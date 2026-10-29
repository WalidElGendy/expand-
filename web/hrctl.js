/* ==========================================================================
   HR system: data loading and event wiring for the screens in hr.js.
   Views stay pure; everything with a side effect is here.
   ========================================================================== */

import * as db from './db.js';
import * as D from './hrdb.js';
import * as V from './hr.js';
import * as H from './hrlogic.js';
import { isHR, quarterOf, leaveSummary, DSTR } from './dash.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export const HR_ROUTES = ['me', 'hr', 'hrsec', 'hremp', 'hrrun', 'hrletter'];

const yearStart = (iso) => `${iso.slice(0, 4)}-01-01`;
const safe = (p, fallback) => p.catch(() => fallback);

/* ------------------------------------------------------------------ load */

export async function loadHR(route, id, ctx) {
  const me = db.state.me;
  const hr = isHR(me);
  const jobs = [];
  const settle = (key, p, fallback = []) => jobs.push(safe(p, fallback).then(v => { ctx[key] = v; }));

  settle('hrSettings', D.getSettings(), null);
  settle('hrHolidays', D.listHolidays());
  settle('people', db.listPeople());
  await Promise.all(jobs.splice(0));
  const S = H.settingsOf(ctx.hrSettings);
  const today = H.todayIn(S.timezone);

  if (route === 'me') {
    settle('hrEmp', D.getEmployee(me.id), null);
    settle('meAttendance', D.listAttendance({ from: H.addDays(today, -62), employee_id: me.id }));
    settle('meLeaves', D.listLeavesSince(yearStart(today), me.id));
    settle('meRequests', D.listRequests({ employee_id: me.id, limit: 100 }));
    settle('hrRequests', D.listRequests({ open: true }));
    settle('meSlips', D.listPayslips({ employee_id: me.id }));
    settle('meDocs', D.listDocuments(me.id));
    settle('meGoals', D.listGoals(me.id));
  }

  if (route === 'hr') {
    settle('hrEmployees', D.listEmployees());
    settle('hrLeaves', D.listLeavesSince(yearStart(today)));
    settle('hrAttendance', D.listAttendance({ from: H.addDays(today, -31) }));
    settle('hrRequests', D.listRequests({}));
    settle('hrReviews', db.listAllReviews());
    if (hr) { settle('hrPrivs', D.listPrivate()); settle('hrDocuments', D.listDocuments()); }
  }

  if (route === 'hrsec') {
    settle('hrEmployees', D.listEmployees());
    if (id === 'people') {
      settle('hrLeaves', D.listLeavesSince(yearStart(today)));
      settle('hrAttendance', D.listAttendance({ from: today, to: today }));
    }
    if (id === 'attendance') {
      const period = ctx.attPeriod || H.periodOf(today);
      const from = `${period}-01`;
      const to = H.periodDays(period).slice(-1)[0];
      settle('hrAttendance', D.listAttendance({ from: from < today ? from : today, to: to > today ? to : today }));
      settle('hrLeaves', D.listLeavesSince(from < today ? from : today));
      settle('hrRequests', D.listRequests({}));
    }
    if (id === 'requests') {
      settle('hrRequests', D.listRequests({}));
      settle('hrLeaves', D.listLeavesSince(yearStart(today)));
    }
    if (id === 'payroll') {
      settle('hrRuns', D.listRuns());
      settle('hrSalaries', D.listSalaries());
      settle('hrAdvances', D.listAdvances());
    }
    if (id === 'performance') {
      settle('hrReviews', db.listAllReviews());
      settle('hrGoals', D.listGoals());
    }
    if (id === 'letters') settle('hrLetters', D.listLetters());
    if (id === 'settings' && hr) settle('hrSyncRuns', D.listSyncRuns(10));
    if (id === 'hiring') settle('hiring', db.listHiring());
  }

  if (route === 'hremp' && id) {
    ctx.hrId = id;
    settle('hrEmp', D.getEmployee(id), null);
    settle('empLeaves', D.listLeavesSince(`${Number(today.slice(0, 4)) - 1}-01-01`, id));
    settle('empAttendance', D.listAttendance({ from: H.addDays(today, -400), employee_id: id }));
    settle('empRequests', D.listRequests({ employee_id: id }));
    settle('empDocs', D.listDocuments(id));
    settle('empGoals', D.listGoals(id));
    settle('empReviews', db.listAllReviews({ subject_id: id }));
    settle('empNotes', db.listOneOnOnes({ employee_id: id }));
    if (hr) {
      settle('empPriv', D.getPrivate(id), null);
      settle('empSalaries', D.listSalaries(id));
      settle('empAdvances', D.listAdvances(id));
    } else { ctx.empPriv = null; ctx.empSalaries = []; ctx.empAdvances = []; }
  }

  if (route === 'hrrun' && id) {
    settle('hrEmployees', D.listEmployees());
    const run = await safe(D.getRun(id), null);
    ctx.hrRun = run;
    settle('hrSlips', run ? D.listPayslips({ run_id: run.id }) : Promise.resolve([]));
  }

  if (route === 'hrletter' && id) {
    if (id.startsWith('new-')) {
      const pre = ctx.letterPrefill || {};
      const direction = id === 'new-internal' ? 'internal' : 'external';
      ctx.hrLetter = { direction, kind: direction === 'internal' ? 'memo' : 'to_whom', lang: 'ar', status: 'draft',
        letter_date: today, subject: '', body: '', attachments: [], ...pre, direction };
      ctx.letterPrefill = null;
    } else {
      settle('hrLetter', D.getLetter(id), null);
    }
    settle('hrEmployees', D.listEmployees());
  }

  await Promise.all(jobs);
}

/* ------------------------------------------------------------------ body */

export function bodyHR(lang, route, id, ctx) {
  if (route === 'me') return V.meView(lang, ctx);
  if (route === 'hr') return V.hrDashView(lang, ctx);
  if (route === 'hremp') return V.hrEmpView(lang, ctx);
  if (route === 'hrrun') return V.hrRunView(lang, ctx);
  if (route === 'hrletter') return V.hrLetterView(lang, ctx);
  if (route === 'hrsec') {
    const f = { people: V.hrPeopleView, attendance: V.hrAttendanceView, requests: V.hrRequestsView, payroll: V.hrPayrollView,
      performance: V.hrPerformanceView, letters: V.hrLettersView, hiring: V.hrHiringView, settings: V.hrSettingsView }[id];
    return f ? f(lang, ctx) : V.hrDashView(lang, ctx);
  }
  return null;
}

/* ----------------------------------------------------------- helpers */

function download(name, text, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
/** Open the print tab synchronously (inside the click) so no popup blocker
    stops it, then fill it once the content is ready. */
function printWindow() {
  const w = window.open('', '_blank');
  if (w) w.document.write('<p style="font-family:sans-serif;padding:20px">…</p>');
  return (html) => { if (!w) return; w.document.open(); w.document.write(html); w.document.close(); };
}
const val = (sel) => ($(sel)?.value ?? '').trim();
const orNull = (sel) => val(sel) || null;
const numOrNull = (sel) => { const v = val(sel); return v === '' ? null : Number(v); };
const busy = (btn, on) => { if (btn) btn.disabled = on; };

/** Work days between two dates (inclusive), by the office calendar. */
function workDaysBetween(from, to, S, holidays) {
  if (!from || !to || to < from) return 0;
  let n = 0;
  for (let d = from; d <= to; d = H.addDays(d, 1)) if (H.isWorkDay(d, S, holidays)) n++;
  return n;
}

/** An office-local date + time → ISO timestamp. Riyadh is UTC+3 all year. */
function localTs(day, time, tz) {
  if (!day || !time) return null;
  if (tz === 'Asia/Riyadh') return new Date(`${day}T${time}:00+03:00`).toISOString();
  return new Date(`${day}T${time}:00`).toISOString();
}

function getPosition() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }),
      () => resolve(null), { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });
  });
}

/* ------------------------------------------------------- payroll compute */

async function computeRun(ctx, run) {
  const S = H.settingsOf(ctx.hrSettings);
  const period = run.period;
  const days = H.periodDays(period);
  const from = days[0], to = days[days.length - 1];
  const todayReal = H.todayIn(S.timezone);
  const today = todayReal > to ? H.addDays(to, 1) : todayReal;   // a past month counts every day
  const [emps, sals, att, leaves, reqs, advs] = await Promise.all([
    D.listEmployees(), D.listSalaries(), D.listAttendance({ from, to }),
    D.listLeavesSince(yearStart(from)), D.listRequests({}), D.listAdvances()]);
  const empOf = new Map(emps.map(e => [e.profile_id, e]));
  const holidays = new Set((ctx.hrHolidays || []).map(h => h.day));
  const roster = V.rosterOf({ ...ctx, hrEmployees: emps });
  const rows = [];
  let missing = 0;
  for (const p of roster) {
    const e = empOf.get(p.id) || null;
    if (e?.joining_date && e.joining_date > to) continue;
    const sal = H.salaryOn(sals, p.id, to);
    if (!sal) { missing++; continue; }
    const month = H.monthAttendance({ period, employeeId: p.id, emp: e, attendance: att, leaves, holidays, settings: S, requests: reqs, today });
    const sickBefore = leaves.filter(l => l.employee_id === p.id && l.kind === 'sick' && l.start_date < from)
      .reduce((a, l) => a + Number(l.days || 0), 0);
    const slip = H.computePayslip({ employeeId: p.id, emp: e, salary: sal, month, settings: S, advances: advs, period, sickBefore });
    rows.push({ ...slip, employee_id: p.id, period, details: { ...slip.details, present: month.present, work_days: month.workDays,
      absent: month.absent, late_count: month.lateCount } });
  }
  await D.replacePayslips(run.id, rows);
  ctx.runMissing = missing;
}

/* ------------------------------------------------------------------ wire */

export function wireHR2(lang, { ctx, rerender, fail, reload }) {
  const t = V.HSTR[lang];
  const route = ctx.route, id = ctx.routeId;
  const S = H.settingsOf(ctx.hrSettings);
  const holidays = new Set((ctx.hrHolidays || []).map(h => h.day));
  const done = async () => { await reload(); rerender(); };
  const run = (btn, fn) => async (e) => {
    e?.preventDefault?.();
    busy(btn, true);
    try { await fn(); await done(); } catch (err) { busy(btn, false); fail(err); }
  };

  /* --- delete an employee's HR record (a duplicate, or entered by mistake) --- */
  if (route !== 'hrsec' || id !== 'people') ctx.hrNotice = null;
  $$('[data-hr-delemp]').forEach(b => b.onclick = async () => {
    const p = (ctx.people || []).find(x => x.id === b.dataset.hrDelemp);
    const n = p?.full_name || p?.email || '';
    if (!confirm(t.delEmpConfirm.replace('{n}', n))) return;
    busy(b, true);
    try {
      const r = await D.deleteEmployee(b.dataset.hrDelemp);
      ctx.hrNotice = r?.profile_deleted ? t.delEmpDone.replace('{n}', n)
        : t.delEmpKept.replace('{n}', n).replace('{why}', t.delEmpWhy[r?.kept_reason] || t.delEmpWhy.has_login);
      location.hash = '#/hr/people';
    } catch (err) {
      busy(b, false);
      const k = Object.keys(t.delEmpErr).find(x => String(err?.message || err).includes(x));
      fail(k ? new Error(t.delEmpErr[k]) : err);
    }
  });

  /* --- profile photo: your own on My HR, anyone's for HR on their page --- */
  $$('[data-ava-file]').forEach(inp => inp.onchange = async () => {
    const f = inp.files?.[0];
    if (!f) return;
    const lab = inp.closest('label');
    if (lab) { lab.classList.add('is-busy'); lab.firstChild.textContent = DSTR[lang].avaSaving; }
    try { await db.setAvatar(inp.dataset.avaFile, f); await done(); }
    catch (err) {
      if (lab) lab.classList.remove('is-busy');
      fail(err.message === 'bad_image' ? new Error(DSTR[lang].avaBad) : err);
      rerender();
    }
  });
  $$('[data-ava-del]').forEach(b => b.onclick = run(b, () => db.removeAvatar(b.dataset.avaDel)));

  /* --- tabs & filters (view state only) --- */
  $$('[data-emp-tab]').forEach(b => b.onclick = () => { ctx.empTab = b.dataset.empTab; rerender(); });
  $$('[data-reqf]').forEach(s => s.onchange = () => { ctx[s.dataset.reqf] = s.value; rerender(); });
  $$('[data-letf], [data-peoplef]').forEach(el => {
    const key = el.dataset.letf || el.dataset.peoplef;
    if (el.tagName === 'SELECT') { el.onchange = () => { ctx[key] = el.value; rerender(); }; return; }
    let timer;
    el.oninput = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        ctx[key] = el.value; rerender();
        const box = $(`[data-${el.dataset.letf ? 'letf' : 'peoplef'}="${key}"]`);
        if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
      }, 250);
    };
  });
  $$('[data-att-period]').forEach(i => i.onchange = async () => {
    ctx.attPeriod = i.value || null;
    if (route === 'hrsec') { await reload(); }
    rerender();
  });
  $$('[data-req-open]').forEach(b => b.onclick = () => { ctx.openReq = ctx.openReq === b.dataset.reqOpen ? null : b.dataset.reqOpen; rerender(); });

  /* --- requests --- */
  $$('[data-req-decide]').forEach(b => b.onclick = async () => {
    const approve = b.dataset.approve === '1';
    if (!approve && !confirm(t.confirmReject)) return;
    const note = $(`[data-req-note="${b.dataset.reqDecide}"]`)?.value.trim() || null;
    await run(b, () => D.decideRequest(b.dataset.reqDecide, approve, note))();
  });
  $$('[data-req-cancel]').forEach(b => b.onclick = run(b, () => D.cancelRequest(b.dataset.reqCancel)));
  $$('[data-req-complete]').forEach(b => b.onclick = async () => {
    const all = [...(ctx.hrRequests || []), ...(ctx.empRequests || []), ...(ctx.meRequests || [])];
    const req = all.find(r => r.id === b.dataset.reqComplete);
    const file = $(`[data-req-result="${b.dataset.reqComplete}"]`)?.files?.[0] || null;
    await run(b, () => D.completeRequest(req, file))();
  });
  $$('[data-req-letter]').forEach(b => b.onclick = () => {
    const all = [...(ctx.hrRequests || []), ...(ctx.empRequests || [])];
    const r = all.find(x => x.id === b.dataset.reqLetter);
    if (!r) return;
    ctx.letterPrefill = { kind: r.type === 'salary_certificate' ? 'salary_certificate' : 'to_whom', employee_id: r.employee_id,
      request_id: r.id, recipient: r.addressee || '' };
    location.hash = '#/hr/l/new-external';
  });

  /* --- CSV --- */
  $$('[data-hr-csv]').forEach(b => b.onclick = () => {
    const kind = b.dataset.hrCsv;
    const today = H.todayIn(S.timezone);
    if (kind === 'attendance') return download(`attendance-${ctx.attPeriod || H.periodOf(today)}.csv`, V.attendanceCSV(lang, ctx));
    if (kind === 'payroll') return download(`payroll-${ctx.hrRun?.period || ''}.csv`, V.payrollCSV(lang, ctx));
    if (kind === 'leaves') {
      const rows = (ctx.hrLeaves || []).map(l => [ctx.people.find(p => p.id === l.employee_id)?.full_name || '', l.kind, l.start_date, l.end_date, l.days, l.note || '']);
      return download(`leave-${today.slice(0, 4)}.csv`, H.toCSV([[t.name, t.lv.type, t.lv.from, t.lv.to, t.lv.days, t.lv.note], ...rows]));
    }
    if (kind === 'people') {
      const emps = new Map((ctx.hrEmployees || []).map(e => [e.profile_id, e]));
      const rows = V.rosterOf(ctx, { includeLeft: true }).map(p => { const e = emps.get(p.id) || {};
        return [p.full_name || '', p.email || '', p.department_id || '', e.position || '', e.employment_status || '', e.joining_date || '',
          e.contract_no || '', e.contract_type || '', e.contract_end || '', e.nationality || '', e.phone || '']; });
      return download('employees.csv', H.toCSV([[t.name, 'Email', t.dept, t.position, t.status, t.joined, t.f.contract_no, t.f.contract_type, t.contractEnd, t.f.nationality, t.f.phone], ...rows]));
    }
  });

  /* --- self-service: clock --- */
  const clockBtn = $('[data-clock]');
  if (clockBtn) clockBtn.onclick = async () => {
    busy(clockBtn, true);
    const msg = $('[data-clock-msg]');
    if (msg) msg.textContent = t.me.locating;
    const pos = await getPosition();
    try {
      await D.clock(pos?.lat ?? null, pos?.lng ?? null, pos?.acc ?? null);
      ctx.clockMsg = pos ? '' : t.me.noLoc;
      await done();
    } catch (err) { busy(clockBtn, false); fail(err); }
  };

  /* --- self-service: new request --- */
  const rqType = $('#rqType');
  if (rqType) rqType.onchange = () => { ctx.reqNewType = rqType.value; rerender(); };
  const autoDays = () => {
    const n = workDaysBetween(val('#rqFrom'), val('#rqTo'), S, holidays);
    if ($('#rqDays') && n) $('#rqDays').value = n;
  };
  ['#rqFrom', '#rqTo'].forEach(s => { const el = $(s); if (el && $('#rqTo')) el.addEventListener('change', () => {
    if (s === '#rqFrom' && !val('#rqTo')) $('#rqTo').value = val('#rqFrom'); autoDays(); }); });
  const reqForm = $('#reqForm');
  if (reqForm) reqForm.onsubmit = async (e) => {
    e.preventDefault();
    const type = val('#rqType');
    const row = { type, details: orNull('#rqDetails') };
    if (['annual_leave', 'sick_leave', 'unpaid_leave', 'other_leave'].includes(type)) {
      Object.assign(row, { start_date: val('#rqFrom'), end_date: val('#rqTo'), days: numOrNull('#rqDays') });
      if (type === 'annual_leave') {
        const ls = leaveSummary(ctx.hrEmp, ctx.meLeaves || [], H.todayIn(S.timezone));
        if (ls.balance !== null && (row.days || 0) > ls.balance && !confirm(t.req.over.replace('{b}', ls.balance))) return;
      }
    }
    if (type === 'early_leave') Object.assign(row, { start_date: val('#rqFrom'), leave_time: val('#rqTime') });
    if (type === 'advance') Object.assign(row, { amount: numOrNull('#rqAmount'), instalments: numOrNull('#rqInst') || 1 });
    if (['salary_certificate', 'letter'].includes(type)) row.addressee = orNull('#rqTo2');
    if (type === 'payslip') row.details = `${val('#rqPeriod')}${row.details ? ` — ${row.details}` : ''}`;
    const file = $('#rqFile')?.files?.[0] || null;
    const btn = reqForm.querySelector('button[type=submit]');
    await run(btn, () => D.createRequest(row, file))();
  };

  /* --- employee file --- */
  const empForm = $('#empForm');
  if (empForm) empForm.onsubmit = async (e) => {
    e.preventDefault();
    const patch = {};
    $$('[data-ef]', empForm).forEach(el => {
      const k = el.dataset.ef;
      if (el.type === 'checkbox') patch[k] = el.checked;
      else if (el.type === 'number') patch[k] = el.value === '' ? null : Number(el.value);
      else patch[k] = el.value.trim() || null;
    });
    if (!patch.employment_status) delete patch.employment_status;
    await run(empForm.querySelector('button[type=submit]'), () => D.saveEmployee(ctx.hrId, patch))();
  };
  const privForm = $('#privForm');
  if (privForm) privForm.onsubmit = async (e) => {
    e.preventDefault();
    const patch = {};
    $$('[data-pf]', privForm).forEach(el => { patch[el.dataset.pf] = el.value.trim() || null; });
    await run(privForm.querySelector('button[type=submit]'), () => D.savePrivate(ctx.hrId, patch))();
  };
  const docUp = $('#docUpForm');
  if (docUp) docUp.onsubmit = async (e) => {
    e.preventDefault();
    const files = [...($('#duFile')?.files || [])];
    if (!files.length) return;
    await run(docUp.querySelector('button[type=submit]'), async () => {
      for (const f of files) await D.addDocument(ctx.hrId, f, { kind: val('#duKind'), title: orNull('#duTitle'), expires_on: orNull('#duExp') });
    })();
  };
  $$('[data-doc-del]').forEach(b => b.onclick = async () => { if (confirm(t.confirmDel)) await run(b, () => D.deleteDocument(b.dataset.docDel))(); });

  const lvForm = $('#lvForm');
  if (lvForm) {
    const auto = () => {
      if (val('#lvFrom') && !val('#lvTo')) $('#lvTo').value = val('#lvFrom');
      const n = workDaysBetween(val('#lvFrom'), val('#lvTo'), S, holidays);
      if (n) $('#lvDays').value = n;
    };
    $('#lvFrom').onchange = auto; $('#lvTo').onchange = auto;
    lvForm.onsubmit = run(lvForm.querySelector('button[type=submit]'), () => D.addLeave({
      employee_id: ctx.hrId, kind: val('#lvKind'), start_date: val('#lvFrom'), end_date: val('#lvTo'),
      days: Number(val('#lvDays')), note: orNull('#lvNote') }));
  }
  $$('[data-leave-del]').forEach(b => b.onclick = async () => { if (confirm(t.confirmDel)) await run(b, () => D.deleteLeave(b.dataset.leaveDel))(); });

  const attFix = $('#attFixForm');
  if (attFix) attFix.onsubmit = async (e) => {
    e.preventDefault();
    const day = val('#afDay');
    const tin = val('#afIn'), tout = val('#afOut');
    const startM = H.timeToMin(S.work_start), endM = H.timeToMin(S.work_end);
    const inM = H.timeToMin(tin), outM = H.timeToMin(tout);
    let late = inM !== null ? Math.max(0, inM - startM) : 0;
    if (late <= S.grace_minutes) late = 0;
    const early = outM !== null ? Math.max(0, endM - outM) : 0;
    await run(attFix.querySelector('button[type=submit]'), () => D.saveAttendance({
      employee_id: ctx.hrId, day, clock_in: localTs(day, tin, S.timezone), clock_out: localTs(day, tout, S.timezone),
      late_minutes: late, early_minutes: early, note: orNull('#afNote'), in_remote: false, out_remote: false, source: 'manual' }))();
  };

  const salForm = $('#salForm');
  if (salForm) salForm.onsubmit = run(salForm.querySelector('button[type=submit]'), () => D.addSalary({
    employee_id: ctx.hrId, effective_from: val('#sfFrom'), basic: Number(val('#sfBasic') || 0), housing: Number(val('#sfHousing') || 0),
    transport: Number(val('#sfTransport') || 0), other_allowances: Number(val('#sfOther') || 0), reason: val('#sfReason'), note: orNull('#sfNote') }));
  $$('[data-sal-del]').forEach(b => b.onclick = async () => { if (confirm(t.confirmDel)) await run(b, () => D.deleteSalary(b.dataset.salDel))(); });

  /* --- performance --- */
  const goalForm = $('#goalForm');
  if (goalForm) goalForm.onsubmit = run(goalForm.querySelector('button[type=submit]'), () => D.addGoal({
    employee_id: ctx.hrId, title: val('#gTitle'), due_date: orNull('#gDue'), weight: numOrNull('#gWeight'),
    period: orNull('#gPeriod'), description: orNull('#gDesc') }));
  $$('[data-goal-prog]').forEach(r => r.onchange = async () => { try { await D.updateGoal(r.dataset.goalProg, { progress: Number(r.value) }); await done(); } catch (e) { fail(e); } });
  $$('[data-goal-st]').forEach(s => s.onchange = async () => { try { await D.updateGoal(s.dataset.goalSt, { status: s.value }); await done(); } catch (e) { fail(e); } });
  $$('[data-goal-del]').forEach(b => b.onclick = async () => { if (confirm(t.confirmDel)) await run(b, () => D.deleteGoal(b.dataset.goalDel))(); });
  const rvKind = $('#rvKind');
  if (rvKind) rvKind.onchange = () => {
    const today = H.todayIn(S.timezone);
    $('#rvPeriod').value = rvKind.value === 'm' ? H.periodOf(today) : quarterOf(new Date());
  };
  const revForm = $('#revForm');
  if (revForm) revForm.onsubmit = async (e) => {
    e.preventDefault();
    const ratings = {};
    $$('[data-rv]', revForm).forEach(s => { if (s.value) ratings[s.dataset.rv] = Number(s.value); });
    await run(revForm.querySelector('button[type=submit]'), () => D.upsertReview({ subject_id: ctx.hrId, period: val('#rvPeriod'),
      ratings, strengths: orNull('#rvStr'), improvements: orNull('#rvImp'), submitted_at: new Date().toISOString() }))();
  };
  const noteForm = $('#noteForm1');
  if (noteForm) noteForm.onsubmit = run(noteForm.querySelector('button[type=submit]'), () => db.addOneOnOne({
    employee_id: ctx.hrId, held_on: val('#onDate'), notes: orNull('#onNotes'), action_items: orNull('#onAct') }));

  /* --- payroll --- */
  const runForm = $('#runForm');
  if (runForm) runForm.onsubmit = async (e) => {
    e.preventDefault();
    const period = val('#runPeriod');
    const btn = runForm.querySelector('button[type=submit]');
    busy(btn, true);
    try {
      let r = await D.getRun(period);
      if (!r) { r = await D.createRun(period); await computeRun(ctx, r); }
      location.hash = `#/hr/payroll/${period}`;
    } catch (err) { busy(btn, false); fail(err); }
  };
  const calc = $('[data-run-calc]');
  if (calc) calc.onclick = run(calc, () => computeRun(ctx, ctx.hrRun));
  $$('[data-run-status]').forEach(b => b.onclick = async () => {
    const to = b.dataset.runStatus;
    if (to === 'paid' && !confirm(t.confirmPaid)) return;
    if (to === 'approved' && !confirm(t.confirmApproveRun)) return;
    await run(b, () => D.setRunStatus(ctx.hrRun.id, to))();
  });
  const runDel = $('[data-run-del]');
  if (runDel) runDel.onclick = async () => {
    if (!confirm(t.confirmDel)) return;
    try { await D.deleteRun(ctx.hrRun.id); location.hash = '#/hr/payroll'; } catch (e) { fail(e); }
  };
  const slipEdit = (attr, field) => $$(`[${attr}]`).forEach(inp => inp.onchange = async () => {
    const sid = inp.getAttribute(attr);
    const s = (ctx.hrSlips || []).find(x => x.id === sid);
    if (!s) return;
    const next = { ...s, [field]: Number(inp.value || 0) };
    const net = H.round2(Number(next.gross) + Number(next.additions) - Number(next.gosi_employee) - Number(next.absence_deduction)
      - Number(next.late_deduction) - Number(next.unpaid_deduction) - Number(next.advance_deduction) - Number(next.other_deductions));
    try { await D.updatePayslip(sid, { [field]: Number(inp.value || 0), net }); await done(); } catch (e) { fail(e); }
  });
  slipEdit('data-slip-add', 'additions');
  slipEdit('data-slip-ded', 'other_deductions');
  const printSlips = (slips) => {
    const write = printWindow();
    write(V.payslipPrintHtml(lang, slips, { people: ctx.people, emps: new Map((ctx.hrEmployees || (ctx.hrEmp ? [ctx.hrEmp] : [])).map(e => [e.profile_id, e])),
      s: ctx.hrSettings || {} }));
  };
  $$('[data-slip-print]').forEach(b => b.onclick = () => {
    const s = [...(ctx.hrSlips || []), ...(ctx.meSlips || [])].find(x => x.id === b.dataset.slipPrint);
    if (s) printSlips([s]);
  });
  const runPrint = $('[data-run-print]');
  if (runPrint) runPrint.onclick = () => printSlips(ctx.hrSlips || []);

  /* --- letters --- */
  const letForm = $('#letForm');
  const readLetter = () => {
    const l = ctx.hrLetter;
    const row = { kind: val('#lfKind'), lang: val('#lfLang'), subject: val('#lfSubject'), body: $('#lfBody')?.value || '',
      employee_id: orNull('#lfEmp'), signatory_name: orNull('#lfSign'), signatory_title: orNull('#lfSignT') };
    if (l.direction === 'internal') row.to_department = orNull('#lfDept');
    else { row.recipient = orNull('#lfRecipient'); row.recipient_attn = orNull('#lfAttn'); }
    if (!l.id) { row.direction = l.direction; row.letter_date = val('#lfDate') || H.todayIn(S.timezone); row.request_id = l.request_id || null; }
    return row;
  };
  if (letForm) letForm.onsubmit = async (e) => {
    e.preventDefault();
    const btn = letForm.querySelector('button[type=submit]');
    busy(btn, true);
    try {
      if (!ctx.hrLetter.id) {
        const created = await D.createLetter(readLetter());
        location.hash = `#/hr/l/${created.id}`;
      } else { await D.updateLetter(ctx.hrLetter.id, readLetter()); await done(); }
    } catch (err) { busy(btn, false); fail(err); }
  };
  const tpl = $('[data-let-template]');
  if (tpl) tpl.onclick = async () => {
    const empId = val('#lfEmp');
    const kind = val('#lfKind'), lng = val('#lfLang') || 'ar';
    let vars = { company: lng === 'ar' ? (ctx.hrSettings?.company_ar || ctx.hrSettings?.company_en || '') : (ctx.hrSettings?.company_en || ''),
      addressee: val('#lfRecipient') };
    if (empId) {
      try {
        const [e, pv, sals] = await Promise.all([D.getEmployee(empId), D.getPrivate(empId), D.listSalaries(empId)]);
        const person = ctx.people.find(p => p.id === empId) || {};
        const dfmt = (d) => d ? new Date(`${d}T00:00:00Z`).toLocaleDateString(lng === 'ar' ? 'ar-SA-u-ca-gregory' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '';
        vars = { ...vars, name: person.full_name || '', nationality: e?.nationality || '', idNo: pv?.national_id || '', position: e?.position || '',
          joining: dfmt(e?.joining_date), salary: H.salaryOn(sals, empId, H.todayIn(S.timezone)) };
      } catch (err) { fail(err); return; }
    }
    const out = H.letterTemplate(kind, lng, vars);
    if (!out.body) return;
    if ($('#lfBody').value.trim() && !confirm(lng === 'ar' ? 'استبدال النص الحالي؟' : 'Replace the current text?')) return;
    $('#lfSubject').value = out.subject; $('#lfBody').value = out.body;
  };
  $$('[data-let-status]').forEach(b => b.onclick = async () => {
    const to = b.dataset.letStatus;
    const patch = { status: to };
    if (to === 'sent') patch.sent_via = orNull('#lfVia');
    await run(b, () => D.updateLetter(ctx.hrLetter.id, patch))();
  });
  const letDel = $('[data-let-del]');
  if (letDel) letDel.onclick = async () => {
    if (!confirm(t.confirmDel)) return;
    try { await D.deleteLetter(ctx.hrLetter.id); location.hash = '#/hr/letters'; } catch (e) { fail(e); }
  };
  const letAtt = $('[data-let-att]');
  if (letAtt) letAtt.onchange = async () => {
    const f = letAtt.files?.[0];
    if (f) { try { await D.addLetterAttachment(ctx.hrLetter, f); await done(); } catch (e) { fail(e); } }
  };
  const letPrint = $('[data-let-print]');
  if (letPrint) letPrint.onclick = async () => {
    const write = printWindow();
    const l = ctx.hrLetter;
    const s = ctx.hrSettings || {};
    const approved = ['approved', 'sent'].includes(l.status);
    const [signature, stamp] = approved ? await Promise.all([D.imageData(s.signature_path), D.imageData(s.stamp_path)]) : [null, null];
    const dep = (db.state.departments || []).find(d => d.id === l.to_department);
    write(V.letterPrintHtml(lang, l, s, { signature, stamp, deptLabel: dep ? ((l.lang || lang) === 'ar' ? dep.name_ar : dep.name_en) : '' }));
  };

  /* --- settings --- */
  const here = $('[data-set-here]');
  if (here) here.onclick = async () => {
    busy(here, true);
    const p = await getPosition();
    busy(here, false);
    if (p) { $('#stLat').value = p.lat.toFixed(6); $('#stLng').value = p.lng.toFixed(6); }
  };
  const setForm = $('#setForm');
  if (setForm) setForm.onsubmit = async (e) => {
    e.preventDefault();
    const gosi = JSON.parse(JSON.stringify(S.gosi));
    $$('[data-gosi]', setForm).forEach(i => { const [k, w] = i.dataset.gosi.split('.'); gosi[k] = { ...(gosi[k] || {}), [w]: Number(i.value || 0) }; });
    gosi.cap = Number(val('#stCap') || 45000);
    const patch = {
      office_lat: numOrNull('#stLat'), office_lng: numOrNull('#stLng'), office_radius_m: Number(val('#stRadius') || 200),
      attendance_start: val('#stAttStart') || undefined,
      work_start: val('#stStart') || '09:00', work_end: val('#stEnd') || '17:00', grace_minutes: Number(val('#stGrace') || 0),
      work_days: $$('[data-wd]', setForm).filter(c => c.checked).map(c => Number(c.dataset.wd)),
      deduct_absence: $('#stDAbs').checked, deduct_late: $('#stDLate').checked, gosi,
      approval_alert_hours: Number(val('#stApH') || 48), contract_alert_days: Number(val('#stCtD') || 60), doc_alert_days: Number(val('#stDocD') || 30),
      company_en: orNull('#stCoEn'), company_ar: orNull('#stCoAr'), company_cr: orNull('#stCr'), company_address: orNull('#stAddr'),
      letter_footer: orNull('#stFooter'), signatory_name: orNull('#stSign'), signatory_title: orNull('#stSignT'),
    };
    const btn = setForm.querySelector('button[type=submit]');
    await run(btn, async () => {
      const sig = $('#stSigImg')?.files?.[0], stp = $('#stStampImg')?.files?.[0];
      if (sig) patch.signature_path = (await D.uploadHrDoc(sig, 'settings')).path;
      if (stp) patch.stamp_path = (await D.uploadHrDoc(stp, 'settings')).path;
      await D.saveSettings(patch);
    })();
  };
  /* --- fingerprint system --- */
  const fpForm = $('#fpForm');
  if (fpForm) fpForm.onsubmit = run(fpForm.querySelector('button[type=submit]'), async () => {
    await D.saveSettings({ attendance_source: val('#fpSource') || 'fingerprint', fp_url: orNull('#fpUrl') });
    const key = val('#fpKey');
    if (key) { await D.setFingerprintKey(key); $('#fpKey').value = ''; }
  });
  const fpClear = $('[data-fp-clear]');
  if (fpClear) fpClear.onclick = async () => { if (confirm(t.confirmDel)) await run(fpClear, () => D.setFingerprintKey(null))(); };
  $$('[data-fp-sync]').forEach(b => b.onclick = async () => {
    const label = b.textContent;
    busy(b, true); b.textContent = t.fp.running;
    try {
      const r = await D.syncFingerprint({ from: val('#fpFrom') || null, to: val('#fpTo') || null });
      ctx.fpMsg = t.fp.done.replace('{n}', r.saved ?? 0).replace('{m}', r.matched ?? 0)
        + (r.error_count ? ` · ${r.error_count} ${t.fp.failed}` : '');
      await done();
    } catch (err) {
      ctx.fpMsg = err.message;
      b.textContent = label; busy(b, false);
      await done().catch(() => {});
      fail(err);
    }
  });

  const holForm = $('#holForm');
  if (holForm) holForm.onsubmit = run(holForm.querySelector('button[type=submit]'), () => D.addHoliday(val('#hoDay'), val('#hoName')));
  $$('[data-hol-del]').forEach(b => b.onclick = run(b, () => D.deleteHoliday(b.dataset.holDel)));
}
