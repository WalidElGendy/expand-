-- ==========================================================================
-- Applied 2026-11-10 to project ookiupgocavjbxcxquwl.
-- A Media department: selectable on People, in HR, filters and reports.
-- Not a project stage (is_stage false), so it never appears in the delivery
-- scheduler or the project team pickers until someone decides it should.
-- ==========================================================================

insert into departments (id, name_en, name_ar, colour, is_stage, sort)
values ('media', 'Media', 'الإعلام', '#d6457f', false, 10)
on conflict (id) do nothing;
