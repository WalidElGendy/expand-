-- ==========================================================================
-- Applied 2026-10-21 to project ookiupgocavjbxcxquwl.
-- Profile photos.
--
-- Everyone can set their own photo (My HR); HR (admin or HR department) can
-- set anyone's (the employee's HR page). Photos live in a public 'avatars'
-- bucket, one folder per profile id; the app crops them to a 320px square
-- JPEG before uploading. The photo shows next to the name in the top bar,
-- the sidebar, the online list and the People table.
-- ==========================================================================

alter table profiles add column if not exists avatar_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "avatars write" on storage.objects for insert
  with check (bucket_id = 'avatars' and is_active_user()
              and ((storage.foldername(name))[1] = my_profile_id()::text or is_hr()));

-- The only way avatar_path changes: yourself, or HR for anyone.
create or replace function set_avatar(p_profile uuid, p_path text) returns text
language plpgsql security definer set search_path = public as $$
begin
  if not is_active_user() or not (p_profile = my_profile_id() or is_hr()) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_path is not null and p_path not like p_profile::text || '/%' then
    raise exception 'bad_path';
  end if;
  update profiles set avatar_path = p_path where id = p_profile;
  if not found then raise exception 'not_found'; end if;
  return p_path;
end $$;

revoke execute on function set_avatar(uuid, text) from public, anon;
