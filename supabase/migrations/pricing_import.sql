-- ==========================================================================
-- A pricing sheet fills the project's pricing table.
--
-- When an Excel pricing sheet is uploaded to a project, the app reads its
-- item rows and sends them here. They replace the project's pricing lines in
-- one transaction (never half old, half new), and the project history says
-- which file they came from, how many lines and the price before VAT.
--
-- Same rule as editing pricing by hand: can_price() (pricing department,
-- planners, leads, managers, admins). The project's price shown in the
-- Projects list is Σ qty × unit price over these lines; nothing is stored
-- twice.
-- ==========================================================================

create or replace function replace_pricing_items(p_project uuid, p_items jsonb, p_file uuid default null)
returns integer
language plpgsql security definer set search_path = public as $$
declare n integer; total numeric; fname text;
begin
  if not coalesce(can_price(), false) then   -- can_price() can be null (no department)
    raise exception 'Only the pricing team, planners and managers can fill pricing from a sheet.';
  end if;
  if not exists (select 1 from projects where id = p_project) then
    raise exception 'No such project.';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array'
     or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 2000 then
    raise exception 'A pricing sheet needs between 1 and 2000 lines.';
  end if;

  delete from pricing_items where project_id = p_project;

  insert into pricing_items (project_id, name, description, qty, unit, cost_sar, unit_price_sar, sort, created_by)
  select p_project,
         left(coalesce(x.name, ''), 500),
         nullif(left(x.description, 4000), ''),
         greatest(coalesce(x.qty, 1), 0),
         nullif(left(x.unit, 60), ''),
         case when x.cost_sar >= 0 then x.cost_sar end,
         case when x.unit_price_sar >= 0 then x.unit_price_sar end,
         (e.o - 1)::integer,
         my_profile_id()
  from jsonb_array_elements(p_items) with ordinality as e(j, o)
  cross join lateral jsonb_to_record(e.j) as x(name text, description text, qty numeric,
                                               unit text, cost_sar numeric, unit_price_sar numeric);
  get diagnostics n = row_count;

  select coalesce(sum(qty * coalesce(unit_price_sar, 0)), 0) into total
    from pricing_items where project_id = p_project;
  select coalesce(title, filename) into fname from files where id = p_file and project_id = p_project;

  insert into project_events (project_id, kind, body, created_by)
  values (p_project, 'note',
          'Pricing filled from ' || coalesce('“' || fname || '”', 'a pricing sheet') || ': '
          || n || ' lines, SAR ' || to_char(total, 'FM999,999,999,990.00') || ' before VAT',
          my_profile_id());
  return n;
end $$;

revoke execute on function replace_pricing_items(uuid, jsonb, uuid) from public, anon;
grant execute on function replace_pricing_items(uuid, jsonb, uuid) to authenticated;
