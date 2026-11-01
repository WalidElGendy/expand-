/* ==========================================================================
   HR → People → Import from Excel.

   One or more reports from another HR system (Jisr, ZenHR, Mudad, Qiwa, or a
   spreadsheet someone keeps) are read in the browser, their columns are
   recognised by name in English or Arabic, each row is matched to somebody
   already in Expand, and the values land in the right place: the HR file,
   the private file (ID, passport, bank), the salary history, and the
   person's department and manager.

   Rules the user chose:
     · a row that matches nobody in Expand is skipped and listed, never
       created — new people come in through New hire;
     · the Excel wins over what Expand holds, but an empty cell never erases
       anything;
     · several reports can be uploaded together: a later file wins over an
       earlier one for the same field, and an employee number seen next to an
       email or ID in one report links that person's rows in the others.

   Nothing is saved until HR has seen every change on the preview and pressed
   Save. Everything here is pure; hrctl.js does the reading and the writing.
   ========================================================================== */

import * as H from './hrlogic.js';
import { esc, fmt } from './dash.js';

/* ------------------------------------------------------------ normalising */

export const normDigits = (s) => String(s ?? '')
  .replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 0x0660))
  .replace(/[\u06F0-\u06F9]/g, d => String(d.charCodeAt(0) - 0x06F0));

/** Header / name / value → a comparable form: lower case, Arabic letter
    variants folded, diacritics and punctuation gone. */
export const norm = (s) => normDigits(s).normalize('NFKC').toLowerCase()
  .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
  .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
  .replace(/[^a-z0-9\u0621-\u064A]+/g, ' ').trim();

/* ---------------------------------------------------------------- fields */

/* table: key = used to find the person, not stored · prof = profiles (via
   hr_set_org) · emp = hr_employees · priv = hr_employee_private · sal = a
   salary row. Synonyms are the column names the usual Saudi systems export,
   in English and Arabic; they are compared after norm(). */
export const FIELDS = [
  { key: 'email', table: 'key', type: 'email', syn: ['email', 'e mail', 'email address', 'work email', 'business email', 'official email', 'company email', 'personal email', 'البريد الالكتروني', 'البريد', 'الايميل', 'بريد العمل'] },
  { key: 'employee_no', table: 'key', type: 'code', syn: ['employee id', 'employee no', 'employee number', 'emp id', 'emp no', 'emp code', 'employee code', 'staff id', 'staff no', 'code', 'الرقم الوظيفي', 'رقم الموظف', 'كود الموظف', 'الكود'] },
  { key: 'full_name', table: 'key', type: 'text', syn: ['name', 'full name', 'employee name', 'employee full name', 'name english', 'english name', 'name en', 'employee name english', 'الاسم', 'اسم الموظف', 'الاسم الكامل', 'الاسم بالانجليزي', 'الاسم بالانجليزيه', 'الاسم الانجليزي'] },
  { key: 'name_ar', table: 'key', type: 'text', syn: ['name arabic', 'arabic name', 'name ar', 'employee name arabic', 'الاسم بالعربي', 'الاسم العربي', 'الاسم بالعربيه', 'اسم الموظف بالعربي'] },

  { key: 'department_id', table: 'prof', type: 'dept', syn: ['department', 'dept', 'department name', 'division', 'القسم', 'الاداره', 'القسم الاداره', 'اسم القسم'] },
  { key: 'supervisor_id', table: 'prof', type: 'person', syn: ['manager', 'line manager', 'direct manager', 'reporting manager', 'reports to', 'supervisor', 'manager name', 'direct manager name', 'المدير المباشر', 'المدير', 'المشرف', 'اسم المدير المباشر'] },

  { key: 'national_id', table: 'priv', type: 'idno', syn: ['national id', 'id number', 'id no', 'iqama', 'iqama number', 'iqama no', 'id iqama', 'id iqama number', 'national id iqama', 'identification number', 'identity number', 'national id number', 'resident id', 'border number', 'رقم الهويه', 'رقم الاقامه', 'رقم الهويه الاقامه', 'الهويه الاقامه', 'رقم الهويه الوطنيه', 'الهويه', 'الاقامه', 'رقم السجل المدني', 'رقم الحدود'] },
  { key: 'id_expiry', table: 'priv', type: 'date', syn: ['id expiry', 'id expiry date', 'iqama expiry', 'iqama expiry date', 'national id expiry', 'id expiration date', 'identity expiry date', 'تاريخ انتهاء الهويه', 'تاريخ انتهاء الاقامه', 'انتهاء الهويه', 'انتهاء الاقامه'] },
  { key: 'passport_no', table: 'priv', type: 'code', syn: ['passport', 'passport number', 'passport no', 'رقم الجواز', 'رقم جواز السفر', 'الجواز'] },
  { key: 'passport_expiry', table: 'priv', type: 'date', syn: ['passport expiry', 'passport expiry date', 'passport expiration date', 'تاريخ انتهاء الجواز', 'انتهاء الجواز'] },
  { key: 'iban', table: 'priv', type: 'iban', syn: ['iban', 'iban number', 'iban no', 'bank iban', 'account number', 'bank account', 'bank account number', 'رقم الايبان', 'الايبان', 'ايبان', 'رقم الحساب', 'رقم الحساب البنكي'] },
  { key: 'bank_name', table: 'priv', type: 'text', syn: ['bank', 'bank name', 'اسم البنك', 'البنك'] },

  { key: 'phone', table: 'emp', type: 'phone', syn: ['mobile', 'phone', 'mobile number', 'phone number', 'mobile no', 'contact number', 'cell', 'رقم الجوال', 'الجوال', 'رقم الهاتف', 'الهاتف', 'رقم التواصل', 'الموبايل'] },
  { key: 'joining_date', table: 'emp', type: 'date', syn: ['joining date', 'join date', 'date of joining', 'hire date', 'hiring date', 'date of hire', 'start date', 'employment date', 'date joined', 'تاريخ الالتحاق', 'تاريخ التعيين', 'تاريخ المباشره', 'تاريخ الانضمام', 'تاريخ بدايه العمل'] },
  { key: 'position', table: 'emp', type: 'text', syn: ['job title', 'position', 'designation', 'title', 'job', 'job name', 'occupation', 'المسمى الوظيفي', 'المسمي الوظيفي', 'الوظيفه', 'المهنه', 'المنصب'] },
  { key: 'nationality', table: 'emp', type: 'nationality', syn: ['nationality', 'citizenship', 'الجنسيه'] },
  { key: 'gender', table: 'emp', type: 'gender', syn: ['gender', 'sex', 'الجنس', 'النوع'] },
  { key: 'birth_date', table: 'emp', type: 'date', syn: ['date of birth', 'birth date', 'birthdate', 'dob', 'تاريخ الميلاد'] },
  { key: 'marital_status', table: 'emp', type: 'text', syn: ['marital status', 'الحاله الاجتماعيه'] },
  { key: 'address', table: 'emp', type: 'text', syn: ['address', 'national address', 'home address', 'العنوان', 'العنوان الوطني'] },
  { key: 'emergency_name', table: 'emp', type: 'text', syn: ['emergency contact', 'emergency contact name', 'emergency name', 'اسم جهه الطوارئ', 'جهه اتصال الطوارئ', 'جهه الاتصال في الطوارئ'] },
  { key: 'emergency_phone', table: 'emp', type: 'phone', syn: ['emergency phone', 'emergency contact number', 'emergency contact phone', 'emergency mobile', 'emergency number', 'رقم الطوارئ', 'جوال الطوارئ'] },
  { key: 'grade', table: 'emp', type: 'text', syn: ['grade', 'job grade', 'level', 'job level', 'الدرجه', 'المرتبه', 'الدرجه الوظيفيه'] },
  { key: 'contract_no', table: 'emp', type: 'code', syn: ['contract number', 'contract no', 'contract id', 'qiwa contract number', 'رقم العقد'] },
  { key: 'contract_type', table: 'emp', type: 'contract', syn: ['contract type', 'contract duration type', 'employment type', 'نوع العقد'] },
  { key: 'contract_start', table: 'emp', type: 'date', syn: ['contract start', 'contract start date', 'contract date', 'بدايه العقد', 'تاريخ بدايه العقد', 'تاريخ العقد'] },
  { key: 'contract_end', table: 'emp', type: 'date', syn: ['contract end', 'contract end date', 'contract expiry', 'contract expiry date', 'contract expiration date', 'نهايه العقد', 'تاريخ نهايه العقد', 'تاريخ انتهاء العقد', 'انتهاء العقد'] },
  { key: 'probation_end', table: 'emp', type: 'date', syn: ['probation end', 'probation end date', 'end of probation', 'probation expiry', 'نهايه فتره التجربه', 'تاريخ انتهاء فتره التجربه', 'انتهاء التجربه'] },
  { key: 'work_location', table: 'emp', type: 'text', syn: ['location', 'work location', 'branch', 'office', 'site', 'city', 'الموقع', 'الفرع', 'مقر العمل', 'موقع العمل', 'المدينه'] },
  { key: 'employment_status', table: 'emp', type: 'status', syn: ['status', 'employment status', 'employee status', 'حاله الموظف', 'الحاله الوظيفيه', 'حاله التوظيف'] },
  { key: 'end_date', table: 'emp', type: 'date', syn: ['termination date', 'last working day', 'last working date', 'end of service date', 'exit date', 'leaving date', 'resignation date', 'تاريخ ترك العمل', 'تاريخ انتهاء الخدمه', 'تاريخ الاستقاله', 'اخر يوم عمل'] },
  { key: 'end_reason', table: 'emp', type: 'text', syn: ['termination reason', 'exit reason', 'leaving reason', 'reason for leaving', 'سبب ترك العمل', 'سبب انتهاء الخدمه'] },
  { key: 'device_no', table: 'emp', type: 'code', syn: ['fingerprint number', 'fingerprint id', 'biometric id', 'attendance id', 'device number', 'device id', 'punch id', 'رقم البصمه', 'رقم الجهاز'] },

  { key: 'basic', table: 'sal', type: 'money', syn: ['basic', 'basic salary', 'basic pay', 'الراتب الاساسي', 'الاساسي', 'اساسي'] },
  { key: 'housing', table: 'sal', type: 'money', syn: ['housing', 'housing allowance', 'بدل السكن', 'السكن', 'بدل سكن'] },
  { key: 'transport', table: 'sal', type: 'money', syn: ['transport', 'transportation', 'transport allowance', 'transportation allowance', 'بدل النقل', 'بدل المواصلات', 'المواصلات', 'النقل', 'بدل نقل'] },
  { key: 'other_allowances', table: 'sal', type: 'money', syn: ['other allowances', 'other allowance', 'other', 'allowances', 'بدلات اخرى', 'بدلات اخري', 'البدلات الاخرى', 'بدلات'] },
].map(f => ({ ...f, synN: f.syn.map(norm) }));

export const FIELD = Object.fromEntries(FIELDS.map(f => [f.key, f]));

/* Columns that look like ours but are not: a contract's status is not the
   employee's, a total is computed here, and Hijri dates are not Gregorian. */
const IGNORE = ['contract status', 'حاله العقد', 'total salary', 'gross salary', 'total', 'gross', 'net salary', 'net',
  'الاجمالي', 'اجمالي الراتب', 'صافي الراتب', 'الراتب الاجمالي', 'gosi', 'التامينات',
  'iqama status', 'visa status', 'id status', 'حاله الاقامه', 'حاله الهويه', 'iqama profession', 'profession on iqama', 'المهنه في الاقامه',
  'id type', 'نوع الهويه', 'company name', 'establishment name', 'اسم الشركه', 'اسم المنشاه', 'المنشاه'].map(norm);

/** A column header → the field it holds, or null. */
export function guessField(header) {
  const h = norm(header);
  if (!h) return null;
  if (IGNORE.includes(h)) return null;
  let hit = FIELDS.find(f => f.synN.includes(h));
  if (!hit) {
    let best = null, bestLen = 0;
    const padded = ` ${h} `;
    for (const f of FIELDS) for (const s of f.synN) {
      if (s.length >= 4 && s.length > bestLen && padded.includes(` ${s} `)) { best = f; bestLen = s.length; }
    }
    hit = best;
  }
  if (hit && hit.type === 'date' && /hijri|هجري/.test(h)) return null;
  return hit ? hit.key : null;
}

/** Which row of a sheet holds the column names: the one, among the first
    fifteen, that most columns are recognised in. */
export function detectHeader(rows) {
  let best = -1, score = 1;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const n = (rows[i] || []).filter(c => c !== null && guessField(c)).length;
    if (n > score) { best = i; score = n; }
  }
  return best;
}

/** A freshly read file → its import settings: the best sheet, header row and
    column mapping. HR can change any of them on the screen. */
export function setupFile(name, sheets) {
  let sheetIdx = 0, headerRow = -1, top = 0;
  sheets.forEach((s, i) => {
    const h = detectHeader(s.rows);
    const n = h < 0 ? 0 : (s.rows[h] || []).filter(c => c !== null && guessField(c)).length;
    if (n > top) { top = n; sheetIdx = i; headerRow = h; }
  });
  const f = { name, sheets, sheetIdx, headerRow: headerRow < 0 ? 0 : headerRow, map: [] };
  return remap(f);
}
export function remap(f) {
  const head = f.sheets[f.sheetIdx]?.rows[f.headerRow] || [];
  f.map = head.map(c => (c === null ? null : guessField(c)));
  return f;
}

/* ---------------------------------------------------------------- values */

const blank = (v) => v === null || v === undefined || (typeof v === 'string' && /^\s*(-+|—|n\/?a|null|none|\.|0000-00-00)?\s*$/i.test(v));
const pad = (n) => String(n).padStart(2, '0');
const validYmd = (y, m, d) => {
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCMonth() === m - 1 ? `${y}-${pad(m)}-${pad(d)}` : null;
};

/** A cell → yyyy-mm-dd: Excel's day numbers, ISO, day-first (dd/mm/yyyy, the
    Saudi way), month names. Hijri years (14xx) are refused, not misread. */
export function parseDate(v) {
  if (blank(v)) return null;
  if (typeof v === 'number') {
    if (v > 1 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000).toISOString().slice(0, 10);
    return null;
  }
  if (v instanceof Date) return validYmd(v.getFullYear(), v.getMonth() + 1, v.getDate());
  const s = normDigits(v).trim();
  if (/^\d{5}(\.\d+)?$/.test(s)) return parseDate(Number(s));
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return validYmd(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (m) {
    let d = +m[1], mo = +m[2];
    if (mo > 12 && d <= 12) [d, mo] = [mo, d];
    return validYmd(+m[3], mo, d);
  }
  const t = Date.parse(s);
  if (Number.isFinite(t)) { const dt = new Date(t); return validYmd(dt.getFullYear(), dt.getMonth() + 1, dt.getDate()); }
  return null;
}

export function parseNum(v) {
  if (blank(v)) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = normDigits(v).replace(/[\u066C,\s]/g, '').replace(/٫/g, '.').replace(/[^\d.-]/g, '');
  if (!s || s === '-' || s === '.') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Phone numbers as the app stores them: Saudi mobiles as 05xxxxxxxx (Excel
    drops the leading zero of a number, and many exports carry +966). */
export function parsePhone(v) {
  if (blank(v)) return null;
  let s = normDigits(typeof v === 'number' ? String(Math.round(v)) : v).replace(/[\s\-().]/g, '');
  if (s.startsWith('00')) s = `+${s.slice(2)}`;
  const d = s.replace(/^\+/, '');
  if (/^9665\d{8}$/.test(d)) return `0${d.slice(3)}`;
  if (/^5\d{8}$/.test(d)) return `0${d}`;
  return d.length >= 7 ? s : null;
}

const code = (v) => {
  if (blank(v)) return null;
  const s = normDigits(typeof v === 'number' ? String(Math.round(v)) : v).trim().replace(/\.0+$/, '');
  return s || null;
};

function oneOf(v, table) {
  const n = norm(v);
  if (!n) return null;
  for (const [k, words] of table) if (words.map(norm).includes(n)) return k;
  let best = null, len = 0;
  for (const [k, words] of table) for (const w of words.map(norm)) {
    if (w.length > len && (` ${n} `).includes(` ${w} `)) { best = k; len = w.length; }
  }
  return best;
}
const GENDER = [['male', ['male', 'm', 'man', 'ذكر']], ['female', ['female', 'f', 'woman', 'انثي', 'انثى', 'أنثى']]];
const STATUS = [
  ['terminated', ['terminated', 'inactive', 'left', 'resigned', 'ended', 'exited', 'end of service', 'not active', 'منتهي', 'منتهيه', 'مستقيل', 'مستقيله', 'مفصول', 'ترك العمل', 'غير نشط', 'غير فعال', 'منتهي الخدمه']],
  ['on_leave', ['on leave', 'leave', 'vacation', 'في اجازه', 'اجازه']],
  ['probation', ['probation', 'on probation', 'under probation', 'تحت التجربه', 'فتره التجربه', 'تجربه']],
  ['active', ['active', 'working', 'employed', 'current', 'نشط', 'فعال', 'على راس العمل', 'علي راس العمل', 'على رأس العمل', 'يعمل']],
];
const CONTRACT = [
  ['unlimited', ['unlimited', 'indefinite', 'open ended', 'open', 'permanent', 'غير محدد المده', 'غير محدد', 'دائم']],
  ['fixed', ['fixed', 'fixed term', 'limited', 'definite', 'محدد المده', 'محدد']],
  ['part_time', ['part time', 'parttime', 'دوام جزئي', 'جزئي']],
  ['temporary', ['temporary', 'temp', 'seasonal', 'مؤقت', 'موسمي']],
];
export const isSaudiNationality = (v) => /saudi|ksa|سعودي/.test(norm(v));

/** A raw cell for a field → the stored value, or null when it is empty or
    cannot be read (then it changes nothing). */
export function parseValue(fieldKey, v) {
  const f = FIELD[fieldKey];
  if (!f || blank(v)) return null;
  switch (f.type) {
    case 'email': { const s = String(v).trim().toLowerCase(); return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s) ? s : null; }
    case 'date': return parseDate(v);
    case 'phone': return parsePhone(v);
    case 'money': { const n = parseNum(v); return n === null || n < 0 ? null : Math.round(n * 100) / 100; }
    case 'code': return code(v);
    case 'idno': { const s = code(v)?.replace(/\s+/g, ''); return s && /^\d{8,15}$/.test(s) ? s : null; }
    case 'iban': { const s = normDigits(v).replace(/\s+/g, '').toUpperCase(); return /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s) ? s : null; }
    case 'gender': return oneOf(v, GENDER);
    case 'status': return oneOf(v, STATUS);
    case 'contract': return oneOf(v, CONTRACT);
    default: { const s = String(typeof v === 'number' ? v : v).replace(/\s+/g, ' ').trim(); return s || null; }
  }
}

/* -------------------------------------------------------------- matching */

const nameTokens = (s) => norm(s).split(' ').filter(w => w.length > 1);

/** Find people by name: the same name, or — when unique — a name whose
    words all appear in the other ("Walid ElGendy" in "Walid Mohamed ElGendy"). */
export function nameMatcher(people) {
  const list = people.map(p => ({ id: p.id, n: norm(p.full_name || ''), t: nameTokens(p.full_name || '') })).filter(x => x.n);
  return (name) => {
    const n = norm(name);
    if (!n) return null;
    const exact = list.filter(x => x.n === n);
    if (exact.length === 1) return { id: exact[0].id, how: 'name' };
    if (exact.length > 1) return null;
    const t = nameTokens(name);
    if (t.length < 2) return null;
    const sub = list.filter(x => x.t.length >= 2 && (x.t.every(w => t.includes(w)) || t.every(w => x.t.includes(w))));
    return sub.length === 1 ? { id: sub[0].id, how: 'name_partial' } : null;
  };
}

function deptMatcher(departments) {
  const list = (departments || []).map(d => ({ id: d.id, keys: [d.id, d.name_en, d.name_ar].filter(Boolean).map(norm) }));
  return (v) => {
    const n = norm(v);
    if (!n) return null;
    const ex = list.find(d => d.keys.includes(n));
    if (ex) return ex.id;
    const part = list.filter(d => d.keys.some(k => k.length >= 3 && (` ${n} `.includes(` ${k} `) || ` ${k} `.includes(` ${n} `))));
    return part.length === 1 ? part[0].id : null;
  };
}

/** Every data row of every uploaded file, with its values read. */
export function extractRows(files) {
  const out = [];
  files.forEach((f, fi) => {
    const rows = f.sheets[f.sheetIdx]?.rows || [];
    for (let r = f.headerRow + 1; r < rows.length; r++) {
      const row = rows[r] || [];
      if (!row.some(c => !blank(c))) continue;
      const vals = {}, raw = {};
      f.map.forEach((key, ci) => {
        if (!key) return;
        if (raw[key] === undefined && !blank(row[ci])) raw[key] = row[ci];
        if (vals[key] !== undefined && vals[key] !== null) return;
        const v = FIELD[key].type === 'dept' || FIELD[key].type === 'person' ? (blank(row[ci]) ? null : String(row[ci]).trim()) : parseValue(key, row[ci]);
        if (v !== null) vals[key] = v;
      });
      if (Object.keys(vals).length) out.push({ file: fi, fileName: f.name, rowNo: r + 1, vals, raw });
    }
  });
  return out;
}

/* ------------------------------------------------------------------ plan */

const same = (a, b) => {
  if ((a === null || a === undefined || a === '') && (b === null || b === undefined || b === '')) return true;
  if (typeof a === 'number' || typeof b === 'number') return Number(a) === Number(b);
  return String(a ?? '').trim() === String(b ?? '').trim();
};
const SAL = ['basic', 'housing', 'transport', 'other_allowances'];

/** Everything the import would do, without doing it. */
export function planImport({ files, people = [], emps = [], privs = [], salaries = [], departments = [], today }) {
  const rows = extractRows(files);
  const empOf = new Map(emps.map(e => [e.profile_id, e]));
  const privOf = new Map(privs.map(p => [p.profile_id, p]));
  const personOf = new Map(people.map(p => [p.id, p]));
  const idx = (pairs) => { const m = new Map(); for (const [k, id] of pairs) if (k) m.set(k, m.has(k) && m.get(k) !== id ? null : id); return m; };
  const byEmail = idx(people.map(p => [String(p.email || '').toLowerCase(), p.id]));
  const byNid = idx(privs.map(p => [p.national_id ? String(p.national_id).replace(/\s+/g, '').toUpperCase() : '', p.profile_id]));
  const byContract = idx(emps.map(e => [e.contract_no ? String(e.contract_no).trim() : '', e.profile_id]));
  const byDevice = idx(emps.map(e => [e.device_no ? String(e.device_no).trim() : '', e.profile_id]));
  const byName = nameMatcher(people);

  const strong = (v) => {
    if (v.email && byEmail.get(v.email)) return { id: byEmail.get(v.email), how: 'email' };
    if (v.national_id && byNid.get(v.national_id)) return { id: byNid.get(v.national_id), how: 'national_id' };
    if (v.contract_no && byContract.get(v.contract_no)) return { id: byContract.get(v.contract_no), how: 'contract_no' };
    if (v.device_no && byDevice.get(v.device_no)) return { id: byDevice.get(v.device_no), how: 'device_no' };
    return null;
  };
  // Pass 1: the strong keys, and the employee numbers / IDs they reveal.
  const link = new Map();
  for (const r of rows) {
    r.match = strong(r.vals);
    if (r.match) for (const k of ['employee_no', 'national_id', 'email']) if (r.vals[k]) link.set(`${k}:${r.vals[k]}`, r.match.id);
  }
  // Pass 2: the rest, through those links, then by name.
  for (const r of rows) {
    if (r.match) continue;
    for (const k of ['employee_no', 'national_id', 'email']) {
      const id = r.vals[k] && link.get(`${k}:${r.vals[k]}`);
      if (id) { r.match = { id, how: 'linked' }; break; }
    }
    if (!r.match) r.match = byName(r.vals.full_name) || byName(r.vals.name_ar);
    if (r.match) for (const k of ['employee_no', 'national_id', 'email']) {
      if (r.vals[k] && !link.has(`${k}:${r.vals[k]}`)) link.set(`${k}:${r.vals[k]}`, r.match.id);
    }
  }

  const findDept = deptMatcher(departments);
  const findPerson = (v) => {
    const s = String(v || '').trim();
    if (!s) return null;
    if (s.includes('@')) return byEmail.get(s.toLowerCase()) || null;
    return byName(s)?.id || null;
  };

  const per = new Map();
  const skipped = [];
  const warnings = [];
  for (const r of rows) {
    if (!r.match) {
      skipped.push({ file: r.fileName, row: r.rowNo, label: r.vals.full_name || r.vals.name_ar || r.vals.email || r.vals.national_id || r.vals.employee_no || '—',
        email: r.vals.email || '', nid: r.vals.national_id || '' });
      continue;
    }
    const acc = per.get(r.match.id) || { id: r.match.id, how: new Set(), vals: {}, src: {} };
    acc.how.add(r.match.how);
    for (const [k, v] of Object.entries(r.vals)) {
      if (FIELD[k].table === 'key') continue;
      acc.vals[k] = v; acc.src[k] = r.fileName;
    }
    per.set(r.match.id, acc);
  }

  const out = [];
  for (const acc of per.values()) {
    const p = personOf.get(acc.id);
    if (!p) continue;
    const e = empOf.get(acc.id) || {};
    const pv = privOf.get(acc.id) || {};
    const emp = {}, priv = {}, prof = {}, changes = [];
    const note = (key, from, to, label = null) => changes.push({ key, from: from ?? null, to, label });
    for (const [k, v] of Object.entries(acc.vals)) {
      const f = FIELD[k];
      if (f.table === 'emp' && !same(e[k], v)) { emp[k] = v; note(k, e[k], v); }
      if (f.table === 'priv' && !same(pv[k], v)) { priv[k] = v; note(k, pv[k], v); }
      if (k === 'department_id') {
        const d = findDept(v);
        if (!d) warnings.push({ kind: 'dept', value: v, who: p.full_name || p.email });
        else if (d !== p.department_id) { prof.department_id = d; note(k, p.department_id, d); }
      }
      if (k === 'supervisor_id') {
        const s = findPerson(v);
        if (!s || s === p.id) warnings.push({ kind: 'manager', value: v, who: p.full_name || p.email });
        else if (s !== p.supervisor_id) { prof.supervisor_id = s; note(k, p.supervisor_id, s); }
      }
    }
    if (acc.vals.nationality) {
      const sa = isSaudiNationality(acc.vals.nationality);
      if (!!e.is_saudi !== sa) { emp.is_saudi = sa; note('is_saudi', !!e.is_saudi, sa); }
    }
    let salary = null;
    if (SAL.some(k => acc.vals[k] !== undefined)) {
      const mine = salaries.filter(s => s.employee_id === acc.id).sort((a, b) => String(b.effective_from).localeCompare(String(a.effective_from)));
      const cur = H.salaryOn(salaries, acc.id, today) || mine[0] || null;
      const next = Object.fromEntries(SAL.map(k => [k, acc.vals[k] !== undefined ? acc.vals[k] : Number(cur?.[k] || 0)]));
      if (!cur || SAL.some(k => !same(Number(cur[k] || 0), next[k]))) {
        const joined = emp.joining_date || e.joining_date || null;
        const effective = cur ? today : (joined && joined <= today ? joined : today);
        salary = { ...next, effective_from: effective, reason: cur ? 'adjustment' : 'hire' };
        note('salary', cur ? H.grossOf(cur) : null, H.grossOf(next));
      }
    }
    if (changes.length) out.push({ id: acc.id, name: p.full_name || p.email, how: [...acc.how], emp, priv, prof, salary, changes });
  }
  out.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return { people: out, skipped, warnings, rows: rows.length, matched: per.size,
    fields: out.reduce((n, x) => n + x.changes.length, 0) };
}

/* ----------------------------------------------------------------- strings */

export const ISTR = {
  en: {
    title: 'Import employees from Excel', open: 'Import from Excel', back: 'Back to People',
    intro: 'Upload one or more reports exported from your HR or payroll system (Jisr, ZenHR, Mudad, Qiwa or any spreadsheet) — .xlsx, .xls or .csv. Columns are recognised by their names in English or Arabic, and each row is matched to someone already in Expand by email, ID / Iqama number, contract number or name.',
    rules: 'Nothing is saved until you press Save. The Excel wins over what is in Expand, but an empty cell never erases anything. Rows that match nobody in Expand are skipped — add new people with New hire first. When several reports fill the same field, the one uploaded last wins.',
    pick: 'Choose files', reading: 'Reading…', clear: 'Start over', remove: 'Remove',
    sheet: 'Sheet', headerRow: 'Column names on row', rowsN: '{n} rows', columns: 'Columns',
    ignore: '— ignore —', sample: 'e.g.', unknownCols: '{n} columns not recognised — pick a field for any you need, or leave them ignored.',
    preview: 'What will change', none: 'No changes: everything in these files already matches Expand, or no rows matched anyone.',
    stats: '{p} people · {f} changes · {s} rows skipped', person: 'Person', how: 'Matched by', changes: 'Changes', include: 'Save',
    save: 'Save {f} changes for {p} people', saving: 'Saving {i} of {n}…',
    done: 'Imported: {p} people updated ({f} changes).', doneErr: ' {e} could not be saved: {names}.',
    skipped: 'Skipped — not in Expand ({n})', skippedNote: 'These rows match nobody in Expand. Add them with New hire (or check their email / ID number), then import again.',
    file: 'File', row: 'Row', warnings: 'Could not place ({n})',
    warnDept: 'Department “{v}” for {who} does not match any department in Expand.',
    warnManager: 'Manager “{v}” for {who} does not match anyone in Expand.',
    xlsErr: 'This old .xls file could not be opened. Open it in Excel and save it as .xlsx, then upload that.',
    readErr: 'Could not read {n}: {e}', browserErr: 'This browser cannot open .xlsx files. Use a current Chrome, Edge, Safari or Firefox.',
    noHeader: 'No column names were recognised in this file. Pick the row that holds them, or set the fields by hand.',
    how_: { email: 'email', national_id: 'ID number', contract_no: 'contract no.', device_no: 'fingerprint no.', linked: 'another report', name: 'name', name_partial: 'name (check)' },
    salaryLabel: 'Salary (gross)', is_saudi: 'Saudi national', yes: 'Yes', no: 'No',
    labels: { email: 'Email', employee_no: 'Employee number (to link reports)', full_name: 'Name (to match)', name_ar: 'Arabic name (to match)',
      department_id: 'Department', supervisor_id: 'Manager', national_id: 'ID / Iqama number', id_expiry: 'ID expiry', passport_no: 'Passport number',
      passport_expiry: 'Passport expiry', iban: 'IBAN', bank_name: 'Bank', phone: 'Mobile', joining_date: 'Joining date', position: 'Position',
      nationality: 'Nationality', gender: 'Gender', birth_date: 'Date of birth', marital_status: 'Marital status', address: 'Address',
      emergency_name: 'Emergency contact', emergency_phone: 'Emergency phone', grade: 'Grade', contract_no: 'Contract number',
      contract_type: 'Contract type', contract_start: 'Contract start', contract_end: 'Contract end', probation_end: 'Probation end',
      work_location: 'Work location', employment_status: 'Employment status', end_date: 'End date', end_reason: 'End reason',
      device_no: 'Fingerprint number', basic: 'Basic salary', housing: 'Housing allowance', transport: 'Transport allowance', other_allowances: 'Other allowances' },
    groups: { key: 'Matching', prof: 'Organisation', emp: 'Employment', priv: 'Private', sal: 'Salary' },
  },
  ar: {
    title: 'استيراد الموظفين من Excel', open: 'استيراد من Excel', back: 'العودة إلى الموظفين',
    intro: 'ارفع تقريراً أو أكثر من نظام الموارد البشرية أو الرواتب (جسر، ZenHR، مدد، قوى أو أي جدول) بصيغة .xlsx أو .xls أو .csv. نتعرّف على الأعمدة من أسمائها بالعربية أو الإنجليزية، ونطابق كل صف بموظف موجود في Expand عبر البريد أو رقم الهوية/الإقامة أو رقم العقد أو الاسم.',
    rules: 'لا يُحفظ شيء قبل الضغط على «حفظ». قيم Excel تُقدَّم على ما في Expand، لكن الخلية الفارغة لا تمسح شيئاً. الصفوف التي لا تطابق أحداً في Expand تُتجاوز — أضف الموظفين الجدد عبر «تعيين جديد» أولاً. إذا ملأ أكثر من تقرير الحقل نفسه فالأخير رفعاً هو المعتمد.',
    pick: 'اختر الملفات', reading: 'جارٍ القراءة…', clear: 'البدء من جديد', remove: 'إزالة',
    sheet: 'الورقة', headerRow: 'أسماء الأعمدة في الصف', rowsN: '{n} صف', columns: 'الأعمدة',
    ignore: '— تجاهل —', sample: 'مثال', unknownCols: '{n} عمود لم يُتعرّف عليه — اختر الحقل لما تحتاجه أو اتركه متجاهلاً.',
    preview: 'ما سيتغيّر', none: 'لا تغييرات: كل ما في الملفات مطابق لما في Expand، أو لم يطابق أي صف أحداً.',
    stats: '{p} موظف · {f} تغيير · {s} صف متجاوز', person: 'الموظف', how: 'طريقة المطابقة', changes: 'التغييرات', include: 'حفظ',
    save: 'حفظ {f} تغيير لـ {p} موظف', saving: 'جارٍ الحفظ {i} من {n}…',
    done: 'تم الاستيراد: تحديث {p} موظف ({f} تغيير).', doneErr: ' تعذّر حفظ {e}: {names}.',
    skipped: 'متجاوز — غير موجود في Expand ({n})', skippedNote: 'هذه الصفوف لا تطابق أحداً في Expand. أضفهم عبر «تعيين جديد» (أو تحقق من البريد/رقم الهوية) ثم أعد الاستيراد.',
    file: 'الملف', row: 'الصف', warnings: 'تعذّر تحديده ({n})',
    warnDept: 'القسم «{v}» للموظف {who} لا يطابق أي قسم في Expand.',
    warnManager: 'المدير «{v}» للموظف {who} لا يطابق أحداً في Expand.',
    xlsErr: 'تعذّر فتح ملف .xls القديم. افتحه في Excel واحفظه بصيغة .xlsx ثم ارفعه.',
    readErr: 'تعذّرت قراءة {n}: {e}', browserErr: 'هذا المتصفح لا يفتح ملفات .xlsx. استخدم إصداراً حديثاً من Chrome أو Edge أو Safari أو Firefox.',
    noHeader: 'لم نتعرّف على أسماء أعمدة في هذا الملف. اختر الصف الذي يحتويها أو حدّد الحقول يدوياً.',
    how_: { email: 'البريد', national_id: 'رقم الهوية', contract_no: 'رقم العقد', device_no: 'رقم البصمة', linked: 'تقرير آخر', name: 'الاسم', name_partial: 'الاسم (تحقّق)' },
    salaryLabel: 'الراتب (الإجمالي)', is_saudi: 'سعودي الجنسية', yes: 'نعم', no: 'لا',
    labels: { email: 'البريد', employee_no: 'الرقم الوظيفي (لربط التقارير)', full_name: 'الاسم (للمطابقة)', name_ar: 'الاسم بالعربي (للمطابقة)',
      department_id: 'القسم', supervisor_id: 'المدير المباشر', national_id: 'رقم الهوية/الإقامة', id_expiry: 'انتهاء الهوية', passport_no: 'رقم الجواز',
      passport_expiry: 'انتهاء الجواز', iban: 'الآيبان', bank_name: 'البنك', phone: 'الجوال', joining_date: 'تاريخ الالتحاق', position: 'المسمى الوظيفي',
      nationality: 'الجنسية', gender: 'الجنس', birth_date: 'تاريخ الميلاد', marital_status: 'الحالة الاجتماعية', address: 'العنوان',
      emergency_name: 'جهة اتصال الطوارئ', emergency_phone: 'جوال الطوارئ', grade: 'الدرجة', contract_no: 'رقم العقد',
      contract_type: 'نوع العقد', contract_start: 'بداية العقد', contract_end: 'نهاية العقد', probation_end: 'نهاية التجربة',
      work_location: 'موقع العمل', employment_status: 'الحالة الوظيفية', end_date: 'تاريخ ترك العمل', end_reason: 'سبب ترك العمل',
      device_no: 'رقم البصمة', basic: 'الراتب الأساسي', housing: 'بدل السكن', transport: 'بدل النقل', other_allowances: 'بدلات أخرى' },
    groups: { key: 'المطابقة', prof: 'التنظيم', emp: 'التوظيف', priv: 'خاص', sal: 'الراتب' },
  },
};

/* ------------------------------------------------------------------ view */

const opt = (v, label, sel) => `<option value="${esc(v)}"${String(v) === String(sel ?? '') ? ' selected' : ''}>${esc(label)}</option>`;
const fill = (s, o) => String(s).replace(/\{(\w+)\}/g, (_, k) => (o[k] ?? ''));
const cellText = (v) => (v === null || v === undefined ? '' : String(v)).slice(0, 40);

function fieldSelect(t, fi, ci, cur) {
  const groups = ['key', 'prof', 'emp', 'priv', 'sal'];
  return `<select data-imp-col="${ci}" data-imp-file="${fi}">${opt('', t.ignore, cur || '')}${groups.map(g =>
    `<optgroup label="${esc(t.groups[g])}">${FIELDS.filter(f => f.table === g).map(f => opt(f.key, t.labels[f.key], cur || '')).join('')}</optgroup>`).join('')}</select>`;
}

function showVal(t, lang, key, v, ctx) {
  if (v === null || v === undefined || v === '') return '<span class="muted">—</span>';
  if (key === 'salary') return esc(H.money(v, lang));
  if (key === 'is_saudi') return esc(v ? t.yes : t.no);
  if (key === 'department_id') {
    const d = (ctx.departments || []).find(x => x.id === v);
    return esc(d ? (lang === 'ar' ? d.name_ar : d.name_en) : v);
  }
  if (key === 'supervisor_id') {
    const p = (ctx.people || []).find(x => x.id === v);
    return esc(p ? (p.full_name || p.email) : '—');
  }
  if (FIELD[key]?.type === 'date') return esc(fmt(v, lang));
  return esc(v);
}

/** The whole import screen. `tabs` is the HR tab bar, passed in by hr.js. */
export function hrImportView(lang, ctx, tabs = '') {
  const t = ISTR[lang];
  const imp = ctx.imp || { files: [] };
  const files = imp.files || [];
  const fileCards = files.map((f, fi) => {
    const sheet = f.sheets[f.sheetIdx] || { rows: [] };
    const head = sheet.rows[f.headerRow] || [];
    const sample = sheet.rows.slice(f.headerRow + 1).find(r => r && r.some(c => c !== null)) || [];
    const unknown = head.filter((c, i) => c !== null && !f.map[i]).length;
    const nRows = Math.max(0, sheet.rows.slice(f.headerRow + 1).filter(r => r && r.some(c => c !== null)).length);
    const cols = head.map((c, ci) => (c === null && !f.map[ci] ? '' : `<label class="impcol${f.map[ci] ? ' is-on' : ''}">
        <span class="impcol__h">${esc(cellText(c) || `#${ci + 1}`)}</span>
        <span class="impcol__s muted small">${sample[ci] !== null && sample[ci] !== undefined ? `${esc(t.sample)} ${esc(cellText(sample[ci]))}` : '&nbsp;'}</span>
        ${fieldSelect(t, fi, ci, f.map[ci])}</label>`)).join('');
    return `<section class="card">
      <div class="card__head"><h2>${esc(f.name)}</h2><span class="muted small">${esc(fill(t.rowsN, { n: nRows }))}</span>
        <button class="btn btn--sm" style="margin-inline-start:auto" data-imp-remove="${fi}">${esc(t.remove)}</button></div>
      <div class="filterbar">
        ${f.sheets.length > 1 ? `<label class="f f--sm"><span>${esc(t.sheet)}</span><select data-imp-sheet="${fi}">${f.sheets.map((s, i) => opt(i, s.name, f.sheetIdx)).join('')}</select></label>` : ''}
        <label class="f f--sm"><span>${esc(t.headerRow)}</span><input type="number" min="1" max="${Math.max(1, sheet.rows.length)}" value="${f.headerRow + 1}" data-imp-head="${fi}" style="width:90px" /></label>
      </div>
      ${!f.map.some(Boolean) ? `<p class="note">${esc(t.noHeader)}</p>` : unknown ? `<p class="muted small" style="margin:0 16px 8px">${esc(fill(t.unknownCols, { n: unknown }))}</p>` : ''}
      <div class="impcols">${cols}</div>
    </section>`;
  }).join('');

  let preview = '';
  const plan = imp.plan;
  if (files.length && plan) {
    const skip = imp.skip || {};
    const chosen = plan.people.filter(p => !skip[p.id]);
    const nf = chosen.reduce((n, p) => n + p.changes.length, 0);
    const label = (k) => (k === 'salary' ? t.salaryLabel : k === 'is_saudi' ? t.is_saudi : t.labels[k] || k);
    preview = `<section class="card">
      <div class="card__head"><h2>${esc(t.preview)}</h2>
        <span class="muted small">${esc(fill(t.stats, { p: plan.people.length, f: plan.fields, s: plan.skipped.length }))}</span></div>
      ${plan.people.length ? `<div class="tblwrap"><table class="tbl tbl--tight"><thead><tr><th>${esc(t.include)}</th><th>${esc(t.person)}</th><th>${esc(t.how)}</th><th>${esc(t.changes)}</th></tr></thead><tbody>
        ${plan.people.map(p => `<tr${skip[p.id] ? ' class="muted"' : ''}>
          <td><input type="checkbox" data-imp-skip="${esc(p.id)}"${skip[p.id] ? '' : ' checked'} /></td>
          <td><button class="link" data-act="go" data-route="#/hr/e/${esc(p.id)}">${esc(p.name)}</button></td>
          <td class="small${p.how.includes('name_partial') ? ' bad' : ' muted'}">${esc(p.how.map(h => t.how_[h] || h).join(', '))}</td>
          <td class="small"><ul class="impchg">${p.changes.map(c => `<li><b>${esc(label(c.key))}</b>: ${showVal(t, lang, c.key, c.from, ctx)} → ${showVal(t, lang, c.key, c.to, ctx)}</li>`).join('')}</ul></td></tr>`).join('')}
      </tbody></table></div>
      <div class="actions" style="padding:12px 16px">
        <button class="btn btn--primary" data-imp-apply${chosen.length ? '' : ' disabled'}>${esc(imp.saving || fill(t.save, { f: nf, p: chosen.length }))}</button></div>`
        : `<p class="note">${esc(t.none)}</p>`}
    </section>
    ${plan.warnings.length ? `<section class="card"><div class="card__head"><h2>${esc(fill(t.warnings, { n: plan.warnings.length }))}</h2></div>
      <ul class="impchg" style="padding:0 16px 14px">${plan.warnings.map(w => `<li>${esc(fill(w.kind === 'dept' ? t.warnDept : t.warnManager, { v: w.value, who: w.who }))}</li>`).join('')}</ul></section>` : ''}
    ${plan.skipped.length ? `<section class="card"><details><summary class="card__head" style="cursor:pointer"><h2>${esc(fill(t.skipped, { n: plan.skipped.length }))}</h2></summary>
      <p class="note">${esc(t.skippedNote)}</p>
      <div class="tblwrap"><table class="tbl tbl--tight"><thead><tr><th>${esc(t.person)}</th><th>${esc(t.labels.email)}</th><th>${esc(t.labels.national_id)}</th><th>${esc(t.file)}</th><th class="num">${esc(t.row)}</th></tr></thead><tbody>
      ${plan.skipped.map(s => `<tr><td>${esc(s.label)}</td><td class="small muted">${esc(s.email)}</td><td class="small muted">${esc(s.nid)}</td><td class="small muted">${esc(s.file)}</td><td class="num muted">${s.row}</td></tr>`).join('')}
      </tbody></table></div></details></section>` : ''}`;
  }

  return `${tabs}
<section class="card">
  <div class="card__head"><h2>${esc(t.title)}</h2>
    <span style="margin-inline-start:auto;display:flex;gap:8px">
      ${files.length ? `<button class="btn btn--sm" data-imp-clear>${esc(t.clear)}</button>` : ''}
      <button class="btn btn--sm" data-act="go" data-route="#/hr/people">${esc(t.back)}</button></span></div>
  <p class="note">${esc(t.intro)}</p>
  <p class="muted small" style="margin:0 16px 12px">${esc(t.rules)}</p>
  ${imp.error ? `<p class="note bad" style="margin:0 16px 12px">${esc(imp.error)}</p>` : ''}
  <div class="actions" style="padding:0 16px 16px">
    <label class="btn btn--primary">${esc(imp.reading ? t.reading : t.pick)}
      <input type="file" data-imp-files multiple accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv" hidden /></label>
  </div>
</section>
${fileCards}
${preview}`;
}
