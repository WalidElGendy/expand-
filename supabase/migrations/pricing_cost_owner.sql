-- ==========================================================================
-- Applied 2026-10-21 to project ookiupgocavjbxcxquwl.
-- Pricing: unit cost, margin and an owner for every line.
--
-- Prices come from different departments and people, so each pricing line
-- can be assigned to a team member. That person can fill in the line (cost,
-- price, quantity, description) even if they are not on the pricing team,
-- but cannot reassign or delete it. Margin % is not stored: the app shows
-- (price − cost) ÷ price, and typing a margin sets the price from the cost.
-- ==========================================================================

alter table pricing_items
  add column if not exists cost_sar numeric check (cost_sar is null or cost_sar >= 0),
  add column if not exists assignee_id uuid references profiles(id) on delete set null;

create index if not exists pricing_items_assignee on pricing_items(assignee_id) where assignee_id is not null;

-- Extra permissive policy; pricing_update (can_price) is left as it was.
-- The check keeps assignee_id = me, so an assignee cannot hand the line on.
create policy pricing_update_assignee on pricing_items for update
  using (is_active_user() and assignee_id = my_profile_id())
  with check (is_active_user() and assignee_id = my_profile_id());
