-- ==========================================================================
-- Purchase requests: what the procurement list needs to actually buy.
--
-- An item on a project's procurement list was a name and a status. A request
-- now also says how many (and of what unit), by when it is needed, and which
-- suppliers have been found with what they quoted. Reference photos are files
-- with procurement_item_id set (bucket refs), as before — now several per item.
--
-- suppliers: [{ "name": "...", "contact": "phone or email", "price": 120.5,
--               "note": "..." }]  — price is the quoted unit price in SAR.
-- Same rules as the rest of procurement: everyone active reads, the
-- production team, planners and leads write (can_edit_production()).
-- ==========================================================================

alter table procurement_items
  add column if not exists qty numeric not null default 1,
  add column if not exists unit text,
  add column if not exists needed_by date,
  add column if not exists suppliers jsonb not null default '[]'::jsonb;

alter table procurement_items drop constraint if exists procurement_items_qty_positive;
alter table procurement_items add constraint procurement_items_qty_positive check (qty > 0);
alter table procurement_items drop constraint if exists procurement_items_suppliers_array;
alter table procurement_items add constraint procurement_items_suppliers_array
  check (jsonb_typeof(suppliers) = 'array' and jsonb_array_length(suppliers) <= 20);
