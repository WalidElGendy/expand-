/* ==========================================================================
   Sums in a price cell.

   One pricing line often stands for several things bought or made together.
   The pricing team can type the sum instead of working it out elsewhere:

       500 + 250*2 + 300
       خشب 500 + دهان 250×2 + تركيب 300

   Words are labels: they are ignored by the arithmetic and kept for the
   breakdown, so the project manager hovering over the cell sees what each
   part is. Allowed: + − × ÷ * / x, brackets, %, decimals, Arabic digits,
   and thousands commas ("1,500"). No functions, no cell references — this
   is a calculator, not a spreadsheet, and nothing in it is ever executed.

   Pure: no DOM, used by the pricing table and its tests.
   ========================================================================== */

const AR = /[٠-٩۰-۹]/g;
const arDigits = (s) => String(s ?? '').replace(AR, d => String((d.charCodeAt(0) & 0xF) % 10));

/** The text with Arabic digits as Latin ones, × ÷ and "x" between numbers as
    * and /, Arabic decimal and thousands marks as . and nothing, and commas
    between digits ("1,500") removed. Words stay; the parser skips them. */
function normalise(text) {
  return arDigits(text)
    .replace(/٫/g, '.').replace(/٬/g, '')
    .replace(/(\d),(?=\d{3}(\D|$))/g, '$1')
    .replace(/[×xX✕](?=\s*[\d(.])/g, '*')
    .replace(/[÷]/g, '/')
    .replace(/[−–—]/g, '-');
}

/** A formula, as opposed to a plain number: it has an operator between two
    values, or words alongside a number. */
export function isFormula(text) {
  const s = normalise(text).trim();
  if (!s) return false;
  if (/^[+-]?\d*\.?\d+%?$/.test(s)) return false;
  return /\d/.test(s);
}

/**
 * Work out a sum. → { value, error }
 * value is rounded to 4 decimals; error is a short code:
 *   'empty' | 'syntax' | 'missingOp' | 'divZero' | 'negative'
 */
export function evaluate(text) {
  const src = normalise(text);
  if (!src.trim()) return { value: null, error: 'empty' };
  // Tokens: numbers, operators, brackets. Anything else is a label.
  const toks = [];
  const re = /(\d*\.?\d+)|([+\-*/()%])|([^\d+\-*/()%.]+|\.)/gy;
  let m;
  while ((m = re.exec(src))) {
    if (m[1] !== undefined) toks.push({ t: 'n', v: Number(m[1]) });
    else if (m[2] !== undefined) toks.push({ t: m[2] });
    else if (m[3] === '.') return { value: null, error: 'syntax' };
  }
  if (!toks.some(x => x.t === 'n')) return { value: null, error: 'empty' };
  let i = 0;
  const peek = () => toks[i]?.t;
  const fail = (e) => { throw new Error(e); };
  const atom = () => {
    if (peek() === '-') { i++; return -atom(); }
    if (peek() === '+') { i++; return atom(); }
    if (peek() === '(') {
      i++; const v = expr();
      if (peek() !== ')') fail('syntax');
      i++; return v;
    }
    if (peek() === 'n') return toks[i++].v;
    return fail('syntax');
  };
  const pct = () => { let v = atom(); while (peek() === '%') { i++; v /= 100; } return v; };
  const term = () => {
    let v = pct();
    for (;;) {
      if (peek() === '*' || peek() === '/') {
        const op = toks[i++].t, w = pct();
        if (op === '/' && w === 0) fail('divZero');
        v = op === '*' ? v * w : v / w;
      } else if (peek() === 'n' || peek() === '(') fail('missingOp');
      else return v;
    }
  };
  const expr = () => {
    let v = term();
    while (peek() === '+' || peek() === '-') { const op = toks[i++].t; const w = term(); v = op === '+' ? v + w : v - w; }
    return v;
  };
  try {
    const v = expr();
    if (i < toks.length) fail(peek() === 'n' ? 'missingOp' : 'syntax');
    if (!Number.isFinite(v)) fail('syntax');
    return { value: Math.round(v * 10000) / 10000, error: null };
  } catch (e) {
    return { value: null, error: e.message || 'syntax' };
  }
}

/** The cell's number: a plain number or the result of a sum; null if empty
    or not a sum that works out. */
export const cellValue = (text) => evaluate(text).value;

const fmt = (n) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });

/**
 * The parts of a sum for the hover: each top-level + or − part with what it
 * comes to, then the total.
 *   "خشب 500 + دهان 250×2 + تركيب 300" →
 *   [{ label: 'خشب 500', value: 500, sign: '+' }, { label: 'دهان 250×2', value: 500, sign: '+' }, …]
 */
export function breakdown(text) {
  const raw = String(text ?? '');
  const parts = [];
  let depth = 0, start = 0, sign = '+';
  const norm = normalise(raw);
  // Walk the normalised text (same length as the original but for commas
  // dropped in numbers) to find top-level + and −, then cut the original
  // at the same places by re-walking it.
  const cuts = [];
  for (let k = 0, seen = false; k < norm.length; k++) {
    const ch = norm[k];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if ((ch === '+' || ch === '-') && depth === 0 && seen) cuts.push(ch);
    if (/\d/.test(ch)) seen = true;
  }
  // Split the original on top-level +, −, –, —.
  depth = 0; let n = 0, seenDigit = false;
  for (let k = 0; k < raw.length; k++) {
    const ch = raw[k];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (/[+\-−–—]/.test(ch) && depth === 0 && seenDigit && n < cuts.length) {
      parts.push({ label: raw.slice(start, k).trim(), sign });
      sign = cuts[n++]; start = k + 1;
      continue;
    }
    if (/[\d٠-٩۰-۹]/.test(ch)) seenDigit = true;
  }
  parts.push({ label: raw.slice(start).trim(), sign });
  return parts.filter(p => p.label).map(p => ({ ...p, value: evaluate(p.label).value }));
}

/** The hover text: one line per part, then the total. Empty for a plain
    number (nothing to break down). */
export function breakdownText(text, { totalLabel = 'Total', qty = null, qtyLabel = '× {q} = {t}' } = {}) {
  if (!isFormula(text)) return '';
  const r = evaluate(text);
  if (r.error) return '';
  const lines = breakdown(text).map(p => `${p.sign === '-' ? '− ' : ''}${p.label}${p.value !== null && String(p.value) !== p.label.trim() ? `  =  ${fmt(p.value)}` : ''}`);
  lines.push(`${totalLabel}: ${fmt(r.value)}`);
  if (qty !== null && Number(qty) !== 1 && Number.isFinite(Number(qty))) {
    lines.push(qtyLabel.replace('{q}', fmt(qty)).replace('{t}', fmt(r.value * Number(qty))));
  }
  return lines.join('\n');
}
