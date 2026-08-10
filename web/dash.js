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
    searchPlaceholder: 'Search this page…',
    homeSub: 'What is open, what is late, and what it costs',
    leadsSub: 'Every lead and where it stands', peopleSub: 'Who can sign in, and as what',
    openProjects: 'Open projects', overdue_: 'Overdue', unassigned_: 'Stages unassigned',
    committedDays: 'Design days committed', openLeads: 'Open leads', nextFree: 'A new project would deliver',
    ofTotal: 'of', needsReview: 'Needs review', allRows: 'All', teamsCol: 'Teams',
    deadlineChart: 'Deadlines by month', deadlineNote: 'Open projects grouped by submission deadline. The dashed line is today, so everything to its left is already late.',
    noneYet: 'Nothing here yet.', today_: 'today',
    st: { in_design: 'In design', submitted: 'Submitted', won: 'Won', lost: 'Lost',
          delivered: 'Delivered', archived: 'Archived', draft: 'Draft', pending: 'Pending',
          in_progress: 'In progress', done: 'Done', blocked: 'Blocked', new: 'New',
          contacted: 'Contacted', qualified: 'Qualified', proposal: 'Proposal' },
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
    searchPlaceholder: 'ابحث في هذه الصفحة…',
    homeSub: 'ما هو مفتوح، وما هو متأخر، وكم يكلّف',
    leadsSub: 'كل عميل محتمل وموقعه', peopleSub: 'من يستطيع الدخول، وبأي صلاحية',
    openProjects: 'مشاريع مفتوحة', overdue_: 'متأخرة', unassigned_: 'مراحل غير مسندة',
    committedDays: 'أيام تصميم ملتزم بها', openLeads: 'عملاء محتملون مفتوحون', nextFree: 'مشروع جديد يُسلَّم في',
    ofTotal: 'من', needsReview: 'تحتاج مراجعة', allRows: 'الكل', teamsCol: 'الفرق',
    deadlineChart: 'المواعيد حسب الشهر', deadlineNote: 'المشاريع المفتوحة مجمّعة حسب موعد التقديم. الخط المتقطع هو اليوم، وكل ما على يساره متأخر بالفعل.',
    noneYet: 'لا شيء هنا بعد.', today_: 'اليوم',
    st: { in_design: 'قيد التصميم', submitted: 'مُقدَّم', won: 'مكسوب', lost: 'خاسر',
          delivered: 'مُسلَّم', archived: 'مؤرشف', draft: 'مسودة', pending: 'بانتظار',
          in_progress: 'قيد التنفيذ', done: 'منجز', blocked: 'متوقف', new: 'جديد',
          contacted: 'تم التواصل', qualified: 'مؤهل', proposal: 'عرض' },
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

/* -------------------------------------------------------------- status pills
   Status is a STATE, not a series, so it uses the reserved status colours and
   always carries its own word. `in_design` shipped to production as raw enum
   text; a colleague should not have to know the column names of the database
   to read their own dashboard. */
/* Deliberately NOT the categorical hues. A "3D design" team pill and an
   "In design" status pill sit inches apart in the same row, and giving them
   the same purple makes the reader work out which is which. Status uses the
   reserved status slots plus one info blue that is not in the series set. */
const ST_COLOUR = {
  in_design:   'var(--info)',
  in_progress: 'var(--info)',
  qualified:   'var(--info)',
  submitted:   'var(--warn)',
  proposal:    'var(--warn)',
  contacted:   'var(--warn)',
  pending:     'var(--ink3)',
  draft:       'var(--ink3)',
  new:         'var(--ink3)',
  blocked:     'var(--critical)',
  lost:        'var(--critical)',
  won:         'var(--ok)',
  done:        'var(--ok)',
  delivered:   'var(--ok)',
  archived:    'var(--ink4)',
};

export function statusPill(status, lang) {
  if (!status) return '';
  const label = DSTR[lang].st[status] || String(status).replace(/_/g, ' ');
  return `<span class="st" style="--c:${ST_COLOUR[status] || 'var(--ink3)'}"><i></i>${esc(label)}</span>`;
}

/* --------------------------------------------------------------- KPI tiles */

const kpi = (n, label, { sub = '', bad = false, colour = '', date = false } = {}) => `
  <div class="kpi${bad ? ' kpi--bad' : ''}${date ? ' kpi--date' : ''}">
    <span class="kpi__l">${colour ? `<i style="--c:${colour}"></i>` : ''}${esc(label)}</span>
    <span class="kpi__n">${n}</span>
    ${sub ? `<span class="kpi__s">${esc(sub)}</span>` : ''}
  </div>`;

/* ------------------------------------------------------------- the chart
   One series, so no legend — the title names it. Bars are anchored to the
   baseline with only their top corners rounded, separated by a 2px surface
   gap, over a recessive grid. Only the tallest bar is labelled: a number on
   every bar is a table pretending to be a chart.

   The window is the data's own range rather than "the next 12 months",
   because these deadlines were imported from Asana and most of them are
   already in the past. A forward-looking chart would have been empty and
   would have read as "nothing due" rather than "nothing captured".        */

function monthKey(d) { return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; }

export function deadlineChart(lang, projects) {
  const dated = projects.filter(p => p.due_on);
  if (dated.length < 2) return '';

  const counts = new Map();
  for (const p of dated) {
    const k = monthKey(parse(p.due_on));
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const keys = [...counts.keys()].sort();

  // A contiguous run of months, so an empty month reads as a gap rather than
  // being silently closed up — the shape of the workload is the point.
  const months = [];
  let [y, m] = keys[0].split('-').map(Number);
  const [ly, lm] = keys[keys.length - 1].split('-').map(Number);
  while (y < ly || (y === ly && m <= lm)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    if (++m > 12) { m = 1; y++; }
    if (months.length > 24) break;
  }
  const series = months.slice(-14).map(k => ({ k, n: counts.get(k) || 0 }));
  const max = Math.max(...series.map(s => s.n), 1);

  /* A viewBox close to the width the card actually gets, so the SVG is not
     scaled up 2x on a wide screen — which would take 11px axis labels to 22px
     and make the chart shout over everything around it. */
  const W = 1180, H = 250, PAD_L = 36, PAD_R = 10, PAD_T = 20, PAD_B = 34;
  const plotW = W - PAD_L - PAD_R, plotH = H - PAD_T - PAD_B;
  const step = plotW / series.length;
  const barW = Math.max(6, Math.min(46, step - 16));   // thin marks, clear surface gap
  const yOf = (n) => PAD_T + plotH - (n / max) * plotH;

  const ticks = [0, Math.round(max / 2), max].filter((v, i, a) => a.indexOf(v) === i);
  const label = (k) => {
    const [yy, mm] = k.split('-');
    return new Date(Date.UTC(+yy, +mm - 1, 1))
      .toLocaleDateString(lang === 'ar' ? 'ar-SA-u-ca-gregory' : 'en-GB',
        { month: 'short', timeZone: 'UTC' });
  };

  // Top-rounded bar: a plain rx rounds the base too, which lifts the bar off
  // its own axis and makes small values look like floating lozenges.
  const barPath = (x, y, w, h) => {
    const r = Math.min(4, w / 2, h);
    return `M${x} ${y + h}V${y + r}q0-${r} ${r}-${r}h${w - 2 * r}q${r} 0 ${r} ${r}V${y + h}Z`;
  };

  const nowKey = monthKey(new Date());
  const nowIdx = series.findIndex(s => s.k >= nowKey);
  const nowX = nowIdx < 0 ? null : PAD_L + nowIdx * step;

  const t = DSTR[lang];
  const peak = series.reduce((a, b) => (b.n > a.n ? b : a), series[0]);

  return `
<section class="card chartcard">
  <div class="card__head">
    <h2>${esc(t.deadlineChart)}</h2>
    <span class="muted small">${dated.length} ${esc(lang === 'ar' ? 'مشروع له موعد' : 'projects with a deadline')}</span>
  </div>
  <div style="padding:6px 16px 0">
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img"
         aria-label="${esc(t.deadlineChart)}: ${series.map(s => `${label(s.k)} ${s.n}`).join(', ')}">
      <g class="grid">
        ${ticks.map(v => `<line x1="${PAD_L}" x2="${W - PAD_R}" y1="${yOf(v)}" y2="${yOf(v)}"/>`).join('')}
      </g>
      <g class="axis">
        ${ticks.map(v => `<text x="${PAD_L - 8}" y="${yOf(v) + 4}" text-anchor="end">${v}</text>`).join('')}
        ${series.map((s, i) => `<text x="${PAD_L + i * step + step / 2}" y="${H - 10}" text-anchor="middle">${esc(label(s.k))}</text>`).join('')}
      </g>
      ${nowX !== null ? `<g class="now">
        <line x1="${nowX}" x2="${nowX}" y1="${PAD_T - 6}" y2="${PAD_T + plotH}"/>
        <text x="${nowX + 4}" y="${PAD_T - 1}">${esc(t.today_)}</text>
      </g>` : ''}
      <g>
        ${series.map((s, i) => {
          if (!s.n) return '';
          const x = PAD_L + i * step + (step - barW) / 2, y = yOf(s.n);
          return `<g class="bar"><title>${esc(label(s.k))} ${s.k.slice(0, 4)} — ${s.n}</title>
            <path d="${barPath(x, y, barW, PAD_T + plotH - y)}"/></g>`;
        }).join('')}
        ${peak.n ? `<text class="val" x="${PAD_L + series.indexOf(peak) * step + step / 2}" y="${yOf(peak.n) - 6}" text-anchor="middle">${peak.n}</text>` : ''}
      </g>
    </svg>
  </div>
  <p class="note">${esc(t.deadlineNote)}</p>
</section>`;
}

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

  /* --- the numbers above the table ------------------------------------- */
  const overdue = open.filter(p => lateBy(p.due_on)).length;
  const stages = open.flatMap(p => p.project_stages || []);
  const liveStages = stages.filter(s => s.status !== 'done');
  const unassigned = liveStages.filter(s => !s.assignee_id).length;

  /* Every stage imported from Asana has a NULL effort_days — Asana has no
     such field — so summing the column alone renders a confident zero next to
     204 open stages. Fall back to the department's stated figure, and count
     how many stages have neither so the tile can say what it is missing
     rather than quietly under-reporting. */
  const effortOf = (s) => Number(s.effort_days) || Number(db.dept(s.department_id)?.base_days) || 0;
  const committed = Math.round(liveStages.reduce((sum, s) => sum + effortOf(s), 0));
  const unpriced = liveStages.filter(s => !effortOf(s)).length;

  const leads = ctx.leads || [];
  const openLeads = leads.filter(l => !['won', 'lost'].includes(l.status)).length;

  /* The product's own promise, on the dashboard: if a medium proposal landed
     today, when would it deliver — against everything already committed.
     It runs through the same scheduler the estimator uses, so this tile and
     that screen cannot quietly disagree. Wrapped because a roster with an
     empty stage throws, and one empty tile beats a blank dashboard. */
  let freeFrom = null;
  try {
    const { sched } = buildScheduler(ctx.people || [], liveStages);
    /* Only stages the scheduler can actually price AND staff. `pricing` and
       `production` are flagged as stages but have no stated effort and nobody
       assigned, and asking the engine to schedule one throws — which took the
       whole tile down with it and printed an em dash. */
    const probeStages = (db.state.departments || [])
      .filter(d => d.is_stage && Number(d.base_days) > 0)
      .filter(d => (ctx.people || []).some(p => p.department_id === d.id))
      .map(d => d.id);
    if (probeStages.length) {
      const { real } = estimateFor(sched, {
        name: 'probe', size: 'M', start: today(), deadline: null, stages: probeStages,
      });
      freeFrom = real?.delivery || null;
    }
  } catch { freeFrom = null; }

  /* Only offer the review filter if there is something to review, and count
     it over everything rather than the visible page. */
  const flagged = open.filter(p => p.import_flags?.length).length;
  const rows = open.slice(0, 80);

  /* The estimate column earned its place only if any row can fill it. When
     every cell is an em dash the column is not information, it is furniture
     that makes the table look broken. */
  const anyEstimate = rows.some(p => p.estimated_delivery);

  return `
<div class="kpis">
  ${kpi(open.length, t.openProjects, { sub: `${projects.length} ${lang === 'ar' ? 'إجمالاً' : 'in total'}`, colour: 'var(--brand)' })}
  ${kpi(overdue, t.overdue_, { bad: overdue > 0, sub: lang === 'ar' ? 'تجاوزت موعد التقديم' : 'past their deadline', colour: 'var(--critical)' })}
  ${kpi(unassigned, t.unassigned_, { sub: `${liveStages.length} ${lang === 'ar' ? 'مرحلة مفتوحة' : 'open stages'}`, colour: 'var(--warn)' })}
  ${kpi(committed, t.committedDays, { colour: 'var(--s2)',
    sub: unpriced ? `${unpriced} ${lang === 'ar' ? 'مرحلة بلا رقم جهد' : 'stages have no effort figure'}`
                  : (lang === 'ar' ? 'جهد متبقٍ' : 'effort still to do') })}
  ${kpi(openLeads, t.openLeads, { sub: `${leads.length} ${lang === 'ar' ? 'في القائمة' : 'in the list'}`, colour: 'var(--s3)' })}
  ${kpi(esc(fmt(freeFrom, lang)), t.nextFree, { date: true, sub: lang === 'ar' ? 'حجم متوسط، يبدأ اليوم' : 'medium size, starting today', colour: 'var(--s1)' })}
</div>

${deadlineChart(lang, open)}

<section class="card">
  <div class="card__head">
    <h2>${esc(t.projects)}</h2>
    <span class="muted small">${open.length} ${esc(lang === 'ar' ? 'مفتوح' : 'open')} · ${projects.length} ${esc(lang === 'ar' ? 'إجمالاً' : 'total')}</span>
    <button class="btn btn--primary btn--sm" style="margin-inline-start:auto" data-act="go" data-route="#/new">${esc(t.newProject)}</button>
  </div>
  ${flagged ? `<div class="chipbar">
    <button class="chip chip--btn is-on" data-rows="all">${esc(t.allRows)} ${open.length}</button>
    <button class="chip chip--btn" data-rows="flagged">${esc(t.needsReview)} ${flagged}</button>
  </div>` : ''}
  <div class="tblwrap">
    <table class="tbl">
      <thead><tr>
        <th>${esc(t.name)}</th><th>${esc(t.teamsCol)}</th>
        ${anyEstimate ? `<th class="num">${esc(t.estimate)}</th>` : ''}
        <th class="num">${esc(t.due)}</th><th>${esc(t.status)}</th>
      </tr></thead>
      <tbody>
        ${rows.map(p => {
          const late = lateBy(p.due_on);
          const st = (p.project_stages || []).slice().sort((a, b) => a.sort - b.sort);
          return `<tr${p.import_flags?.length ? ' data-flagged="1"' : ''}>
            <td><button class="link" data-act="go" data-route="#/p/${esc(p.id)}">${esc(p.name)}</button></td>
            <td class="small"><span class="stagecell">${st.map(s => `<span class="pill" style="--c:${esc(db.dept(s.department_id)?.colour || '#555')}">${esc(deptName(s.department_id, lang))}${s.status === 'done' ? ' ✓' : ''}</span>`).join('')}</span></td>
            ${anyEstimate ? `<td class="num">${esc(fmt(p.estimated_delivery, lang))}</td>` : ''}
            <td class="num ${late ? 'bad' : 'muted'}">${esc(fmt(p.due_on, lang))}
              ${late ? `<span class="block small">${late} ${esc(t.overdue)}</span>` : ''}</td>
            <td>${statusPill(p.status, lang)}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>
  ${open.length > rows.length ? `<p class="note">${esc(lang === 'ar'
    ? `تعرض ${rows.length} من ${open.length} مشروعاً مفتوحاً. استخدم البحث في الأعلى للوصول إلى البقية.`
    : `Showing ${rows.length} of ${open.length} open projects. Use the search above to reach the rest.`)}</p>` : ''}
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
  const gap = real.delivery && naive.delivery
    ? CAL.countWorkingDays(parse(naive.delivery), parse(real.delivery)) : 0;
  return `
  <div class="est">
    <div class="est__side">
      <span class="est__k">${esc(t.naive)}</span>
      <span class="est__v">${esc(fmt(naive.delivery, lang))}</span>
    </div>
    <div class="est__arrow">→</div>
    <div class="est__side est__side--real">
      <span class="est__k">${esc(t.estimate)}</span>
      <span class="est__v">${esc(fmt(real.delivery, lang))}</span>
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
    ${STATUSES.map(s => `<div class="stat"><span class="stat__n">${counts[s]}</span><span class="stat__l">${esc(t.st[s] || s)}</span></div>`).join('')}
    <div class="stat${stale ? ' stat--bad' : ''}"><span class="stat__n">${stale}</span><span class="stat__l">${esc(t.overdue)}</span></div>
  </div>
  <div id="leadForm"></div>
  <div class="tblwrap">
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
              ${STATUSES.map(s => `<option value="${s}"${s === l.status ? ' selected' : ''}>${esc(t.st[s] || s)}</option>`).join('')}
            </select>
          </td>
          <td class="num ${late ? 'bad' : 'muted'}">${esc(fmt(l.next_follow_up_on, lang))}</td>
          <td class="muted small">${esc(l.owner?.full_name || t.unassigned)}</td>
          <td class="num"><button class="link small" data-note="${esc(l.id)}">${esc(t.logNote)}</button></td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>
  </div>
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
