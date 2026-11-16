/* ==========================================================================
   A pricing sheet → the project's pricing lines.

   The pricing team prices in Excel. When their sheet is uploaded to a
   project, its item rows become the project's pricing table, so the price
   shows on the project and in the Projects list without anyone typing the
   numbers in a second time.

   The house template (هيكلية مشروع) has these columns, and the reader finds
   them by their headings, not by position, so a moved or extra column does
   not break it:

     #  المخرج  البند  وصف البند  الكمية  وحدة القياس  سعر التكلفة الإفرادي
     سعر التكلفة الإجمالي  تكلفة الوحدة  الإجمالي  ملاحظات

   Note "تكلفة الوحدة" there is the SELLING unit price (cost × 1.6), while
   the app's own export uses the same words for the cost. The headings alone
   cannot settle which money column is which, so the numbers do: the selling
   unit price is the one that, times the quantity, gives the line total.

   Pure: readPricing(sheets) → { items, sheet, subtotal, sheetSubtotal, … }
   where sheets is what xlsxread.js's readSpreadsheet returns.
   ========================================================================== */

/* ------------------------------------------------------------- headings */

/** Arabic and English headings in one comparable form: no diacritics or
    tatweel, one alef, ta marbuta as ha, alef maqsura as ya, lower case. */
export function norm(s) {
  return String(s ?? '')
    .replace(/[ً-ْٰـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
    .toLowerCase()
    .replace(/[()\[\]{}:.\-–—_/\\|*#،,]+/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

const TOTALISH = /اجمالي|المجموع|total|amount|subtotal/;
const COSTISH = /تكلفه|كلفه|cost/;
const MONEYISH = /سعر|تكلفه|كلفه|price|cost|rate|ثمن/;
const TAXISH = /ضريب|vat|tax|شامل|incl/;
const DISCOUNTISH = /خصم|discount/;

/** What a heading names, or null. Money columns are only sorted into
    "unit money" and the kinds of total here; which unit column is the
    selling price is decided from the numbers (see pickPrice).

      total     a line total before tax (several are allowed)
      netTotal  the line total after the sheet's discount
      costTotal the line's total cost
    Tax columns, the tax-inclusive total and the discount amount itself are
    not read: the app works out VAT on its own. */
export function headingKind(h) {
  const s = norm(h);
  if (!s) return null;
  if (/^(#|م|no|n|رقم|ت|التسلسل|تسلسل|الرقم التسلسلي|sr|s ?n|ser)$/.test(s)) return 'seq';
  if (/ملاحظ|notes?$|remarks?|comments?/.test(s)) return 'notes';
  if (/وصف|description|details|المواصفات|specification/.test(s)) return 'description';
  if (/^(الكميه|كميه|العدد|عدد|qty|quantity|quantities|q ty)( |$)/.test(s)) return 'qty';
  if (/وحده القياس|^الوحده( u)?$|^وحده$|^unit$|^uom$|unit of measure|^units?$/.test(s)) return 'unit';
  if (/^(المخرج|المخرجات|القسم|المرحله|section|deliverable|category|group|phase)$/.test(s)) return 'section';
  if (/^(البند|البنود|بند|مسمي البند|اسم البند|الصنف|اسم الصنف|المسمي|item|items|item name|name)$/.test(s) || /^(البند|item) /.test(s)) return 'name';
  if (TAXISH.test(s)) return null;
  if (TOTALISH.test(s) && DISCOUNTISH.test(s)) return 'netTotal';
  if (DISCOUNTISH.test(s) || /margin|هامش|نسبه|%/.test(s)) return null;
  if (TOTALISH.test(s)) return COSTISH.test(s) ? 'costTotal' : 'total';
  if (MONEYISH.test(s)) return 'money';
  return null;
}

/* --------------------------------------------------------------- values */

const AR_DIGITS = /[٠-٩۰-۹]/g;
/** 1500, "1,500", "١٬٥٠٠", "SAR 1,500.00" → 1500; anything else → null. */
export function toNum(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean') return null;
  let s = String(v).replace(AR_DIGITS, d => String((d.charCodeAt(0) & 0xF) % 10))
    .replace(/[٫]/g, '.').replace(/[٬,\s]/g, '')
    .replace(/sar|ريال|ر\.?س\.?/gi, '');
  const pct = s.endsWith('%'); if (pct) s = s.slice(0, -1);
  if (!/^-?\d*\.?\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? (pct ? n / 100 : n) : null;
}
const text = (v) => (v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim());
const round = (n, d = 2) => (n === null ? null : Math.round(n * 10 ** d) / 10 ** d);

/* ------------------------------------------------- formulas, as a fallback

   Excel saves each formula's result next to it, and that is what is read.
   A sheet written by a script may carry formulas and no results; for those
   the simple arithmetic a pricing sheet uses (+ − × ÷, %, SUM, ROUND,
   references on the same sheet) is worked out here. Anything else stays
   unknown rather than guessed. */

const colIdx = (letters) => { let n = 0; for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };

export function cellGetter(sheet) {
  const rows = sheet.rows || [], fx = sheet.formulas || {};
  const memo = new Map(), busy = new Set();
  const get = (r, c) => {
    const v = rows[r]?.[c];
    if (v !== null && v !== undefined) return v;
    const key = `${r},${c}`;
    if (!fx[key]) return null;
    if (memo.has(key)) return memo.get(key);
    if (busy.has(key)) return null;
    busy.add(key);
    let out = null;
    try { out = evalFormula(fx[key], get); } catch { out = null; }
    busy.delete(key); memo.set(key, out);
    return out;
  };
  return get;
}

export function evalFormula(f, get) {
  const src = String(f).replace(/^=/, '').toUpperCase();
  let i = 0;
  const peek = () => src[i], ws = () => { while (src[i] === ' ') i++; };
  const ref = () => {
    const m = src.slice(i).match(/^\$?([A-Z]{1,3})\$?(\d+)/);
    if (!m) return null;
    i += m[0].length;
    return { r: Number(m[2]) - 1, c: colIdx(m[1]) };
  };
  const args = () => {
    const out = [];
    ws(); if (peek() === ')') { i++; return out; }
    for (;;) {
      ws();
      const save = i, a = ref();
      if (a && src[i] === ':') {
        i++; const b = ref(); if (!b) throw new Error('range');
        const vals = [];
        for (let r = Math.min(a.r, b.r); r <= Math.max(a.r, b.r); r++)
          for (let c = Math.min(a.c, b.c); c <= Math.max(a.c, b.c); c++) vals.push(toNum(get(r, c)));
        out.push(vals);
      } else { i = save; out.push(expr()); }
      ws();
      if (peek() === ',' || peek() === ';') { i++; continue; }
      if (peek() === ')') { i++; return out; }
      throw new Error('args');
    }
  };
  const atom = () => {
    ws();
    if (peek() === '(') { i++; const v = expr(); ws(); if (peek() !== ')') throw new Error(')'); i++; return v; }
    if (peek() === '-') { i++; return -atom(); }
    if (peek() === '+') { i++; return atom(); }
    const num = src.slice(i).match(/^\d*\.?\d+(E[+-]?\d+)?/);
    if (num) { i += num[0].length; return Number(num[0]); }
    const fn = src.slice(i).match(/^([A-Z]+)\(/);
    if (fn) {
      i += fn[0].length;
      const a = args(), flat = a.flat().filter(v => v !== null && Number.isFinite(v));
      if (fn[1] === 'SUM') return flat.reduce((x, y) => x + y, 0);
      if (fn[1] === 'ROUND') { const d = a[1] ?? 0; return Math.round(a[0] * 10 ** d) / 10 ** d; }
      if (fn[1] === 'PRODUCT') return flat.reduce((x, y) => x * y, 1);
      throw new Error(`fn ${fn[1]}`);
    }
    const r = ref();
    if (r) { const v = toNum(get(r.r, r.c)); return v === null ? 0 : v; }
    throw new Error('atom');
  };
  const pct = () => { let v = atom(); ws(); while (peek() === '%') { i++; v /= 100; ws(); } return v; };
  const pow = () => { let v = pct(); ws(); while (peek() === '^') { i++; v = v ** pct(); ws(); } return v; };
  const term = () => {
    let v = pow(); ws();
    while (peek() === '*' || peek() === '/') { const op = src[i++]; const w = pow(); v = op === '*' ? v * w : v / w; ws(); }
    return v;
  };
  const expr = () => {
    let v = term(); ws();
    while (peek() === '+' || peek() === '-') { const op = src[i++]; const w = term(); v = op === '+' ? v + w : v - w; ws(); }
    return v;
  };
  const v = expr(); ws();
  if (i < src.length) throw new Error('trailing');
  return Number.isFinite(v) ? v : null;
}

/* ---------------------------------------------------------- the reading */

/** What the columns of one heading row are, with a score for how much of a
    pricing table it describes; null if it names no item or no money. */
function headerAt(get, r, width) {
  const cols = { money: [], total: [] };
  for (let c = 0; c < width; c++) {
    const v = get(r, c);
    if (typeof v !== 'string') continue;
    const k = headingKind(v);
    if (!k) continue;
    if (k === 'money' || k === 'total') cols[k].push(c);
    else if (cols[k] === undefined) cols[k] = c;
  }
  const hasItem = cols.name !== undefined || cols.description !== undefined;
  const hasMoney = cols.money.length + cols.total.length + (cols.netTotal !== undefined ? 1 : 0) > 0;
  if (!hasItem || !hasMoney) return null;
  const score = Object.keys(cols).filter(k => cols[k] !== undefined && !Array.isArray(cols[k])).length
    + cols.money.length + cols.total.length;
  return score >= 3 ? { r, cols, score } : null;
}

/** Every heading row of a sheet: a sheet can hold more than one table (a
    framework agreement with its printing items, then its trips), each with
    its own columns. */
function findHeaders(sheet, get) {
  const rows = sheet.rows || [];
  const width = Math.max(...rows.map(r => r?.length || 0), 0);
  const out = [];
  for (let r = 0; r < rows.length; r++) {
    const h = headerAt(get, r, width);
    if (h) out.push(h);
  }
  return out;
}

/** The selling unit price is the money column that, times the quantity,
    gives one of the line totals on most rows; that total is the line total.
    The cost is a column whose heading says cost, among the rest. Without a
    match the headings decide: price / سعر البيع is the price. */
function pickPrice(cols, dataRows, get, heads) {
  const money = cols.money, totals = cols.total;
  const qtyOf = (r) => (cols.qty !== undefined ? toNum(get(r, cols.qty)) ?? 1 : 1);
  let price = null, total = totals[0] ?? null, best = 0;
  for (const c of money) for (const t of totals) {
    let hits = 0;
    for (const r of dataRows) {
      const u = toNum(get(r, c)), v = toNum(get(r, t));
      if (u !== null && v !== null && Math.abs(qtyOf(r) * u - v) <= Math.max(0.01, Math.abs(v) * 0.0005)) hits++;
    }
    if (hits > best) { best = hits; price = c; total = t; }
  }
  if (price === null) {
    price = money.find(c => /بيع|sell|sale|price|سعر الوحده|سعر الافرادي/.test(norm(heads[c])) && !COSTISH.test(norm(heads[c])))
      ?? money.find(c => !COSTISH.test(norm(heads[c])))
      ?? null;
  }
  const cost = money.find(c => c !== price && COSTISH.test(norm(heads[c]))) ?? null;
  return { price, cost, total };
}

/** One table: its item rows (up to the next heading row) as pricing lines,
    and the subtotal the table states under itself. */
function readTable(sh, get, h, end, heads) {
  const cols = h.cols;
  const moneyCols = [...cols.money, ...cols.total, cols.netTotal, cols.costTotal].filter(c => c !== undefined);
  const dataRows = [], footRows = [];
  for (let r = h.r + 1; r < end; r++) {
    const name = cols.name !== undefined ? text(get(r, cols.name)) : '';
    const desc = cols.description !== undefined ? text(get(r, cols.description)) : '';
    const anyNum = [cols.qty, ...moneyCols].some(c => c !== undefined && toNum(get(r, c)) !== null);
    if ((name || desc) && anyNum) dataRows.push(r);
    else if (anyNum && dataRows.length) footRows.push(r);
  }
  if (!dataRows.length) return null;

  const { price, cost, total } = pickPrice(cols, dataRows, get, heads);
  const net = cols.netTotal;
  const sections = cols.section !== undefined
    ? new Set(dataRows.map(r => text(get(r, cols.section))).filter(Boolean)) : new Set();
  let discounted = false;

  const items = dataRows.map(r => {
    const qRaw = cols.qty !== undefined ? toNum(get(r, cols.qty)) : null;
    const qty = qRaw === null ? 1 : Math.max(0, qRaw);
    let unitPrice = price !== null ? toNum(get(r, price)) : null;
    const lineTotal = total !== null ? toNum(get(r, total)) : null;
    if (unitPrice === null && lineTotal !== null) unitPrice = qty ? lineTotal / qty : lineTotal;
    /* After the sheet's discount: the price the client is actually asked
       for, so that is the project's price. */
    const netTotal = net !== undefined ? toNum(get(r, net)) : null;
    if (netTotal !== null && qty) {
      const u = netTotal / qty;
      if (unitPrice === null || Math.abs(u - unitPrice) > 0.005) discounted = true;
      unitPrice = u;
    }
    let unitCost = cost !== null ? toNum(get(r, cost)) : null;
    if (unitCost === null && cols.costTotal !== undefined) {
      const ct = toNum(get(r, cols.costTotal));
      if (ct !== null) unitCost = qty ? ct / qty : ct;
    }
    let name = cols.name !== undefined ? text(get(r, cols.name)) : '';
    let description = cols.description !== undefined ? text(get(r, cols.description)) : '';
    if (!name) { name = description; description = ''; }
    if (description === name) description = '';
    if (sections.size > 1) {
      const sec = text(get(r, cols.section));
      if (sec) name = `${sec} · ${name}`;
    }
    const note = cols.notes !== undefined ? text(get(r, cols.notes)) : '';
    if (note) description = description ? `${description} — ${note}` : note;
    return {
      name: name.slice(0, 500),
      description: description ? description.slice(0, 4000) : null,
      qty: round(qty, 4),
      unit: cols.unit !== undefined ? (text(get(r, cols.unit)).slice(0, 60) || null) : null,
      cost_sar: unitCost !== null && unitCost >= 0 ? round(unitCost, 4) : null,
      unit_price_sar: unitPrice !== null && unitPrice >= 0 ? round(unitPrice, 4) : null,
    };
  });

  /* The table's own subtotal: the first figure under the column the price
     came from (after discount if there is one, else the line total, else any
     other total column) that is not labelled as tax. */
  const look = [...new Set([net, total, ...cols.total].filter(c => c !== undefined && c !== null))];
  let stated = null;
  for (const r of footRows) {
    const label = norm((sh.rows[r] || []).map(x => (typeof x === 'string' ? x : '')).join(' '));
    if (TAXISH.test(label) && !/قبل|before|excl/.test(label)) continue;
    const c = look.find(c => toNum(get(r, c)) !== null);
    if (c !== undefined) { stated = round(toNum(get(r, c))); break; }
  }
  return { items, stated, discounted };
}

/**
 * readPricing(sheets) → {
 *   items: [{ name, description, qty, unit, cost_sar, unit_price_sar }],
 *   sheet,          the sheet the lines came from
 *   subtotal,       Σ qty × unit price, before VAT
 *   sheetSubtotal,  what the sheet itself states, summed over its tables
 *   matches,        true / false when the sheet states a subtotal, else null
 *   discounted,     prices are after a discount the sheet applies
 *   reason,         when no lines were found: 'no_header' | 'no_rows'
 * }
 */
export function readPricing(sheets) {
  let found = null;
  for (const sh of sheets || []) {
    const get = cellGetter(sh);
    const hs = findHeaders(sh, get);
    if (!hs.length) continue;
    const score = Math.max(...hs.map(h => h.score));
    if (!found || score > found.score) found = { sh, get, hs, score };
  }
  if (!found) return { items: [], sheet: null, subtotal: 0, sheetSubtotal: null, matches: null, discounted: false, reason: 'no_header' };

  const { sh, get, hs } = found;
  const width = Math.max(...(sh.rows || []).map(r => r?.length || 0), 0);
  const items = [];
  let stated = 0, allStated = true, discounted = false;
  hs.forEach((h, i) => {
    const heads = Array.from({ length: width }, (_, c) => text(get(h.r, c)));
    const t = readTable(sh, get, h, i + 1 < hs.length ? hs[i + 1].r : (sh.rows || []).length, heads);
    if (!t) return;
    items.push(...t.items);
    if (t.stated === null) allStated = false; else stated += t.stated;
    discounted ||= t.discounted;
  });
  if (!items.length) return { items: [], sheet: sh.name, subtotal: 0, sheetSubtotal: null, matches: null, discounted: false, reason: 'no_rows' };

  const subtotal = round(items.reduce((a, it) => a + (it.qty || 0) * (it.unit_price_sar || 0), 0));
  const sheetSubtotal = allStated ? round(stated) : null;
  const matches = sheetSubtotal === null ? null : Math.abs(sheetSubtotal - subtotal) <= 1;
  return { items, sheet: sh.name, subtotal, sheetSubtotal, matches, discounted, reason: null };
}

/** Files the importer can read: Excel and CSV, by name or type. */
export const isSpreadsheet = (f) =>
  /\.(xlsx|xlsm|xls|csv)$/i.test(f?.filename || f?.name || '')
  || /spreadsheetml|ms-excel|text\/csv/.test(f?.mime || f?.type || '');
