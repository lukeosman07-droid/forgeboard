-- Forgeboard v2, Phase 3: collaboration.
-- Run once in the Supabase SQL Editor (or `supabase db push`). The editor runs
-- the whole file as one transaction, so if anything fails nothing is changed.
--
-- What changes:
--   * activity: every change to a task (who, which field, old and new value,
--     when) and every comment, written by triggers so nothing can skip it.
--     How far back people can see depends on the plan (14 days on the trial).
--   * notifications + notification_prefs: assigned, mentioned, commented on
--     your task, status change on your task. Created by triggers, only for
--     people who can see the project and whose preferences allow it. Emails go
--     out from the server (claim_notification_emails), never twice.
--   * Comments can be edited (by their author) and carry @mentions written as
--     @[Name](user-id).
--   * Full-text search over tasks, comments and notes: search_workspace().
--   * Realtime: items, sections, subtasks, comments and notifications are
--     published to Supabase Realtime. Row Level Security still decides who
--     receives each change.
--   * Daily email jobs: due-date digest and trial-ending warning.

-- ===========================================================================
-- 1. Who can see a project, for a given user (triggers run as the writer)
-- ===========================================================================

create function public.user_can_read_project(p_project uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.projects pr
    join public.workspace_members m on m.workspace_id = pr.workspace_id and m.user_id = p_user
    where pr.id = p_project
      and (m.role <> 'guest'
           or exists (select 1 from public.project_members pm where pm.project_id = pr.id and pm.user_id = p_user))
  );
$$;

-- The signed-in user, if they still exist. (While an account is being deleted,
-- its own writes must not name it, or the deletion would fail.)
create function public.current_actor()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id from auth.users u where u.id = (select auth.uid());
$$;

-- ===========================================================================
-- 2. Activity log
-- ===========================================================================

create table public.activity (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  -- No foreign key: the history of a deleted task stays in the project feed.
  item_id uuid,
  comment_id uuid,
  actor_id uuid references auth.users (id) on delete set null,
  verb text not null check (verb in ('created', 'updated', 'deleted', 'commented', 'comment_edited', 'comment_deleted')),
  -- Task title at the time, so the feed reads well after a rename or delete.
  item_title text,
  -- {"due_date": {"old": "2026-12-01", "new": "2026-12-05"}, ...}
  changes jsonb,
  created_at timestamptz not null default now()
);

create index activity_item_idx on public.activity (item_id, created_at desc);
create index activity_project_idx on public.activity (project_id, created_at desc);
create index activity_workspace_idx on public.activity (workspace_id, created_at desc);

-- How far back a workspace's plan lets people see history.
create function public.workspace_activity_since(ws uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select case when l.activity_days is null then '-infinity'::timestamptz
              else now() - make_interval(days => l.activity_days) end
  from public.workspaces w
  cross join lateral public.plan_limits(w.plan) l
  where w.id = ws;
$$;

alter table public.activity enable row level security;
revoke all on public.activity from anon, authenticated;
grant select on public.activity to authenticated;
grant all on public.activity to service_role;

create policy "Anyone who can see the project can see its history, within the plan's window"
  on public.activity for select to authenticated
  using (public.can_read_project(project_id) and created_at >= public.workspace_activity_since(workspace_id));

-- The task fields whose changes are recorded.
create function public.item_changes(o public.items, n public.items)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(f.key, jsonb_build_object('old', f.old_value, 'new', f.new_value)), '{}'::jsonb)
  from (
    select key, value as new_value, (to_jsonb(o) -> key) as old_value
    from jsonb_each(to_jsonb(n))
    where key in ('title', 'details', 'type', 'status', 'priority', 'assignee', 'assignee_id',
                  'start_date', 'due_date', 'section_id')
  ) f
  where f.old_value is distinct from f.new_value;
$$;

create function public.item_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changes jsonb;
begin
  if tg_op = 'INSERT' then
    insert into public.activity (workspace_id, project_id, item_id, actor_id, verb, item_title)
    values (new.workspace_id, new.project_id, new.id, public.current_actor(), 'created', new.title);
    return new;
  elsif tg_op = 'UPDATE' then
    v_changes := public.item_changes(old, new);
    -- Moving a task within a list (position only) isn't worth a history line.
    if v_changes <> '{}'::jsonb then
      insert into public.activity (workspace_id, project_id, item_id, actor_id, verb, item_title, changes)
      values (new.workspace_id, new.project_id, new.id, public.current_actor(), 'updated', new.title, v_changes);
    end if;
    return new;
  else
    -- Skip when the whole project is being deleted (its history goes with it).
    if exists (select 1 from public.projects where id = old.project_id) then
      insert into public.activity (workspace_id, project_id, item_id, actor_id, verb, item_title)
      values (old.workspace_id, old.project_id, old.id, public.current_actor(), 'deleted', old.title);
    end if;
    return old;
  end if;
end;
$$;

create trigger z_activity after insert or update or delete on public.items
  for each row execute function public.item_activity();

-- ===========================================================================
-- 3. Comments: editing and mentions
-- ===========================================================================

alter table public.item_comments add column edited_at timestamptz;

create function public.comment_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.body is distinct from old.body then
    new.edited_at := now();
  end if;
  return new;
end;
$$;

create trigger c_edited before update on public.item_comments
  for each row execute function public.comment_before_update();

-- Only the body can change, and only by its author.
revoke update on public.item_comments from authenticated;
grant update (body) on public.item_comments to authenticated;

create policy "People can edit their own comments"
  on public.item_comments for update to authenticated
  using (public.can_comment_item(item_id) and created_by = (select auth.uid()))
  with check (public.can_comment_item(item_id) and created_by = (select auth.uid()));

-- The user IDs mentioned in a comment body, written as @[Name](uuid).
create function public.comment_mentions(p_body text)
returns uuid[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(distinct m[1]::uuid), '{}')
  from regexp_matches(
    coalesce(p_body, ''),
    '@\[[^\]]{0,200}\]\(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)',
    'g'
  ) as m;
$$;

-- ===========================================================================
-- 4. Notifications and preferences
-- ===========================================================================

create table public.notification_prefs (
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  in_app_assigned boolean not null default true,
  in_app_mentioned boolean not null default true,
  in_app_commented boolean not null default true,
  in_app_status boolean not null default true,
  email_assigned boolean not null default true,
  email_mentioned boolean not null default true,
  email_commented boolean not null default false,
  email_status boolean not null default false,
  email_digest boolean not null default true,
  -- Local hour (in the profile's time zone) after which the daily digest may go out.
  digest_hour smallint not null default 8 check (digest_hour between 0 and 23),
  -- Written by the digest job only.
  last_digest_on date,
  updated_at timestamptz not null default now(),
  primary key (user_id, workspace_id)
);

create index notification_prefs_workspace_idx on public.notification_prefs (workspace_id);

alter table public.notification_prefs enable row level security;
revoke all on public.notification_prefs from anon, authenticated;
grant select on public.notification_prefs to authenticated;
grant insert (user_id, workspace_id, in_app_assigned, in_app_mentioned, in_app_commented, in_app_status,
              email_assigned, email_mentioned, email_commented, email_status, email_digest, digest_hour)
  on public.notification_prefs to authenticated;
grant update (in_app_assigned, in_app_mentioned, in_app_commented, in_app_status,
              email_assigned, email_mentioned, email_commented, email_status, email_digest, digest_hour, updated_at)
  on public.notification_prefs to authenticated;
grant all on public.notification_prefs to service_role;

create policy "People see their own preferences"
  on public.notification_prefs for select to authenticated
  using (user_id = (select auth.uid()));

create policy "People set their own preferences in workspaces they belong to"
  on public.notification_prefs for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_workspace_member(workspace_id));

create policy "People change their own preferences"
  on public.notification_prefs for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.is_workspace_member(workspace_id));

create table public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  item_id uuid references public.items (id) on delete cascade,
  comment_id uuid references public.item_comments (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  type text not null check (type in ('assigned', 'mentioned', 'commented', 'status')),
  -- Extra detail for the message, e.g. {"status": "done"}.
  data jsonb not null default '{}',
  -- Shown in the bell and Inbox only when true (the person may want email only).
  in_app boolean not null default true,
  -- off: no email wanted; pending -> sending -> sent | failed | skipped (email not set up).
  email_state text not null default 'off' check (email_state in ('off', 'pending', 'sending', 'sent', 'failed', 'skipped')),
  email_claimed_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, workspace_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null and in_app;
create index notifications_email_idx on public.notifications (created_at) where email_state in ('pending', 'sending');
create index notifications_item_idx on public.notifications (item_id);
create index notifications_comment_idx on public.notifications (comment_id);

alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant all on public.notifications to service_role;

create policy "People see their own notifications"
  on public.notifications for select to authenticated
  using (user_id = (select auth.uid()) and in_app);

create policy "People mark their own notifications read"
  on public.notifications for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Creates one notification if the person can see the project and their
-- preferences want it in the app or by email. Never notifies the actor.
create function public.notify(
  p_user uuid,
  p_type text,
  p_workspace uuid,
  p_project uuid,
  p_item uuid,
  p_comment uuid,
  p_actor uuid,
  p_data jsonb default '{}'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prefs public.notification_prefs;
  v_in_app boolean;
  v_email boolean;
begin
  if p_user is null or p_user is not distinct from p_actor then
    return;
  end if;
  if not public.user_can_read_project(p_project, p_user) then
    return;
  end if;

  select * into v_prefs from public.notification_prefs where user_id = p_user and workspace_id = p_workspace;
  if not found then
    -- Defaults: everything in the app; email for assignments and mentions.
    v_prefs := row(p_user, p_workspace, true, true, true, true, true, true, false, false, true, 8, null, now())::public.notification_prefs;
  end if;

  v_in_app := case p_type
    when 'assigned' then v_prefs.in_app_assigned
    when 'mentioned' then v_prefs.in_app_mentioned
    when 'commented' then v_prefs.in_app_commented
    when 'status' then v_prefs.in_app_status
  end;
  v_email := case p_type
    when 'assigned' then v_prefs.email_assigned
    when 'mentioned' then v_prefs.email_mentioned
    when 'commented' then v_prefs.email_commented
    when 'status' then v_prefs.email_status
  end;
  if not (v_in_app or v_email) then
    return;
  end if;

  insert into public.notifications (user_id, workspace_id, project_id, item_id, comment_id, actor_id, type, data, in_app, email_state)
  values (p_user, p_workspace, p_project, p_item, p_comment, p_actor, p_type, coalesce(p_data, '{}'), v_in_app,
          case when v_email then 'pending' else 'off' end);
end;
$$;

revoke execute on function public.notify(uuid, text, uuid, uuid, uuid, uuid, uuid, jsonb) from public, anon, authenticated;

-- Assignments and status changes on tasks.
create function public.item_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := public.current_actor();
begin
  if new.type <> 'action_item' then
    return new;
  end if;

  if new.assignee_id is not null
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id) then
    perform public.notify(new.assignee_id, 'assigned', new.workspace_id, new.project_id, new.id, null, v_actor);
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    perform public.notify(coalesce(new.assignee_id, new.created_by), 'status', new.workspace_id, new.project_id, new.id, null,
                          v_actor, jsonb_build_object('status', new.status, 'old_status', old.status));
  end if;
  return new;
end;
$$;

create trigger z_notify after insert or update on public.items
  for each row execute function public.item_notify();

-- Comments: history, mentions, and a note to the task's owner.
create function public.comment_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := public.current_actor();
  v_item public.items;
  v_mentions uuid[];
  v_user uuid;
  v_owner uuid;
begin
  select * into v_item from public.items where id = coalesce(new.item_id, old.item_id);
  -- The task itself is being deleted: nothing to record.
  if not found then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    insert into public.activity (workspace_id, project_id, item_id, comment_id, actor_id, verb, item_title)
    values (v_item.workspace_id, v_item.project_id, v_item.id, old.id, v_actor, 'comment_deleted', v_item.title);
    return old;
  end if;

  if tg_op = 'INSERT' then
    insert into public.activity (workspace_id, project_id, item_id, comment_id, actor_id, verb, item_title)
    values (v_item.workspace_id, v_item.project_id, v_item.id, new.id, v_actor, 'commented', v_item.title);
    v_mentions := public.comment_mentions(new.body);
  else
    if new.body is not distinct from old.body then
      return new;
    end if;
    insert into public.activity (workspace_id, project_id, item_id, comment_id, actor_id, verb, item_title)
    values (v_item.workspace_id, v_item.project_id, v_item.id, new.id, v_actor, 'comment_edited', v_item.title);
    -- Only people newly mentioned by the edit.
    select coalesce(array_agg(u), '{}') into v_mentions
    from unnest(public.comment_mentions(new.body)) u
    where u <> all (public.comment_mentions(old.body));
  end if;

  foreach v_user in array v_mentions loop
    perform public.notify(v_user, 'mentioned', v_item.workspace_id, v_item.project_id, v_item.id, new.id, v_actor);
  end loop;

  if tg_op = 'INSERT' then
    v_owner := coalesce(v_item.assignee_id, v_item.created_by);
    if v_owner is not null and not (v_owner = any (v_mentions)) then
      perform public.notify(v_owner, 'commented', v_item.workspace_id, v_item.project_id, v_item.id, new.id, v_actor);
    end if;
  end if;
  return new;
end;
$$;

create trigger z_after_write after insert or update or delete on public.item_comments
  for each row execute function public.comment_after_write();

-- ---------------------------------------------------------------------------
-- Email delivery (server only). The server claims pending emails, sends them,
-- and records the result. A claim older than 15 minutes (a crashed send) is
-- retried. Each notification is emailed at most once.
-- ---------------------------------------------------------------------------

create function public.claim_notification_emails(p_limit integer default 50)
returns table (
  id bigint,
  type text,
  data jsonb,
  user_id uuid,
  email text,
  full_name text,
  workspace_name text,
  workspace_slug text,
  project_id uuid,
  project_name text,
  item_id uuid,
  item_title text,
  comment_body text,
  actor_name text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with claimed as (
    update public.notifications n
    set email_state = 'sending', email_claimed_at = now()
    where n.id in (
      select x.id from public.notifications x
      where x.email_state = 'pending'
         or (x.email_state = 'sending' and x.email_claimed_at < now() - interval '15 minutes')
      order by x.created_at
      limit greatest(1, least(p_limit, 200))
      for update skip locked
    )
    returning n.*
  )
  select c.id, c.type, c.data, c.user_id, p.email, p.full_name, w.name, w.slug, c.project_id, pr.name, c.item_id, it.title,
         cm.body, coalesce(ap.full_name, ap.email), c.created_at
  from claimed c
  join public.profiles p on p.id = c.user_id
  join public.workspaces w on w.id = c.workspace_id
  left join public.projects pr on pr.id = c.project_id
  left join public.items it on it.id = c.item_id
  left join public.item_comments cm on cm.id = c.comment_id
  left join public.profiles ap on ap.id = c.actor_id
  order by c.created_at;
end;
$$;

create function public.finish_notification_emails(p_ids bigint[], p_state text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_state not in ('sent', 'failed', 'skipped') then
    raise exception 'invalid state %', p_state;
  end if;
  update public.notifications set email_state = p_state where id = any (p_ids) and email_state = 'sending';
end;
$$;

-- People whose daily digest is due now: their local hour has reached their
-- digest hour, they haven't had one today, and they have open tasks due by
-- tomorrow (local) or overdue. p_any_hour skips the hour check, for a job that
-- can only run once a day.
create function public.due_digest_candidates(p_now timestamptz default now(), p_any_hour boolean default false)
returns table (
  user_id uuid,
  email text,
  full_name text,
  workspace_id uuid,
  workspace_name text,
  workspace_slug text,
  local_date date,
  tasks jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with people as (
    select m.user_id, m.workspace_id, p.email, p.full_name, w.name as workspace_name, w.slug as workspace_slug,
           coalesce(np.email_digest, true) as wants, coalesce(np.digest_hour, 8) as hour, np.last_digest_on,
           (p_now at time zone (case when p.time_zone is not null and exists (select 1 from pg_catalog.pg_timezone_names tz where tz.name = p.time_zone) then p.time_zone else 'UTC' end)) as local_ts
    from public.workspace_members m
    join public.profiles p on p.id = m.user_id
    join public.workspaces w on w.id = m.workspace_id
    left join public.notification_prefs np on np.user_id = m.user_id and np.workspace_id = m.workspace_id
    where p.email is not null
  )
  select pe.user_id, pe.email, pe.full_name, pe.workspace_id, pe.workspace_name, pe.workspace_slug, pe.local_ts::date,
         jsonb_agg(jsonb_build_object(
           'id', it.id, 'title', it.title, 'due_date', it.due_date, 'project_id', it.project_id, 'project_name', pr.name,
           'overdue', it.due_date < pe.local_ts::date
         ) order by it.due_date, it.title)
  from people pe
  join public.items it on it.workspace_id = pe.workspace_id and it.assignee_id = pe.user_id
  join public.projects pr on pr.id = it.project_id
  where pe.wants
    and (p_any_hour or extract(hour from pe.local_ts) >= pe.hour)
    and (pe.last_digest_on is null or pe.last_digest_on < pe.local_ts::date)
    and it.type = 'action_item'
    and it.status <> 'done'
    and it.due_date is not null
    and it.due_date <= pe.local_ts::date + 1
    and public.user_can_read_project(it.project_id, pe.user_id)
  group by pe.user_id, pe.email, pe.full_name, pe.workspace_id, pe.workspace_name, pe.workspace_slug, pe.local_ts;
$$;

create function public.mark_digest_sent(p_user uuid, p_workspace uuid, p_date date)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notification_prefs (user_id, workspace_id, last_digest_on)
  values (p_user, p_workspace, p_date)
  on conflict (user_id, workspace_id) do update set last_digest_on = excluded.last_digest_on;
$$;

-- Trial-ending warning, once per workspace, 3 days before the end.
alter table public.workspaces add column trial_warning_sent_at timestamptz;

create function public.trial_ending_candidates(p_now timestamptz default now())
returns table (workspace_id uuid, workspace_name text, workspace_slug text, trial_ends_at timestamptz, email text, full_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select w.id, w.name, w.slug, w.trial_ends_at, p.email, p.full_name
  from public.workspaces w
  join public.workspace_members m on m.workspace_id = w.id and m.role = 'owner'
  join public.profiles p on p.id = m.user_id
  where w.plan = 'trial'
    and w.trial_warning_sent_at is null
    and w.trial_ends_at > p_now
    and w.trial_ends_at <= p_now + interval '3 days'
    and p.email is not null;
$$;

revoke execute on function
  public.claim_notification_emails(integer),
  public.finish_notification_emails(bigint[], text),
  public.due_digest_candidates(timestamptz, boolean),
  public.mark_digest_sent(uuid, uuid, date),
  public.trial_ending_candidates(timestamptz),
  public.item_activity(),
  public.item_notify(),
  public.comment_after_write()
from public, anon, authenticated;
grant execute on function
  public.claim_notification_emails(integer),
  public.finish_notification_emails(bigint[], text),
  public.due_digest_candidates(timestamptz, boolean),
  public.mark_digest_sent(uuid, uuid, date),
  public.trial_ending_candidates(timestamptz)
to service_role;

-- ===========================================================================
-- 5. Full-text search
-- ===========================================================================

alter table public.items add column search tsvector generated always as (
  setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(details, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(assignee, '')), 'C')
) stored;

alter table public.item_comments add column search tsvector generated always as (
  -- Mentions count as the name, not the ID.
  to_tsvector('english', regexp_replace(coalesce(body, ''), '@\[([^\]]*)\]\([0-9a-f-]+\)', '\1', 'g'))
) stored;

alter table public.notes add column search tsvector generated always as (
  setweight(to_tsvector('english', coalesce(summary, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(raw_text, '')), 'B')
) stored;

create index items_search_idx on public.items using gin (search);
create index item_comments_search_idx on public.item_comments using gin (search);
create index notes_search_idx on public.notes using gin (search);

-- Ranked results for the command palette. Runs as the caller, so Row Level
-- Security limits a guest to the projects shared with them. Each word matches
-- as a prefix, so results appear while typing.
create function public.search_workspace(ws uuid, q text, p_limit integer default 20)
returns table (
  kind text,
  id uuid,
  item_id uuid,
  project_id uuid,
  project_name text,
  title text,
  snippet text,
  item_type text,
  status text,
  rank real
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_words text[];
  v_query tsquery;
begin
  select array_agg(w) into v_words
  from (
    select w from regexp_split_to_table(lower(left(coalesce(q, ''), 200)), '[^[:alnum:]]+') as w
    where w <> '' limit 8
  ) words;
  if v_words is null then
    return;
  end if;
  v_query := to_tsquery('english', array_to_string(array(select w || ':*' from unnest(v_words) as w), ' & '));
  if v_query is null or numnode(v_query) = 0 then
    return;
  end if;

  return query
  select r.kind, r.id, r.item_id, r.project_id, pr.name, r.title,
         case when r.body is null or r.body = '' then null
              else ts_headline('english', r.body, v_query, 'MaxWords=18, MinWords=6, ShortWord=2, StartSel=«, StopSel=», HighlightAll=false')
         end,
         r.item_type, r.status, r.rank::real
  from (
    (select 'task'::text as kind, it.id, it.id as item_id, it.project_id, it.title, it.details as body, it.type as item_type,
            it.status, ts_rank(it.search, v_query) * 1.2 as rank
     from public.items it
     where it.workspace_id = ws and it.search @@ v_query
     order by rank desc limit p_limit)
    union all
    (select 'comment', c.id, it.id, it.project_id, it.title,
            regexp_replace(c.body, '@\[([^\]]*)\]\([0-9a-f-]+\)', '@\1', 'g'), it.type, it.status, ts_rank(c.search, v_query)
     from public.item_comments c
     join public.items it on it.id = c.item_id
     where c.workspace_id = ws and c.search @@ v_query
     order by 9 desc limit p_limit)
    union all
    (select 'note', n.id, null::uuid, n.project_id, coalesce(nullif(left(n.summary, 90), ''), 'Meeting notes'), n.raw_text, null::text,
            null::text, ts_rank(n.search, v_query) * 0.9
     from public.notes n
     where n.workspace_id = ws and n.search @@ v_query
     order by 9 desc limit p_limit)
  ) r
  join public.projects pr on pr.id = r.project_id
  order by r.rank desc
  limit greatest(1, least(p_limit, 50));
end;
$$;

grant execute on function public.search_workspace(uuid, text, integer) to authenticated;

-- ===========================================================================
-- 6. Realtime
-- ===========================================================================

-- Supabase creates this publication; plain Postgres (local checks) doesn't have it.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.items, public.sections, public.subtasks, public.item_comments, public.notifications;
  end if;
end;
$$;
