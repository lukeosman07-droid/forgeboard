-- Phase 5: engineering depth.
--
--   * Registers, each with a per-project running number: rfis, submittals
--     (with submittal_revisions history), milestones and design reviews.
--     Review comments are items with a disposition; a review closes only when
--     every comment is dealt with.
--   * item_dependencies: finish-to-start links between tasks, with a cycle
--     check, and dependency_conflicts() for successors that start too early.
--   * saved_views: a project's filters and sort, saved by name.
--   * templates: a workspace's own project templates.
--   * workload(): open tasks per person per week across projects.
--   * Search and Ask cover RFIs and submittals.
--
-- Plans: RFIs, submittals and dependencies need the "registers" feature
-- (trial, Team, Business); workload and custom templates need "workload"
-- (trial, Business). Milestones, reviews and saved views are on every plan.

-- ===========================================================================
-- 0. AI features for the register helpers
-- ===========================================================================

alter table public.ai_usage drop constraint ai_usage_feature_check;
alter table public.ai_usage add constraint ai_usage_feature_check
  check (feature in ('extract', 'plan', 'status_report', 'ask', 'rfi_draft', 'submittal_review', 'other'));

-- ===========================================================================
-- 1. Shared helpers
-- ===========================================================================

-- Gives a new register row the next number in its project (RFI-001, ...).
-- Locks the project row so two people adding at once never get the same one.
create function public.register_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_next integer;
begin
  perform 1 from public.projects where id = new.project_id for no key update;
  execute format('select coalesce(max(number), 0) + 1 from public.%I where project_id = $1', tg_table_name)
    into v_next using new.project_id;
  new.number := v_next;
  return new;
end;
$$;

-- Register rows never change number, project or creation time.
create function public.register_keep()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.number := old.number;
  new.project_id := old.project_id;
  new.workspace_id := old.workspace_id;
  new.created_at := old.created_at;
  return new;
end;
$$;

-- The name to show for a workspace member.
create function public.member_display_name(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(nullif(trim(p.full_name), ''), p.email, 'Former member')
  from public.profiles p where p.id = p_user;
$$;

create function public.is_member_of(p_workspace uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.workspace_members m where m.workspace_id = p_workspace and m.user_id = p_user);
$$;

-- ===========================================================================
-- 2. RFIs
-- ===========================================================================

create table public.rfis (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  number integer not null,
  subject text not null check (char_length(subject) between 1 and 300),
  question text not null default '' check (char_length(question) <= 10000),
  response text check (char_length(response) <= 10000),
  status text not null default 'open' check (status in ('draft', 'open', 'answered', 'closed')),
  asked_by_id uuid default auth.uid() references auth.users (id) on delete set null,
  -- Who has to act next: a member (ball_in_court_id), or a named outside party.
  ball_in_court text check (char_length(ball_in_court) <= 200),
  ball_in_court_id uuid references auth.users (id) on delete set null,
  date_required date,
  -- Kept by the database from status changes.
  opened_at timestamptz,
  answered_at timestamptz,
  closed_at timestamptz,
  -- The extracted question it was raised from.
  source_item_id uuid references public.items (id) on delete set null,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search tsvector generated always as (
    setweight(to_tsvector('english', 'RFI ' || number::text || ' ' || subject), 'A') ||
    setweight(to_tsvector('english', coalesce(question, '') || ' ' || coalesce(response, '')), 'B')
  ) stored,
  unique (project_id, number)
);

create index rfis_project_idx on public.rfis (project_id, number);
create index rfis_workspace_idx on public.rfis (workspace_id);
create index rfis_search_idx on public.rfis using gin (search);
create index rfis_created_by_idx on public.rfis (created_by);

-- Status dates, people and links. Server scripts (no auth.uid()) may set the
-- dates themselves, for importing history.
create function public.rfi_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is not null then
    if tg_op = 'INSERT' then
      new.opened_at := null;
      new.answered_at := null;
      new.closed_at := null;
    else
      new.opened_at := old.opened_at;
      new.answered_at := old.answered_at;
      new.closed_at := old.closed_at;
    end if;
  end if;
  new.updated_at := now();

  if new.status <> 'draft' and new.opened_at is null then
    new.opened_at := now();
  end if;
  if new.status = 'answered' and new.answered_at is null then
    new.answered_at := now();
  end if;
  if new.status = 'closed' and new.closed_at is null then
    new.closed_at := now();
  end if;
  -- Reopened: the clock runs again.
  if new.status in ('draft', 'open') then
    new.answered_at := null;
    new.closed_at := null;
  elsif new.status = 'answered' then
    new.closed_at := null;
  end if;

  if new.ball_in_court_id is not null then
    if not public.is_member_of(new.workspace_id, new.ball_in_court_id) then
      raise exception 'ball in court must be a member of this workspace' using errcode = '23514';
    end if;
    new.ball_in_court := public.member_display_name(new.ball_in_court_id);
  end if;
  if new.asked_by_id is not null and (tg_op = 'INSERT' or new.asked_by_id is distinct from old.asked_by_id)
     and not public.is_member_of(new.workspace_id, new.asked_by_id) then
    raise exception 'asked by must be a member of this workspace' using errcode = '23514';
  end if;
  if new.source_item_id is not null
     and not exists (select 1 from public.items i where i.id = new.source_item_id and i.project_id = new.project_id) then
    raise exception 'that item belongs to a different project' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger a_stamp before insert or update on public.rfis
  for each row execute function public.stamp_created_by();
create trigger a_workspace before insert on public.rfis
  for each row execute function public.project_child_before_write();
create trigger b_number before insert on public.rfis
  for each row execute function public.register_number();
create trigger b_keep before update on public.rfis
  for each row execute function public.register_keep();
create trigger c_checks before insert or update on public.rfis
  for each row execute function public.rfi_before_write();

alter table public.rfis enable row level security;
revoke all on public.rfis from anon, authenticated;
grant select, insert, delete on public.rfis to authenticated;
grant update (subject, question, response, status, asked_by_id, ball_in_court, ball_in_court_id, date_required) on public.rfis to authenticated;
grant all on public.rfis to service_role;

create policy "Anyone who can see the project can view its RFIs"
  on public.rfis for select to authenticated
  using (public.can_read_project(project_id));
create policy "Members can add RFIs on plans with registers"
  on public.rfis for insert to authenticated
  with check (public.can_write_project(project_id) and public.workspace_has_feature(workspace_id, 'registers'));
create policy "Members can edit RFIs on plans with registers"
  on public.rfis for update to authenticated
  using (public.can_write_project(project_id))
  with check (public.can_write_project(project_id) and public.workspace_has_feature(workspace_id, 'registers'));
create policy "Members can delete RFIs"
  on public.rfis for delete to authenticated
  using (public.can_write_project(project_id));

-- ===========================================================================
-- 3. Submittals and their revision history
-- ===========================================================================

create table public.submittals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  number integer not null,
  spec_section text check (char_length(spec_section) <= 60),
  title text not null check (char_length(title) between 1 and 300),
  description text check (char_length(description) <= 5000),
  -- Who sent it in: the contractor or supplier.
  submitted_by text check (char_length(submitted_by) <= 200),
  reviewer text check (char_length(reviewer) <= 200),
  reviewer_id uuid references auth.users (id) on delete set null,
  received_on date,
  due_on date,
  returned_on date,
  revision integer not null default 0 check (revision between 0 and 99),
  action text not null default 'pending'
    check (action in ('pending', 'approved', 'approved_as_noted', 'revise_resubmit', 'rejected')),
  review_notes text check (char_length(review_notes) <= 20000),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search tsvector generated always as (
    setweight(to_tsvector('english', 'Submittal ' || number::text || ' ' || coalesce(spec_section, '') || ' ' || title), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '') || ' ' || coalesce(submitted_by, '') || ' ' || coalesce(review_notes, '')), 'B')
  ) stored,
  unique (project_id, number)
);

create index submittals_project_idx on public.submittals (project_id, number);
create index submittals_workspace_idx on public.submittals (workspace_id);
create index submittals_search_idx on public.submittals using gin (search);
create index submittals_created_by_idx on public.submittals (created_by);

-- One row per past revision, written only by the trigger below.
create table public.submittal_revisions (
  id bigint generated always as identity primary key,
  submittal_id uuid not null references public.submittals (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  revision integer not null,
  action text not null,
  received_on date,
  due_on date,
  returned_on date,
  review_notes text,
  recorded_by uuid references auth.users (id) on delete set null,
  recorded_at timestamptz not null default now(),
  unique (submittal_id, revision)
);

create index submittal_revisions_project_idx on public.submittal_revisions (project_id);

-- The flow: pending -> a decision. After "revise and resubmit" or "rejected",
-- the next revision starts: the old one goes into the history and the new one
-- is pending again.
create function public.submittal_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' and new.revision <> old.revision then
    if new.revision <> old.revision + 1 then
      raise exception 'submittal_revision_order' using errcode = '23514',
        hint = 'A new revision is always the next number.';
    end if;
    if old.action not in ('revise_resubmit', 'rejected') then
      raise exception 'submittal_resubmit_not_needed' using errcode = '23514',
        hint = 'Only a submittal marked "revise and resubmit" or "rejected" gets a new revision.';
    end if;
    insert into public.submittal_revisions
      (submittal_id, workspace_id, project_id, revision, action, received_on, due_on, returned_on, review_notes, recorded_by)
    values
      (old.id, old.workspace_id, old.project_id, old.revision, old.action, old.received_on, old.due_on, old.returned_on, old.review_notes, (select auth.uid()));
    new.action := 'pending';
    new.returned_on := null;
    new.review_notes := null;
  end if;

  -- Returned the day a decision is made, unless a date was given.
  if new.action <> 'pending' and new.returned_on is null
     and (tg_op = 'INSERT' or old.action = 'pending' or new.revision <> old.revision) then
    new.returned_on := current_date;
  end if;
  if new.action = 'pending' then
    new.returned_on := null;
  end if;

  if new.reviewer_id is not null then
    if not public.is_member_of(new.workspace_id, new.reviewer_id) then
      raise exception 'the reviewer must be a member of this workspace' using errcode = '23514';
    end if;
    new.reviewer := public.member_display_name(new.reviewer_id);
  end if;
  return new;
end;
$$;

create trigger a_stamp before insert or update on public.submittals
  for each row execute function public.stamp_created_by();
create trigger a_workspace before insert on public.submittals
  for each row execute function public.project_child_before_write();
create trigger b_number before insert on public.submittals
  for each row execute function public.register_number();
create trigger b_keep before update on public.submittals
  for each row execute function public.register_keep();
create trigger c_checks before insert or update on public.submittals
  for each row execute function public.submittal_before_write();

alter table public.submittals enable row level security;
revoke all on public.submittals from anon, authenticated;
grant select, insert, delete on public.submittals to authenticated;
grant update (spec_section, title, description, submitted_by, reviewer, reviewer_id, received_on, due_on, returned_on, revision, action, review_notes)
  on public.submittals to authenticated;
grant all on public.submittals to service_role;

create policy "Anyone who can see the project can view its submittals"
  on public.submittals for select to authenticated
  using (public.can_read_project(project_id));
create policy "Members can add submittals on plans with registers"
  on public.submittals for insert to authenticated
  with check (public.can_write_project(project_id) and public.workspace_has_feature(workspace_id, 'registers'));
create policy "Members can edit submittals on plans with registers"
  on public.submittals for update to authenticated
  using (public.can_write_project(project_id))
  with check (public.can_write_project(project_id) and public.workspace_has_feature(workspace_id, 'registers'));
create policy "Members can delete submittals"
  on public.submittals for delete to authenticated
  using (public.can_write_project(project_id));

alter table public.submittal_revisions enable row level security;
revoke all on public.submittal_revisions from anon, authenticated;
grant select on public.submittal_revisions to authenticated;
grant all on public.submittal_revisions to service_role;

create policy "Anyone who can see the project can view submittal history"
  on public.submittal_revisions for select to authenticated
  using (public.can_read_project(project_id));

-- ===========================================================================
-- 4. Milestones and design reviews
-- ===========================================================================

create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  number integer not null,
  name text not null check (char_length(name) between 1 and 120),
  due_on date not null,
  done_at timestamptz,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (project_id, number)
);

create index milestones_project_idx on public.milestones (project_id, due_on);
create index milestones_workspace_idx on public.milestones (workspace_id);
create index milestones_created_by_idx on public.milestones (created_by);

create trigger a_stamp before insert or update on public.milestones
  for each row execute function public.stamp_created_by();
create trigger a_workspace before insert on public.milestones
  for each row execute function public.project_child_before_write();
create trigger b_number before insert on public.milestones
  for each row execute function public.register_number();
create trigger b_keep before update on public.milestones
  for each row execute function public.register_keep();

alter table public.milestones enable row level security;
revoke all on public.milestones from anon, authenticated;
grant select, insert, delete on public.milestones to authenticated;
grant update (name, due_on, done_at) on public.milestones to authenticated;
grant all on public.milestones to service_role;

create policy "Anyone who can see the project can view its milestones"
  on public.milestones for select to authenticated
  using (public.can_read_project(project_id));
create policy "Members can add milestones"
  on public.milestones for insert to authenticated
  with check (public.can_write_project(project_id));
create policy "Members can edit milestones"
  on public.milestones for update to authenticated
  using (public.can_write_project(project_id))
  with check (public.can_write_project(project_id));
create policy "Members can delete milestones"
  on public.milestones for delete to authenticated
  using (public.can_write_project(project_id));

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  number integer not null,
  name text not null check (char_length(name) between 1 and 200),
  milestone_id uuid references public.milestones (id) on delete set null,
  due_on date,
  status text not null default 'open' check (status in ('open', 'closed')),
  closed_at timestamptz,
  closed_by uuid references auth.users (id) on delete set null,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (project_id, number)
);

create index reviews_project_idx on public.reviews (project_id, number);
create index reviews_workspace_idx on public.reviews (workspace_id);
create index reviews_milestone_idx on public.reviews (milestone_id) where milestone_id is not null;
create index reviews_created_by_idx on public.reviews (created_by);

-- Close-out check: a review closes only when every comment has a disposition
-- and every comment to incorporate is done.
create function public.review_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pending integer;
  v_undone integer;
begin
  if new.milestone_id is not null
     and not exists (select 1 from public.milestones m where m.id = new.milestone_id and m.project_id = new.project_id) then
    raise exception 'that milestone belongs to a different project' using errcode = '23514';
  end if;

  if new.status = 'closed' and (tg_op = 'INSERT' or old.status <> 'closed') then
    if tg_op = 'UPDATE' then
      select count(*) filter (where i.disposition = 'pending'),
             count(*) filter (where i.disposition = 'incorporate' and i.status <> 'done')
        into v_pending, v_undone
      from public.items i where i.review_id = new.id;
      if v_pending > 0 or v_undone > 0 then
        raise exception 'review_not_ready' using errcode = '23514',
          hint = format('%s comment(s) still need a disposition and %s to incorporate aren''t done yet.', v_pending, v_undone);
      end if;
    end if;
    new.closed_at := now();
    new.closed_by := (select auth.uid());
  elsif new.status = 'open' then
    new.closed_at := null;
    new.closed_by := null;
  elsif tg_op = 'UPDATE' then
    new.closed_at := old.closed_at;
    new.closed_by := old.closed_by;
  end if;
  return new;
end;
$$;

create trigger a_stamp before insert or update on public.reviews
  for each row execute function public.stamp_created_by();
create trigger a_workspace before insert on public.reviews
  for each row execute function public.project_child_before_write();
create trigger b_number before insert on public.reviews
  for each row execute function public.register_number();
create trigger b_keep before update on public.reviews
  for each row execute function public.register_keep();
create trigger c_checks before insert or update on public.reviews
  for each row execute function public.review_before_write();

alter table public.reviews enable row level security;
revoke all on public.reviews from anon, authenticated;
grant select, insert, delete on public.reviews to authenticated;
grant update (name, milestone_id, due_on, status) on public.reviews to authenticated;
grant all on public.reviews to service_role;

create policy "Anyone who can see the project can view its reviews"
  on public.reviews for select to authenticated
  using (public.can_read_project(project_id));
create policy "Members can add reviews"
  on public.reviews for insert to authenticated
  with check (public.can_write_project(project_id));
create policy "Members can edit reviews"
  on public.reviews for update to authenticated
  using (public.can_write_project(project_id))
  with check (public.can_write_project(project_id));
create policy "Members can delete reviews"
  on public.reviews for delete to authenticated
  using (public.can_write_project(project_id));

-- ===========================================================================
-- 5. Items: linked RFIs and submittals, review comments
-- ===========================================================================

alter table public.items
  add column rfi_id uuid references public.rfis (id) on delete set null,
  add column submittal_id uuid references public.submittals (id) on delete set null,
  -- A design review comment: belongs to a review and has a disposition.
  add column review_id uuid references public.reviews (id) on delete cascade,
  add column disposition text check (disposition in ('pending', 'incorporate', 'no_change', 'rejected', 'deferred')),
  add constraint items_disposition_with_review check ((review_id is null) = (disposition is null));

create index items_rfi_idx on public.items (rfi_id) where rfi_id is not null;
create index items_submittal_idx on public.items (submittal_id) where submittal_id is not null;
create index items_review_idx on public.items (review_id) where review_id is not null;

create function public.item_register_links()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.rfi_id is not null and (tg_op = 'INSERT' or new.rfi_id is distinct from old.rfi_id)
     and not exists (select 1 from public.rfis r where r.id = new.rfi_id and r.project_id = new.project_id) then
    raise exception 'that RFI belongs to a different project' using errcode = '23514';
  end if;
  if new.submittal_id is not null and (tg_op = 'INSERT' or new.submittal_id is distinct from old.submittal_id)
     and not exists (select 1 from public.submittals s where s.id = new.submittal_id and s.project_id = new.project_id) then
    raise exception 'that submittal belongs to a different project' using errcode = '23514';
  end if;
  if new.review_id is not null and (tg_op = 'INSERT' or new.review_id is distinct from old.review_id) then
    if not exists (select 1 from public.reviews r where r.id = new.review_id and r.project_id = new.project_id) then
      raise exception 'that review belongs to a different project' using errcode = '23514';
    end if;
    if exists (select 1 from public.reviews r where r.id = new.review_id and r.status = 'closed') then
      raise exception 'review_closed' using errcode = '23514', hint = 'This review is closed. Reopen it to add comments.';
    end if;
  end if;
  -- Review comments always carry a disposition; other items never do.
  if new.review_id is null then
    new.disposition := null;
  elsif new.disposition is null then
    new.disposition := 'pending';
  end if;
  return new;
end;
$$;

create trigger c_register_links before insert or update on public.items
  for each row execute function public.item_register_links();

-- Files can hang off RFIs and submittals too.
alter table public.attachments
  add column rfi_id uuid references public.rfis (id) on delete cascade,
  add column submittal_id uuid references public.submittals (id) on delete cascade,
  drop constraint attachments_one_parent,
  add constraint attachments_one_parent check (num_nonnulls(item_id, document_id, rfi_id, submittal_id) <= 1);

create index attachments_rfi_idx on public.attachments (rfi_id) where rfi_id is not null;
create index attachments_submittal_idx on public.attachments (submittal_id) where submittal_id is not null;

create function public.attachment_register_links()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.rfi_id is not null
     and not exists (select 1 from public.rfis r where r.id = new.rfi_id and r.project_id = new.project_id) then
    raise exception 'that RFI belongs to a different project' using errcode = '23514';
  end if;
  if new.submittal_id is not null
     and not exists (select 1 from public.submittals s where s.id = new.submittal_id and s.project_id = new.project_id) then
    raise exception 'that submittal belongs to a different project' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger c_register_links before insert or update on public.attachments
  for each row execute function public.attachment_register_links();

grant update (rfi_id, submittal_id) on public.attachments to authenticated;

-- ===========================================================================
-- 6. Dependencies
-- ===========================================================================

create table public.item_dependencies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  -- Finish-to-start: the successor starts after the predecessor is due.
  predecessor_id uuid not null references public.items (id) on delete cascade,
  successor_id uuid not null references public.items (id) on delete cascade,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (predecessor_id, successor_id),
  constraint item_dependencies_not_self check (predecessor_id <> successor_id)
);

create index item_dependencies_project_idx on public.item_dependencies (project_id);
create index item_dependencies_successor_idx on public.item_dependencies (successor_id);
create index item_dependencies_created_by_idx on public.item_dependencies (created_by);

create function public.dependency_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select i.project_id, i.workspace_id into new.project_id, new.workspace_id
  from public.items i where i.id = new.predecessor_id;
  if new.project_id is null then
    raise exception 'task % does not exist', new.predecessor_id using errcode = '23503';
  end if;
  if not exists (select 1 from public.items i where i.id = new.successor_id and i.project_id = new.project_id) then
    raise exception 'both tasks must be in the same project' using errcode = '23514';
  end if;
  -- No loops: the predecessor must not already wait on the successor.
  if exists (
    with recursive chain (id) as (
      select new.successor_id
      union
      select d.successor_id from public.item_dependencies d join chain c on d.predecessor_id = c.id
    )
    select 1 from chain where id = new.predecessor_id
  ) then
    raise exception 'dependency_cycle' using errcode = '23514',
      hint = 'That would make a loop: these tasks would wait on each other.';
  end if;
  return new;
end;
$$;

create trigger a_stamp before insert on public.item_dependencies
  for each row execute function public.stamp_created_by();
create trigger b_checks before insert on public.item_dependencies
  for each row execute function public.dependency_before_insert();

alter table public.item_dependencies enable row level security;
revoke all on public.item_dependencies from anon, authenticated;
grant select, insert, delete on public.item_dependencies to authenticated;
grant all on public.item_dependencies to service_role;

create policy "Anyone who can see the project can view its dependencies"
  on public.item_dependencies for select to authenticated
  using (public.can_read_project(project_id));
create policy "Members can link tasks on plans with dependencies"
  on public.item_dependencies for insert to authenticated
  with check (public.can_write_project(project_id) and public.workspace_has_feature(workspace_id, 'registers'));
create policy "Members can unlink tasks"
  on public.item_dependencies for delete to authenticated
  using (public.can_write_project(project_id));

-- Links where the successor starts on or before the day its predecessor is
-- due, while both are still open. Runs as the caller.
create function public.dependency_conflicts(p_project uuid)
returns table (dependency_id uuid, predecessor_id uuid, successor_id uuid, predecessor_due date, successor_start date)
language sql
stable
set search_path = ''
as $$
  select d.id, d.predecessor_id, d.successor_id, p.due_date, coalesce(s.start_date, s.due_date)
  from public.item_dependencies d
  join public.items p on p.id = d.predecessor_id
  join public.items s on s.id = d.successor_id
  where d.project_id = p_project
    and p.status <> 'done' and s.status <> 'done'
    and p.due_date is not null
    and coalesce(s.start_date, s.due_date) <= p.due_date;
$$;

grant execute on function public.dependency_conflicts(uuid) to authenticated;

-- ===========================================================================
-- 7. Saved views
-- ===========================================================================

create table public.saved_views (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  view text not null default 'table' check (view in ('table', 'board', 'calendar', 'timeline')),
  -- The filters and sort as URL query parameters, e.g. "status=open,stuck&sort=due".
  query text not null default '' check (char_length(query) <= 2000),
  -- Shared views show for everyone on the project; others only for their creator.
  shared boolean not null default true,
  created_by uuid default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index saved_views_project_idx on public.saved_views (project_id, name);
create index saved_views_created_by_idx on public.saved_views (created_by);

-- How many views there are already (a policy can't count its own table).
create function public.saved_view_count(p_project uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) from public.saved_views where project_id = p_project;
$$;

create trigger a_stamp before insert or update on public.saved_views
  for each row execute function public.stamp_created_by();
create trigger a_workspace before insert or update on public.saved_views
  for each row execute function public.project_child_before_write();

alter table public.saved_views enable row level security;
revoke all on public.saved_views from anon, authenticated;
grant select, insert, delete on public.saved_views to authenticated;
grant update (name, view, query, shared) on public.saved_views to authenticated;
grant all on public.saved_views to service_role;

create policy "People see shared views and their own"
  on public.saved_views for select to authenticated
  using (public.can_read_project(project_id) and (shared or created_by = (select auth.uid())));
create policy "Anyone on the project can save a view for themselves; members can share one"
  on public.saved_views for insert to authenticated
  with check (
    public.can_read_project(project_id)
    and (not shared or public.can_write_project(project_id))
    and public.saved_view_count(project_id) < 100
  );
create policy "The creator or the project's manager can change a view"
  on public.saved_views for update to authenticated
  using (created_by = (select auth.uid()) or public.can_manage_project(project_id))
  with check (public.can_read_project(project_id) and (not shared or public.can_write_project(project_id)));
create policy "The creator or the project's manager can delete a view"
  on public.saved_views for delete to authenticated
  using (created_by = (select auth.uid()) or public.can_manage_project(project_id));

-- ===========================================================================
-- 8. Custom templates
-- ===========================================================================

create table public.templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text check (char_length(description) <= 500),
  color text not null default 'blue' check (color in ('orange', 'blue', 'green', 'purple', 'pink', 'teal', 'yellow', 'red')),
  -- The ProjectPlan shape (sections of tasks with day offsets), validated by the app.
  plan jsonb not null check (jsonb_typeof(plan) = 'object' and coalesce(jsonb_typeof(plan -> 'sections'), '') = 'array' and pg_column_size(plan) <= 200000),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index templates_workspace_idx on public.templates (workspace_id, name);
create index templates_created_by_idx on public.templates (created_by);

create function public.template_count(p_workspace uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) from public.templates where workspace_id = p_workspace;
$$;

create trigger a_stamp before insert or update on public.templates
  for each row execute function public.stamp_created_by();

alter table public.templates enable row level security;
revoke all on public.templates from anon, authenticated;
grant select, insert, delete on public.templates to authenticated;
grant update (name, description, color) on public.templates to authenticated;
grant all on public.templates to service_role;

create policy "Members of the workspace see its templates"
  on public.templates for select to authenticated
  using (public.is_workspace_staff(workspace_id));
create policy "Members can save templates on plans that include them"
  on public.templates for insert to authenticated
  with check (
    public.can_write_workspace(workspace_id)
    and public.workspace_has_feature(workspace_id, 'workload')
    and public.template_count(workspace_id) < 100
  );
create policy "The creator or an admin can rename a template"
  on public.templates for update to authenticated
  using (public.can_write_workspace(workspace_id) and (created_by = (select auth.uid()) or public.is_workspace_admin(workspace_id)))
  with check (public.can_write_workspace(workspace_id));
create policy "The creator or an admin can delete a template"
  on public.templates for delete to authenticated
  using (public.can_write_workspace(workspace_id) and (created_by = (select auth.uid()) or public.is_workspace_admin(workspace_id)));

-- ===========================================================================
-- 9. Workload
-- ===========================================================================

-- Open tasks per person, across every project the caller can read. Buckets:
--   'overdue' - due before this week (week_start is null),
--   'week'    - due in the week starting week_start (overdue_count: already
--               past p_today),
--   'none'    - no due date.
-- A person is a member (person_id) or a plain name (person_id null); tasks
-- with no owner are one "Unassigned" row (person_id and person_name null).
-- Business plan (and trial) only.
create function public.workload(ws uuid, p_today date, p_weeks integer default 6)
returns table (person_key text, person_id uuid, person_name text, bucket text, week_start date, open_count integer, overdue_count integer)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_monday date := p_today - ((extract(isodow from p_today)::integer) - 1);
  v_end date := v_monday + 7 * greatest(1, least(coalesce(p_weeks, 6), 26));
begin
  if not public.workspace_has_feature(ws, 'workload') then
    return;
  end if;
  return query
  with open_tasks as (
    select i.assignee_id,
           nullif(trim(i.assignee), '') as name,
           i.due_date
    from public.items i
    where i.workspace_id = ws and i.type = 'action_item' and i.status <> 'done'
      -- A design review comment becomes work once someone decides to incorporate it.
      and (i.review_id is null or i.disposition = 'incorporate')
  ), placed as (
    select t.assignee_id,
           case when t.assignee_id is not null then 'id:' || t.assignee_id::text
                when t.name is not null then 'name:' || lower(t.name)
                else 'none' end as person_key,
           t.name,
           case when t.due_date is null then 'none'
                when t.due_date < v_monday then 'overdue'
                when t.due_date < v_end then 'week'
                else 'later' end as bucket,
           case when t.due_date >= v_monday and t.due_date < v_end
                then t.due_date - ((extract(isodow from t.due_date)::integer) - 1) end as week_start,
           t.due_date is not null and t.due_date < p_today as overdue
    from open_tasks t
  )
  select p.person_key,
         (array_agg(p.assignee_id))[1],
         case when (array_agg(p.assignee_id))[1] is not null then public.member_display_name((array_agg(p.assignee_id))[1])
              else max(p.name) end,
         p.bucket,
         p.week_start,
         count(*)::integer,
         count(*) filter (where p.overdue)::integer
  from placed p
  where p.bucket <> 'later'
  group by p.person_key, p.bucket, p.week_start;
end;
$$;

grant execute on function public.workload(uuid, date, integer) to authenticated;

-- ===========================================================================
-- 10. Search and Ask cover RFIs and submittals
-- ===========================================================================

create or replace function public.search_workspace(ws uuid, q text, p_limit integer default 20)
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
    (select 'document', d.id, null::uuid, d.project_id,
            coalesce(nullif(d.title, ''), nullif(left(d.summary, 90), ''), 'Meeting notes'), left(d.raw_text, 200000), null::text,
            null::text, ts_rank(d.search, v_query) * 0.9
     from public.documents d
     where d.workspace_id = ws and d.search @@ v_query
     order by 9 desc limit p_limit)
    union all
    (select 'rfi', r.id, null::uuid, r.project_id,
            'RFI-' || lpad(r.number::text, 3, '0') || ': ' || r.subject,
            concat_ws(E'\n', r.question, r.response), null::text, r.status, ts_rank(r.search, v_query) * 1.1
     from public.rfis r
     where r.workspace_id = ws and r.search @@ v_query
     order by 9 desc limit p_limit)
    union all
    (select 'submittal', s.id, null::uuid, s.project_id,
            'Submittal ' || lpad(s.number::text, 3, '0') || ': ' || s.title,
            concat_ws(E'\n', s.description, s.review_notes), null::text, s.action, ts_rank(s.search, v_query) * 1.1
     from public.submittals s
     where s.workspace_id = ws and s.search @@ v_query
     order by 9 desc limit p_limit)
  ) r
  join public.projects pr on pr.id = r.project_id
  order by r.rank desc
  limit greatest(1, least(p_limit, 50));
end;
$$;

create or replace function public.ask_search(ws uuid, q text, p_limit integer default 12)
returns table (
  kind text,
  id uuid,
  item_id uuid,
  project_id uuid,
  project_name text,
  title text,
  excerpt text,
  item_type text,
  status text,
  created_at timestamptz,
  rank real
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_words text[];
  v_query tsquery;
  v_limit integer := greatest(1, least(coalesce(p_limit, 12), 30));
begin
  if not public.workspace_has_feature(ws, 'file_ai') then
    return;
  end if;
  select array_agg(w) into v_words
  from (
    select w from regexp_split_to_table(lower(left(coalesce(q, ''), 500)), '[^[:alnum:]]+') as w
    where char_length(w) > 1 limit 20
  ) words;
  if v_words is null then
    return;
  end if;
  select string_agg(t::text, ' | ') ::tsquery into v_query
  from (select to_tsquery('english', w || ':*') as t from unnest(v_words) as w) parts
  where numnode(t) > 0;
  if v_query is null then
    return;
  end if;

  return query
  select r.kind, r.id, r.item_id, r.project_id, pr.name, r.title,
         case when r.body is null or r.body = '' then null
              else ts_headline('english', r.body, v_query,
                               'MaxWords=60, MinWords=25, MaxFragments=3, FragmentDelimiter=" … ", StartSel="", StopSel=""')
         end,
         r.item_type, r.status, r.created_at, r.rank::real
  from (
    (select 'task'::text as kind, it.id, it.id as item_id, it.project_id, it.title,
            concat_ws(E'\n', it.details, case when it.source_quote is not null then 'Source: "' || it.source_quote || '"' end) as body,
            it.type as item_type, it.status, it.created_at,
            ts_rank_cd(it.search, v_query) * case when it.type = 'decision' then 1.5 else 1.2 end as rank
     from public.items it
     where it.workspace_id = ws and it.search @@ v_query
     order by rank desc limit v_limit)
    union all
    (select 'comment', c.id, it.id, it.project_id, it.title,
            regexp_replace(c.body, '@\[([^\]]*)\]\([0-9a-f-]+\)', '@\1', 'g'), it.type, it.status, c.created_at,
            ts_rank_cd(c.search, v_query)
     from public.item_comments c
     join public.items it on it.id = c.item_id
     where c.workspace_id = ws and c.search @@ v_query
     order by 10 desc limit v_limit)
    union all
    (select 'document', d.id, null::uuid, d.project_id,
            coalesce(nullif(d.title, ''), nullif(left(d.summary, 90), ''), 'Meeting notes'),
            left(d.raw_text, 200000), null::text, null::text, d.created_at,
            ts_rank_cd(d.search, v_query) * 0.9
     from public.documents d
     where d.workspace_id = ws and d.search @@ v_query
     order by 10 desc limit v_limit)
    union all
    (select 'rfi', r.id, null::uuid, r.project_id,
            'RFI-' || lpad(r.number::text, 3, '0') || ': ' || r.subject,
            concat_ws(E'\n', 'Question: ' || nullif(r.question, ''), 'Response: ' || r.response), null::text, r.status, r.created_at,
            ts_rank_cd(r.search, v_query) * 1.3
     from public.rfis r
     where r.workspace_id = ws and r.search @@ v_query
     order by 10 desc limit v_limit)
    union all
    (select 'submittal', s.id, null::uuid, s.project_id,
            'Submittal ' || lpad(s.number::text, 3, '0') || ': ' || s.title,
            concat_ws(E'\n', s.description, 'Review: ' || s.review_notes), null::text, s.action, s.created_at,
            ts_rank_cd(s.search, v_query) * 1.1
     from public.submittals s
     where s.workspace_id = ws and s.search @@ v_query
     order by 10 desc limit v_limit)
  ) r
  join public.projects pr on pr.id = r.project_id
  order by r.rank desc
  limit v_limit;
end;
$$;

-- ===========================================================================
-- 11. Realtime
-- ===========================================================================

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.rfis, public.submittals, public.milestones, public.reviews, public.item_dependencies;
  end if;
end;
$$;
