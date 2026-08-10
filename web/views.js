/* ==========================================================================
   Landing, roster, profiles and the sales pipeline.

   These screens are deliberately built on the same engine as the estimator
   rather than on a second set of numbers. A profile does not say "busy" —
   it converts the person's actual open proposals into working days at the
   stated effort, runs that through the KSA calendar, and prints the date
   they are free. If that date is wrong, the estimator is wrong too, and
   both get fixed in one place.
   ========================================================================== */

import { WorkCalendar, iso, parse } from '../engine/calendar.js';
import {
  capturedAt, workspace, DEPARTMENTS, PEOPLE, CAPACITY,
  PIPELINE_STAGES, DEALS, LEADS, MEASURED, byId, assignmentsFor,
} from '../data/snapshot.js';
import { DEFAULT_STAGES, DEFAULT_SIZE_FACTORS } from '../engine/scheduler.js';

const CAL = new WorkCalendar();
const esc = (x) => String(x ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ------------------------------ translations ----------------------------- */

export const VSTR = {
  en: {
    brandLine: 'Delivery, priced in capacity.',
    heroTitle: 'Know the delivery date before you promise it.',
    heroBody: 'Your teams are the constraint, not the calendar. Expand reads what each designer is already committed to and answers the only question a client actually asks: when.',
    signIn: 'Sign in', seeHow: 'See how it works', openEstimator: 'Open the estimator',
    proofTitle: 'What your workspace says today',
    proofNote: 'Read from Asana on',
    people: 'people', peopleOne: 'person',
    openProposals: 'open proposals', committed: 'working days committed',
    freeFrom: 'first free slot', notBefore: 'not before',
    whoTitle: 'Who are you?',
    whoBody: 'Pick your name. There is no password yet — this is the shape of the product, not the security model.',
    back: 'Back', backToTeam: 'Back to the team',
    vacant: 'No one assigned',
    workload: 'Workload', tasks: 'Open work', pipeline: 'Sales pipeline',
    utilisation: 'Committed load', overdue: 'overdue', onePersonStage: 'Single-person stage',
    blocking: 'What you are holding up', blockingNone: 'Nothing is waiting on you.',
    nextDue: 'Next due', noDue: 'no due date set',
    projects: 'projects', project: 'project',
    stageOf: 'Stage', elapsedNote: 'Elapsed time — effort plus waiting. Not the effort figure.',
    leadsTitle: 'Leads', dealsTitle: 'Deals', wonTitle: 'Closed won',
    leadGapTitle: 'The lead list stopped',
    capacityCheck: 'What a win would cost',
    capacityBody: 'Every deal below is sized, so closing it can be priced in design days before anyone promises a date.',
    ifWon: 'if won', addsTo: 'adds to', wouldPush: 'would push the queue to',
    owner: 'Owner', due: 'Due', daysLate: 'days late', today: 'today',
    noOne: 'unassigned',
    misrouted: 'Filed in Asana as a 3D task but assigned to 2D — left as found.',
    assigned: 'people assigned', assignedOne: 'person assigned',
    noDateShort: 'no effort figure, no date',
    statedIs: 'stated', measuredIs: 'measured', medianOf: 'median of',
    noStatedFigure: 'no stated figure',
    openDealsL: 'open deals', designDaysIfAll: 'design days if all close',
    pricingGateNote: 'Three people are in pricing, but one holds price review and approval on 17 of the 19 open proposals. Adding people to this stage does not widen it — the approval is the gate, and it takes a median of 13 days against a figure nobody has stated.',
    leadsStalledNote: 'The pipeline is being worked; the top of it is not. 48 of 70 leads are open and unassigned, and nothing has been added since 10 November 2025. Deals close from a list that stopped being fed.',
    productionNote: 'One delivered job to measure, and nobody in Asana holding production work. The stage exists in the process and not in the record.',
    pmNote: 'Four project managers, and not one open task assigned to any of them. The people who own delivery are the only function the workspace cannot see, so nothing they are carrying can be scheduled or chased.',
    roleTitles: {
      pm: 'Project manager', '3d': '3D designer', '2d': '2D technical designer',
      content: 'Content creator', pricing: 'Pricing', bd: 'Business developer', production: 'Production',
    },
    capacityUnconfirmed: 'Capacity is what Asana shows, not what anyone has confirmed. If more people do this work without being assigned in Asana, these dates are wrong in your favour — and worth correcting.',
    contentVacantNote: 'No Asana task in the workspace is assigned to content. Either the role is vacant or the work happens without a record — those look identical in the data and call for opposite responses.',
  },
  ar: {
    brandLine: 'التسليم، مُقدَّراً بالطاقة الفعلية.',
    heroTitle: 'اعرف موعد التسليم قبل أن تَعِد به.',
    heroBody: 'الفريق هو القيد، لا التقويم. يقرأ إكسباند ما التزم به كل مصمم فعلياً ويجيب على السؤال الوحيد الذي يسأله العميل: متى؟',
    signIn: 'تسجيل الدخول', seeHow: 'كيف يعمل', openEstimator: 'افتح حاسبة التسليم',
    proofTitle: 'ما تقوله مساحة العمل اليوم',
    proofNote: 'قُرئت من أسانا في',
    people: 'أشخاص', peopleOne: 'شخص',
    openProposals: 'عرضاً مفتوحاً', committed: 'يوم عمل ملتزم به',
    freeFrom: 'أول موعد متاح', notBefore: 'ليس قبل',
    whoTitle: 'من أنت؟',
    whoBody: 'اختر اسمك. لا توجد كلمة مرور بعد — هذه شكل المنتج، وليست نموذج الحماية.',
    back: 'رجوع', backToTeam: 'رجوع إلى الفريق',
    vacant: 'لا أحد مسند',
    workload: 'حِمل العمل', tasks: 'العمل المفتوح', pipeline: 'خط المبيعات',
    utilisation: 'الحِمل الملتزم به', overdue: 'متأخرة', onePersonStage: 'مرحلة بشخص واحد',
    blocking: 'ما الذي تؤخّره', blockingNone: 'لا شيء ينتظرك.',
    nextDue: 'الاستحقاق القادم', noDue: 'بلا موعد',
    projects: 'مشاريع', project: 'مشروع',
    stageOf: 'المرحلة', elapsedNote: 'زمن منقضٍ — جهد زائد انتظار. ليس رقم الجهد.',
    leadsTitle: 'العملاء المحتملون', dealsTitle: 'الصفقات', wonTitle: 'صفقات مكسوبة',
    leadGapTitle: 'قائمة العملاء المحتملين توقفت',
    capacityCheck: 'ماذا يكلّف الفوز',
    capacityBody: 'كل صفقة أدناه لها حجم، فيمكن تسعير إغلاقها بأيام التصميم قبل أن يَعِد أحد بموعد.',
    ifWon: 'عند الفوز', addsTo: 'يضيف إلى', wouldPush: 'يدفع الطابور إلى',
    owner: 'المسؤول', due: 'الاستحقاق', daysLate: 'يوماً تأخيراً', today: 'اليوم',
    noOne: 'غير مسند',
    misrouted: 'مسجَّلة في أسانا كمهمة ثلاثية الأبعاد لكنها مسندة لفريق 2D — تُركت كما هي.',
    assigned: 'أشخاص مسندون', assignedOne: 'شخص مسند',
    noDateShort: 'بلا رقم جهد، بلا موعد',
    statedIs: 'المُعلن', measuredIs: 'المقيس', medianOf: 'وسيط',
    noStatedFigure: 'بلا رقم معلن',
    openDealsL: 'صفقات مفتوحة', designDaysIfAll: 'يوم تصميم عند الفوز بالكل',
    pricingGateNote: 'ثلاثة أشخاص في التسعير، لكن واحداً يملك مراجعة الأسعار واعتمادها في ١٧ من ١٩ عرضاً مفتوحاً. إضافة أشخاص لهذه المرحلة لا توسّعها — الاعتماد هو البوابة، ويستغرق وسيطاً قدره ١٣ يوماً مقابل رقم لم يعلنه أحد.',
    leadsStalledNote: 'خط المبيعات يُعمل عليه، أما أعلاه فلا. ٤٨ من ٧٠ عميلاً محتملاً مفتوحون وغير مسندين، ولم يُضف شيء منذ ١٠ نوفمبر ٢٠٢٥. الصفقات تُغلق من قائمة توقّف تغذيتها.',
    productionNote: 'عمل واحد مُسلَّم يمكن قياسه، ولا أحد في أسانا يحمل عمل التنفيذ. المرحلة موجودة في العملية وغير موجودة في السجل.',
    pmNote: 'أربعة مديري مشاريع، ولا مهمة مفتوحة واحدة مسندة لأي منهم. مَن يملكون التسليم هم الوظيفة الوحيدة التي لا تراها مساحة العمل، فلا يمكن جدولة ما يحملونه ولا متابعته.',
    roleTitles: {
      pm: 'مدير مشاريع', '3d': 'مصمم ثلاثي الأبعاد', '2d': 'مصمم فني',
      content: 'منتج محتوى', pricing: 'التسعير', bd: 'مطور أعمال', production: 'التنفيذ',
    },
    capacityUnconfirmed: 'الطاقة هنا هي ما يُظهره أسانا، لا ما أكّده أحد. إن كان آخرون ينفذون هذا العمل دون إسناد في أسانا، فهذه المواعيد خاطئة لصالحك — ويستحق تصحيحها.',
    contentVacantNote: 'لا توجد مهمة في أسانا مسندة للمحتوى. إما أن الدور شاغر أو أن العمل يتم دون تسجيل — وهما يبدوان متطابقين في البيانات ويستدعيان ردّين متعاكسين.',
  },
};

/* --------------------------- workload arithmetic -------------------------- */

/**
 * Convert a person's open proposals into committed working days, then into
 * the date they are next free.
 *
 * The multiplication is deliberately the SIMPLE one — open proposals × the
 * stage's stated effort — because that is the number the team gave and can
 * argue with. It is not a model output dressed up as a measurement.
 * Returns null where no stated effort exists (pricing), rather than guessing.
 */
export function commitment(person, from = new Date()) {
  const stage = DEFAULT_STAGES[person.dept];
  if (!stage || !person.projects) {
    return { days: null, free: null, weeks: null, stage: stage || null };
  }
  const days = Math.round(person.projects * stage.baseDays);
  const free = CAL.addWorkingDays(from, days);
  return { days, free: iso(free), weeks: +(days / 5).toFixed(1), stage };
}

/** Days between today and a date, negative when the date is in the past. */
export function lateness(dueIso, from = new Date()) {
  if (!dueIso) return null;
  const due = parse(dueIso);
  const now = CAL.nextWorking(from);
  const sign = due < now ? -1 : 1;
  const [a, b] = sign < 0 ? [due, now] : [now, due];
  return sign * CAL.countWorkingDays(a, b);
}

/* -------------------------------- helpers -------------------------------- */

const fmtDate = (isoStr, lang) => {
  if (!isoStr) return '—';
  const d = parse(isoStr);
  return d.toLocaleDateString(lang === 'ar' ? 'ar-SA-u-ca-gregory' : 'en-GB',
    { day: 'numeric', month: 'short', year: 'numeric' });
};

/* Derived, never stored — see the note in data/snapshot.js. */
export const overdueFor = (personId) =>
  assignmentsFor(personId).filter(a => { const l = lateness(a.due); return l !== null && l < 0; }).length;

export const nextDueFor = (personId) =>
  assignmentsFor(personId).map(a => a.due).filter(Boolean).sort()[0] || null;

const deptName = (id, lang) => (DEPARTMENTS[id] ? DEPARTMENTS[id][lang] : id);
const personName = (p, lang) => (p.vacant ? VSTR[lang].vacant : p.name);

/** Bar whose width is a share of the busiest person, so it compares people. */
function loadBar(days, max, colour) {
  const pct = max ? Math.max(2, Math.round((days / max) * 100)) : 0;
  return `<div class="loadbar"><i style="width:${pct}%;background:${colour}"></i></div>`;
}

/* Cost of a win, in design days, using the same size factors the estimator
   uses. This is the join no CRM makes: a deal is not just a number, it is a
   claim on two people's calendars. Module scope because both the landing
   summary and the pipeline board price deals, and two copies of this would
   eventually disagree. */
export const designDays = (size) => {
  const f = DEFAULT_SIZE_FACTORS[size] ?? 1;
  return Math.round((DEFAULT_STAGES['3d'].baseDays + DEFAULT_STAGES['2d'].baseDays) * f);
};

/* ========================= the business, by function ======================
   One row per department, covering every function rather than only the two
   with a stated effort figure.

   The measured medians live in these rows now instead of in a table of their
   own. Read apart, "2D says 2 days" and "2D actually takes 5.5" are two
   facts; read on one line they are the finding, and the departments with no
   stated figure at all stop looking like an empty row and start looking like
   the question they are.

   What this deliberately does NOT do is multiply a measured median by a
   project count to manufacture a delivery date for pricing or content. Those
   medians are ELAPSED days — effort plus the wait — so multiplying them by a
   queue counts the queue twice and would put Omar's next free slot somewhere
   in 2027. A dash and a stated reason is the honest cell.
   ======================================================================== */

const BUSINESS_ORDER = ['3d', '2d', 'pricing', 'content', 'bd', 'pm', 'production'];

export function businessRows() {
  const openDeals = DEALS.filter(d => d.stage !== 'won');
  const pendingDays = openDeals.reduce((s, d) => s + designDays(d.size), 0);

  return BUSINESS_ORDER.map((id) => {
    const staff = PEOPLE.filter(p => p.dept === id && !p.vacant);
    const projects = staff.reduce((s, p) => s + p.projects, 0);
    const priced = staff.map(p => ({ p, c: commitment(p) }))
      .filter(x => x.c.days)
      .sort((a, b) => b.c.days - a.c.days);

    return {
      id, staff, projects,
      // Department days are the sum, but the free date comes from the busiest
      // person: a stage is only clear when its most loaded member is.
      days: priced.length ? priced.reduce((s, x) => s + x.c.days, 0) : null,
      free: priced.length ? priced[0].c.free : null,
      measured: MEASURED.find(m => m.stage === id) || null,
      deals: id === 'bd' ? openDeals.length : null,
      dealDays: id === 'bd' ? pendingDays : null,
    };
  });
}

/* ================================ LANDING ================================= */

export function landingView(lang) {
  const t = VSTR[lang];
  const rows = businessRows();
  const max = Math.max(...rows.map(r => r.days || 0), 1);

  /* Who is in a department, named while the list is short enough to read and
     counted once it is not. A row that says "3 people" when it could say
     their names is hiding the thing the reader wants. */
  const whoLine = (r) => {
    if (!r.staff.length) return esc(t.vacant);
    const names = r.staff.length <= 2
      ? r.staff.map(p => p.name).join(lang === 'ar' ? ' و' : ', ')
      : `${r.staff.length} ${t.people}`;
    return r.projects
      ? `${esc(names)} · ${r.projects} ${esc(r.projects === 1 ? t.project : t.projects)}`
      : esc(names);
  };

  /* stated 5 · measured 11.5 median of 6 — the removed table, per row. */
  const measuredLine = (m) => m ? `<span class="deptrow__m small muted">${
    m.stated == null ? esc(t.noStatedFigure) : `${esc(t.statedIs)} ${m.stated}`
  } · ${esc(t.measuredIs)} <b>${m.medianElapsed}</b> ${esc(t.medianOf)} ${m.n}</span>` : '';

  /* The two right-hand cells differ by what a department can honestly say. */
  const cells = (r) => {
    if (r.days) return [
      [r.days, t.committed],
      [fmtDate(r.free, lang), t.freeFrom],
    ];
    if (r.id === 'bd') return [
      [r.deals, t.openDealsL],
      [r.dealDays, t.designDaysIfAll],
    ];
    if (r.projects) return [
      [r.projects, t.openProposals],
      ['—', t.noDateShort],
    ];
    // People but no work is a different fact from no people at all, and the
    // cells should not read the same.
    return [
      [r.staff.length, r.staff.length === 1 ? t.assignedOne : t.assigned],
      r.staff.length ? [0, t.openProposals] : ['—', t.noDateShort],
    ];
  };

  const NOTES = { pricing: t.pricingGateNote, content: t.contentVacantNote,
                  bd: t.leadsStalledNote, pm: t.pmNote, production: t.productionNote };

  return `
<section class="hero">
  <p class="hero__eyebrow">${esc(t.brandLine)}</p>
  <h1 class="hero__title">${esc(t.heroTitle)}</h1>
  <p class="hero__body">${esc(t.heroBody)}</p>
  <div class="hero__cta">
    <button class="btn btn--primary" data-act="go" data-route="#/who">${esc(t.signIn)}</button>
    <button class="btn" data-act="go" data-route="#/estimate">${esc(t.openEstimator)}</button>
  </div>
</section>

<section class="card">
  <div class="card__head">
    <h2>${esc(t.proofTitle)}</h2>
    <span class="muted small">${esc(t.proofNote)} ${esc(fmtDate(capturedAt, lang))} · ${esc(workspace)}</span>
  </div>

  <div class="loadlist">
    ${rows.map((r) => {
      const [[n1, l1], [n2, l2]] = cells(r);
      const colour = DEPARTMENTS[r.id].colour;
      return `
      <div class="loadlist__row deptrow${r.staff.length ? '' : ' deptrow--empty'}">
        <div class="loadlist__who">
          <strong><i class="dot" style="background:${colour}"></i>${esc(deptName(r.id, lang))}</strong>
          <span class="muted small">${whoLine(r)}</span>
        </div>
        <div class="deptrow__mid">
          ${r.days ? loadBar(r.days, max, colour) : ''}
          ${measuredLine(r.measured)}
        </div>
        <div class="loadlist__num">
          <strong>${esc(n1)}</strong>
          <span class="muted small">${esc(l1)}</span>
        </div>
        <div class="loadlist__num">
          <strong>${esc(n2)}</strong>
          <span class="muted small">${esc(l2)}</span>
        </div>
        ${NOTES[r.id] ? `<p class="deptrow__note small">${esc(NOTES[r.id])}</p>` : ''}
      </div>`;
    }).join('')}
  </div>

  <p class="note">${esc(t.elapsedNote)}</p>
  <p class="note">${esc(t.capacityUnconfirmed)}</p>
</section>`;
}

/* ============================== ROLE PICKER =============================== */

export function whoView(lang) {
  const t = VSTR[lang];
  const order = ['pm', '3d', '2d', 'content', 'pricing', 'bd'];

  return `
<section class="card">
  <div class="card__head">
    <h2>${esc(t.whoTitle)}</h2>
    <span class="muted small">${esc(t.whoBody)}</span>
  </div>

  ${order.map(d => {
    const dept = DEPARTMENTS[d];
    const members = PEOPLE.filter(p => p.dept === d);
    return `
    <div class="deptblock">
      <h3 class="deptblock__title"><i style="background:${dept.colour}"></i>${esc(dept[lang])}</h3>
      <div class="whogrid">
        ${members.map(p => {
          const c = commitment(p);
          return `
          <button class="whocard${p.vacant ? ' whocard--vacant' : ''}"
                  ${p.vacant ? 'disabled' : `data-act="go" data-route="#/me/${esc(p.id)}"`}>
            <span class="whocard__name">${esc(personName(p, lang))}</span>
            <span class="whocard__role muted small">${esc(p.role[lang])}</span>
            ${p.vacant ? '' : `<span class="whocard__load small">
              ${p.projects} ${esc(p.projects === 1 ? t.project : t.projects)}
              ${c.days ? ` · ${c.days} ${esc(lang === 'ar' ? 'يوم' : 'd')}` : ''}
              ${overdueFor(p.id) ? ` · <b class="bad">${overdueFor(p.id)} ${esc(t.overdue)}</b>` : ''}
            </span>`}
          </button>`;
        }).join('')}
      </div>
      ${d === 'content' ? `<p class="note">${esc(t.contentVacantNote)}</p>` : ''}
    </div>`;
  }).join('')}
</section>`;
}

/* ================================ PROFILE ================================= */

export function profileView(lang, id) {
  const t = VSTR[lang];
  const p = byId(id);
  if (!p) return `<section class="card"><p>Unknown person.</p></section>`;

  const dept = DEPARTMENTS[p.dept];
  const c = commitment(p);
  const cap = CAPACITY[p.dept];
  
  const staff = PEOPLE.filter(x => !x.vacant);
  const max = Math.max(...staff.map(x => commitment(x).days || 0), 1);

  /* What this person is holding up: their own rows in the live assignment
     table, soonest first, overdue at the top. Derived from the same rows the
     counts come from, so the list and the number cannot disagree. */
  const blocking = assignmentsFor(p.id)
    .slice()
    .sort((a, b) => (a.due ? 0 : 1) - (b.due ? 0 : 1) || String(a.due).localeCompare(String(b.due)));

  /* Overdue is COUNTED from the rows below rather than stored alongside them.
     A stored count and a rendered list drift apart the first time either
     changes, and a dashboard that contradicts its own table is worse than
     one that shows nothing. */
  const overdue = overdueFor(p.id);
  const nextDue = nextDueFor(p.id);
  const late = lateness(nextDue);

  return `
<nav class="crumb"><button class="link" data-act="go" data-route="#/who">← ${esc(t.backToTeam)}</button></nav>

<section class="card profile">
  <div class="profile__head">
    <div class="avatar" style="--c:${dept.colour}">${esc(p.name.slice(0, 1))}</div>
    <div>
      <h1 class="profile__name">${esc(p.name)}</h1>
      <p class="muted">${esc(p.role[lang])} · ${esc(dept[lang])}</p>
    </div>
    ${cap && cap.people === 1 ? `<span class="chip chip--warn">${esc(t.onePersonStage)}</span>` : ''}
  </div>

  ${p.note ? `<p class="note note--lead">${esc(p.note[lang])}</p>` : ''}

  <div class="stats">
    <div class="stat">
      <span class="stat__n">${p.projects}</span>
      <span class="stat__l">${esc(t.openProposals)}</span>
    </div>
    <div class="stat">
      <span class="stat__n">${p.openTasks}</span>
      <span class="stat__l">${esc(t.tasks)}</span>
    </div>
    <div class="stat${overdue ? ' stat--bad' : ''}">
      <span class="stat__n">${overdue}</span>
      <span class="stat__l">${esc(t.overdue)}</span>
    </div>
    <div class="stat">
      <span class="stat__n">${c.days ?? '—'}</span>
      <span class="stat__l">${esc(t.committed)}</span>
    </div>
    <div class="stat stat--wide">
      <span class="stat__n">${esc(fmtDate(c.free, lang))}</span>
      <span class="stat__l">${esc(t.freeFrom)}</span>
    </div>
  </div>

  ${c.days ? `
  <div class="loadrow">
    ${loadBar(c.days, max, dept.colour)}
    <span class="muted small">${c.days} ${esc(t.committed)} · ${c.weeks} ${esc(lang === 'ar' ? 'أسبوع عمل' : 'working weeks')}</span>
  </div>` : ''}

  ${nextDue ? `
  <p class="${late !== null && late < 0 ? 'bad' : 'muted'}">
    ${esc(t.nextDue)}: ${esc(fmtDate(nextDue, lang))}
    ${late !== null && late < 0 ? ` — ${Math.abs(late)} ${esc(t.daysLate)}` : ''}
  </p>` : `<p class="muted">${esc(t.nextDue)}: ${esc(t.noDue)}</p>`}
</section>

${p.dept === 'bd' ? pipelineView(lang, true) : `
<section class="card">
  <div class="card__head"><h2>${esc(t.blocking)}</h2></div>
  ${blocking.length ? `
  <table class="tbl">
    <thead><tr>
      <th>${esc(lang === 'ar' ? 'المشروع' : 'Project')}</th>
      <th>${esc(t.stageOf)}</th>
      <th class="num">${esc(t.due)}</th>
    </tr></thead>
    <tbody>
      ${blocking.map(a => {
        const l = lateness(a.due);
        return `<tr>
          <td>${esc(a.project)}${a.misrouted
            ? `<span class="muted small block">${esc(t.misrouted)}</span>` : ''}</td>
          <td class="muted">${esc(deptName(a.stage, lang))}</td>
          <td class="num ${l !== null && l < 0 ? 'bad' : 'muted'}">
            ${a.due ? esc(fmtDate(a.due, lang)) : esc(t.noDue)}
            ${l !== null && l < 0 ? `<span class="block small">${Math.abs(l)} ${esc(t.daysLate)}</span>` : ''}
          </td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>
  <p class="note">${esc(lang === 'ar'
    ? `تعرض ${blocking.length} بنداً من ${p.openTasks} مهمة مفتوحة في أسانا. الباقي لم يُلتقط في هذه اللقطة — سيظهر كاملاً عند وجود اتصال مباشر.`
    : `Showing ${blocking.length} of the ${p.openTasks} tasks open in Asana. The rest were not captured in this snapshot and appear in full once the connection is live.`)}</p>`
  : `<p class="muted">${esc(t.blockingNone)}</p>`}
</section>`}`;
}

/* ============================ SALES PIPELINE ============================== */

export function pipelineView(lang, embedded = false) {
  const t = VSTR[lang];

  const openDeals = DEALS.filter(d => d.stage !== 'won');
  const pendingDays = openDeals.reduce((s, d) => s + designDays(d.size), 0);
  const threeD = PEOPLE.find(x => x.dept === '3d');
  const base = threeD ? commitment(threeD) : { days: 0, free: null };
  const after = iso(CAL.addWorkingDays(new Date(), (base.days || 0) + pendingDays));

  return `
${embedded ? '' : '<nav class="crumb"><button class="link" data-act="go" data-route="#/who">← ' + esc(t.backToTeam) + '</button></nav>'}

<section class="card">
  <div class="card__head">
    <h2>${esc(t.pipeline)}</h2>
    <span class="muted small">${esc(t.proofNote)} ${esc(fmtDate(capturedAt, lang))}</span>
  </div>

  <div class="board">
    ${PIPELINE_STAGES.map(st => {
      const deals = DEALS.filter(d => d.stage === st.id);
      return `
      <div class="bcol">
        <h3 class="bcol__title">${esc(st[lang])}<span class="muted">${deals.length}</span></h3>
        ${deals.map(d => {
          const l = lateness(d.due);
          return `
          <article class="deal">
            <p class="deal__name">${esc(d.latin)}</p>
            ${d.name === d.latin ? '' : `<p class="deal__ar muted small">${esc(d.name)}</p>`}
            <p class="deal__meta small">
              <span class="muted">${esc(d.owner)}</span>
              <span class="${l !== null && l < 0 ? 'bad' : 'muted'}">${esc(fmtDate(d.due, lang))}</span>
            </p>
            ${st.id !== 'won' ? `<p class="deal__cost small">
              ${esc(t.ifWon)}: <strong>${designDays(d.size)}</strong> ${esc(lang === 'ar' ? 'يوم تصميم' : 'design days')}
            </p>` : ''}
          </article>`;
        }).join('')}
      </div>`;
    }).join('')}
  </div>
</section>

<section class="card">
  <div class="card__head"><h2>${esc(t.capacityCheck)}</h2></div>
  <p class="muted">${esc(t.capacityBody)}</p>
  <div class="stats">
    <div class="stat">
      <span class="stat__n">${openDeals.length}</span>
      <span class="stat__l">${esc(t.dealsTitle)}</span>
    </div>
    <div class="stat">
      <span class="stat__n">${pendingDays}</span>
      <span class="stat__l">${esc(lang === 'ar' ? 'يوم تصميم عند الفوز بالكل' : 'design days if all close')}</span>
    </div>
    <div class="stat stat--wide stat--bad">
      <span class="stat__n">${esc(fmtDate(after, lang))}</span>
      <span class="stat__l">${esc(t.wouldPush)}</span>
    </div>
  </div>
</section>

<section class="card">
  <div class="card__head">
    <h2>${esc(t.leadGapTitle)}</h2>
    <span class="muted small">${LEADS.open} / ${LEADS.total} ${esc(lang === 'ar' ? 'مفتوحة' : 'still open')}</span>
  </div>
  <p class="muted">${esc(lang === 'ar'
    ? `كل الـ${LEADS.open} عميلاً محتملاً المفتوحين غير مسندين لأحد، وآخر دفعة أُضيفت في ${fmtDate(LEADS.newestDue, lang)}. القائمة لم تُلمس منذ ذلك الحين.`
    : `All ${LEADS.open} open leads are unassigned, and the last batch was added on ${fmtDate(LEADS.newestDue, lang)}. Nothing has moved since.`)}</p>
  <div class="batches">
    ${LEADS.batches.map(b => `
      <div class="batch">
        <span class="batch__l muted small">${esc(b.label)}</span>
        <span class="batch__n">${b.open}<span class="muted">/${b.total}</span></span>
      </div>`).join('')}
  </div>
  <table class="tbl tbl--tight">
    <tbody>
      ${LEADS.otherLists.map(l => `<tr>
        <td>${esc(l.name)}</td>
        <td class="num muted">${l.total}</td>
        <td class="num ${l.open ? 'bad' : ''}">${l.open} ${esc(lang === 'ar' ? 'مفتوحة' : 'open')}</td>
      </tr>`).join('')}
    </tbody>
  </table>
</section>`;
}
