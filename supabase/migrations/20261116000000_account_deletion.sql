-- Forgeboard v2, Phase 0: let a signed-in user delete their own account.
-- Run once in the Supabase SQL Editor, after 20261112000000_work_management.sql.
--
-- Deleting the auth user removes everything they own: the profile, projects,
-- sections, notes, items, subtasks, comments and AI usage rows all reference
-- auth.users with "on delete cascade".
--
-- The app cancels any Stripe subscription before calling this (see
-- src/app/dashboard/settings/actions.ts). The function itself only ever deletes
-- the caller, so there is no user ID parameter to tamper with.

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
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

  delete from auth.users where id = v_user_id;
end;
$$;

revoke execute on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;
