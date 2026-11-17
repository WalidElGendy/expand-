-- ==========================================================================
-- Quick chat between colleagues — nothing stored.
--
-- Messages are Realtime broadcasts, never rows: the chat-send edge function
-- stamps who sent them (from the sender's sign-in, so nobody can write as
-- someone else) and broadcasts to the recipient's private inbox channel
-- "inbox:<profile id>". A message exists only in the two open browser tabs;
-- closing the conversation or the tab is the end of it.
--
-- 1. Only the owner of an inbox may listen to it (private channel policy).
-- 2. chat_directory(): the people one can write to, with what to call them —
--    name, department, role and job title. The job title lives on the HR
--    record, which only HR can read; this exposes that one field, nothing
--    else from it.
-- ==========================================================================

drop policy if exists "chat inbox: only its owner listens" on realtime.messages;
create policy "chat inbox: only its owner listens" on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and realtime.topic() = 'inbox:' || (select public.my_profile_id())::text
    and (select public.is_active_user())
  );

create or replace function chat_directory()
returns table (id uuid, full_name text, department_id text, role text, job_title text, avatar_path text)
language sql stable security definer set search_path = public as $$
  select p.id, coalesce(nullif(trim(p.full_name), ''), p.email), p.department_id, p.role::text,
         nullif(trim(e.position), ''), p.avatar_path
  from profiles p
  left join hr_employees e on e.profile_id = p.id
  where p.is_active and is_active_user()
  order by 2
$$;
revoke execute on function chat_directory() from public, anon;
grant execute on function chat_directory() to authenticated;
