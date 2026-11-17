-- ==========================================================================
-- Personal themes: each person's colours, saved with their profile so they
-- follow them to any computer.
--
-- theme: { "preset": "blossom", "accent": "#e0569b", "tint": 2,
--          "mode": "system" | "light" | "dark", "size": "s" | "m" | "l",
--          "corners": "sharp" | "normal" | "round" }
-- null means the default look. Only its owner sets it (set_my_theme); it is
-- read with the rest of the profile. The app checks every field again
-- before using it, so this only keeps the column small and well formed.
-- ==========================================================================

alter table profiles add column if not exists theme jsonb;

alter table profiles drop constraint if exists profiles_theme_shape;
alter table profiles add constraint profiles_theme_shape check (
  theme is null or (jsonb_typeof(theme) = 'object' and pg_column_size(theme) <= 512)
);

create or replace function set_my_theme(p_theme jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := my_profile_id();
begin
  if me is null or not is_active_user() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_theme is not null and (
       jsonb_typeof(p_theme) <> 'object'
    or pg_column_size(p_theme) > 512
    or coalesce(p_theme->>'accent', '#000000') !~ '^#[0-9a-fA-F]{6}$'
    or coalesce(p_theme->>'mode', 'system') not in ('system', 'light', 'dark')
    or coalesce(p_theme->>'size', 'm') not in ('s', 'm', 'l')
    or coalesce(p_theme->>'corners', 'normal') not in ('sharp', 'normal', 'round')
    or coalesce(p_theme->>'tint', '0') not in ('0', '1', '2')
  ) then
    raise exception 'bad_theme';
  end if;
  update profiles set theme = p_theme where id = me;
end $$;

revoke execute on function set_my_theme(jsonb) from public, anon;
grant execute on function set_my_theme(jsonb) to authenticated;
