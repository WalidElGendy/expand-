/* ==========================================================================
   HR rules, as pure functions.

   Everything that decides a number an employee will see — an absence, a
   deduction, a GOSI contribution, a net salary, an alert — is computed here
   from plain rows, with no database and no DOM, so it can be tested on its
   own (test/hr.test.mjs) and the screens cannot disagree with each other.
   ========================================================================== */

const DAY = 86400000;
const pad = (n) => String(n).padStart(2, '0');
export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/* ------------------------------------------------------------------ dates */

/** A calendar date as 'YYYY-MM-DD' in the given IANA zone (default Riyadh). */
export function todayIn(tz = 'Asia/Riyadh', d = new Date()) {
  try {
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
    if (/^\d{4}-\d{2}-\d{2}$/.test(p)) return p;
  } catch { /* fall through */ }
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
/** Minutes since midnight, in the zone. */
export function minutesNowIn(tz = 'Asia/Riyadh', d = new Date()) {
  try {
    const p = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
    const [h, m] = p.split(':').map(Number);
    if (Number.isFinite(h)) return (h % 24) * 60 + m;
  } catch { /* fall through */ }
  return d.getHours() * 60 + d.getMinutes();
}
const toUTC = (iso) => { const [y, m, d] = iso.slice(0, 10).split('-').map(Number); return Date.UTC(y, m - 1, d); };
const fromUTC = (t) => { const d = new Date(t); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
export const addDays = (iso, n) => fromUTC(toUTC(iso) + n * DAY);
export const daysBetween = (a, b) => Math.round((toUTC(b) - toUTC(a)) / DAY);
export const weekday = (iso) => new Date(toUTC(iso)).getUTCDay();          // 0 = Sunday
export const periodOf = (iso) => iso.slice(0, 7);
export function periodDays(period) {
  const [y, m] = period.split('-').map(Number);
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) => `${period}-${pad(i + 1)}`);
}
export function shiftPeriod(period, n) {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}
/** 'HH:MM[:SS]' → minutes. */
export const timeToMin = (t) => { if (!t) return null; const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
export const minToTime = (n) => `${pad(Math.floor(n / 60))}:${pad(n % 60)}`;

export const DEFAULT_SETTINGS = {
  timezone: 'Asia/Riyadh', office_lat: null, office_lng: null, office_radius_m: 200,
  work_start: '09:00', work_end: '17:00', grace_minutes: 15, work_days: [0, 1, 2, 3, 4],
  deduct_absence: true, deduct_late: false,
  gosi: { cap: 45000, saudi_legacy: { employee: 9.75, employer: 11.75 },
          saudi_new: { employee: 10.75, employer: 12.75 }, non_saudi: { employee: 0, employer: 2 } },
  approval_alert_hours: 48, contract_alert_days: 60, doc_alert_days: 30,
  attendance_start: null,          // absences only count from the day clocking began
  attendance_source: 'fingerprint', // 'fingerprint' | 'both' | 'app'
};
export const settingsOf = (s) => ({ ...DEFAULT_SETTINGS, ...(s || {}),
  gosi: { ...DEFAULT_SETTINGS.gosi, ...((s && s.gosi) || {}) } });

export const workHours = (s) => {
  const a = timeToMin(s.work_start), b = timeToMin(s.work_end);
  return a !== null && b !== null && b > a ? (b - a) / 60 : 8;
};

export function isWorkDay(iso, settings, holidays = new Set()) {
  const s = settingsOf(settings);
  return (s.work_days || []).includes(weekday(iso)) && !holidays.has(iso);
}

/** The leave (if any) covering a day. */
export const leaveOn = (leaves, empId, iso) =>
  (leaves || []).find(l => l.employee_id === empId && l.start_date <= iso && l.end_date >= iso) || null;

/* ------------------------------------------------------------ attendance */

/**
 * One employee's month: present days, absences, lateness, early leaves,
 * punches away from the office and leave taken — what the monthly report
 * shows and what payroll deducts from.
 *
 * A day counts as absent when it is a work day, the employee had started and
 * not yet left, it is in the past (today is never an absence yet), there is
 * no clock-in, and no leave covers it. Early leave on a day with an approved
 * early-leave request is excused.
 */
export function monthAttendance({ period, employeeId, emp = null, attendance = [], leaves = [],
                                  holidays = new Set(), settings, requests = [], today }) {
  const s = settingsOf(settings);
  const days = periodDays(period);
  const start = emp?.joining_date || null;
  const end = emp?.end_date || null;
  const byDay = new Map(attendance.filter(a => a.employee_id === employeeId).map(a => [a.day, a]));
  const excused = new Set(requests
    .filter(r => r.employee_id === employeeId && r.type === 'early_leave' && ['approved', 'completed'].includes(r.status))
    .map(r => r.start_date));
  const out = { period, employeeId, workDays: 0, present: 0, absent: [], lateCount: 0, lateMinutes: 0,
    earlyCount: 0, earlyMinutes: 0, earlyExcused: 0, remote: 0, leave: { annual: 0, sick: 0, unpaid: 0, other: 0 },
    openPunches: 0 };
  for (const d of days) {
    if (start && d < start) continue;
    if (end && d > end) continue;
    const a = byDay.get(d);
    const lv = leaveOn(leaves, employeeId, d);
    const work = isWorkDay(d, s, holidays);
    if (lv && work) out.leave[lv.kind] = (out.leave[lv.kind] || 0) + 1;
    if (!work) { if (a?.clock_in) out.present++; continue; }
    out.workDays++;
    if (a?.clock_in) {
      out.present++;
      if (a.late_minutes > 0) { out.lateCount++; out.lateMinutes += a.late_minutes; }
      if (a.clock_out && a.early_minutes > 0) {
        if (excused.has(d)) out.earlyExcused++;
        else { out.earlyCount++; out.earlyMinutes += a.early_minutes; }
      }
      if (a.in_remote || a.out_remote) out.remote++;
      if (!a.clock_out && today && d < today) out.openPunches++;
    } else if (!lv && today && d < today && (!s.attendance_start || d >= s.attendance_start)) {
      out.absent.push(d);
    }
  }
  return out;
}

/** Today's picture across the company. */
export function todayAttendance({ people, attendance, leaves, settings, holidays = new Set(), today, nowMin }) {
  const s = settingsOf(settings);
  const work = isWorkDay(today, s, holidays);
  const started = nowMin === undefined || nowMin >= timeToMin(s.work_start) + s.grace_minutes;
  const rows = people.map(p => {
    const a = attendance.find(x => x.employee_id === p.id && x.day === today) || null;
    const lv = leaveOn(leaves, p.id, today);
    let state = 'off';
    if (lv) state = lv.kind === 'sick' ? 'sick' : 'leave';
    else if (a?.clock_in) state = a.clock_out ? 'out' : 'in';
    else if (work) state = started && (!s.attendance_start || today >= s.attendance_start) ? 'absent' : 'expected';
    return { person: p, att: a, leave: lv, state, late: a?.late_minutes || 0, remote: !!(a?.in_remote || a?.out_remote) };
  });
  const count = (st) => rows.filter(r => r.state === st).length;
  return {
    work, rows,
    present: count('in') + count('out'), clockedIn: count('in'), absent: count('absent'),
    onLeave: count('leave'), sick: count('sick'), expected: count('expected'),
    late: rows.filter(r => r.late > 0).length, remote: rows.filter(r => r.remote).length,
  };
}

/* ----------------------------------------------------------------- leave */

/**
 * Sick-leave pay under Saudi Labor Law art. 117: within a year, the first 30
 * days on full pay, the next 60 at three quarters, the next 30 unpaid.
 * `before` is the sick days already taken this year; `now` the days being
 * paid. Returns how many of `now` fall in each band.
 */
export function sickBands(before, now) {
  const bands = [[30, 1], [60, 0.75], [30, 0]];
  let pos = before, left = now;
  const out = { full: 0, threeQuarter: 0, unpaid: 0 };
  const keys = ['full', 'threeQuarter', 'unpaid'];
  let edge = 0;
  for (let i = 0; i < bands.length && left > 0; i++) {
    const top = edge + bands[i][0];
    if (pos < top) { const take = Math.min(left, top - pos); out[keys[i]] += take; left -= take; pos += take; }
    edge = top;
  }
  out.unpaid += left;     // beyond 120 days: unpaid
  return out;
}

/* --------------------------------------------------------------- payroll */

/** The salary row in force on a date (latest effective_from on or before it). */
export function salaryOn(salaries, employeeId, iso) {
  return (salaries || [])
    .filter(s => s.employee_id === employeeId && s.effective_from <= iso)
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0] || null;
}
export const grossOf = (s) => s ? round2(Number(s.basic) + Number(s.housing) + Number(s.transport) + Number(s.other_allowances)) : 0;

export const gosiSchemeOf = (emp) => emp?.gosi_scheme || (emp?.is_saudi ? 'saudi_legacy' : 'non_saudi');

/** GOSI on basic + housing, capped. Rates are percentages from settings. */
export function gosiFor(emp, salary, settings) {
  const s = settingsOf(settings);
  const scheme = gosiSchemeOf(emp);
  if (!salary || scheme === 'exempt') return { scheme, base: 0, employee: 0, employer: 0 };
  const rates = s.gosi[scheme] || { employee: 0, employer: 0 };
  const base = Math.min(Number(salary.basic) + Number(salary.housing), Number(s.gosi.cap) || 45000);
  return { scheme, base: round2(base), employee: round2(base * rates.employee / 100), employer: round2(base * rates.employer / 100) };
}

/** The instalment each active advance takes this period. */
export function advanceDue(advances, employeeId, period) {
  return round2((advances || [])
    .filter(a => a.employee_id === employeeId && a.status === 'active' && a.start_period <= period)
    .reduce((t, a) => t + Math.min(Number(a.monthly_amount), Number(a.remaining)), 0));
}

/**
 * One payslip. Daily wage is gross / 30 (Saudi practice for monthly pay).
 * Unexcused absence and unpaid leave are deducted per day; lateness only if
 * HR switched it on. Sick days beyond 30 in the year are paid at 75%, beyond
 * 90 unpaid.
 */
export function computePayslip({ employeeId, emp, salary, month, settings, advances = [], period,
                                 sickBefore = 0, additions = 0, otherDeductions = 0 }) {
  const s = settingsOf(settings);
  const basic = Number(salary?.basic || 0), housing = Number(salary?.housing || 0);
  const transport = Number(salary?.transport || 0), other = Number(salary?.other_allowances || 0);
  const gross = round2(basic + housing + transport + other);
  const daily = gross / 30;
  const g = gosiFor(emp, salary, s);
  const absenceDays = month ? month.absent.length : 0;
  const absence = s.deduct_absence ? round2(absenceDays * daily) : 0;
  const lateMin = month ? month.lateMinutes : 0;
  const late = s.deduct_late ? round2(lateMin * daily / (workHours(s) * 60)) : 0;
  const unpaidDays = month ? (month.leave.unpaid || 0) : 0;
  const unpaid = round2(unpaidDays * daily);
  const sick = sickBands(sickBefore, month ? (month.leave.sick || 0) : 0);
  const sickDed = round2(sick.threeQuarter * daily * 0.25 + sick.unpaid * daily);
  const adv = advanceDue(advances, employeeId || emp?.profile_id || salary?.employee_id, period);
  const otherDed = round2(Number(otherDeductions || 0) + sickDed);
  const add = round2(additions);
  const net = round2(gross + add - g.employee - absence - late - unpaid - adv - otherDed);
  return {
    basic, housing, transport, other_allowances: other, additions: add, gross,
    gosi_employee: g.employee, gosi_employer: g.employer,
    absence_days: absenceDays, absence_deduction: absence,
    late_minutes: lateMin, late_deduction: late,
    unpaid_days: unpaidDays, unpaid_deduction: unpaid,
    advance_deduction: adv, other_deductions: otherDed,
    deductions_note: sickDed ? `sick:${sick.threeQuarter}@75%,${sick.unpaid}@0%` : null,
    net,
    details: { gosi_scheme: g.scheme, gosi_base: g.base, daily: round2(daily), sick },
  };
}

/* ---------------------------------------------------------------- alerts */

/**
 * Everything that needs HR's attention, most urgent first.
 * level: 'critical' (overdue/expired), 'warn' (soon), 'info'.
 */
export function hrAlerts({ people = [], emps = [], privs = [], documents = [], leaves = [],
                           requests = [], settings, today, now = new Date() }) {
  const s = settingsOf(settings);
  const out = [];
  const active = new Set(people.filter(p => p.is_active).map(p => p.id));
  const empOf = new Map(emps.map(e => [e.profile_id, e]));
  const push = (level, kind, employee_id, date, extra = {}) => out.push({ level, kind, employee_id, date, ...extra });
  const window = (date, days, kind, id, extra) => {
    if (!date) return;
    const left = daysBetween(today, date);
    if (left < 0) push('critical', kind, id, date, { days: left, ...extra });
    else if (left <= days) push('warn', kind, id, date, { days: left, ...extra });
  };
  for (const e of emps) {
    if (e.employment_status === 'terminated') continue;
    if (!active.has(e.profile_id) && !e.joining_date) continue;
    window(e.contract_end, s.contract_alert_days, 'contract_end', e.profile_id);
    if (e.probation_end) window(e.probation_end, 14, 'probation_end', e.profile_id);
  }
  for (const p of privs) {
    if (empOf.get(p.profile_id)?.employment_status === 'terminated') continue;
    window(p.id_expiry, s.doc_alert_days, 'id_expiry', p.profile_id);
    window(p.passport_expiry, s.doc_alert_days, 'passport_expiry', p.profile_id);
  }
  for (const d of documents) {
    if (empOf.get(d.employee_id)?.employment_status === 'terminated') continue;
    window(d.expires_on, s.doc_alert_days, 'doc_expiry', d.employee_id, { doc: d.title || d.kind });
  }
  for (const l of leaves) {
    const left = daysBetween(today, l.end_date);
    if (l.start_date <= today && left >= 0 && left <= 2) push('info', 'leave_ending', l.employee_id, l.end_date, { days: left, leaveKind: l.kind });
  }
  for (const r of requests) {
    if (!['pending_manager', 'pending_hr'].includes(r.status)) continue;
    const hours = (now - new Date(r.created_at)) / 3600000;
    if (hours >= s.approval_alert_hours) push('warn', 'approval_delay', r.employee_id, r.created_at.slice(0, 10),
      { hours: Math.floor(hours), request_id: r.id, stage: r.status });
  }
  const rank = { critical: 0, warn: 1, info: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level] || String(a.date).localeCompare(String(b.date)));
}

/* ------------------------------------------------------------ dashboard */

/** Leave days per employee this year, most first. */
export function leaveLeaders(leaves, year, limit = 5) {
  const t = new Map();
  for (const l of leaves || []) {
    if (!l.start_date?.startsWith(String(year))) continue;
    t.set(l.employee_id, (t.get(l.employee_id) || 0) + Number(l.days || 0));
  }
  return [...t.entries()].map(([employee_id, days]) => ({ employee_id, days: round2(days) }))
    .sort((a, b) => b.days - a.days).slice(0, limit);
}

/** Latest review per person with its score (0–100), lowest first. */
export function lowPerformers(reviews, formScore, threshold = 60) {
  const latest = new Map();
  for (const r of reviews || []) {
    const cur = latest.get(r.subject_id);
    if (!cur || String(r.period) > String(cur.period)) latest.set(r.subject_id, r);
  }
  return [...latest.values()].map(r => ({ employee_id: r.subject_id, period: r.period, pct: formScore(r.ratings).pct }))
    .filter(x => x.pct !== null && x.pct < threshold).sort((a, b) => a.pct - b.pct);
}

/** Present head-count per work day over the last `n` work days. */
export function attendanceTrend({ attendance, people, leaves, settings, holidays = new Set(), today, n = 14 }) {
  const s = settingsOf(settings);
  const out = [];
  let d = addDays(today, -1);
  let guard = 0;
  while (out.length < n && guard++ < 60) {
    if (isWorkDay(d, s, holidays)) {
      const present = new Set(attendance.filter(a => a.day === d && a.clock_in).map(a => a.employee_id)).size;
      const away = people.filter(p => leaveOn(leaves, p.id, d)).length;
      out.unshift({ day: d, present, expected: Math.max(0, people.length - away) });
    }
    d = addDays(d, -1);
  }
  return out;
}

/* ------------------------------------------------------------- letters */

export const money = (n, lang = 'en') => {
  const v = round2(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return lang === 'ar' ? `${v} ر.س` : `SAR ${v}`;
};

/** A starting text for common letters. HR edits it before review. */
export function letterTemplate(kind, lang, { name = '', nationality = '', idNo = '', position = '',
                                              joining = '', salary = null, addressee = '', company = '' } = {}) {
  const gross = salary ? grossOf(salary) : null;
  const ar = lang === 'ar';
  const who = ar ? `السيد/ة ${name}` : `Mr./Ms. ${name}`;
  const ident = ar
    ? `${nationality ? `الجنسية ${nationality}، ` : ''}${idNo ? `رقم الهوية/الإقامة ${idNo}، ` : ''}`
    : `${nationality ? `a ${nationality} national, ` : ''}${idNo ? `ID/Iqama no. ${idNo}, ` : ''}`;
  const pay = gross === null ? '' : ar
    ? ` ويتقاضى راتباً شهرياً إجمالياً قدره ${money(gross, 'ar')} (الأساسي ${money(salary.basic, 'ar')}، السكن ${money(salary.housing, 'ar')}، النقل ${money(salary.transport, 'ar')}).`
    : ` with a total monthly salary of ${money(gross, 'en')} (basic ${money(salary.basic, 'en')}, housing ${money(salary.housing, 'en')}, transport ${money(salary.transport, 'en')}).`;
  const T = {
    salary_certificate: ar
      ? { subject: 'تعريف بالراتب', body: `تشهد ${company} بأن ${who}، ${ident}يعمل لديها بوظيفة ${position} منذ ${joining}${pay}\n\nوقد أُعطي هذا التعريف بناءً على طلبه لتقديمه إلى ${addressee || 'من يهمه الأمر'} دون أدنى مسؤولية على الشركة.` }
      : { subject: 'Salary certificate', body: `This is to certify that ${who}, ${ident}has been employed by ${company} as ${position} since ${joining}${pay}\n\nThis certificate is issued at the employee's request for submission to ${addressee || 'whom it may concern'}, without any liability on the company.` },
    employment_certificate: ar
      ? { subject: 'شهادة تعريف', body: `تشهد ${company} بأن ${who}، ${ident}يعمل لديها بوظيفة ${position} منذ ${joining} ولا يزال على رأس العمل حتى تاريخه.\n\nأُعطيت هذه الشهادة بناءً على طلبه لتقديمها إلى ${addressee || 'من يهمه الأمر'}.` }
      : { subject: 'Employment certificate', body: `This is to certify that ${who}, ${ident}has been employed by ${company} as ${position} since ${joining} and remains in our employment as of today.\n\nIssued at the employee's request for ${addressee || 'whom it may concern'}.` },
    embassy: ar
      ? { subject: `خطاب إلى ${addressee || 'السفارة'}`, body: `تحية طيبة وبعد،\n\nتفيد ${company} بأن ${who}، ${ident}يعمل لديها بوظيفة ${position} منذ ${joining}${pay}\n\nولا مانع لدى الشركة من سفره خلال إجازته المعتمدة، وسيعود لمباشرة عمله فور انتهائها.\n\nوتفضلوا بقبول فائق الاحترام.` }
      : { subject: `Letter to ${addressee || 'the Embassy'}`, body: `Dear Sir/Madam,\n\n${company} confirms that ${who}, ${ident}has been employed with us as ${position} since ${joining}${pay}\n\nThe company has no objection to the employee travelling during the approved leave, and they will resume work on its completion.\n\nYours faithfully,` },
    bank: ar
      ? { subject: `خطاب إلى ${addressee || 'البنك'}`, body: `تفيد ${company} بأن ${who}، ${ident}يعمل لديها بوظيفة ${position} منذ ${joining}${pay}\n\nأُعطي هذا الخطاب بناءً على طلبه.` }
      : { subject: `Letter to ${addressee || 'the Bank'}`, body: `${company} confirms that ${who}, ${ident}has been employed with us as ${position} since ${joining}${pay}\n\nIssued at the employee's request.` },
    experience: ar
      ? { subject: 'شهادة خبرة', body: `تشهد ${company} بأن ${who}، ${ident}عمل لديها بوظيفة ${position} منذ ${joining}، وقد كان مثالاً للالتزام والكفاءة.\n\nونتمنى له التوفيق.` }
      : { subject: 'Experience certificate', body: `${company} certifies that ${who}, ${ident}worked with us as ${position} from ${joining}, and showed commitment and competence throughout.\n\nWe wish them every success.` },
    to_whom: ar
      ? { subject: 'إلى من يهمه الأمر', body: `تفيد ${company} بأن ${who}، ${ident}يعمل لديها بوظيفة ${position} منذ ${joining}.` }
      : { subject: 'To whom it may concern', body: `${company} confirms that ${who}, ${ident}has been employed with us as ${position} since ${joining}.` },
  };
  return T[kind] || { subject: '', body: '' };
}

/* --------------------------------------------------------------- export */

export function toCSV(rows) {
  const cell = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + rows.map(r => r.map(cell).join(',')).join('\n');
}
