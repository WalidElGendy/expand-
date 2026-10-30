-- ==========================================================================
-- Applied 2026-10-30 to project ookiupgocavjbxcxquwl.
-- Who can have a login: an @expandexpo.com address, or any other address an
-- admin has invited (a row in `invitations`, written by "Invite someone" or
-- by an admin pressing "Send code" for that person on People).
--
-- Enforced on auth.users itself, so it holds for every way an account can be
-- made — the "First time here?" code, an admin invitation, a direct call to
-- the Auth API with the public key, a future OAuth button — and for changing
-- an existing account's email to an outside address. Anonymous sign-ins
-- (no email) are refused too.
-- ==========================================================================

create or replace function public.auth_email_gate()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if tg_op = 'UPDATE' and lower(coalesce(new.email, '')) = lower(coalesce(old.email, '')) then
    return new;
  end if;
  if nullif(trim(coalesce(new.email, '')), '') is null then
    raise exception 'An email address is required to have an account here.' using errcode = '42501';
  end if;
  if lower(split_part(trim(new.email), '@', 2)) = 'expandexpo.com' then
    return new;
  end if;
  if exists (select 1 from invitations where lower(email) = lower(trim(new.email))) then
    return new;
  end if;
  raise exception 'Only @expandexpo.com addresses, or addresses an admin has invited, can have an account here.'
    using errcode = '42501';
end $function$;

create or replace trigger auth_email_gate
  before insert or update of email on auth.users
  for each row execute function public.auth_email_gate();
