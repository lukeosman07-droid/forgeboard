-- Forgeboard v2, Phase 1: workspaces, members, invites and guests.
-- Run once in the Supabase SQL Editor, after 20261116000000_account_deletion.sql.
-- The SQL Editor runs the whole file as one transaction: if any statement fails,
-- nothing is changed.
--
-- What changes:
--   * Every project, section, note, item, subtask and comment now belongs to a
--     WORKSPACE (a firm), not to one person. Each existing account gets its own
--     workspace and keeps everything it had.
--   * Access is decided by membership and role:
--       owner   billing, delete workspace, everything an admin can do
--       admin   manage members and settings
--       member  create and edit work in every project
--       guest   read and comment, only in the projects they were added to
--   * owner_id is renamed created_by. It records who made a row and no longer
--     controls access. When that person's account is deleted the row stays.
--
-- Security model: all authorization lives here, in policies and security definer
-- functions. The app never decides who may see or change a row.

-- ===========================================================================
-- 1. Tables
-- ===========================================================================

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  -- Nullable: the workspace outlives the account that created it.
  created_by uuid references auth.users (id) on delete set null,
  plan text not null default 'trial'
    check (plan in ('trial', 'starter', 'team', 'business', 'enterprise')),
  subscription_status text,              -- mirrors Stripe: active, past_due, canceled...
  trial_ends_at timestamptz not null default now() + interval '14 days',
  grace_ends_at timestamptz,             -- set when a payment fails (Phase 2)
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  storage_bytes_used bigint not null default 0,
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member', 'guest')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index workspace_members_user_id_idx on public.workspace_members (user_id);
-- A workspace has at most one owner. (Functions below keep it at exactly one.)
create unique index workspace_members_one_owner_idx on public.workspace_members (workspace_id) where role = 'owner';

-- Guests see only the projects listed here. Members see every project.
create table public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create index project_members_user_id_idx on public.project_members (user_id);

create table public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email text not null check (email = lower(email) and char_length(email) between 3 and 320),
  role text not null check (role in ('admin', 'member', 'guest')),
  -- For a guest invited from a project's Share dialog: the project they join.
  project_id uuid references public.projects (id) on delete cascade,
  token_hash text not null unique,       -- SHA-256 of the link's token; the token itself is never stored
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  revoked_at timestamptz
);

create index workspace_invites_workspace_id_idx on public.workspace_invites (workspace_id);
create index workspace_invites_email_idx on public.workspace_invites (email);

alter table public.profiles
  add column avatar_url text,
  add column time_zone text,
  add column last_workspace_id uuid references public.workspaces (id) on delete set null;

grant update (avatar_url, time_zone, last_workspace_id) on public.profiles to authenticated;

-- ===========================================================================
-- 2. Give every existing account a workspace and move its data into it
-- ===========================================================================

create function public.new_workspace_slug(p_name text)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_base text;
  v_slug text;
begin
  v_base := regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', '-', 'g');
  v_base := trim(both '-' from left(trim(both '-' from v_base), 40));
  if v_base = '' then
    v_base := 'workspace';
  end if;

  v_slug := v_base;
  while exists (select 1 from public.workspaces where slug = v_slug) loop
    v_slug := v_base || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 5);
  end loop;
  return v_slug;
end;
$$;

-- Creates a workspace owned by p_user. Internal: called by the sign-up trigger,
-- by create_workspace() and by the backfill below.
create function public.create_workspace_for(p_user uuid, p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := left(coalesce(nullif(trim(p_name), ''), 'My workspace'), 120);
  v_id uuid;
begin
  insert into public.workspaces (name, slug, created_by)
  values (v_name, public.new_workspace_slug(v_name), p_user)
  returning id into v_id;

  insert into public.workspace_members (workspace_id, user_id, role) values (v_id, p_user, 'owner');

  update public.profiles set last_workspace_id = v_id where id = p_user and last_workspace_id is null;
  return v_id;
end;
$$;

-- One workspace per existing profile, named after the company (or the person).
-- "free" becomes a fresh 14-day trial; paid plans and Stripe IDs are copied.
do $$
declare
  p record;
  v_ws uuid;
begin
  for p in select * from public.profiles order by created_at loop
    v_ws := public.create_workspace_for(
      p.id,
      coalesce(
        nullif(trim(p.company_name), ''),
        nullif(trim(p.full_name), '') || '''s workspace',
        split_part(coalesce(p.email, 'my'), '@', 1) || '''s workspace'
      )
    );
    update public.workspaces
    set plan = case when p.plan = 'free' then 'trial' else p.plan end,
        subscription_status = p.subscription_status,
        stripe_customer_id = p.stripe_customer_id,
        stripe_subscription_id = p.stripe_subscription_id
    where id = v_ws;
  end loop;
end;
$$;

alter table public.projects add column workspace_id uuid references public.workspaces (id) on delete cascade;
alter table public.sections add column workspace_id uuid references public.workspaces (id) on delete cascade;
alter table public.notes add column workspace_id uuid references public.workspaces (id) on delete cascade;
alter table public.items add column workspace_id uuid references public.workspaces (id) on delete cascade;
alter table public.subtasks add column workspace_id uuid references public.workspaces (id) on delete cascade;
alter table public.item_comments add column workspace_id uuid references public.workspaces (id) on delete cascade;
-- Stays nullable until Phase 2 replaces this table with ai_usage.
alter table public.ai_extraction_events add column workspace_id uuid references public.workspaces (id) on delete cascade;

-- At this point each user owns exactly one workspace, so the owner decides it.
update public.projects p set workspace_id = w.id from public.workspaces w where w.created_by = p.owner_id;
update public.sections s set workspace_id = p.workspace_id from public.projects p where p.id = s.project_id;
update public.notes n set workspace_id = p.workspace_id from public.projects p where p.id = n.project_id;
update public.items i set workspace_id = p.workspace_id from public.projects p where p.id = i.project_id;
update public.subtasks s set workspace_id = i.workspace_id from public.items i where i.id = s.item_id;
update public.item_comments c set workspace_id = i.workspace_id from public.items i where i.id = c.item_id;
update public.ai_extraction_events e set workspace_id = w.id from public.workspaces w where w.created_by = e.user_id;

alter table public.projects alter column workspace_id set not null;
alter table public.sections alter column workspace_id set not null;
alter table public.notes alter column workspace_id set not null;
alter table public.items alter column workspace_id set not null;
alter table public.subtasks alter column workspace_id set not null;
alter table public.item_comments alter column workspace_id set not null;

create index projects_workspace_id_idx on public.projects (workspace_id);
create index sections_workspace_id_idx on public.sections (workspace_id);
create index notes_workspace_id_idx on public.notes (workspace_id);
create index items_workspace_id_idx on public.items (workspace_id);
create index subtasks_workspace_id_idx on public.subtasks (workspace_id);
create index item_comments_workspace_id_idx on public.item_comments (workspace_id);
create index ai_extraction_events_workspace_id_idx on public.ai_extraction_events (workspace_id);

-- owner_id -> created_by. It used to cascade (deleting a user deleted their rows);
-- in a shared workspace the work must stay, so it becomes "set null".
do $$
declare
  t text;
begin
  foreach t in array array['projects', 'sections', 'notes', 'items', 'subtasks', 'item_comments'] loop
    execute format('alter table public.%I rename column owner_id to created_by', t);
    execute format('alter table public.%I alter column created_by drop not null', t);
    execute format('alter table public.%I drop constraint %I', t, t || '_owner_id_fkey');
    execute format(
      'alter table public.%I add constraint %I foreign key (created_by) references auth.users (id) on delete set null',
      t, t || '_created_by_fkey'
    );
    execute format('alter index public.%I rename to %I', t || '_owner_id_idx', t || '_created_by_idx');
  end loop;
end;
$$;

-- A real person on a task. The text column stays for names that aren't members
-- ("Contractor", or a name the AI found in meeting notes).
alter table public.items add column assignee_id uuid references auth.users (id) on delete set null;
create index items_assignee_id_idx on public.items (assignee_id);

-- ===========================================================================
-- 3. Authorization helpers
--    security definer: they read the membership tables directly, so policies
--    that call them never recurse into those tables' own policies.
-- ===========================================================================

create function public.workspace_role(ws uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.workspace_members where workspace_id = ws and user_id = (select auth.uid());
$$;

create function public.is_workspace_member(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.workspace_role(ws) is not null;
$$;

-- Owner or admin: may manage members and workspace settings.
create function public.is_workspace_admin(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.workspace_role(ws) in ('owner', 'admin'), false);
$$;

-- Owner, admin or member: may create and edit work. Guests may not.
-- Phase 2 also returns false here while the workspace is read-only.
create function public.can_write_workspace(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.workspace_role(ws) in ('owner', 'admin', 'member'), false);
$$;

-- True when the caller was added to this project by name (how guests get in).
create function public.is_project_member(p uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.project_members where project_id = p and user_id = (select auth.uid()));
$$;

create function public.can_read_project(p uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.projects pr
    where pr.id = p
      and (public.can_write_workspace(pr.workspace_id)
           or (public.is_workspace_member(pr.workspace_id) and public.is_project_member(pr.id)))
  );
$$;

create function public.can_write_project(p uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.projects pr where pr.id = p and public.can_write_workspace(pr.workspace_id));
$$;

create function public.can_read_item(i uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.items it where it.id = i and public.can_read_project(it.project_id));
$$;

create function public.can_write_item(i uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.items it where it.id = i and public.can_write_project(it.project_id));
$$;

-- Seats by plan (guests are free). Phase 2 folds this into workspace_limits().
create function public.workspace_seat_limit(ws uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case plan
    when 'trial' then 5
    when 'starter' then 5
    when 'team' then 15
    when 'business' then 50
    else 1000
  end
  from public.workspaces where id = ws;
$$;

create function public.workspace_seats_used(ws uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.workspace_members where workspace_id = ws and role <> 'guest';
$$;

-- ===========================================================================
-- 4. Triggers: the database, not the browser, fills in workspace_id and created_by
-- ===========================================================================

-- created_by is always the signed-in user on insert and never changes afterwards
-- (except to null, when that user's account is deleted). Server scripts using
-- the service role have no auth.uid() and may set it freely.
create function public.stamp_created_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null then
    if tg_op = 'INSERT' then
      new.created_by := (select auth.uid());
    elsif new.created_by is not null then
      new.created_by := old.created_by;
    end if;
  end if;
  return new;
end;
$$;

create function public.project_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.workspace_id := old.workspace_id; -- a project never moves between workspaces
  end if;
  return new;
end;
$$;

-- sections, notes and items take their workspace from their project.
create function public.project_child_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select workspace_id into new.workspace_id from public.projects where id = new.project_id;
  if new.workspace_id is null then
    raise exception 'project % does not exist', new.project_id using errcode = '23503';
  end if;
  return new;
end;
$$;

-- A task's section and source note must be in the same project, and its
-- assignee must belong to the workspace.
create function public.item_check_links()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.section_id is not null
     and not exists (select 1 from public.sections s where s.id = new.section_id and s.project_id = new.project_id) then
    raise exception 'that section belongs to a different project' using errcode = '23514';
  end if;
  if new.note_id is not null
     and not exists (select 1 from public.notes n where n.id = new.note_id and n.project_id = new.project_id) then
    raise exception 'that note belongs to a different project' using errcode = '23514';
  end if;
  if new.assignee_id is not null
     and not exists (
       select 1 from public.workspace_members m
       where m.workspace_id = new.workspace_id and m.user_id = new.assignee_id
     ) then
    raise exception 'the assignee is not a member of this workspace' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- subtasks and comments take their workspace from their task.
create function public.item_child_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select workspace_id into new.workspace_id from public.items where id = new.item_id;
  if new.workspace_id is null then
    raise exception 'item % does not exist', new.item_id using errcode = '23503';
  end if;
  return new;
end;
$$;

-- Trigger names sort so that workspace_id is set (a_) before links are checked (b_).
create trigger a_stamp before insert or update on public.projects
  for each row execute function public.stamp_created_by();
create trigger b_workspace before insert or update on public.projects
  for each row execute function public.project_before_write();

create trigger a_stamp before insert or update on public.sections
  for each row execute function public.stamp_created_by();
create trigger a_workspace before insert or update on public.sections
  for each row execute function public.project_child_before_write();

create trigger a_stamp before insert or update on public.notes
  for each row execute function public.stamp_created_by();
create trigger a_workspace before insert or update on public.notes
  for each row execute function public.project_child_before_write();

create trigger a_stamp before insert or update on public.items
  for each row execute function public.stamp_created_by();
create trigger a_workspace before insert or update on public.items
  for each row execute function public.project_child_before_write();
create trigger b_links before insert or update on public.items
  for each row execute function public.item_check_links();

create trigger a_stamp before insert or update on public.subtasks
  for each row execute function public.stamp_created_by();
create trigger a_workspace before insert or update on public.subtasks
  for each row execute function public.item_child_before_write();

create trigger a_stamp before insert or update on public.item_comments
  for each row execute function public.stamp_created_by();
create trigger a_workspace before insert or update on public.item_comments
  for each row execute function public.item_child_before_write();

-- ===========================================================================
-- 5. Row Level Security: replace every owner-based policy with a membership one
-- ===========================================================================

do $$
declare
  pol record;
begin
  for pol in
    select tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename in ('projects', 'sections', 'notes', 'items', 'subtasks', 'item_comments')
  loop
    execute format('drop policy %I on public.%I', pol.policyname, pol.tablename);
  end loop;
end;
$$;

-- projects -------------------------------------------------------------------
-- The select policy reads the row's own columns (not can_read_project) so that
-- "insert ... returning" can see the row it just created.
create policy "Members can view projects; guests only the ones shared with them"
  on public.projects for select to authenticated
  using (
    public.can_write_workspace(workspace_id)
    or (public.is_workspace_member(workspace_id) and public.is_project_member(id))
  );

create policy "Members can create projects"
  on public.projects for insert to authenticated
  with check (public.can_write_workspace(workspace_id));

create policy "Members can edit projects"
  on public.projects for update to authenticated
  using (public.can_write_workspace(workspace_id))
  with check (public.can_write_workspace(workspace_id));

create policy "Admins and the project's creator can delete it"
  on public.projects for delete to authenticated
  using (
    public.is_workspace_admin(workspace_id)
    or (created_by = (select auth.uid()) and public.can_write_workspace(workspace_id))
  );

-- sections, notes, items -----------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['sections', 'notes', 'items'] loop
    execute format(
      'create policy "Anyone who can see the project can view" on public.%I for select to authenticated
         using (public.can_read_project(project_id))', t);
    execute format(
      'create policy "Members can add" on public.%I for insert to authenticated
         with check (public.can_write_project(project_id))', t);
    execute format(
      'create policy "Members can edit" on public.%I for update to authenticated
         using (public.can_write_project(project_id))
         with check (public.can_write_project(project_id))', t);
    execute format(
      'create policy "Members can delete" on public.%I for delete to authenticated
         using (public.can_write_project(project_id))', t);
  end loop;
end;
$$;

-- subtasks -------------------------------------------------------------------
create policy "Anyone who can see the task can view its subtasks"
  on public.subtasks for select to authenticated
  using (public.can_read_item(item_id));

create policy "Members can add subtasks"
  on public.subtasks for insert to authenticated
  with check (public.can_write_item(item_id));

create policy "Members can edit subtasks"
  on public.subtasks for update to authenticated
  using (public.can_write_item(item_id))
  with check (public.can_write_item(item_id));

create policy "Members can delete subtasks"
  on public.subtasks for delete to authenticated
  using (public.can_write_item(item_id));

-- comments: the one thing a guest may write ------------------------------------
create policy "Anyone who can see the task can view its comments"
  on public.item_comments for select to authenticated
  using (public.can_read_item(item_id));

create policy "Anyone who can see the task can comment"
  on public.item_comments for insert to authenticated
  with check (public.can_read_item(item_id));

create policy "People can delete their own comments; admins any"
  on public.item_comments for delete to authenticated
  using (
    public.can_read_item(item_id)
    and (created_by = (select auth.uid()) or public.is_workspace_admin(workspace_id))
  );

-- workspaces -----------------------------------------------------------------
alter table public.workspaces enable row level security;

create policy "Members can view their workspace"
  on public.workspaces for select to authenticated
  using (public.is_workspace_member(id));

create policy "Admins can rename the workspace"
  on public.workspaces for update to authenticated
  using (public.is_workspace_admin(id))
  with check (public.is_workspace_admin(id));

-- Column-level locks. Members never see the Stripe IDs, and the only column
-- anyone can write is the name. Plans and billing change through the server.
revoke all on public.workspaces from anon, authenticated;
grant select (id, name, slug, created_by, plan, subscription_status, trial_ends_at, grace_ends_at, storage_bytes_used, created_at)
  on public.workspaces to authenticated;
grant update (name) on public.workspaces to authenticated;
grant all on public.workspaces to service_role;

-- workspace_members: read-only; every change goes through a function below ----
alter table public.workspace_members enable row level security;

create policy "Members can see who is in their workspace"
  on public.workspace_members for select to authenticated
  using (public.is_workspace_member(workspace_id));

revoke all on public.workspace_members from anon, authenticated;
grant select on public.workspace_members to authenticated;
grant all on public.workspace_members to service_role;

-- workspace_invites: read-only, and never the token hash -----------------------
alter table public.workspace_invites enable row level security;

create policy "Admins and the sender can see invites"
  on public.workspace_invites for select to authenticated
  using (public.is_workspace_admin(workspace_id) or invited_by = (select auth.uid()));

revoke all on public.workspace_invites from anon, authenticated;
grant select (id, workspace_id, email, role, project_id, invited_by, created_at, expires_at, accepted_at, revoked_at)
  on public.workspace_invites to authenticated;
grant all on public.workspace_invites to service_role;

-- project_members ------------------------------------------------------------
alter table public.project_members enable row level security;

create policy "Anyone who can see the project can see who it is shared with"
  on public.project_members for select to authenticated
  using (public.can_read_project(project_id));

-- Only someone already in the workspace can be added to one of its projects.
create policy "Members can share a project with workspace people"
  on public.project_members for insert to authenticated
  with check (
    public.can_write_project(project_id)
    and exists (
      select 1 from public.projects pr
      join public.workspace_members m on m.workspace_id = pr.workspace_id
      where pr.id = project_id and m.user_id = project_members.user_id
    )
  );

create policy "Members can unshare; anyone can remove themselves"
  on public.project_members for delete to authenticated
  using (public.can_write_project(project_id) or user_id = (select auth.uid()));

revoke all on public.project_members from anon, authenticated;
grant select, insert, delete on public.project_members to authenticated;
grant all on public.project_members to service_role;

-- ===========================================================================
-- 6. Functions the app calls. Each one checks the caller's role itself.
-- ===========================================================================

-- Names and emails of the people in a workspace, for pickers and the Members page.
-- (profiles stays private to its owner; this exposes only these columns.)
create function public.workspace_people(ws uuid)
returns table (user_id uuid, full_name text, email text, avatar_url text, role text, joined_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id, p.full_name, p.email, p.avatar_url, m.role, m.created_at
  from public.workspace_members m
  left join public.profiles p on p.id = m.user_id
  where m.workspace_id = ws and public.is_workspace_member(ws)
  order by m.created_at;
$$;

create function public.create_workspace(p_name text)
returns table (id uuid, slug text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_id uuid;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if char_length(trim(coalesce(p_name, ''))) not between 1 and 120 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  if (select count(*) from public.workspace_members m where m.user_id = v_user and m.role = 'owner') >= 10 then
    raise exception 'workspace_limit' using errcode = '53400';
  end if;

  v_id := public.create_workspace_for(v_user, p_name);
  return query select w.id, w.slug from public.workspaces w where w.id = v_id;
end;
$$;

-- Records an invite. The app makes the random token, emails the link, and sends
-- only the token's SHA-256 hash here.
--   * admins invite admins, members and guests
--   * any member can invite a guest to one project (the Share dialog)
create function public.create_invite(
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
    if p_role <> 'guest' or not public.can_write_project(p_project)
       or not exists (select 1 from public.projects pr where pr.id = p_project and pr.workspace_id = p_workspace) then
      raise exception 'not_allowed' using errcode = '42501';
    end if;
  elsif not public.is_workspace_admin(p_workspace) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  -- Only the owner may create admins (same rule as set_member_role).
  if p_role = 'admin' and public.workspace_role(p_workspace) <> 'owner' then
    raise exception 'not_allowed' using errcode = '42501';
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

create function public.revoke_invite(p_invite uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.workspace_invites i set revoked_at = now()
  where i.id = p_invite and i.accepted_at is null and i.revoked_at is null
    and (public.is_workspace_admin(i.workspace_id) or i.invited_by = (select auth.uid()));
  if not found then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
end;
$$;

-- What the invite page shows before the visitor signs in. Knowing the token is
-- the only way to call this usefully, and it reveals just these three things.
create function public.invite_preview(p_token text)
returns table (workspace_name text, email text, role text)
language sql
stable
security definer
set search_path = ''
as $$
  select w.name, i.email, i.role
  from public.workspace_invites i
  join public.workspaces w on w.id = i.workspace_id
  where i.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
    and i.accepted_at is null and i.revoked_at is null and i.expires_at > now();
$$;

-- Joins the workspace. Single use, 7 days, and only for the invited email.
create function public.accept_invite(p_token text)
returns table (workspace_slug text, project_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_email text;
  v_invite public.workspace_invites%rowtype;
  v_existing text;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;

  select * into v_invite from public.workspace_invites i
  where i.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
  for update;
  if not found or v_invite.accepted_at is not null or v_invite.revoked_at is not null or v_invite.expires_at <= now() then
    raise exception 'invite_invalid' using errcode = '22023';
  end if;

  select lower(u.email) into v_email from auth.users u where u.id = v_user;
  if v_email is distinct from v_invite.email then
    raise exception 'invite_wrong_email' using errcode = '42501';
  end if;

  select m.role into v_existing from public.workspace_members m
  where m.workspace_id = v_invite.workspace_id and m.user_id = v_user;

  if v_existing is null then
    -- Checked again here: seats may have filled up since the invite was sent.
    if v_invite.role <> 'guest'
       and public.workspace_seats_used(v_invite.workspace_id) >= public.workspace_seat_limit(v_invite.workspace_id) then
      raise exception 'seat_limit' using errcode = '53400';
    end if;
    insert into public.workspace_members (workspace_id, user_id, role)
    values (v_invite.workspace_id, v_user, v_invite.role);
  end if;

  if v_invite.project_id is not null then
    insert into public.project_members (project_id, user_id) values (v_invite.project_id, v_user)
    on conflict do nothing;
  end if;

  update public.workspace_invites i set accepted_at = now() where i.id = v_invite.id;
  update public.profiles p set last_workspace_id = v_invite.workspace_id where p.id = v_user;

  return query select w.slug, v_invite.project_id from public.workspaces w where w.id = v_invite.workspace_id;
end;
$$;

-- Admins change roles. The owner's role only changes through transfer_ownership.
create function public.set_member_role(p_workspace uuid, p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current text;
begin
  if not public.is_workspace_admin(p_workspace) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_role not in ('admin', 'member', 'guest') then
    raise exception 'invalid_role' using errcode = '22023';
  end if;

  select m.role into v_current from public.workspace_members m
  where m.workspace_id = p_workspace and m.user_id = p_user for update;
  if v_current is null then
    raise exception 'not_a_member' using errcode = '22023';
  end if;
  if v_current = 'owner' then
    raise exception 'owner_role_is_fixed' using errcode = '42501';
  end if;
  -- Only the owner may create or demote admins.
  if (v_current = 'admin' or p_role = 'admin') and public.workspace_role(p_workspace) <> 'owner' then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if v_current = 'guest' and p_role <> 'guest'
     and public.workspace_seats_used(p_workspace) >= public.workspace_seat_limit(p_workspace) then
    raise exception 'seat_limit' using errcode = '53400';
  end if;

  update public.workspace_members m set role = p_role where m.workspace_id = p_workspace and m.user_id = p_user;
end;
$$;

-- Removes someone (admins), or yourself (leave). The owner can't be removed.
-- Their tasks keep the person's name as plain text so the history still reads.
create function public.remove_member(p_workspace uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_role text;
begin
  select m.role into v_role from public.workspace_members m
  where m.workspace_id = p_workspace and m.user_id = p_user for update;
  if v_role is null then
    raise exception 'not_a_member' using errcode = '22023';
  end if;
  if v_role = 'owner' then
    raise exception 'owner_cannot_leave' using errcode = '42501';
  end if;
  if p_user is distinct from v_caller then
    if not public.is_workspace_admin(p_workspace)
       or (v_role = 'admin' and public.workspace_role(p_workspace) <> 'owner') then
      raise exception 'not_allowed' using errcode = '42501';
    end if;
  end if;

  update public.items i
  set assignee = coalesce(i.assignee, (select coalesce(p.full_name, p.email) from public.profiles p where p.id = p_user)),
      assignee_id = null
  where i.workspace_id = p_workspace and i.assignee_id = p_user;

  delete from public.project_members pm
  using public.projects pr
  where pr.id = pm.project_id and pr.workspace_id = p_workspace and pm.user_id = p_user;

  delete from public.workspace_members m where m.workspace_id = p_workspace and m.user_id = p_user;
  update public.profiles p set last_workspace_id = null where p.id = p_user and p.last_workspace_id = p_workspace;
end;
$$;

-- Hands the workspace to another member. The old owner becomes an admin.
create function public.transfer_ownership(p_workspace uuid, p_new_owner uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
begin
  if public.workspace_role(p_workspace) is distinct from 'owner' then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_new_owner = v_caller or not exists (
    select 1 from public.workspace_members m
    where m.workspace_id = p_workspace and m.user_id = p_new_owner and m.role in ('admin', 'member')
  ) then
    raise exception 'invalid_new_owner' using errcode = '22023';
  end if;

  update public.workspace_members m set role = 'admin' where m.workspace_id = p_workspace and m.user_id = v_caller;
  update public.workspace_members m set role = 'owner' where m.workspace_id = p_workspace and m.user_id = p_new_owner;
end;
$$;

-- ===========================================================================
-- 7. Sign-up, billing mirror and account deletion
-- ===========================================================================

-- New accounts get a profile and a workspace of their own.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_full_name text := nullif(trim(new.raw_user_meta_data ->> 'full_name'), '');
  v_company text := nullif(trim(new.raw_user_meta_data ->> 'company_name'), '');
begin
  -- Only name fields are copied from sign-up data. Plan and billing fields
  -- always start at their defaults, whatever the sign-up request contained.
  insert into public.profiles (id, email, full_name, company_name)
  values (new.id, new.email, v_full_name, v_company);

  perform public.create_workspace_for(
    new.id,
    coalesce(v_company, v_full_name || '''s workspace', split_part(coalesce(new.email, 'my'), '@', 1) || '''s workspace')
  );
  return new;
end;
$$;

-- Until Phase 2 moves billing to the workspace, Stripe still writes to profiles.
-- This keeps the plan on the workspace that person owns in step, so seat limits
-- follow what they pay for. (With several owned workspaces, the oldest one.)
create function public.mirror_profile_billing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.workspaces w
  set plan = case when new.plan = 'free' then 'trial' else new.plan end,
      subscription_status = new.subscription_status,
      stripe_customer_id = new.stripe_customer_id,
      stripe_subscription_id = new.stripe_subscription_id
  where w.id = (
    select m.workspace_id from public.workspace_members m
    join public.workspaces w2 on w2.id = m.workspace_id
    where m.user_id = new.id and m.role = 'owner'
    order by w2.created_at
    limit 1
  );
  return new;
end;
$$;

create trigger on_profile_billing_changed
  after update of plan, subscription_status, stripe_customer_id, stripe_subscription_id on public.profiles
  for each row execute function public.mirror_profile_billing();

-- Deleting your account: workspaces where you are the only person go with you.
-- If you own a workspace other people use, hand it over first.
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

  delete from public.workspaces w
  where exists (select 1 from public.workspace_members m where m.workspace_id = w.id and m.user_id = v_user_id and m.role = 'owner');

  delete from auth.users where id = v_user_id;
end;
$$;

-- ===========================================================================
-- 8. Who may call what
-- ===========================================================================

revoke execute on function
  public.new_workspace_slug(text),
  public.create_workspace_for(uuid, text),
  public.stamp_created_by(),
  public.project_before_write(),
  public.project_child_before_write(),
  public.item_check_links(),
  public.item_child_before_write(),
  public.mirror_profile_billing()
from public, anon, authenticated;

revoke execute on function
  public.workspace_role(uuid),
  public.is_workspace_member(uuid),
  public.is_workspace_admin(uuid),
  public.can_write_workspace(uuid),
  public.is_project_member(uuid),
  public.can_read_project(uuid),
  public.can_write_project(uuid),
  public.can_read_item(uuid),
  public.can_write_item(uuid),
  public.workspace_seat_limit(uuid),
  public.workspace_seats_used(uuid),
  public.workspace_people(uuid),
  public.create_workspace(text),
  public.create_invite(uuid, text, text, text, uuid),
  public.revoke_invite(uuid),
  public.accept_invite(text),
  public.set_member_role(uuid, uuid, text),
  public.remove_member(uuid, uuid),
  public.transfer_ownership(uuid, uuid),
  public.invite_preview(text)
from public, anon;

grant execute on function
  public.workspace_role(uuid),
  public.is_workspace_member(uuid),
  public.is_workspace_admin(uuid),
  public.can_write_workspace(uuid),
  public.is_project_member(uuid),
  public.can_read_project(uuid),
  public.can_write_project(uuid),
  public.can_read_item(uuid),
  public.can_write_item(uuid),
  public.workspace_seat_limit(uuid),
  public.workspace_seats_used(uuid),
  public.workspace_people(uuid),
  public.create_workspace(text),
  public.create_invite(uuid, text, text, text, uuid),
  public.revoke_invite(uuid),
  public.accept_invite(text),
  public.set_member_role(uuid, uuid, text),
  public.remove_member(uuid, uuid),
  public.transfer_ownership(uuid, uuid),
  public.invite_preview(text)
to authenticated;

-- The invite page loads before the visitor has signed in.
grant execute on function public.invite_preview(text) to anon;

-- Comments were insert/select/delete only; nothing changes there. Triggers need
-- no grants. service_role keeps full access to the altered tables.
