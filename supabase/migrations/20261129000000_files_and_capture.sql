-- Phase 4: files and AI capture.
--
--   * documents: the notes table, renamed and widened. Pasted notes, uploaded
--     files and forwarded emails all become documents. Tasks point at the
--     document, quote and page they came from.
--   * attachments: files on tasks and documents, kept in the private
--     "attachments" Storage bucket at workspace_id/project_id/uuid-filename.
--     Every upload counts toward the workspace's storage quota, checked here.
--   * project_inboxes: a secret email address per project.
--   * Weekly AI reports: report_settings, project_reports and a read-only
--     share link that expires.
--   * Ask Forgeboard: ask_search() finds what the asker may read.

-- ===========================================================================
-- 1. documents (formerly notes)
-- ===========================================================================

alter table public.notes rename to documents;
alter index public.notes_project_id_idx rename to documents_project_id_idx;
alter index public.notes_created_by_idx rename to documents_created_by_idx;
alter index public.notes_workspace_id_idx rename to documents_workspace_id_idx;

alter table public.documents
  add column title text check (char_length(title) <= 300),
  add column origin text not null default 'paste' check (origin in ('paste', 'upload', 'email')),
  -- For a PDF: where each page starts in raw_text (0-based character offsets).
  add column page_offsets integer[],
  add column email_from text check (char_length(email_from) <= 320),
  -- When someone last saved tasks from it (the capture panel's inbox list).
  add column captured_at timestamptz,
  add constraint documents_text_length check (char_length(raw_text) <= 1000000);

-- Search covers the title too now.
drop index public.notes_search_idx;
alter table public.documents drop column search;
alter table public.documents add column search tsvector generated always as (
  setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(summary, '')), 'A') ||
  setweight(to_tsvector('english', left(coalesce(raw_text, ''), 200000)), 'B')
) stored;
create index documents_search_idx on public.documents using gin (search);
create index documents_inbox_idx on public.documents (project_id, created_at desc) where origin = 'email';

-- Reading files and email with AI is a paid feature (not on Starter).
create policy "File AI needs a plan that includes it"
  on public.documents as restrictive for insert to authenticated
  with check (origin = 'paste' or public.workspace_has_feature(workspace_id, 'file_ai'));

-- ===========================================================================
-- 2. Where each task came from
-- ===========================================================================

alter table public.items rename column note_id to source_document_id;
alter table public.items
  add column source_quote text check (char_length(source_quote) <= 2000),
  add column source_page integer check (source_page between 1 and 100000);
create index items_source_document_idx on public.items (source_document_id) where source_document_id is not null;

create or replace function public.item_check_links()
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
  if new.source_document_id is not null
     and not exists (select 1 from public.documents d where d.id = new.source_document_id and d.project_id = new.project_id) then
    raise exception 'that document belongs to a different project' using errcode = '23514';
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

-- ===========================================================================
-- 3. attachments
-- ===========================================================================

-- The file types people may upload. Mirrors UPLOAD_TYPES in src/lib/files.ts.
create function public.allowed_upload_type(p_mime text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_mime in (
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/png',
    'image/jpeg',
    'image/vnd.dwg',
    'image/vnd.dxf',
    'text/plain',
    'message/rfc822',
    'text/vtt',
    'application/x-subrip'
  );
$$;

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  -- What it's attached to: a task, a document, or (while capturing) nothing yet.
  item_id uuid references public.items (id) on delete cascade,
  document_id uuid references public.documents (id) on delete cascade,
  storage_path text not null unique,
  name text not null check (char_length(name) between 1 and 255),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 26214400),
  mime_type text not null check (public.allowed_upload_type(mime_type)),
  -- pending until the browser has finished uploading the file.
  status text not null default 'pending' check (status in ('pending', 'ready')),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint attachments_one_parent check (num_nonnulls(item_id, document_id) <= 1)
);

create index attachments_project_idx on public.attachments (project_id, created_at desc);
create index attachments_item_idx on public.attachments (item_id) where item_id is not null;
create index attachments_document_idx on public.attachments (document_id) where document_id is not null;
create index attachments_created_by_idx on public.attachments (created_by, created_at desc);

alter table public.documents
  add column attachment_id uuid references public.attachments (id) on delete set null;

-- Before a new attachment is saved: links, quota and rate limit, then the path.
create function public.attachment_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_used bigint;
  v_limit bigint;
begin
  if new.item_id is not null
     and not exists (select 1 from public.items i where i.id = new.item_id and i.project_id = new.project_id) then
    raise exception 'that task belongs to a different project' using errcode = '23514';
  end if;
  if new.document_id is not null
     and not exists (select 1 from public.documents d where d.id = new.document_id and d.project_id = new.project_id) then
    raise exception 'that document belongs to a different project' using errcode = '23514';
  end if;

  -- 100 uploads per person per hour.
  if new.created_by is not null and (
    select count(*) from public.attachments a
    where a.created_by = new.created_by and a.created_at > now() - interval '1 hour'
  ) >= 100 then
    raise exception 'upload_rate_limited' using errcode = 'P0001',
      hint = 'You have uploaded a lot of files in the last hour. Please wait a little and try again.';
  end if;

  -- Lock the workspace row so two uploads at once can't both squeeze in.
  select w.storage_bytes_used, l.storage_bytes into v_used, v_limit
  from public.workspaces w cross join lateral public.plan_limits(w.plan) l
  where w.id = new.workspace_id
  for update of w;
  if v_used + new.size_bytes > v_limit then
    raise exception 'storage_quota_exceeded' using errcode = 'P0001',
      hint = format('This file would go over your plan''s %s GB of storage (%s MB used). Delete some files or upgrade.',
                    round(v_limit / 1073741824.0), round(v_used / 1048576.0));
  end if;

  new.storage_path := new.workspace_id::text || '/' || new.project_id::text || '/' || new.id::text || '-'
    || left(coalesce(nullif(regexp_replace(new.name, '[^A-Za-z0-9._-]+', '_', 'g'), ''), 'file'), 100);
  new.status := 'pending';
  return new;
end;
$$;

-- Only the name and the upload status can change afterwards.
create function public.attachment_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.workspace_id, new.project_id, new.storage_path, new.size_bytes, new.mime_type, new.created_at)
     is distinct from (old.workspace_id, old.project_id, old.storage_path, old.size_bytes, old.mime_type, old.created_at) then
    raise exception 'only an attachment''s name, status and place can change' using errcode = '42501';
  end if;
  if new.item_id is not null
     and not exists (select 1 from public.items i where i.id = new.item_id and i.project_id = new.project_id) then
    raise exception 'that task belongs to a different project' using errcode = '23514';
  end if;
  if new.document_id is not null
     and not exists (select 1 from public.documents d where d.id = new.document_id and d.project_id = new.project_id) then
    raise exception 'that document belongs to a different project' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- Keep workspaces.storage_bytes_used in step.
create function public.attachment_storage_used()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.workspaces set storage_bytes_used = storage_bytes_used + new.size_bytes where id = new.workspace_id;
    return new;
  end if;
  update public.workspaces set storage_bytes_used = greatest(storage_bytes_used - old.size_bytes, 0) where id = old.workspace_id;
  return old;
end;
$$;

create trigger a_stamp before insert or update on public.attachments
  for each row execute function public.stamp_created_by();
create trigger a_workspace before insert on public.attachments
  for each row execute function public.project_child_before_write();
create trigger b_checks before insert on public.attachments
  for each row execute function public.attachment_before_insert();
create trigger b_checks_update before update on public.attachments
  for each row execute function public.attachment_before_update();
create trigger z_storage_used after insert or delete on public.attachments
  for each row execute function public.attachment_storage_used();

alter table public.attachments enable row level security;
revoke all on public.attachments from anon, authenticated;
grant select, insert, delete on public.attachments to authenticated;
grant update (name, status, item_id, document_id) on public.attachments to authenticated;
grant all on public.attachments to service_role;

create policy "Anyone who can see the project can view its files"
  on public.attachments for select to authenticated
  using (public.can_read_project(project_id));
create policy "Members can upload files"
  on public.attachments for insert to authenticated
  with check (public.can_write_project(project_id));
create policy "Members can edit files"
  on public.attachments for update to authenticated
  using (public.can_write_project(project_id))
  with check (public.can_write_project(project_id));
create policy "Members can delete files"
  on public.attachments for delete to authenticated
  using (public.can_write_project(project_id));

-- The project an object path belongs to: workspace_id/project_id/file.
create function public.storage_path_project(p_path text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when split_part(p_path, '/', 2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then split_part(p_path, '/', 2)::uuid
  end;
$$;

-- A browser may upload only to the path of an attachment it just started.
create function public.can_upload_attachment(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.attachments a
    where a.storage_path = p_path
      and a.status = 'pending'
      and a.created_by = (select auth.uid())
      and public.can_write_project(a.project_id)
  );
$$;

grant execute on function public.storage_path_project(text), public.can_upload_attachment(text) to authenticated;

-- The private bucket and its policies. Plain Postgres (local checks) has no
-- storage schema, so this only runs on Supabase.
do $$
begin
  if to_regclass('storage.buckets') is null then
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('attachments', 'attachments', false, 26214400, array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/png', 'image/jpeg', 'image/vnd.dwg', 'image/vnd.dxf',
    'text/plain', 'message/rfc822', 'text/vtt', 'application/x-subrip'
  ])
  on conflict (id) do update
    set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

  execute $p$
    create policy "Forgeboard: read files in projects you can see"
      on storage.objects for select to authenticated
      using (bucket_id = 'attachments' and public.can_read_project(public.storage_path_project(name)))
  $p$;
  execute $p$
    create policy "Forgeboard: upload files you started"
      on storage.objects for insert to authenticated
      with check (
        bucket_id = 'attachments'
        and public.can_write_project(public.storage_path_project(name))
        and public.can_upload_attachment(name)
      )
  $p$;
  execute $p$
    create policy "Forgeboard: delete files in projects you can edit"
      on storage.objects for delete to authenticated
      using (bucket_id = 'attachments' and public.can_write_project(public.storage_path_project(name)))
  $p$;
end;
$$;

-- Uploads that never finished (the browser closed), for the daily cleanup.
create function public.stale_attachments(p_before timestamptz, p_limit integer default 200)
returns table (id uuid, storage_path text)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.storage_path from public.attachments a
  where a.status = 'pending' and a.created_at < p_before
  order by a.created_at
  limit greatest(1, least(p_limit, 1000));
$$;

revoke all on function public.stale_attachments(timestamptz, integer) from public, anon, authenticated;
grant execute on function public.stale_attachments(timestamptz, integer) to service_role;

-- ===========================================================================
-- 4. Project inboxes
-- ===========================================================================

create table public.project_inboxes (
  project_id uuid primary key references public.projects (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  -- The secret part of the address: p-<token>@<inbox domain>. 128 random bits.
  token text not null unique default replace(gen_random_uuid()::text, '-', '')
    check (token ~ '^[0-9a-f]{32}$'),
  allow_outside_senders boolean not null default false,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index project_inboxes_workspace_idx on public.project_inboxes (workspace_id);

create trigger a_stamp before insert or update on public.project_inboxes
  for each row execute function public.stamp_created_by();
create trigger a_workspace before insert or update on public.project_inboxes
  for each row execute function public.project_child_before_write();

alter table public.project_inboxes enable row level security;
revoke all on public.project_inboxes from anon, authenticated;
grant select, insert, delete on public.project_inboxes to authenticated;
grant update (token, allow_outside_senders) on public.project_inboxes to authenticated;
grant all on public.project_inboxes to service_role;

-- Guests can't see the address: only people who can add work to the project.
create policy "Members can see the project's inbox"
  on public.project_inboxes for select to authenticated
  using (public.can_write_project(project_id));
create policy "Members can turn on the inbox on plans that include it"
  on public.project_inboxes for insert to authenticated
  with check (public.can_write_project(project_id) and public.workspace_has_feature(workspace_id, 'file_ai'));
create policy "Project managers can change the inbox"
  on public.project_inboxes for update to authenticated
  using (public.can_manage_project(project_id))
  with check (public.can_manage_project(project_id));
create policy "Project managers can turn the inbox off"
  on public.project_inboxes for delete to authenticated
  using (public.can_manage_project(project_id));

-- Called by the inbound-email webhook (service role) after it has checked the
-- signature. Decides here whether the mail is accepted and files it.
create function public.receive_inbound_email(
  p_token text,
  p_from text,
  p_subject text,
  p_text text
)
returns table (accepted boolean, reason text, document_id uuid, project_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inbox public.project_inboxes;
  v_sender uuid;
  v_id uuid;
begin
  select * into v_inbox from public.project_inboxes i where i.token = lower(p_token);
  if not found then
    return query select false, 'unknown_address'::text, null::uuid, null::uuid;
    return;
  end if;
  if not public.workspace_has_feature(v_inbox.workspace_id, 'file_ai') then
    return query select false, 'plan'::text, null::uuid, v_inbox.project_id;
    return;
  end if;
  if public.workspace_is_read_only(v_inbox.workspace_id) then
    return query select false, 'read_only'::text, null::uuid, v_inbox.project_id;
    return;
  end if;

  -- The sender, if they're a member of the workspace who can see the project.
  select u.id into v_sender
  from auth.users u
  join public.workspace_members m on m.user_id = u.id and m.workspace_id = v_inbox.workspace_id
  where lower(u.email) = lower(trim(p_from))
    and public.user_can_read_project(v_inbox.project_id, u.id)
  limit 1;
  if v_sender is null and not v_inbox.allow_outside_senders then
    return query select false, 'sender_not_allowed'::text, null::uuid, v_inbox.project_id;
    return;
  end if;

  -- At most 200 emails a day into one project.
  if (select count(*) from public.documents d
      where d.project_id = v_inbox.project_id and d.origin = 'email' and d.created_at > now() - interval '1 day') >= 200 then
    return query select false, 'rate_limited'::text, null::uuid, v_inbox.project_id;
    return;
  end if;

  insert into public.documents (project_id, created_by, origin, title, email_from, raw_text)
  values (
    v_inbox.project_id,
    v_sender,
    'email',
    left(coalesce(nullif(trim(p_subject), ''), '(no subject)'), 300),
    left(trim(p_from), 320),
    left(coalesce(p_text, ''), 1000000)
  )
  returning id into v_id;

  return query select true, 'ok'::text, v_id, v_inbox.project_id;
end;
$$;

revoke all on function public.receive_inbound_email(text, text, text, text) from public, anon, authenticated;
grant execute on function public.receive_inbound_email(text, text, text, text) to service_role;

-- ===========================================================================
-- 5. Weekly AI reports
-- ===========================================================================

create table public.report_settings (
  project_id uuid primary key references public.projects (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  enabled boolean not null default false,
  -- People who get the email. Each must still be able to see the project when it's sent.
  recipient_ids uuid[] not null default '{}' check (cardinality(recipient_ids) <= 50),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

create trigger a_stamp before insert or update on public.report_settings
  for each row execute function public.stamp_created_by();
create trigger a_workspace before insert or update on public.report_settings
  for each row execute function public.project_child_before_write();

alter table public.report_settings enable row level security;
revoke all on public.report_settings from anon, authenticated;
grant select, insert, update on public.report_settings to authenticated;
grant all on public.report_settings to service_role;

create policy "Anyone who can see the project can view its report settings"
  on public.report_settings for select to authenticated
  using (public.can_read_project(project_id));
create policy "Project managers can set up reports on plans that include them"
  on public.report_settings for insert to authenticated
  with check (public.can_manage_project(project_id) and public.workspace_has_feature(workspace_id, 'workload'));
create policy "Project managers can change report settings"
  on public.report_settings for update to authenticated
  using (public.can_manage_project(project_id))
  with check (public.can_manage_project(project_id) and public.workspace_has_feature(workspace_id, 'workload'));

create table public.project_reports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  -- The Monday the report covers up to.
  week_of date not null,
  report jsonb not null,
  share_token text not null unique default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  share_expires_at timestamptz not null default now() + interval '30 days',
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (project_id, week_of)
);

create index project_reports_project_idx on public.project_reports (project_id, week_of desc);

create trigger a_stamp before insert or update on public.project_reports
  for each row execute function public.stamp_created_by();
create trigger a_workspace before insert or update on public.project_reports
  for each row execute function public.project_child_before_write();

alter table public.project_reports enable row level security;
revoke all on public.project_reports from anon, authenticated;
grant select, insert, delete on public.project_reports to authenticated;
grant update (report, share_expires_at) on public.project_reports to authenticated;
grant all on public.project_reports to service_role;

create policy "Anyone who can see the project can view its reports"
  on public.project_reports for select to authenticated
  using (public.can_read_project(project_id));
create policy "Project managers can write reports on plans that include them"
  on public.project_reports for insert to authenticated
  with check (public.can_manage_project(project_id) and public.workspace_has_feature(workspace_id, 'workload'));
create policy "Project managers can regenerate or stop sharing a report"
  on public.project_reports for update to authenticated
  using (public.can_manage_project(project_id))
  with check (public.can_manage_project(project_id));
create policy "Project managers can delete reports"
  on public.project_reports for delete to authenticated
  using (public.can_manage_project(project_id));

-- The read-only share page. Anyone with the link, until it expires.
create function public.shared_report(p_token text)
returns table (project_name text, workspace_name text, week_of date, report jsonb, created_at timestamptz, expires_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.name, w.name, r.week_of, r.report, r.created_at, r.share_expires_at
  from public.project_reports r
  join public.projects p on p.id = r.project_id
  join public.workspaces w on w.id = r.workspace_id
  where p_token ~ '^[0-9a-f]{64}$' and r.share_token = p_token and r.share_expires_at > now();
$$;

grant execute on function public.shared_report(text) to anon, authenticated;

-- Projects due a report for this week (the cron, service role).
create function public.weekly_report_candidates(p_week date)
returns table (project_id uuid, workspace_id uuid, workspace_slug text, project_name text, owner_id uuid, recipient_ids uuid[])
language sql
stable
security definer
set search_path = ''
as $$
  select s.project_id, s.workspace_id, w.slug, p.name,
         coalesce(p.manager_id, (select m.user_id from public.workspace_members m where m.workspace_id = w.id and m.role = 'owner' limit 1)),
         s.recipient_ids
  from public.report_settings s
  join public.projects p on p.id = s.project_id
  join public.workspaces w on w.id = s.workspace_id
  where s.enabled
    and public.workspace_has_feature(s.workspace_id, 'workload')
    and not public.workspace_is_read_only(s.workspace_id)
    and not exists (select 1 from public.project_reports r where r.project_id = s.project_id and r.week_of = p_week)
  order by s.project_id
  limit 200;
$$;

-- Recipients who may still see the project, with their email.
create function public.report_recipients(p_project uuid, p_ids uuid[])
returns table (user_id uuid, email text, full_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.email::text, pr.full_name
  from auth.users u
  left join public.profiles pr on pr.id = u.id
  where u.id = any (p_ids)
    and u.email is not null
    and public.user_can_read_project(p_project, u.id);
$$;

revoke all on function public.weekly_report_candidates(date), public.report_recipients(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.weekly_report_candidates(date), public.report_recipients(uuid, uuid[]) to service_role;

-- ===========================================================================
-- 6. Search: notes are documents now
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
  ) r
  join public.projects pr on pr.id = r.project_id
  order by r.rank desc
  limit greatest(1, least(p_limit, 50));
end;
$$;

-- ===========================================================================
-- 7. Ask Forgeboard
-- ===========================================================================

-- Passages that might answer a question. Runs as the caller, so Row Level
-- Security leaves out every project they can't read. Any word may match
-- (a question has many words that won't all appear), ranked by how many do.
-- No embeddings. Only on plans with file AI.
create function public.ask_search(ws uuid, q text, p_limit integer default 12)
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
  -- Each word on its own, so stop words simply drop out.
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
  ) r
  join public.projects pr on pr.id = r.project_id
  order by r.rank desc
  limit v_limit;
end;
$$;

grant execute on function public.ask_search(uuid, text, integer) to authenticated;
