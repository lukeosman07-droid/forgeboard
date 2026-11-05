-- Forgeboard initial schema: profiles, projects, notes, items.
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste this file -> Run.
--
-- Security model:
--   * Row Level Security (RLS) is on for every table, so each user only sees their own rows.
--   * Users may edit only their own full_name and company_name on profiles.
--     plan, subscription_status, stripe_* and ai_extractions_used can only be changed
--     with the service role key (server code, the seed script, or later Stripe webhooks).

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  company_name text,
  plan text not null default 'free'
    check (plan in ('free', 'team', 'business', 'enterprise')),
  subscription_status text,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  ai_extractions_used integer not null default 0 check (ai_extractions_used >= 0),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view their own profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Column-level lock: signed-in users can only ever write these two columns.
-- (No insert or delete for users: the trigger below creates the row, and it is
-- removed automatically when the auth user is deleted.)
revoke all on public.profiles from anon;
revoke insert, update, delete on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, company_name) on public.profiles to authenticated;
grant all on public.profiles to service_role;

-- ---------------------------------------------------------------------------
-- Create a profile automatically when someone signs up
-- ---------------------------------------------------------------------------
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Only name fields are copied from sign-up data. Plan and billing fields
  -- always start at their defaults, whatever the sign-up request contained.
  insert into public.profiles (id, email, full_name, company_name)
  values (
    new.id,
    new.email,
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'company_name'), '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep profiles.email in sync if a user changes their email.
create function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

-- These functions are only for the triggers; nobody should call them through the API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_user_email_change() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  description text,
  created_at timestamptz not null default now()
);

create index projects_owner_id_idx on public.projects (owner_id);

alter table public.projects enable row level security;

create policy "Users can view their own projects"
  on public.projects for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy "Users can create their own projects"
  on public.projects for insert to authenticated
  with check ((select auth.uid()) = owner_id);

create policy "Users can update their own projects"
  on public.projects for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "Users can delete their own projects"
  on public.projects for delete to authenticated
  using ((select auth.uid()) = owner_id);

-- ---------------------------------------------------------------------------
-- notes: the original pasted meeting-note text
-- ---------------------------------------------------------------------------
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  raw_text text not null,
  created_at timestamptz not null default now()
);

create index notes_project_id_idx on public.notes (project_id);
create index notes_owner_id_idx on public.notes (owner_id);

alter table public.notes enable row level security;

create policy "Users can view their own notes"
  on public.notes for select to authenticated
  using ((select auth.uid()) = owner_id);

-- Insert/update also check the project belongs to the same user, so nobody can
-- attach rows to someone else's project.
create policy "Users can create notes in their own projects"
  on public.notes for insert to authenticated
  with check (
    (select auth.uid()) = owner_id
    and exists (
      select 1 from public.projects p
      where p.id = project_id and p.owner_id = (select auth.uid())
    )
  );

create policy "Users can update their own notes"
  on public.notes for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check (
    (select auth.uid()) = owner_id
    and exists (
      select 1 from public.projects p
      where p.id = project_id and p.owner_id = (select auth.uid())
    )
  );

create policy "Users can delete their own notes"
  on public.notes for delete to authenticated
  using ((select auth.uid()) = owner_id);

-- ---------------------------------------------------------------------------
-- items: action items, decisions, risks, questions
-- ---------------------------------------------------------------------------
create table public.items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  note_id uuid references public.notes (id) on delete set null,
  type text not null check (type in ('action_item', 'decision', 'risk', 'question')),
  title text not null check (char_length(title) between 1 and 500),
  details text,
  assignee text,
  due_date date,
  priority text check (priority in ('low', 'medium', 'high')),
  status text not null default 'open' check (status in ('open', 'done')),
  created_at timestamptz not null default now()
);

create index items_project_id_idx on public.items (project_id);
create index items_owner_id_idx on public.items (owner_id);
create index items_note_id_idx on public.items (note_id);

alter table public.items enable row level security;

create policy "Users can view their own items"
  on public.items for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy "Users can create items in their own projects"
  on public.items for insert to authenticated
  with check (
    (select auth.uid()) = owner_id
    and exists (
      select 1 from public.projects p
      where p.id = project_id and p.owner_id = (select auth.uid())
    )
    and (
      note_id is null
      or exists (
        select 1 from public.notes n
        where n.id = note_id and n.owner_id = (select auth.uid())
      )
    )
  );

create policy "Users can update their own items"
  on public.items for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check (
    (select auth.uid()) = owner_id
    and exists (
      select 1 from public.projects p
      where p.id = project_id and p.owner_id = (select auth.uid())
    )
    and (
      note_id is null
      or exists (
        select 1 from public.notes n
        where n.id = note_id and n.owner_id = (select auth.uid())
      )
    )
  );

create policy "Users can delete their own items"
  on public.items for delete to authenticated
  using ((select auth.uid()) = owner_id);

-- Table permissions (RLS above still limits signed-in users to their own rows).
-- Signed-out visitors get no access at all.
revoke all on public.projects, public.notes, public.items from anon;
grant select, insert, update, delete on public.projects, public.notes, public.items to authenticated;
grant all on public.projects, public.notes, public.items to service_role;
