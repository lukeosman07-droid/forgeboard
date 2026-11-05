-- Forgeboard step 2: AI extraction usage tracking and limits.
-- Run once in the Supabase SQL Editor, after 20261105000000_initial_schema.sql.
--
-- Limits are enforced inside the database by claim_ai_extraction(), which only the
-- server (service role key) can call:
--   * free plan (or unpaid subscription): a fixed number of trial extractions in total
--   * paid plans with an active subscription: unlimited, but max N per rolling hour
-- Every user is also held to the hourly cap, so nobody can run up AI costs.

-- One short AI summary per saved note.
alter table public.notes add column summary text;

-- One row per extraction attempt.
create table public.ai_extraction_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'succeeded', 'empty', 'failed')),
  created_at timestamptz not null default now()
);

create index ai_extraction_events_user_time_idx
  on public.ai_extraction_events (user_id, created_at desc);

-- RLS on with no policies: signed-in users can't read or write this table at all.
alter table public.ai_extraction_events enable row level security;
revoke all on public.ai_extraction_events from anon, authenticated;
grant all on public.ai_extraction_events to service_role;

-- Atomically checks the user's limits and, if allowed, records the attempt.
-- Locks the profile row so two extractions started at once can't both slip past a limit.
create function public.claim_ai_extraction(
  p_user_id uuid,
  p_free_limit integer,
  p_hourly_limit integer
)
returns table (allowed boolean, reason text, event_id bigint, free_remaining integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
  v_recent integer;
  v_is_paid boolean;
  v_event_id bigint;
begin
  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then
    return query select false, 'no_profile'::text, null::bigint, null::integer;
    return;
  end if;

  v_is_paid := v_profile.plan in ('team', 'business', 'enterprise')
               and v_profile.subscription_status = 'active';

  -- Attempts that failed because of an error don't count toward the hourly cap.
  select count(*) into v_recent
  from public.ai_extraction_events
  where user_id = p_user_id
    and status <> 'failed'
    and created_at > now() - interval '1 hour';

  if v_recent >= p_hourly_limit then
    return query select false, 'rate_limited'::text, null::bigint, null::integer;
    return;
  end if;

  if not v_is_paid and v_profile.ai_extractions_used >= p_free_limit then
    return query select false, 'trial_exhausted'::text, null::bigint, 0;
    return;
  end if;

  insert into public.ai_extraction_events (user_id) values (p_user_id)
  returning id into v_event_id;

  update public.profiles
  set ai_extractions_used = ai_extractions_used + 1
  where id = p_user_id;

  return query select
    true,
    case when v_is_paid then 'paid' else 'trial' end,
    v_event_id,
    case when v_is_paid then null::integer
         else greatest(p_free_limit - v_profile.ai_extractions_used - 1, 0) end;
end;
$$;

-- Records how an attempt ended. 'failed' and 'empty' give the trial credit back
-- ('empty' still counts toward the hourly cap; 'failed' doesn't).
create function public.finish_ai_extraction(p_event_id bigint, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  if p_status not in ('succeeded', 'empty', 'failed') then
    raise exception 'invalid status %', p_status;
  end if;

  update public.ai_extraction_events
  set status = p_status
  where id = p_event_id and status = 'pending'
  returning user_id into v_user_id;

  if v_user_id is not null and p_status in ('empty', 'failed') then
    update public.profiles
    set ai_extractions_used = greatest(ai_extractions_used - 1, 0)
    where id = v_user_id;
  end if;
end;
$$;

-- Only the server (service role) may call these.
revoke execute on function public.claim_ai_extraction(uuid, integer, integer) from public, anon, authenticated;
revoke execute on function public.finish_ai_extraction(bigint, text) from public, anon, authenticated;
grant execute on function public.claim_ai_extraction(uuid, integer, integer) to service_role;
grant execute on function public.finish_ai_extraction(bigint, text) to service_role;
