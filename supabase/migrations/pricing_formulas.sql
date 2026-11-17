-- ==========================================================================
-- Pricing: a unit cost or unit price can be a sum of its parts.
--
-- The pricing team types "خشب 500 + دهان 250×2 + تركيب 300" into a cost or
-- price cell. The app works it out (web/calc.js) and saves the result in
-- cost_sar / unit_price_sar as before, so every total, the project's price
-- and the exports read the same numbers; the sum itself is kept here so the
-- project manager can hover the cell and see each part. Null for a plain
-- number. Same update rules as the rest of the line.
-- ==========================================================================

alter table pricing_items
  add column if not exists cost_formula text,
  add column if not exists price_formula text;

alter table pricing_items drop constraint if exists pricing_items_formula_len;
alter table pricing_items add constraint pricing_items_formula_len
  check (coalesce(length(cost_formula), 0) <= 1000 and coalesce(length(price_formula), 0) <= 1000);
