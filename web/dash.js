/* ==========================================================================
   Signed-in screens: sign in, and the dashboard your role earns.

   The routing rule is deliberately by DEPARTMENT first and ROLE second,
   because that is how the company actually works. A 3D designer and a 3D
   lead want the same screen with different buttons; a project manager and a
   business developer want entirely different screens at the same seniority.

   Every date on these screens comes from engine/scheduler.js — the same code
   the estimator uses. Nothing here re-implements a delivery date, so there is
   no second answer that can quietly disagree with the first.
   ========================================================================== */

import * as db from './db.js';
import { Scheduler, DEFAULT_SIZE_FACTORS } from '../engine/scheduler.js';
import { WorkCalendar, iso, parse } from '../engine/calendar.js';

const CAL = new WorkCalendar();
const esc = (x) => String(x ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => iso(CAL.nextWorking(new Date()));

export const DSTR = {
  en: {
    signIn: 'Sign in', signOut: 'Sign out', email: 'Email', password: 'Password',
    firstTime: 'First time here?', setPassword: 'Create your password',
    forgot: 'Forgot your password?', sendReset: 'Email me a reset link',
    backToSignIn: 'Back to sign in', checkInbox: 'Check your inbox.',
    newPassword: 'Choose a new password', setIt: 'Save my new password',
    linkExpired: 'That link has expired or was already used.',
    linkExpiredWhy: 'Sign-in links are single use and time limited. Some mail scanners open links before you do, which uses them up. Send yourself a fresh one.',
    sendFresh: 'Email me a new link', passwordSaved: 'Password saved. Signing you in…',
    recoverPrompt: 'Enter a new password for your account.',
    noInvite: 'Your account exists but has not been activated. Ask an admin to add you.',
    home: 'Home', projects: 'Projects', newProject: 'New project', leads: 'Leads',
    documents: 'Documents', people: 'People', myQueue: 'My queue',
    save: 'Save', cancel: 'Cancel', add: 'Add', uploading: 'Uploading…', saving: 'Saving…',
    name: 'Name', client: 'Client', size: 'Size', description: 'Description',
    start: 'Earliest start', deadline: 'Submission deadline',
    stages: 'Which teams does this need?', assignTo: 'Assign to',
    rfp: 'RFP document', refs: 'Reference photos', dropHere: 'Choose files',
    estimate: 'Estimated delivery', naive: 'If the teams were free',
    queueDays: 'of that is queue', createAndAssign: 'Create and assign',
    status: 'Status', due: 'Due', owner: 'Owner', stage: 'Stage', team: 'Team',
    start_: 'Start', markDone: 'Mark done', started: 'Started', done: 'Done',
    nothingQueued: 'Nothing is queued for you.',
    company: 'Company', phone: 'Phone', followUp: 'Next follow-up', value: 'Value (SAR)',
    addLead: 'Add lead', logCall: 'Log a call', logNote: 'Add a note',
    title: 'Title', upload: 'Upload', library: 'Document library',
    invite: 'Invite someone', role: 'Role', department: 'Department', active: 'Active',
    pending: 'Invited, not signed in yet', noLogin: 'No login yet',
    inviteNote: 'They will set their own password from the sign-in screen. You never see it.',
    unassigned: 'Unassigned', overdue: 'overdue', workingDays: 'working days',
    importedFrom: 'Imported from Asana', flagged: 'Imported with caveats',
  },
  ar: {
    signIn: 'تسجيل الدخول', signOut: 'تسجيل الخروج', email: 'البريد الإلكتروني', password: 'كلمة المرور',
    firstTime: 'أول مرة هنا؟', setPassword: 'أنشئ كلمة المرور',
    forgot: 'نسيت كلمة المرور؟', sendReset: 'أرسل لي رابط إعادة التعيين',
    backToSignIn: 'رجوع لتسجيل الدخول', checkInbox: 'تحقق من بريدك.',
    newPassword: 'اختر كلمة مرور جديدة', setIt: 'حفظ كلمة المرور',
    linkExpired: 'انتهت صلاحية الرابط أو تم استخدامه من قبل.',
    linkExpiredWhy: 'روابط الدخول تُستخدم مرة واحدة ولها مدة صلاحية. بعض أنظمة فحص البريد تفتح الرابط قبلك فتستهلكه. أرسل لنفسك رابطاً جديداً.',
    sendFresh: 'أرسل لي رابطاً جديداً', passwordSaved: 'تم حفظ كلمة المرور. جارٍ تسجيل دخولك…',
    recoverPrompt: 'أدخل كلمة مرور جديدة لحسابك.',
    noInvite: 'حسابك موجود لكنه غير مفعّل. اطلب من المسؤول إضافتك.',
    home: 'الرئيسية', projects: 'المشاريع', newProject: 'مشروع جديد', leads: 'العملاء المحتملون',
    documents: 'المستندات', people: 'الفريق', myQueue: 'مهامي',
    save: 'حفظ', cancel: 'إلغاء', add: 'إضافة', uploading: 'جارٍ الرفع…', saving: 'جارٍ الحفظ…',
    name: 'الاسم', client: 'العميل', size: 'الحجم', description: 'الوصف',
    start: 'أقرب بداية', deadline: 'موعد التقديم',
    stages: 'ما الفرق المطلوبة؟', assignTo: 'إسناد إلى',
    rfp: 'كراسة الشروط', refs: 'صور مرجعية', dropHere: 'اختر الملفات',
    estimate: 'موعد التسليم المتوقع', naive: 'لو كانت الفرق فارغة',
    queueDays: 'منها انتظار', createAndAssign: 'إنشاء وإسناد',
    status: 'الحالة', due: 'الاستحقاق', owner: 'المسؤول', stage: 'المرحلة', team: 'الفريق',
    start_: 'ابدأ', markDone: 'تم الإنجاز', started: 'قيد التنفيذ', done: 'منجز',
    nothingQueued: 'لا يوجد عمل في انتظارك.',
    company: 'الجهة', phone: 'الهاتف', followUp: 'المتابعة القادمة', value: 'القيمة (ر.س)',
    addLead: 'إضافة عميل محتمل', logCall: 'تسجيل مكالمة', logNote: 'إضافة ملاحظة',
    title: 'العنوان', upload: 'رفع', library: 'مكتبة المستندات',
    invite: 'دعوة شخص', role: 'الصلاحية', department: 'القسم', active: 'مفعّل',
    pending: 'مدعو، لم يسجّل الدخول بعد', noLogin: 'لا يوجد حساب دخول',
    inviteNote: 'سيضع كلمة المرور بنفسه من شاشة الدخول. أنت لا تراها أبداً.',
    unassigned: 'غير مسند', overdue: 'متأخرة', workingDays: 'أيام عمل',
    importedFrom: 'مستورد من أسانا', flagged: 'مستورد مع تحفظات',
  },
};

/* ------------------------------------------------------------------ helpers */

const fmt = (isoStr, lang) => isoStr
  ? parse(isoStr).toLocaleDateString(lang === 'ar' ? 'ar-SA-u-ca-gregory' : 'en-GB',
      { day: 'numeric', month: 'short', year: 'numeric' })
  : '—';

const lateBy = (d) => {
  if (!d) return null;
  const due = parse(d), now = CAL.nextWorking(new Date());
  return due < now ? CAL.countWorkingDays(due, now) : 0;
};

const deptName = (id, lang) => {
  const d = db.dept(id);
  return d ? (lang === 'ar' ? d.name_ar : d.name_en) : id;
};

const STAGE_LABEL = { pending: 'pending', in_progress: 'started', done: 'done', blocked: 'blocked' };

/* --------------------------------------------------------------- scheduling
   Build a scheduler that already knows what everyone is carrying, then ask it
   about the new project. Without the first half the answer is the naive one:
   how long the work takes, on a team with nothing else to do. */

export function buildScheduler(people, openStages) {
  const members = people
    .filter(p => p.department_id && db.dept(p.department_id)?.is_stage)
    .map(p => ({ id: p.id, name: p.full_name || p.email, team: p.department_id }));

  const sched = new Scheduler({ members, calendar: CAL });

  // Replay committed work oldest-first so the ledger reflects reality.
  const byProject = new Map();
  for (const s of openStages) {
    if (s.status === 'done') continue;
    if (!byProject.has(s.project_id)) byProject.set(s.project_id, { start: s.planned_start, stages: [] });
    const e = byProject.get(s.project_id);
    e.stages.push(s.department_id);
    if (s.planned_start && (!e.start || s.planned_start < e.start)) e.start = s.planned_start;
  }
  let n = 0;
  for (const [pid, e] of byProject) {
    const stages = e.stages.filter(d => db.dept(d)?.base_days);
    if (!stages.length) continue;
    try {
      sched.scheduleProject({
        id: 'live-' + pid, name: 'committed', size: 'M',
        earliestStart: e.start || today(), stages, commit: true,
      });
      n++;
    } catch { /* a project the engine cannot place must not block the estimate */ }
  }
  return { sched, committed: n, members };
}

export function estimateFor(sched, { name, size, start, deadline, stages }) {
  const real = sched.scheduleProject({
    id: '__new__', name, size, earliestStart: start, deadline: deadline || null,
    stages, commit: false,
  });
  const naive = new Scheduler({ members: sched.members ?? [], calendar: CAL })
    .scheduleProject({ id: 'n', name, size, earliestStart: start, stages, commit: false });
  return { real, naive };
}

/* ================================ SIGN IN ================================= */

export function signInView(lang, mode = 'in', msg = '', authErr = null) {
  const t = DSTR[lang];
  const title = mode === 'up' ? t.setPassword
              : mode === 'forgot' ? t.forgot
              : mode === 'reset' ? t.newPassword
              : t.signIn;

  /* An expired link is the single most likely way to arrive here, and the
     only useful response is a new link — so the panel carries the button
     rather than telling the user to go and find it. */
  const expired = authErr && /expired|invalid/i.test(authErr.code || authErr.message || '');
  const errPanel = !authErr ? '' : `
    <div class="autherr">
      <p class="autherr__h">${esc(expired ? t.linkExpired : authErr.message || t.linkExpired)}</p>
      ${expired ? `<p class="autherr__b small">${esc(t.linkExpiredWhy)}</p>
                   <button type="button" class="btn btn--sm" data-auth="forgot">${esc(t.sendFresh)}</button>` : ''}
    </div>`;

  return `
<section class="authwrap">
  <div class="card auth">
    <div class="card__head"><h2>${esc(title)}</h2></div>
    ${errPanel}
    <form id="authForm" class="authform" autocomplete="on">
      ${mode === 'reset' ? `<p class="small muted">${esc(t.recoverPrompt)}</p>` : `
      <label class="f f--wide">
        <span>${esc(t.email)}</span>
        <input id="aEmail" type="email" name="email" required autocomplete="username"
               placeholder="you@expandexpo.com" />
      </label>`}
      ${mode === 'forgot' ? '' : `
      <label class="f f--wide">
        <span>${esc(mode === 'reset' ? t.newPassword : t.password)}</span>
        <input id="aPass" type="password" name="password" required minlength="8"
               autocomplete="${mode === 'up' || mode === 'reset' ? 'new-password' : 'current-password'}" />
      </label>`}
      ${msg ? `<p class="authmsg ${/^!/.test(msg) ? 'bad' : ''}">${esc(msg.replace(/^!/, ''))}</p>` : ''}
      <button class="btn btn--primary" type="submit" id="aGo">${esc(mode === 'reset' ? t.setIt : title)}</button>
      <div class="authlinks small">
        ${mode === 'reset' ? ''
          : mode === 'in'
          ? `<button type="button" class="link" data-auth="up">${esc(t.firstTime)}</button>
             <button type="button" class="link" data-auth="forgot">${esc(t.forgot)}</button>`
          : `<button type="button" class="link" data-auth="in">${esc(t.backToSignIn)}</button>`}
      </div>
    </form>
  </div>
</section>`;
}

/* ================================== HOME ================================== */

export function homeView(lang, ctx) {
  const t = DSTR[lang], me = db.state.me;
  if (!me) return `<section class="card"><p class="note">${esc(t.noInvite)}</p></section>`;
  if (!me.is_active) return `<section class="card"><p class="note note--lead">${esc(t.noInvite)}</p></section>`;

  const d = me.department_id;
  if (d === 'bd') return leadsView(lang, ctx);
  if (d === 'content') return docsView(lang, ctx);
  if (d === 'pm' || me.role === 'admin' || me.role === 'manager') return pmView(lang, ctx);
  return queueView(lang, ctx);
}

/* ------------------------------- designer queue --------------------------- */

export function queueView(lang, ctx) {
  const t = DSTR[lang];
  const mine = (ctx.stages || []).filter(s => s.assignee_id === db.state.me?.id && s.status !== 'done');
  mine.sort((a, b) => String(a.planned_end || '9999').localeCompare(String(b.planned_end || '9999')));

  return `
<section class="card">
  <div class="card__head">
    <h2>${esc(t.myQueue)}</h2>
    <span class="muted small">${mine.length} ${esc(lang === 'ar' ? 'بند' : 'items')}</span>
  </div>
  ${mine.length ? `
  <table class="tbl">
    <thead><tr>
      <th>${esc(t.projects)}</th><th>${esc(t.stage)}</th>
      <th class="num">${esc(t.due)}</th><th class="num">${esc(t.status)}</th>
    </tr></thead>
    <tbody>
      ${mine.map(s => {
        const late = lateBy(s.planned_end);
        return `<tr>
          <td>${esc(s.project_name || '—')}</td>
          <td class="muted">${esc(deptName(s.department_id, lang))}</td>
          <td class="num ${late ? 'bad' : 'muted'}">${esc(fmt(s.planned_end, lang))}
            ${late ? `<span class="block small">${late} ${esc(t.overdue)}</span>` : ''}</td>
          <td class="num">
            ${s.status === 'pending'
              ? `<button class="btn btn--sm" data-stage="${esc(s.id)}" data-to="in_progress">${esc(t.start_)}</button>`
              : `<button class="btn btn--sm btn--primary" data-stage="${esc(s.id)}" data-to="done">${esc(t.markDone)}</button>`}
          </td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>` : `<p class="muted">${esc(t.nothingQueued)}</p>`}
</section>`;
}

/* ------------------------------------ PM ---------------------------------- */

export function pmView(lang, ctx) {
  const t = DSTR[lang];
  const projects = (ctx.projects || []).filter(p => !p.is_crm_list);
  const open = projects.filter(p => !['delivered', 'archived', 'lost'].includes(p.status));

  return `
<section class="card">
  <div class="card__head">
    <h2>${esc(t.projects)}</h2>
    <span class="muted small">${open.length} ${esc(lang === 'ar' ? 'مفتوح' : 'open')} · ${projects.length} ${esc(lang === 'ar' ? 'إجمالاً' : 'total')}</span>
    <button class="btn btn--primary btn--sm" style="margin-inline-start:auto" data-act="go" data-route="#/new">${esc(t.newProject)}</button>
  </div>
  <table class="tbl">
    <thead><tr>
      <th>${esc(t.name)}</th><th>${esc(t.stages)}</th>
      <th class="num">${esc(t.estimate)}</th><th class="num">${esc(t.due)}</th><th>${esc(t.status)}</th>
    </tr></thead>
    <tbody>
      ${open.slice(0, 60).map(p => {
        const late = lateBy(p.due_on);
        const stages = (p.project_stages || []).slice().sort((a, b) => a.sort - b.sort);
        return `<tr>
          <td>
            <button class="link" data-act="go" data-route="#/p/${esc(p.id)}">${esc(p.name)}</button>
            ${p.import_flags?.length ? `<span class="muted small block" title="${esc(p.import_flags.join(', '))}">${esc(t.flagged)}</span>` : ''}
          </td>
          <td class="small">${stages.map(s => `<span class="pill" style="--c:${esc(db.dept(s.department_id)?.colour || '#555')}">${esc(deptName(s.department_id, lang))}${s.status === 'done' ? ' ✓' : ''}</span>`).join(' ')}</td>
          <td class="num">${esc(fmt(p.estimated_delivery, lang))}</td>
          <td class="num ${late ? 'bad' : 'muted'}">${esc(fmt(p.due_on, lang))}</td>
          <td class="muted small">${esc(p.status)}</td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>
</section>`;
}

/* ------------------------------ new project ------------------------------- */

export function newProjectView(lang, ctx) {
  const t = DSTR[lang];
  const stageDepts = db.state.departments.filter(d => d.is_stage);
  const people = ctx.people || [];

  return `
<nav class="crumb"><button class="link" data-act="go" data-route="#/home">← ${esc(t.projects)}</button></nav>
<section class="card">
  <div class="card__head"><h2>${esc(t.newProject)}</h2></div>
  <form id="projForm" class="projform">
    <div class="fields">
      <label class="f f--wide"><span>${esc(t.name)}</span><input id="pName" required /></label>
      <label class="f"><span>${esc(t.client)}</span><input id="pClient" /></label>
      <label class="f"><span>${esc(t.size)}</span>
        <select id="pSize">
          ${['S', 'M', 'L', 'XL'].map(s => `<option value="${s}"${s === 'M' ? ' selected' : ''}>${s} · ×${DEFAULT_SIZE_FACTORS[s]}</option>`).join('')}
        </select></label>
      <label class="f"><span>${esc(t.start)}</span><input id="pStart" type="date" value="${today()}" /></label>
      <label class="f"><span>${esc(t.deadline)}</span><input id="pDeadline" type="date" /></label>
      <label class="f f--wide"><span>${esc(t.description)}</span><textarea id="pDesc" rows="3"></textarea></label>
    </div>

    <h3 class="subhead">${esc(t.stages)}</h3>
    <div class="stagepick">
      ${stageDepts.map(d => `
        <div class="stagepick__row">
          <label class="chk">
            <input type="checkbox" class="stageOn" value="${esc(d.id)}" ${['3d', '2d'].includes(d.id) ? 'checked' : ''} />
            <i style="background:${esc(d.colour)}"></i>
            <span>${esc(lang === 'ar' ? d.name_ar : d.name_en)}</span>
            <span class="muted small">${d.base_days ? `${d.base_days} ${esc(t.workingDays)}` : esc(lang === 'ar' ? 'بلا رقم جهد' : 'no stated effort')}</span>
          </label>
          <select class="stageWho" data-dept="${esc(d.id)}">
            <option value="">${esc(t.unassigned)}</option>
            ${people.filter(p => p.department_id === d.id)
              .map(p => `<option value="${esc(p.id)}">${esc(p.full_name || p.email)}</option>`).join('')}
          </select>
        </div>`).join('')}
    </div>

    <h3 class="subhead">${esc(t.rfp)} · ${esc(t.refs)}</h3>
    <div class="fields">
      <label class="f"><span>${esc(t.rfp)}</span>
        <input id="pRfp" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.zip,.txt" /></label>
      <label class="f"><span>${esc(t.refs)}</span>
        <input id="pRefs" type="file" accept="image/*,.pdf" multiple /></label>
    </div>

    <div id="estBox" class="estbox"></div>

    <div class="actions">
      <button type="submit" class="btn btn--primary" id="pGo">${esc(t.createAndAssign)}</button>
      <button type="button" class="btn" data-act="go" data-route="#/home">${esc(t.cancel)}</button>
    </div>
  </form>
</section>`;
}

export function estimateBox(lang, est) {
  const t = DSTR[lang];
  if (!est) return '';
  const { real, naive } = est;
  const gap = real.deliveryDate && naive.deliveryDate
    ? CAL.countWorkingDays(parse(naive.deliveryDate), parse(real.deliveryDate)) : 0;
  return `
  <div class="est">
    <div class="est__side">
      <span class="est__k">${esc(t.naive)}</span>
      <span class="est__v">${esc(fmt(naive.deliveryDate, lang))}</span>
    </div>
    <div class="est__arrow">→</div>
    <div class="est__side est__side--real">
      <span class="est__k">${esc(t.estimate)}</span>
      <span class="est__v">${esc(fmt(real.deliveryDate, lang))}</span>
      ${gap > 0 ? `<span class="est__note small">${gap} ${esc(t.workingDays)} ${esc(t.queueDays)}</span>` : ''}
    </div>
  </div>`;
}

/* ----------------------------------- leads -------------------------------- */

export function leadsView(lang, ctx) {
  const t = DSTR[lang];
  const leads = ctx.leads || [];
  const STATUSES = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost'];
  const counts = Object.fromEntries(STATUSES.map(s => [s, leads.filter(l => l.status === s).length]));
  const stale = leads.filter(l => l.status !== 'won' && l.status !== 'lost' && lateBy(l.next_follow_up_on)).length;

  return `
<section class="card">
  <div class="card__head">
    <h2>${esc(t.leads)}</h2>
    <span class="muted small">${leads.length}</span>
    <button class="btn btn--primary btn--sm" style="margin-inline-start:auto" data-act="newlead">${esc(t.addLead)}</button>
  </div>
  <div class="stats">
    ${STATUSES.map(s => `<div class="stat"><span class="stat__n">${counts[s]}</span><span class="stat__l">${esc(s)}</span></div>`).join('')}
    <div class="stat${stale ? ' stat--bad' : ''}"><span class="stat__n">${stale}</span><span class="stat__l">${esc(t.overdue)}</span></div>
  </div>
  <div id="leadForm"></div>
  <table class="tbl">
    <thead><tr>
      <th>${esc(t.name)}</th><th>${esc(t.company)}</th><th>${esc(t.status)}</th>
      <th class="num">${esc(t.followUp)}</th><th>${esc(t.owner)}</th><th></th>
    </tr></thead>
    <tbody>
      ${leads.slice(0, 200).map(l => {
        const late = lateBy(l.next_follow_up_on);
        return `<tr>
          <td>${esc(l.name)}${l.email ? `<span class="muted small block">${esc(l.email)}</span>` : ''}</td>
          <td class="muted small">${esc(l.company || l.source || '')}</td>
          <td>
            <select class="leadStatus btn--sm" data-lead="${esc(l.id)}">
              ${STATUSES.map(s => `<option value="${s}"${s === l.status ? ' selected' : ''}>${s}</option>`).join('')}
            </select>
          </td>
          <td class="num ${late ? 'bad' : 'muted'}">${esc(fmt(l.next_follow_up_on, lang))}</td>
          <td class="muted small">${esc(l.owner?.full_name || t.unassigned)}</td>
          <td class="num"><button class="link small" data-note="${esc(l.id)}">${esc(t.logNote)}</button></td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>
</section>`;
}

export const leadFormHtml = (lang, people) => {
  const t = DSTR[lang];
  return `
<form id="newLead" class="inlineform">
  <div class="fields">
    <label class="f"><span>${esc(t.name)}</span><input id="lName" required /></label>
    <label class="f"><span>${esc(t.company)}</span><input id="lCompany" /></label>
    <label class="f"><span>${esc(t.email)}</span><input id="lEmail" type="email" /></label>
    <label class="f"><span>${esc(t.phone)}</span><input id="lPhone" type="tel" inputmode="tel" /></label>
    <label class="f"><span>${esc(t.followUp)}</span><input id="lFollow" type="date" /></label>
    <label class="f"><span>${esc(t.value)}</span><input id="lValue" type="number" min="0" step="1000" /></label>
    <label class="f f--wide"><span>${esc(t.description)}</span><textarea id="lNotes" rows="2"></textarea></label>
  </div>
  <div class="actions">
    <button class="btn btn--primary" type="submit">${esc(t.add)}</button>
    <button class="btn" type="button" data-act="cancellead">${esc(t.cancel)}</button>
  </div>
</form>`;
};

/* --------------------------------- documents ------------------------------ */

export function docsView(lang, ctx) {
  const t = DSTR[lang];
  const files = ctx.files || [];
  return `
<section class="card">
  <div class="card__head"><h2>${esc(t.library)}</h2><span class="muted small">${files.length}</span></div>
  <form id="docForm" class="inlineform">
    <div class="fields">
      <label class="f"><span>${esc(t.title)}</span><input id="dTitle" /></label>
      <label class="f"><span>${esc(t.description)}</span><input id="dDesc" /></label>
      <label class="f f--wide"><span>${esc(t.dropHere)}</span>
        <input id="dFiles" type="file" multiple
               accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.zip,image/*" required /></label>
    </div>
    <div class="actions"><button class="btn btn--primary" type="submit">${esc(t.upload)}</button></div>
  </form>
  <table class="tbl">
    <thead><tr><th>${esc(t.name)}</th><th>${esc(t.title)}</th><th class="num">${esc(lang === 'ar' ? 'الحجم' : 'Size')}</th><th></th></tr></thead>
    <tbody>
      ${files.map(f => `<tr>
        <td>${esc(f.filename)}<span class="muted small block">${esc(f.uploader?.full_name || '')}</span></td>
        <td class="muted small">${esc(f.title || '')}</td>
        <td class="num muted small">${f.size_bytes ? (f.size_bytes / 1048576).toFixed(1) + ' MB' : '—'}</td>
        <td class="num"><button class="link small" data-open="${esc(f.id)}">${esc(lang === 'ar' ? 'فتح' : 'Open')}</button></td>
      </tr>`).join('')}
    </tbody>
  </table>
</section>`;
}

/* ----------------------------------- admin -------------------------------- */

export function adminView(lang, ctx) {
  const t = DSTR[lang];
  const people = ctx.people || [];
  const invites = ctx.invites || [];
  const depts = db.state.departments;

  return `
<section class="card">
  <div class="card__head"><h2>${esc(t.invite)}</h2></div>
  <form id="inviteForm" class="inlineform">
    <div class="fields">
      <label class="f"><span>${esc(t.email)}</span><input id="iEmail" type="email" required placeholder="name@expandexpo.com" /></label>
      <label class="f"><span>${esc(t.name)}</span><input id="iName" /></label>
      <label class="f"><span>${esc(t.department)}</span>
        <select id="iDept">${depts.map(d => `<option value="${esc(d.id)}">${esc(lang === 'ar' ? d.name_ar : d.name_en)}</option>`).join('')}</select></label>
      <label class="f"><span>${esc(t.role)}</span>
        <select id="iRole">${['member', 'lead', 'manager', 'admin'].map(r => `<option value="${r}">${r}</option>`).join('')}</select></label>
    </div>
    <p class="note">${esc(t.inviteNote)}</p>
    <div class="actions"><button class="btn btn--primary" type="submit">${esc(t.invite)}</button></div>
  </form>
</section>

<section class="card">
  <div class="card__head"><h2>${esc(t.people)}</h2><span class="muted small">${people.length}</span></div>
  <table class="tbl">
    <thead><tr>
      <th>${esc(t.name)}</th><th>${esc(t.email)}</th><th>${esc(t.department)}</th>
      <th>${esc(t.role)}</th><th class="num">${esc(t.active)}</th>
    </tr></thead>
    <tbody>
      ${people.map(p => `<tr>
        <td>${esc(p.full_name || '—')}
          ${!p.user_id ? `<span class="muted small block">${esc(invites.some(i => i.email === p.email) ? t.pending : t.noLogin)}</span>` : ''}</td>
        <td class="muted small">${esc(p.email || '—')}</td>
        <td><select class="pDept btn--sm" data-p="${esc(p.id)}">
          <option value="">—</option>
          ${depts.map(d => `<option value="${esc(d.id)}"${d.id === p.department_id ? ' selected' : ''}>${esc(lang === 'ar' ? d.name_ar : d.name_en)}</option>`).join('')}
        </select></td>
        <td><select class="pRole btn--sm" data-p="${esc(p.id)}">
          ${['member', 'lead', 'manager', 'admin'].map(r => `<option value="${r}"${r === p.role ? ' selected' : ''}>${r}</option>`).join('')}
        </select></td>
        <td class="num"><input type="checkbox" class="pActive" data-p="${esc(p.id)}" ${p.is_active ? 'checked' : ''} /></td>
      </tr>`).join('')}
    </tbody>
  </table>
</section>`;
}
