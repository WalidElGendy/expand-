/* ==========================================================================
   A small spreadsheet reader: .xlsx and .csv in the browser, no library.

   An .xlsx is a ZIP of XML files. The ZIP is read here and each part is
   inflated with the browser's own DecompressionStream('deflate-raw'), so the
   bundle stays free of a 300 KB spreadsheet library for one HR screen. Old
   binary .xls files (Excel 97–2003) are a different format altogether; for
   those the full SheetJS reader is loaded on demand from its CDN, only when
   someone actually picks one.

   readSpreadsheet(file) → [{ name, rows: [[value, …], …] }, …]
     value: string | number | boolean | null. Dates come through as Excel's
     day numbers (the cell formats are not read); the importer turns them
     into dates for the columns that hold dates.
   ========================================================================== */

const td = new TextDecoder('utf-8');

/* --------------------------------------------------------------- the ZIP */

function u16(b, o) { return b[o] | (b[o + 1] << 8); }
function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }

async function inflateRaw(bytes) {
  if (typeof DecompressionStream === 'undefined') throw new Error('xlsx_unsupported_browser');
  const ds = new DecompressionStream('deflate-raw');
  const out = new Response(new Blob([bytes]).stream().pipeThrough(ds));
  return new Uint8Array(await out.arrayBuffer());
}

/** name → Uint8Array of every entry of a ZIP (stored or deflated). */
export async function unzip(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--) {
    if (u32(b, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not_a_zip');
  const count = u16(b, eocd + 10);
  let p = u32(b, eocd + 16);
  const files = {};
  for (let n = 0; n < count; n++) {
    if (u32(b, p) !== 0x02014b50) break;
    const method = u16(b, p + 10);
    const csize = u32(b, p + 20);
    const nlen = u16(b, p + 28), xlen = u16(b, p + 30), clen = u16(b, p + 32);
    const local = u32(b, p + 42);
    const name = td.decode(b.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + xlen + clen;
    const start = local + 30 + u16(b, local + 26) + u16(b, local + 28);
    const raw = b.subarray(start, start + csize);
    files[name] = { method, raw };
  }
  const out = {};
  for (const [name, f] of Object.entries(files)) {
    out[name] = async () => (f.method === 0 ? f.raw : await inflateRaw(f.raw));
  }
  return out;
}

/* --------------------------------------------------------------- the XML */

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' };
export const xmlText = (s) => String(s ?? '').replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
  if (e[0] === '#') {
    const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(cp) ? String.fromCodePoint(cp) : m;
  }
  return ENT[e] ?? m;
});
const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m ? xmlText(m[1]) : null;
};
/** All the text of an <si> or <is>: plain <t>, or several rich-text runs. */
const runsText = (x) => [...x.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(m => xmlText(m[1])).join('');

/** "C12" → column index 2 (0-based). */
export function colIndex(ref) {
  const letters = String(ref).match(/^[A-Z]+/i)?.[0].toUpperCase() || 'A';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function parseSharedStrings(xml) {
  return [...String(xml || '').matchAll(/<si>([\s\S]*?)<\/si>|<si\/>/g)].map(m => runsText(m[1] || ''));
}

export function parseSheet(xml, shared = []) {
  const rows = [];
  for (const rm of String(xml).matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>|<row\b([^>]*)\/>/g)) {
    const rAttr = rm[1] ?? rm[3] ?? '';
    const rn = Number(attr(rAttr, 'r')) || rows.length + 1;
    const row = [];
    for (const cm of (rm[2] || '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const a = cm[1], inner = cm[2] || '';
      const ref = attr(a, 'r');
      const ci = ref ? colIndex(ref) : row.length;
      const t = attr(a, 't');
      const v = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let val = null;
      if (t === 's') val = shared[Number(v)] ?? null;
      else if (t === 'inlineStr') val = runsText(inner.match(/<is>([\s\S]*?)<\/is>/)?.[1] || '');
      else if (t === 'str' || t === 'e') val = v === undefined ? null : xmlText(v);
      else if (t === 'b') val = v === '1';
      else if (v !== undefined) { const n = Number(v); val = Number.isFinite(n) ? n : xmlText(v); }
      row[ci] = val;
    }
    for (let i = 0; i < row.length; i++) if (row[i] === undefined) row[i] = null;
    rows[rn - 1] = row;
  }
  for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
  return rows;
}

/** The sheets of an .xlsx, in workbook order, with their names. */
export async function readXlsx(buf) {
  const z = await unzip(buf);
  const text = async (name) => (z[name] ? td.decode(await z[name]()) : '');
  const shared = parseSharedStrings(await text('xl/sharedStrings.xml'));
  const wb = await text('xl/workbook.xml');
  const rels = await text('xl/_rels/workbook.xml.rels');
  const target = {};
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(m[0], 'Id'), t = attr(m[0], 'Target');
    if (id && t) target[id] = t.startsWith('/') ? t.slice(1) : `xl/${t.replace(/^\.\//, '')}`;
  }
  const sheets = [];
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const name = attr(m[0], 'name') || `Sheet${sheets.length + 1}`;
    const rid = attr(m[0], 'r:id');
    const path = target[rid] || `xl/worksheets/sheet${sheets.length + 1}.xml`;
    const xml = await text(path);
    if (xml) sheets.push({ name, rows: parseSheet(xml, shared) });
  }
  if (!sheets.length) {
    for (const name of Object.keys(z).filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort()) {
      sheets.push({ name: name.match(/sheet\d+/)[0], rows: parseSheet(await text(name), shared) });
    }
  }
  return sheets;
}

/* --------------------------------------------------------------- the CSV */

export function parseCsv(text) {
  const s = String(text).replace(/^\uFEFF/, '');
  const first = s.split(/\r?\n/, 1)[0] || '';
  const delim = [',', ';', '\t'].map(d => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.map(r => r.map(c => (c.trim() === '' ? null : c.trim())));
}

function decodeText(bytes) {
  const u = td.decode(bytes);
  // A CSV saved by Arabic Excel is often Windows-1256, which reads as \uFFFD in UTF-8.
  if (u.includes('\uFFFD')) {
    try { return new TextDecoder('windows-1256').decode(bytes); } catch { /* fall through */ }
  }
  return u;
}

/* ------------------------------------------------------------ old .xls */

const SHEETJS = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs';
async function readWithSheetJS(buf) {
  let X;
  try { X = await import(/* @vite-ignore */ SHEETJS); } catch { throw new Error('xls_unavailable'); }
  const wb = X.read(new Uint8Array(buf), { type: 'array' });
  return wb.SheetNames.map(name => ({
    name, rows: X.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null }),
  }));
}

/* Several HR systems "export to Excel" by saving an HTML table with an .xls
   name. Excel opens it happily; so does this. */
export function parseHtmlTables(html) {
  const strip = (s) => xmlText(String(s).replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
  return [...String(html).matchAll(/<table\b[\s\S]*?<\/table>/gi)].map((tm, i) => ({
    name: `Table ${i + 1}`,
    rows: [...tm[0].matchAll(/<tr\b[\s\S]*?<\/tr>/gi)].map(rm =>
      [...rm[0].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(cm => { const v = strip(cm[1]); return v === '' ? null : v; })),
  })).filter(s => s.rows.length);
}

/** Any spreadsheet file the HR screen accepts → its sheets. */
export async function readSpreadsheet(file) {
  const buf = await file.arrayBuffer();
  const b = new Uint8Array(buf);
  const isZip = b[0] === 0x50 && b[1] === 0x4b;                       // "PK"
  const isOle = b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0;
  if (isZip) return readXlsx(buf);
  if (isOle) return readWithSheetJS(buf);
  const text = decodeText(b);
  if (/<table\b/i.test(text.slice(0, 200000))) {
    const t = parseHtmlTables(text);
    if (t.length) return t;
  }
  return [{ name: file.name || 'CSV', rows: parseCsv(text) }];
}
