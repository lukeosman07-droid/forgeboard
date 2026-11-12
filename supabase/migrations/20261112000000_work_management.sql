-- Forgeboard step 4: full work management.
-- Run once in the Supabase SQL Editor, after the earlier migrations.
--
-- Adds: project colors, sections (groups of tasks), richer task statuses and
-- priorities, start dates for the timeline, manual ordering, subtasks and comments.
-- Every new table has Row Level Security: each user only sees their own rows.

-- ---------------------------------------------------------------------------
-- projects: a color for the sidebar and cards
-- ---------------------------------------------------------------------------
alter table public.projects add column if not exists color text not null default 'orange'
  check (color in ('orange', 'blue', 'green', 'purple', 'pink', 'teal', 'yellow', 'red'));

-- ---------------------------------------------------------------------------
-- sections: named groups of tasks inside a project
-- ---------------------------------------------------------------------------
create table if not exists public.sections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  position double precision not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists sections_project_id_idx on public.sections (project_id);
create index if not exists sections_owner_id_idx on public.sections (owner_id);

alter table public.sections enable row level security;

create policy "Users can view their own sections"
  on public.sections for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy "Users can create sections in their own projects"
  on public.sections for insert to authenticated
  with check (
    (select auth.uid()) = owner_id
    and exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid()))
  );

create policy "Users can update their own sections"
  on public.sections for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check (
    (select auth.uid()) = owner_id
    and exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid()))
  );

create policy "Users can delete their own sections"
  on public.sections for delete to authenticated
  using ((select auth.uid()) = owner_id);

-- ---------------------------------------------------------------------------
-- items: new statuses, urgent priority, section, start date, ordering
-- ---------------------------------------------------------------------------
alter table public.items drop constraint if exists items_status_check;
alter table public.items add constraint items_status_check
  check (status in ('open', 'in_progress', 'stuck', 'done'));

alter table public.items drop constraint if exists items_priority_check;
alter table public.items add constraint items_priority_check
  check (priority in ('low', 'medium', 'high', 'urgent'));

alter table public.items add column if not exists section_id uuid references public.sections (id) on delete set null;
alter table public.items add column if not exists start_date date;
alter table public.items add column if not exists position double precision not null default 0;
alter table public.items add column if not exists completed_at timestamptz;

create index if not exists items_section_id_idx on public.items (section_id);

-- Keep existing rows in a stable order (oldest first).
update public.items i
set position = sub.rn
from (select id, row_number() over (partition by project_id order by created_at) as rn from public.items) sub
where sub.id = i.id and i.position = 0;

-- Recreate item write policies so a task can only point at the user's own section.
drop policy if exists "Users can create items in their own projects" on public.items;
drop policy if exists "Users can update their own items" on public.items;

create policy "Users can create items in their own projects"
  on public.items for insert to authenticated
  with check (
    (select auth.uid()) = owner_id
    and exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid()))
    and (note_id is null or exists (select 1 from public.notes n where n.id = note_id and n.owner_id = (select auth.uid())))
    and (section_id is null or exists (
      select 1 from public.sections s
      where s.id = section_id and s.owner_id = (select auth.uid()) and s.project_id = project_id
    ))
  );

create policy "Users can update their own items"
  on public.items for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check (
    (select auth.uid()) = owner_id
    and exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid()))
    and (note_id is null or exists (select 1 from public.notes n where n.id = note_id and n.owner_id = (select auth.uid())))
    and (section_id is null or exists (
      select 1 from public.sections s
      where s.id = section_id and s.owner_id = (select auth.uid()) and s.project_id = project_id
    ))
  );

-- ---------------------------------------------------------------------------
-- subtasks: a checklist inside a task
-- ---------------------------------------------------------------------------
create table if not exists public.subtasks (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items (id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 300),
  done boolean not null default false,
  position double precision not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists subtasks_item_id_idx on public.subtasks (item_id);
create index if not exists subtasks_owner_id_idx on public.subtasks (owner_id);

alter table public.subtasks enable row level security;

create policy "Users can view their own subtasks"
  on public.subtasks for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy "Users can create subtasks on their own items"
  on public.subtasks for insert to authenticated
  with check (
    (select auth.uid()) = owner_id
    and exists (select 1 from public.items i where i.id = item_id and i.owner_id = (select auth.uid()))
  );

create policy "Users can update their own subtasks"
  on public.subtasks for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check (
    (select auth.uid()) = owner_id
    and exists (select 1 from public.items i where i.id = item_id and i.owner_id = (select auth.uid()))
  );

create policy "Users can delete their own subtasks"
  on public.subtasks for delete to authenticated
  using ((select auth.uid()) = owner_id);

-- ---------------------------------------------------------------------------
-- item_comments: updates posted on a task
-- ---------------------------------------------------------------------------
create table if not exists public.item_comments (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items (id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now()
);

create index if not exists item_comments_item_id_idx on public.item_comments (item_id);
create index if not exists item_comments_owner_id_idx on public.item_comments (owner_id);

alter table public.item_comments enable row level security;

create policy "Users can view their own comments"
  on public.item_comments for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy "Users can comment on their own items"
  on public.item_comments for insert to authenticated
  with check (
    (select auth.uid()) = owner_id
    and exists (select 1 from public.items i where i.id = item_id and i.owner_id = (select auth.uid()))
  );

create policy "Users can delete their own comments"
  on public.item_comments for delete to authenticated
  using ((select auth.uid()) = owner_id);

-- ---------------------------------------------------------------------------
-- Table permissions
-- ---------------------------------------------------------------------------
revoke all on public.sections, public.subtasks, public.item_comments from anon;
grant select, insert, update, delete on public.sections, public.subtasks to authenticated;
grant select, insert, delete on public.item_comments to authenticated;
grant all on public.sections, public.subtasks, public.item_comments to service_role;
