/* HR rules: attendance, leave pay, payroll/GOSI, alerts, letters. */
import * as H from '../web/hrlogic.js';

let pass = 0, fail = 0;
const eq = (a, b, msg) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  ok ? pass++ : fail++;
  if (!ok) console.error(`FAIL ${msg}\n  got      ${JSON.stringify(a)}\n  expected ${JSON.stringify(b)}`);
};

// dates
eq(H.addDays('2026-02-27', 3), '2026-03-02', 'addDays across month');
eq(H.periodDays('2026-02').length, 28, 'February 2026 has 28 days');
eq(H.weekday('2026-10-15'), 4, '15 Oct 2026 is a Thursday');
eq(H.shiftPeriod('2026-12', 1), '2027-01', 'shiftPeriod over the year');
eq(H.todayIn('Asia/Riyadh', new Date('2026-10-14T22:30:00Z')), '2026-10-15', 'Riyadh is already tomorrow at 22:30 UTC');

// attendance month: Oct 2026, Sun–Thu, today = 15th
const S = { work_days: [0, 1, 2, 3, 4] };
const att = [
  { employee_id: 'e', day: '2026-10-01', clock_in: 'x', clock_out: 'y', late_minutes: 20, early_minutes: 0 },
  { employee_id: 'e', day: '2026-10-04', clock_in: 'x', clock_out: 'y', late_minutes: 0, early_minutes: 30 },
  { employee_id: 'e', day: '2026-10-05', clock_in: 'x', clock_out: 'y', late_minutes: 0, early_minutes: 60, in_remote: true },
  { employee_id: 'e', day: '2026-10-06', clock_in: 'x', clock_out: null, late_minutes: 0, early_minutes: 0 },
];
const leaves = [{ employee_id: 'e', kind: 'annual', start_date: '2026-10-07', end_date: '2026-10-08', days: 2 }];
const reqs = [{ employee_id: 'e', type: 'early_leave', status: 'approved', start_date: '2026-10-05' }];
const m = H.monthAttendance({ period: '2026-10', employeeId: 'e', attendance: att, leaves, settings: S,
  holidays: new Set(['2026-10-11']), requests: reqs, today: '2026-10-15' });
// work days 1..14 Sun–Thu: 1,4,5,6,7,8,11(hol),12,13,14 → 9 counted (11 is holiday)
eq(m.workDays > 0, true, 'counts work days');
eq(m.present, 4, 'present days');
eq(m.absent, ['2026-10-12', '2026-10-13', '2026-10-14'], 'absences exclude leave, holiday, today');
eq([m.lateCount, m.lateMinutes], [1, 20], 'lateness');
eq([m.earlyCount, m.earlyMinutes, m.earlyExcused], [1, 30, 1], 'approved early leave is excused');
eq(m.remote, 1, 'away-from-office punches');
eq(m.leave.annual, 2, 'leave days in month');
eq(m.openPunches, 1, 'forgot to clock out');
const m2 = H.monthAttendance({ period: '2026-10', employeeId: 'e', emp: { joining_date: '2026-10-13' },
  attendance: [], settings: S, today: '2026-10-15' });
eq(m2.absent, ['2026-10-13', '2026-10-14'], 'no absences before joining');
const m3 = H.monthAttendance({ period: '2026-10', employeeId: 'e', attendance: [], settings: { ...S, attendance_start: '2026-10-14' }, today: '2026-10-16' });
eq(m3.absent, ['2026-10-14', '2026-10-15'], 'no absences before attendance tracking started');

// sick-leave bands (art. 117)
eq(H.sickBands(0, 10), { full: 10, threeQuarter: 0, unpaid: 0 }, 'first sick days on full pay');
eq(H.sickBands(25, 10), { full: 5, threeQuarter: 5, unpaid: 0 }, 'crossing 30 days');
eq(H.sickBands(85, 10), { full: 0, threeQuarter: 5, unpaid: 5 }, 'crossing 90 days');

// GOSI
const sal = { employee_id: 'e', basic: 10000, housing: 2500, transport: 1000, other_allowances: 0 };
eq(H.gosiFor({ is_saudi: true }, sal, {}), { scheme: 'saudi_legacy', base: 12500, employee: 1218.75, employer: 1468.75 }, 'Saudi legacy GOSI on basic+housing');
eq(H.gosiFor({ is_saudi: false }, sal, {}), { scheme: 'non_saudi', base: 12500, employee: 0, employer: 250 }, 'non-Saudi: employer hazards only');
eq(H.gosiFor({ gosi_scheme: 'saudi_new' }, { basic: 50000, housing: 10000 }, {}).base, 45000, 'GOSI base capped at 45,000');
eq(H.gosiFor({ gosi_scheme: 'exempt' }, sal, {}).employee, 0, 'exempt');

// salary in force
const sals = [{ employee_id: 'e', effective_from: '2026-01-01', basic: 1 }, { employee_id: 'e', effective_from: '2026-07-01', basic: 2 }];
eq(H.salaryOn(sals, 'e', '2026-06-30').basic, 1, 'before raise');
eq(H.salaryOn(sals, 'e', '2026-07-01').basic, 2, 'raise effective');
eq(H.salaryOn(sals, 'e', '2025-12-31'), null, 'no salary yet');

// payslip: 3 absences, advance instalment, Saudi
const adv = [{ employee_id: 'e', status: 'active', start_period: '2026-10', monthly_amount: 1000, remaining: 500 }];
const p = H.computePayslip({ employeeId: 'e', emp: { is_saudi: true }, salary: sal, month: m, settings: S, advances: adv, period: '2026-10' });
eq(p.gross, 13500, 'gross');
eq(p.absence_deduction, 1350, 'absence: 3 days × gross/30');
eq(p.late_deduction, 0, 'lateness not deducted by default');
eq(p.advance_deduction, 500, 'advance takes no more than what is left');
eq(p.net, 13500 - 1218.75 - 1350 - 500, 'net');
const pl = H.computePayslip({ employeeId: 'e', emp: {}, salary: sal, month: m, settings: { ...S, deduct_late: true, deduct_absence: false }, period: '2026-10' });
eq(pl.late_deduction, 18.75, 'late: 20 min of an 8h day at 450/day');
eq(pl.absence_deduction, 0, 'absence deduction can be turned off');
const ps = H.computePayslip({ employeeId: 'e', emp: {}, salary: sal, month: { ...m, absent: [], leave: { sick: 10, unpaid: 2 } },
  settings: S, period: '2026-10', sickBefore: 25 });
eq(ps.unpaid_deduction, 900, 'unpaid leave 2 days');
eq(ps.other_deductions, 562.5, 'sick: 5 days at 75% → 25% of 450 × 5');

// alerts
const al = H.hrAlerts({
  people: [{ id: 'e', is_active: true }],
  emps: [{ profile_id: 'e', contract_end: '2026-11-01', probation_end: '2026-10-10', joining_date: '2026-07-10' }],
  privs: [{ profile_id: 'e', id_expiry: '2026-10-20' }],
  documents: [{ employee_id: 'e', expires_on: '2027-06-01', kind: 'passport' }],
  leaves: [{ employee_id: 'e', start_date: '2026-10-10', end_date: '2026-10-16', kind: 'annual' }],
  requests: [{ id: 'r', employee_id: 'e', status: 'pending_hr', created_at: '2026-10-10T08:00:00Z' }],
  settings: {}, today: '2026-10-15', now: new Date('2026-10-15T08:00:00Z'),
});
eq(al.map(a => a.kind), ['probation_end', 'approval_delay', 'id_expiry', 'contract_end', 'leave_ending'], 'alerts and order');
eq(al[0].level, 'critical', 'past probation end is critical');

// leaders, low performers
eq(H.leaveLeaders([{ employee_id: 'a', start_date: '2026-01-02', days: 3 }, { employee_id: 'b', start_date: '2026-02-01', days: 5 },
  { employee_id: 'a', start_date: '2026-03-01', days: 4 }, { employee_id: 'a', start_date: '2025-03-01', days: 40 }], 2026),
  [{ employee_id: 'a', days: 7 }, { employee_id: 'b', days: 5 }], 'leave leaders this year');
const fs = (r) => ({ pct: r.v });
eq(H.lowPerformers([{ subject_id: 'a', period: '2026-Q1', ratings: { v: 40 } }, { subject_id: 'a', period: '2026-Q2', ratings: { v: 80 } },
  { subject_id: 'b', period: '2026-Q2', ratings: { v: 50 } }], fs), [{ employee_id: 'b', period: '2026-Q2', pct: 50 }], 'latest review decides');

// letters & csv
const L = H.letterTemplate('salary_certificate', 'en', { name: 'Sara', position: 'Designer', joining: '1 Feb 2020', salary: sal, company: 'Expand', addressee: 'Embassy of France' });
eq(L.body.includes('SAR 13,500.00') && L.body.includes('Embassy of France'), true, 'salary certificate text');
eq(H.letterTemplate('embassy', 'ar', { name: 'سارة', company: 'إكسباند' }).subject.startsWith('خطاب'), true, 'Arabic template');
eq(H.toCSV([['a', 'b,c'], ['"q"', 1]]), '﻿a,"b,c"\n"""q""",1', 'csv quoting');

console.log(fail ? `FAIL — ${pass} passed, ${fail} failed` : `PASS — ${pass} passed, 0 failed`);
process.exit(fail ? 1 : 0);
