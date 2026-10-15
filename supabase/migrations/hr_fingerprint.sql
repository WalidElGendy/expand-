-- ==========================================================================
-- Applied 2026-10-15 to project ookiupgocavjbxcxquwl.
-- Attendance from the fingerprint system (Malachite, expandexpo.malhr.com).
--
--   · hr_settings.attendance_source: 'fingerprint' (default) | 'both' | 'app'.
--     In 'fingerprint' mode hr_clock refuses, so the app button cannot be used.
--   · The Malachite API key lives in the vault (secret 'hr_fp_api_key'), set
--     by HR through hr_set_fp_key(); only the service role can read it back.
--   · Edge function hr-attendance-sync (verify_jwt off, checks HR sign-in or
--     the vault token itself) pulls punches into hr_attendance.
--   · pg_cron runs it every 15 minutes through hr_fp_sync_kick().
--   · Rows HR corrects by hand are source = 'manual' and are never overwritten.
-- ==========================================================================

alter table hr_employees add column if not exists device_no text;
create unique index if not exists hr_employees_device_no on hr_employees(device_no) where device_no is not null;

alter table hr_attendance add column if not exists source text not null default 'app';
alter table hr_attendance add column if not exists ext jsonb;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'hr_attendance_source_chk') then
    alter table hr_attendance add constraint hr_attendance_source_chk check (source in ('app','fingerprint','manual'));
  end if;
end $$;

alter table hr_settings add column if not exists attendance_source text not null default 'fingerprint';
alter table hr_settings add column if not exists fp_url text default 'https://expandexpo.malhr.com';
alter table hr_settings add column if not exists fp_key_hint text;
alter table hr_settings add column if not exists fp_last_sync timestamptz;
alter table hr_settings add column if not exists fp_last_ok boolean;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'hr_settings_att_source_chk') then
    alter table hr_settings add constraint hr_settings_att_source_chk check (attendance_source in ('app','fingerprint','both'));
  end if;
end $$;

create table if not exists hr_sync_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  trigger text not null default 'manual',
  by_id uuid references profiles(id) on delete set null,
  date_from date, date_to date,
  ok boolean,
  summary jsonb,
  error text
);
create index if not exists hr_sync_runs_started on hr_sync_runs(started_at desc);
alter table hr_sync_runs enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'hr_sync_runs' and policyname = 'hrsync_read') then
    create policy hrsync_read on hr_sync_runs for select to authenticated using (is_hr());
  end if;
end $$;

create or replace function hr_set_fp_key(p_key text) returns text
language plpgsql security definer set search_path = public, vault as $$
declare sid uuid; k text := nullif(btrim(coalesce(p_key, '')), '');
begin
  if not is_hr() then raise exception 'not_allowed' using errcode = '42501'; end if;
  select id into sid from vault.secrets where name = 'hr_fp_api_key';
  if sid is null then
    perform vault.create_secret(coalesce(k, ''), 'hr_fp_api_key', 'Fingerprint (Malachite) API key');
  else
    perform vault.update_secret(sid, coalesce(k, ''));
  end if;
  update hr_settings set fp_key_hint = case when k is null then null else right(k, 4) end,
         updated_at = now(), updated_by = my_profile_id() where id = 1;
  return case when k is null then null else right(k, 4) end;
end $$;

create or replace function hr_fp_key() returns text
language sql security definer set search_path = public, vault as $$
  select nullif(decrypted_secret, '') from vault.decrypted_secrets where name = 'hr_fp_api_key' limit 1
$$;

create or replace function hr_sync_token_ok(p_token text) returns boolean
language sql security definer set search_path = public, vault as $$
  select coalesce(p_token, '') <> '' and exists (
    select 1 from vault.decrypted_secrets where name = 'hr_sync_cron_token' and decrypted_secret = p_token)
$$;

do $$ begin
  if not exists (select 1 from vault.secrets where name = 'hr_sync_cron_token') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), 'hr_sync_cron_token', 'Lets the scheduler start a fingerprint sync');
  end if;
end $$;

-- run separately (they hang when batched with DDL through the MCP):
-- revoke execute on function hr_fp_key() from public, anon, authenticated;
-- revoke execute on function hr_sync_token_ok(text) from public, anon, authenticated;
-- revoke execute on function hr_set_fp_key(text) from public, anon;
-- revoke execute on function hr_fp_sync_kick() from public, anon, authenticated;

-- hr_clock: same as hr_system.sql plus, at the top,
--   if coalesce(s.attendance_source, 'fingerprint') = 'fingerprint' then
--     raise exception 'fingerprint_only' using errcode = '42501';
--   end if;
-- and it fills clock_in on a row that exists without one.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

create or replace function hr_fp_sync_kick() returns bigint
language plpgsql security definer set search_path = public, vault, extensions as $$
declare rid bigint; tok text; src text; hasKey boolean;
begin
  select attendance_source into src from hr_settings where id = 1;
  if coalesce(src, 'fingerprint') = 'app' then return null; end if;
  select exists (select 1 from vault.decrypted_secrets where name = 'hr_fp_api_key' and decrypted_secret <> '') into hasKey;
  if not hasKey then return null; end if;
  select decrypted_secret into tok from vault.decrypted_secrets where name = 'hr_sync_cron_token';
  select net.http_post(
    url := 'https://ookiupgocavjbxcxquwl.supabase.co/functions/v1/hr-attendance-sync',
    headers := jsonb_build_object('content-type', 'application/json', 'x-sync-token', tok),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000) into rid;
  return rid;
end $$;

select cron.schedule('hr-fingerprint-sync', '*/15 * * * *', 'select public.hr_fp_sync_kick()');
