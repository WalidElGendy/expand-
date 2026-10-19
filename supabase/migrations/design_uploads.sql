-- ==========================================================================
-- Applied 2026-10-19 to project ookiupgocavjbxcxquwl.
-- Design on the project page.
--
-- The 2D and 3D designers upload their designs to the project (files with
-- purpose 'design', department_id '2d' or '3d', in the docs bucket).
-- An upload marks that team's stage done. A 2D upload — the technical
-- drawings — also moves a project that is still in design on to pricing.
-- ==========================================================================

-- run on its own first (an enum value cannot be added inside a transaction
-- that then uses it):
-- alter type file_purpose add value if not exists 'design';

create or replace function can_design() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_active from profiles where user_id = auth.uid()), false)
     and (can_plan() or my_dept() in ('2d','3d')
          or my_role() = any (array['lead','manager','admin']::app_role[]))
$$;

create policy file_insert_design on files for insert
  with check (purpose = 'design' and department_id in ('2d','3d')
              and project_id is not null and can_design());

create policy "storage write design" on storage.objects for insert
  with check (bucket_id = 'docs' and can_design());

create or replace function design_uploaded() returns trigger
language plpgsql security definer set search_path = public as $$
declare st project_status;
begin
  if new.purpose <> 'design' or new.project_id is null or new.department_id not in ('2d','3d') then
    return new;
  end if;
  update project_stages set status = 'done', completed_at = coalesce(completed_at, now())
   where project_id = new.project_id and department_id = new.department_id and status <> 'done';
  if new.department_id = '2d' then
    select status into st from projects where id = new.project_id;
    if st = 'in_design' then
      update projects set status = 'pricing' where id = new.project_id;
      insert into project_events (project_id, kind, from_status, to_status, body, created_by)
      values (new.project_id, 'status', 'in_design', 'pricing',
              '2D design uploaded — moved to pricing automatically', new.uploaded_by);
    end if;
  end if;
  return new;
end $$;

create trigger t_design_uploaded after insert on files
  for each row execute function design_uploaded();

-- Applied one statement at a time (the storage policy waits on a lock when
-- run as one batch):
-- revoke execute on function can_design() from public, anon;
