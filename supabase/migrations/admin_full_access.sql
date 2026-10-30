-- ==========================================================================
-- Applied 2026-10-30 to project ookiupgocavjbxcxquwl.
-- Admins have every permission, whatever department they sit in. Audited
-- every policy and permission function after access_rules.sql: all of them
-- already let admins through except can_manage_design(), which limited an
-- admin who belongs to the 2D or 3D team to that team's design files.
-- ==========================================================================

create or replace function public.can_manage_design(p_team text)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select is_admin()
      or (can_design() and (coalesce(my_dept(), '') not in ('2d','3d') or my_dept() = p_team))
$function$;
