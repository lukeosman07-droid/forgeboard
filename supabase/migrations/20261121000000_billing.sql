-- Forgeboard v2, Phase 2: billing on the workspace, plan limits and read-only mode.
-- Run once in the Supabase SQL Editor, after 20261117000000_workspaces.sql.
-- The SQL Editor runs the whole file as one transaction: if any statement fails,
-- nothing is changed.
--
-- What changes:
--   * Stripe now writes to the WORKSPACE (a firm), never to a profile. The
--     profile -> workspace billing mirror from Phase 1 is removed.
--   * One table of plan limits (plan_limits) and workspace_limits(ws), which the
--     app reads to show the same limits the database enforces.
--   * Read-only mode. A workspace becomes read-only when its trial ends without
--     a subscription, when a subscription ends, or 7 days after a failed payment.
--     Everything stays visible and exportable; nothing can be created or edited.
--     It is worked out from timestamps at query time, so no scheduled job is
--     needed to switch it on, and paying switches it off at once.
--   * ai_usage: one row per AI call, per workspace, with tokens and latency.
--     Monthly AI runs per plan are enforced by claim_ai_use().
--     ai_extraction_events, claim_ai_extraction() and finish_ai_extraction() stay
--     for one release, unused, so the old code keeps working until the new code
--     is live. Phase 3 drops them, with the plan columns on profiles.
--   * stripe_events: webhook event IDs already processed, so a replayed event
--     changes nothing.
--   * Onboarding flags, and delete_workspace() for owners.

-- ===========================================================================
-- 1. Columns and tables
-- ===========================================================================

alter table public.workspaces
  add column billing_interval text check (billing_interval in ('month', 'year')),
  add column current_period_end timestamptz,
  add column cancel_at_period_end boolean not null default false,
  add column onboarded_at timestamptz,
  add column checklist_dismissed_at timestamptz;

-- Workspaces that already exist are in use: they skip the first-run steps.
update public.workspaces set onboarded_at = now();

grant select (billing_interval, current_period_end, cancel_at_period_end, onboarded_at, checklist_dismissed_at)
  on public.workspaces to authenticated;
-- The update policy still limits these to admins.
grant update (onboarded_at, checklist_dismissed_at) on public.workspaces to authenticated;

-- Stripe webhook events already handled. Server only.
create table public.stripe_events (
  id text primary key,                   -- Stripe's event ID, evt_...
  type text not null,
  workspace_id uuid references public.workspaces (id) on delete set null,
  processed_at timestamptz not null default now()
);

alter table public.stripe_events enable row level security;
revoke all on public.stripe_events from anon, authenticated;
grant all on public.stripe_events to service_role;

-- One row per AI call. Written only by claim_ai_use() and finish_ai_use().
create table public.ai_usage (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  feature text not null check (feature in ('extract', 'plan', 'status_report', 'ask', 'other')),
  model text,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  latency_ms integer check (latency_ms >= 0),
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'empty', 'failed')),
  created_at timestamptz not null default now()
);

create index ai_usage_workspace_time_idx on public.ai_usage (workspace_id, created_at desc);
create index ai_usage_user_time_idx on public.ai_usage (user_id, created_at desc);

-- Keep the history: every past extraction becomes an ai_usage row.
insert into public.ai_usage (workspace_id, user_id, feature, status, created_at)
select e.workspace_id, e.user_id, 'extract', e.status, e.created_at
from public.ai_extraction_events e
where e.workspace_id is not null;

alter table public.ai_usage enable row level security;

create policy "Admins can see their workspace's AI usage"
  on public.ai_usage for select to authenticated
  using (public.is_workspace_admin(workspace_id));

revoke all on public.ai_usage from anon, authenticated;
grant select on public.ai_usage to authenticated;
grant all on public.ai_usage to service_role;

-- ===========================================================================
-- 2. Plans and limits. Mirrors PLAN_LIMITS in src/lib/plans.ts: change both.
-- ===========================================================================

-- activity_days null means unlimited.
create function public.plan_limits(p_plan text)
returns table (
  seats integer,
  ai_runs integer,
  storage_bytes bigint,
  file_ai boolean,
  registers boolean,
  workload boolean,
  activity_days integer
)
language sql
immutable
set search_path = ''
as $$
  select l.seats, l.ai_runs, l.storage_bytes, l.file_ai, l.registers, l.workload, l.activity_days
  from (values
    ('trial',      5,    50,    1073741824::bigint, true,  true,  true,  14),
    ('starter',    5,   300,    5368709120::bigint, false, false, false, 90),
    ('team',      15,  1500,   53687091200::bigint, true,  true,  false, 365),
    ('business',  50,  5000,  268435456000::bigint, true,  true,  true,  null::integer),
    ('enterprise', 1000, 50000, 1099511627776::bigint, true, true, true, null::integer)
  ) as l (plan, seats, ai_runs, storage_bytes, file_ai, registers, workload, activity_days)
  where l.plan = p_plan;
$$;

-- Why a workspace is read-only, or null when it isn't:
--   trial_ended         the 14-day trial is over and nobody has subscribed
--   subscription_ended  a paid subscription was canceled and has run out
--   payment_failed      a payment failed and the 7-day grace period is over
-- Enterprise is invoiced by hand and is never switched off here.
create function public.workspace_read_only_reason(ws uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when w.plan = 'enterprise' then null
    when w.plan = 'trial' and w.trial_ends_at <= now() then
      case when w.subscription_status = 'canceled' then 'subscription_ended' else 'trial_ended' end
    when w.grace_ends_at is not null and w.grace_ends_at <= now() then 'payment_failed'
    else null
  end
  from public.workspaces w
  where w.id = ws;
$$;

create function public.workspace_is_read_only(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.workspace_read_only_reason(ws) is not null;
$$;

-- AI runs counted against this calendar month (UTC). Failed and empty runs are
-- given back, so they don't count.
create function public.workspace_ai_runs_used(ws uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.ai_usage u
  where u.workspace_id = ws
    and u.status in ('pending', 'succeeded')
    and u.created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc';
$$;

-- Seats now come from plan_limits (same numbers as Phase 1).
create or replace function public.workspace_seat_limit(ws uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select l.seats from public.workspaces w cross join lateral public.plan_limits(w.plan) l where w.id = ws;
$$;

-- Everything the app shows about the plan, in one call. Members only.
create function public.workspace_limits(ws uuid)
returns table (
  plan text,
  seats integer,
  seats_used integer,
  ai_runs integer,
  ai_runs_used integer,
  storage_bytes bigint,
  storage_bytes_used bigint,
  file_ai boolean,
  registers boolean,
  workload boolean,
  activity_days integer,
  read_only_reason text,
  trial_ends_at timestamptz,
  grace_ends_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select w.plan, l.seats, public.workspace_seats_used(w.id), l.ai_runs, public.workspace_ai_runs_used(w.id),
         l.storage_bytes, w.storage_bytes_used, l.file_ai, l.registers, l.workload, l.activity_days,
         public.workspace_read_only_reason(w.id), w.trial_ends_at, w.grace_ends_at
  from public.workspaces w
  cross join lateral public.plan_limits(w.plan) l
  where w.id = ws and public.is_workspace_member(ws);
$$;

-- Feature gates for the tables later phases add (file AI, registers, workload).
-- Their policies call this, so a plan without the feature can't use it even
-- through the API.
create function public.workspace_has_feature(ws uuid, p_feature text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case p_feature
      when 'file_ai' then l.file_ai
      when 'registers' then l.registers
      when 'workload' then l.workload
      else false
    end
    from public.workspaces w cross join lateral public.plan_limits(w.plan) l
    where w.id = ws
  ), false);
$$;

-- Storage quota check for uploads (attachments arrive in Phase 4).
create function public.workspace_has_storage(ws uuid, p_bytes bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select w.storage_bytes_used + greatest(p_bytes, 0) <= l.storage_bytes
    from public.workspaces w cross join lateral public.plan_limits(w.plan) l
    where w.id = ws
  ), false);
$$;

-- ===========================================================================
-- 3. Read-only mode in the authorization helpers
-- ===========================================================================

-- Owner, admin or member, whether or not the workspace is read-only. Reading
-- depends on this; writing depends on can_write_workspace.
create function public.is_workspace_staff(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.workspace_role(ws) in ('owner', 'admin', 'member'), false);
$$;

create or replace function public.can_write_workspace(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_workspace_staff(ws) and not public.workspace_is_read_only(ws);
$$;

-- Read access no longer goes through can_write_workspace, so a read-only
-- workspace stays fully visible.
create or replace function public.can_read_project(p uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.projects pr
    where pr.id = p
      and (public.is_workspace_staff(pr.workspace_id)
           or (public.is_workspace_member(pr.workspace_id) and public.is_project_member(pr.id)))
  );
$$;

-- Sharing a project is a change too, so it stops while read-only.
create or replace function public.can_manage_project(p uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.projects pr
    where pr.id = p
      and public.can_write_workspace(pr.workspace_id)
      and (public.is_workspace_admin(pr.workspace_id) or pr.manager_id = (select auth.uid()))
  );
$$;

-- Guests may comment, but not in a read-only workspace.
create function public.can_comment_item(i uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.items it
    where it.id = i and public.can_read_project(it.project_id) and not public.workspace_is_read_only(it.workspace_id)
  );
$$;

drop policy "Members can view projects; guests only the ones shared with them" on public.projects;
create policy "Members can view projects; guests only the ones shared with them"
  on public.projects for select to authenticated
  using (
    public.is_workspace_staff(workspace_id)
    or (public.is_workspace_member(workspace_id) and public.is_project_member(id))
  );

drop policy "Admins and the project's creator can delete it" on public.projects;
create policy "Admins and the project's creator can delete it"
  on public.projects for delete to authenticated
  using (
    public.can_write_workspace(workspace_id)
    and (public.is_workspace_admin(workspace_id) or created_by = (select auth.uid()))
  );

drop policy "Anyone who can see the task can comment" on public.item_comments;
create policy "Anyone who can see the task can comment"
  on public.item_comments for insert to authenticated
  with check (public.can_comment_item(item_id));

drop policy "People can delete their own comments; admins any" on public.item_comments;
create policy "People can delete their own comments; admins any"
  on public.item_comments for delete to authenticated
  using (
    public.can_comment_item(item_id)
    and (created_by = (select auth.uid()) or public.is_workspace_admin(workspace_id))
  );

-- No new invites while read-only (removing people still works, so a firm can
-- get under a smaller plan's seat count).
create or replace function public.create_invite(
  p_workspace uuid,
  p_email text,
  p_role text,
  p_token_hash text,
  p_project uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_email text := lower(trim(coalesce(p_email, '')));
  v_id uuid;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if p_role not in ('admin', 'member', 'guest') or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_invite' using errcode = '22023';
  end if;

  if p_project is not null then
    -- A project invite is a guest invite, from that project's PM or an admin.
    if p_role <> 'guest' or not public.can_manage_project(p_project)
       or not exists (select 1 from public.projects pr where pr.id = p_project and pr.workspace_id = p_workspace) then
      if public.workspace_is_read_only(p_workspace) and public.is_workspace_member(p_workspace) then
        raise exception 'read_only' using errcode = '42501';
      end if;
      raise exception 'not_allowed' using errcode = '42501';
    end if;
  elsif not public.is_workspace_admin(p_workspace) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  -- Only the owner may create admins (same rule as set_member_role).
  if p_role = 'admin' and public.workspace_role(p_workspace) <> 'owner' then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if public.workspace_is_read_only(p_workspace) then
    raise exception 'read_only' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.workspace_members m
    join auth.users u on u.id = m.user_id
    where m.workspace_id = p_workspace and lower(u.email) = v_email
  ) then
    raise exception 'already_member' using errcode = '23505';
  end if;

  if (select count(*) from public.workspace_invites i
      where i.workspace_id = p_workspace and i.created_at > now() - interval '1 day') >= 20 then
    raise exception 'invite_limit' using errcode = '53400';
  end if;

  -- A newer invite replaces an older pending one to the same address.
  update public.workspace_invites i set revoked_at = now()
  where i.workspace_id = p_workspace and i.email = v_email and i.accepted_at is null and i.revoked_at is null;

  -- Seats: members plus invitations still waiting, so a firm can't over-invite.
  -- After a downgrade in the Stripe portal a workspace can be over its seats:
  -- everyone stays, and this blocks new invites until it is back under.
  if p_role <> 'guest'
     and public.workspace_seats_used(p_workspace)
         + (select count(*) from public.workspace_invites i
            where i.workspace_id = p_workspace and i.role <> 'guest'
              and i.accepted_at is null and i.revoked_at is null and i.expires_at > now())
         >= public.workspace_seat_limit(p_workspace) then
    raise exception 'seat_limit' using errcode = '53400';
  end if;

  insert into public.workspace_invites (workspace_id, email, role, project_id, token_hash, invited_by)
  values (p_workspace, v_email, p_role, p_project, p_token_hash, v_user)
  returning id into v_id;
  return v_id;
end;
$$;

-- ===========================================================================
-- 4. AI usage: claim before the call, finish after it. Server only.
-- ===========================================================================

-- Atomically checks the workspace's monthly runs and the person's hourly cap,
-- and records the attempt. Locks the workspace row so two calls started at
-- once can't both slip past the limit.
create function public.claim_ai_use(p_workspace uuid, p_user uuid, p_feature text, p_hourly_limit integer)
returns table (allowed boolean, reason text, usage_id bigint, runs_left integer, runs_limit integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan text;
  v_limit integer;
  v_used integer;
  v_recent integer;
  v_id bigint;
begin
  select w.plan into v_plan from public.workspaces w where w.id = p_workspace for update;
  if not found or not exists (
    select 1 from public.workspace_members m
    where m.workspace_id = p_workspace and m.user_id = p_user and m.role <> 'guest'
  ) then
    return query select false, 'not_allowed'::text, null::bigint, null::integer, null::integer;
    return;
  end if;

  if public.workspace_is_read_only(p_workspace) then
    return query select false, 'read_only'::text, null::bigint, null::integer, null::integer;
    return;
  end if;

  -- Attempts that failed because of an error don't count toward the hourly cap.
  select count(*) into v_recent from public.ai_usage u
  where u.user_id = p_user and u.status <> 'failed' and u.created_at > now() - interval '1 hour';
  if v_recent >= p_hourly_limit then
    return query select false, 'rate_limited'::text, null::bigint, null::integer, null::integer;
    return;
  end if;

  select l.ai_runs into v_limit from public.plan_limits(v_plan) l;
  v_used := public.workspace_ai_runs_used(p_workspace);
  if v_used >= v_limit then
    return query select false, 'limit_reached'::text, null::bigint, 0, v_limit;
    return;
  end if;

  insert into public.ai_usage (workspace_id, user_id, feature) values (p_workspace, p_user, p_feature)
  returning id into v_id;

  return query select true, 'ok'::text, v_id, v_limit - v_used - 1, v_limit;
end;
$$;

-- Records how a call ended. 'failed' and 'empty' give the run back.
create function public.finish_ai_use(
  p_usage_id bigint,
  p_status text,
  p_model text default null,
  p_input_tokens integer default 0,
  p_output_tokens integer default 0,
  p_latency_ms integer default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('succeeded', 'empty', 'failed') then
    raise exception 'invalid status %', p_status;
  end if;
  update public.ai_usage u
  set status = p_status,
      model = left(p_model, 100),
      input_tokens = greatest(coalesce(p_input_tokens, 0), 0),
      output_tokens = greatest(coalesce(p_output_tokens, 0), 0),
      latency_ms = greatest(p_latency_ms, 0)
  where u.id = p_usage_id and u.status = 'pending';
end;
$$;

-- ===========================================================================
-- 5. Billing writes from the Stripe webhook. Server only.
-- ===========================================================================

drop trigger on_profile_billing_changed on public.profiles;
drop function public.mirror_profile_billing();

-- Applies a Stripe subscription to its workspace. p_plan is null when the
-- subscription has ended (canceled, or never paid): the workspace goes back to
-- 'trial' with the trial already over, which makes it read-only. Its data stays.
-- An old subscription ending never overwrites a newer one.
create function public.sync_workspace_subscription(
  p_workspace uuid,
  p_customer text,
  p_subscription text,
  p_plan text,
  p_status text,
  p_interval text,
  p_period_end timestamptz,
  p_cancel_at_period_end boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ws public.workspaces%rowtype;
begin
  select * into v_ws from public.workspaces w where w.id = p_workspace for update;
  if not found then
    return false;
  end if;

  if p_plan is null then
    if v_ws.stripe_subscription_id is not null and v_ws.stripe_subscription_id <> p_subscription then
      return false; -- an older subscription ended; the current one stands
    end if;
    update public.workspaces w
    set plan = case when w.plan = 'enterprise' then w.plan else 'trial' end,
        subscription_status = 'canceled',
        stripe_customer_id = coalesce(p_customer, w.stripe_customer_id),
        stripe_subscription_id = null,
        billing_interval = null,
        current_period_end = null,
        cancel_at_period_end = false,
        grace_ends_at = null,
        trial_ends_at = least(w.trial_ends_at, now())
    where w.id = p_workspace;
    return true;
  end if;

  if p_plan not in ('starter', 'team', 'business') then
    raise exception 'invalid plan %', p_plan;
  end if;

  update public.workspaces w
  set plan = p_plan,
      subscription_status = p_status,
      stripe_customer_id = p_customer,
      stripe_subscription_id = p_subscription,
      billing_interval = p_interval,
      current_period_end = p_period_end,
      cancel_at_period_end = coalesce(p_cancel_at_period_end, false),
      -- Stripe gave up retrying: start the grace period if a failed invoice didn't.
      grace_ends_at = case
        when p_status in ('unpaid', 'paused') then coalesce(w.grace_ends_at, now() + interval '7 days')
        when p_status in ('active', 'trialing') then null
        else w.grace_ends_at
      end
  where w.id = p_workspace;
  return true;
end;
$$;

-- invoice.payment_failed: 7 days of grace from the first failure. Replaying
-- the event, or later retries failing, never extends it.
create function public.record_payment_failed(p_customer text, p_failed_at timestamptz)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  update public.workspaces w
  set grace_ends_at = coalesce(w.grace_ends_at, p_failed_at + interval '7 days')
  where w.stripe_customer_id = p_customer and w.stripe_subscription_id is not null
  returning w.id into v_id;
  return v_id;
end;
$$;

-- invoice.paid: the grace period is over and the workspace is writable again.
create function public.record_payment_succeeded(p_customer text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  update public.workspaces w
  set grace_ends_at = null
  where w.stripe_customer_id = p_customer
  returning w.id into v_id;
  return v_id;
end;
$$;

-- ===========================================================================
-- 6. Deleting a workspace (owner only, subscription canceled first)
-- ===========================================================================

-- The app cancels the Stripe subscription, records that, then calls this.
-- Typing the workspace's name confirms it. Everything in it goes too.
create function public.delete_workspace(p_workspace uuid, p_confirm_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ws public.workspaces%rowtype;
  v_email text;
begin
  if public.workspace_role(p_workspace) is distinct from 'owner' then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select * into v_ws from public.workspaces w where w.id = p_workspace for update;
  if trim(coalesce(p_confirm_name, '')) <> v_ws.name then
    raise exception 'confirm_name_mismatch' using errcode = '22023';
  end if;

  -- The shared demo workspace must survive visitors.
  select lower(u.email) into v_email from auth.users u where u.id = (select auth.uid());
  if v_email = 'demo@demo.com' then
    raise exception 'demo_locked' using errcode = '42501';
  end if;

  if v_ws.stripe_subscription_id is not null
     and coalesce(v_ws.subscription_status, '') not in ('canceled', 'incomplete_expired') then
    raise exception 'cancel_subscription_first' using errcode = '42501';
  end if;

  delete from public.workspaces w where w.id = p_workspace;
end;
$$;

-- Deleting your account deletes the workspaces only you are in, so their
-- subscriptions must be canceled first (the app does that before calling).
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_email text;
begin
  if v_user_id is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;

  select email into v_email from auth.users where id = v_user_id;

  -- The shared demo login must survive visitors. Remove this check when the demo
  -- becomes a read-only sample workspace (docs/SPEC.md, Phase 6).
  if lower(v_email) = 'demo@demo.com' then
    raise exception 'the demo account cannot be deleted' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.workspace_members mine
    where mine.user_id = v_user_id and mine.role = 'owner'
      and exists (
        select 1 from public.workspace_members others
        where others.workspace_id = mine.workspace_id and others.user_id <> v_user_id
      )
  ) then
    raise exception 'transfer_ownership_first' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.workspace_members mine
    join public.workspaces w on w.id = mine.workspace_id
    where mine.user_id = v_user_id and mine.role = 'owner'
      and w.stripe_subscription_id is not null
      and coalesce(w.subscription_status, '') not in ('canceled', 'incomplete_expired')
  ) then
    raise exception 'cancel_subscription_first' using errcode = '42501';
  end if;

  delete from public.workspaces w
  where exists (select 1 from public.workspace_members m where m.workspace_id = w.id and m.user_id = v_user_id and m.role = 'owner');

  -- Deleting the user clears them as PM (on delete set null), which the
  -- projects trigger would otherwise refuse for a non-admin.
  perform set_config('forgeboard.trusted', 'on', true);
  delete from auth.users where id = v_user_id;
  perform set_config('forgeboard.trusted', '', true);
end;
$$;

-- ===========================================================================
-- 7. Who may call what
-- ===========================================================================

-- Server only (service role): AI accounting and Stripe writes.
revoke execute on function
  public.claim_ai_use(uuid, uuid, text, integer),
  public.finish_ai_use(bigint, text, text, integer, integer, integer),
  public.sync_workspace_subscription(uuid, text, text, text, text, text, timestamptz, boolean),
  public.record_payment_failed(text, timestamptz),
  public.record_payment_succeeded(text)
from public, anon, authenticated;

grant execute on function
  public.claim_ai_use(uuid, uuid, text, integer),
  public.finish_ai_use(bigint, text, text, integer, integer, integer),
  public.sync_workspace_subscription(uuid, text, text, text, text, text, timestamptz, boolean),
  public.record_payment_failed(text, timestamptz),
  public.record_payment_succeeded(text)
to service_role;

-- Internal: counts any workspace's usage, so only other functions call it.
revoke execute on function public.workspace_ai_runs_used(uuid) from public, anon, authenticated;
grant execute on function public.workspace_ai_runs_used(uuid) to service_role;

-- Signed-in users. Policies call the helpers; the rest check membership or role.
revoke execute on function
  public.plan_limits(text),
  public.workspace_read_only_reason(uuid),
  public.workspace_is_read_only(uuid),
  public.workspace_limits(uuid),
  public.workspace_has_feature(uuid, text),
  public.workspace_has_storage(uuid, bigint),
  public.is_workspace_staff(uuid),
  public.can_comment_item(uuid),
  public.delete_workspace(uuid, text)
from public, anon;

grant execute on function
  public.plan_limits(text),
  public.workspace_read_only_reason(uuid),
  public.workspace_is_read_only(uuid),
  public.workspace_limits(uuid),
  public.workspace_has_feature(uuid, text),
  public.workspace_has_storage(uuid, bigint),
  public.is_workspace_staff(uuid),
  public.can_comment_item(uuid),
  public.delete_workspace(uuid, text)
to authenticated, service_role;
