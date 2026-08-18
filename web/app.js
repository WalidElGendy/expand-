/* ==========================================================================
   Delivery estimator — interactive proof of the scheduling engine.

   This is not the CRM. It is the one screen that has to be right before the
   CRM is worth building: given who is on each team and what they are already
   committed to, when can a new proposal actually be delivered.

   It deliberately shows the naive answer next to the real one, because the
   gap between them is the whole reason the tool exists.
   ========================================================================== */

import { Scheduler, calibrate, backtest, DEFAULT_STAGES, SIZES } from '../engine/scheduler.js';
import { WorkCalendar, iso, parse } from '../engine/calendar.js';
import * as db from './db.js';
import * as C from './controller.js';
import {
  DSTR, signInView, canPlan, sizeOptionsHtml,
  buildScheduler, monthlyLoad, workloadCalendar,
} from './dash.js';

/* ------------------------------ translations ----------------------------- */

const STR = {
  en: {
    title: 'Delivery estimator', sub: 'When can we actually deliver this proposal?',
    teams: 'Your teams', pipeline: 'Current pipeline', newProposal: 'New proposal',
    name: 'Project name', size: 'Size', start: 'Earliest start', deadline: 'Submission deadline',
    estimate: 'Estimate delivery', addPipeline: 'Add to pipeline', reset: 'Reset demo',
    naive: 'Naive answer', naiveNote: 'longest stage, empty team',
    real: 'With current workload', realNote: 'what the team can actually do',
    later: 'later than the naive answer', bottleneck: 'Bottleneck',
    queue: 'waiting for the team', work: 'doing the work',
    breakdown: 'Stage breakdown', timeline: 'Who is doing what',
    utilisation: 'Team load', levers: 'What would move this date',
    confidence: 'Confidence', meets: 'Meets the deadline', misses: 'Misses the deadline by',
    days: 'working days', day: 'working day', slack: 'days of slack',
    person: 'person', people: 'people', noProjects: 'Nothing in the pipeline yet.',
    stage3d: '3D design', stage2d: '2D technical', stagecontent: 'Content creation',
    saves: 'saves', addPerson: 'Add one person to',
    sizes: { S: 'Small', M: 'Medium', L: 'Large' },
    effortNote: 'person-days of work',
    stages: 'stages', next20: 'next 20 working days',
    confHigh: 'Mostly hands-on work, little waiting. This date holds unless scope changes.',
    confMedium: 'A meaningful part of this is waiting for the team to free up. Slips upstream will move it.',
    confLow: 'Most of this date is queue, not work. It is a forecast about other projects finishing on time.',
    confLevel: { high: 'High', medium: 'Medium', low: 'Low' },
    leverAdd: 'Add one person to', leverScope: 'Scope down from', leverTo: 'to',
    leverDefer: 'Deliver without', leverDeferTail: 'and follow up',
  },
  ar: {
    title: 'تقدير موعد التسليم', sub: 'متى يمكننا فعلياً تسليم هذا العرض؟',
    teams: 'الفرق', pipeline: 'المشاريع الجارية', newProposal: 'عرض جديد',
    name: 'اسم المشروع', size: 'الحجم', start: 'أقرب بداية', deadline: 'موعد التقديم',
    estimate: 'احسب موعد التسليم', addPipeline: 'أضف إلى المشاريع', reset: 'إعادة الضبط',
    naive: 'الحساب المبسّط', naiveNote: 'أطول مرحلة، فريق فارغ',
    real: 'مع حِمل العمل الحالي', realNote: 'ما يستطيع الفريق فعله',
    later: 'أطول من الحساب المبسّط', bottleneck: 'الاختناق',
    queue: 'انتظار توفر الفريق', work: 'تنفيذ العمل',
    breakdown: 'تفصيل المراحل', timeline: 'من يعمل على ماذا',
    utilisation: 'حِمل الفرق', levers: 'ما الذي يقرّب هذا الموعد',
    confidence: 'درجة الثقة', meets: 'يلتزم بالموعد', misses: 'يتجاوز الموعد بـ',
    days: 'أيام عمل', day: 'يوم عمل', slack: 'أيام فائضة',
    person: 'شخص', people: 'أشخاص', noProjects: 'لا توجد مشاريع بعد.',
    stage3d: 'تصميم ثلاثي الأبعاد', stage2d: 'الرسومات الفنية', stagecontent: 'إنتاج المحتوى',
    saves: 'يوفّر', addPerson: 'إضافة شخص إلى',
    sizes: { S: 'صغير', M: 'متوسط', L: 'كبير' },
    effortNote: 'أيام عمل للفرد',
    stages: 'مراحل', next20: 'أقرب ٢٠ يوم عمل',
    confHigh: 'العمل تنفيذ في معظمه، والانتظار قليل. هذا الموعد ثابت ما لم يتغيّر النطاق.',
    confMedium: 'جزء معتبر من هذا انتظار لتوفّر الفريق. أي تأخير سابق سيحرّك الموعد.',
    confLow: 'معظم هذا الموعد انتظار وليس تنفيذاً. إنه توقّع بأن المشاريع الأخرى ستنتهي في وقتها.',
    confLevel: { high: 'عالية', medium: 'متوسطة', low: 'منخفضة' },
    leverAdd: 'إضافة شخص إلى فريق', leverScope: 'تصغير الحجم من', leverTo: 'إلى',
    leverDefer: 'التسليم بدون', leverDeferTail: 'ثم استكماله لاحقاً',
  },
};

const TEAM_LABEL = {
  en: { '3d': '3D design', '2d': '2D technical', content: 'Content' },
  ar: { '3d': 'ثلاثي الأبعاد', '2d': 'الرسومات الفنية', content: 'المحتوى' },
};

/* Validated on the Expand dark surface #101014 — see docs/README. */
const TEAM_COLOR = { '3d': 'var(--s1)', '2d': 'var(--s2)', content: 'var(--s3)' };

/* --------------------------------- state --------------------------------- */

const S = {
  lang: 'en',
  route: '#/',
  q: '',                 // the top-bar filter, kept across re-renders
  headcount: { '3d': 2, '2d': 2, content: 1 },
  /* The picked size lives here rather than only in the DOM. It is read by the
     workload calendar, and any re-render — a language toggle, a headcount
     nudge — used to rebuild the select with Medium selected and silently
     throw the choice away. */
  size: 'M',
  pipeline: [],
  seq: 0,
  result: null,
  whatIf: null,
};

const T = () => STR[S.lang];
const $ = (s, r = document) => r.querySelector(s);
const esc = (x) => String(x ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const CAL = new WorkCalendar();
const today = () => iso(CAL.nextWorking(new Date()));

function members() {
  const out = [];
  for (const [team, n] of Object.entries(S.headcount)) {
    for (let i = 0; i < n; i++) {
      out.push({ id: `${team}-${i + 1}`, name: `${TEAM_LABEL[S.lang][team]} ${i + 1}`, team });
    }
  }
  return out;
}

/** A scheduler with the whole current pipeline already committed. */
function loaded() {
  const s = new Scheduler({ members: members(), calendar: CAL });
  for (const p of S.pipeline) {
    s.scheduleProject({ id: p.id, name: p.name, size: p.size, earliestStart: p.start });
  }
  return s;
}

/* --------------------------------- format -------------------------------- */

const fmtDate = (d) => {
  const x = parse(d);
  return x.toLocaleDateString(S.lang === 'ar' ? 'ar-SA-u-ca-gregory' : 'en-GB',
    { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
};
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/* ---------------------- localising the engine's output --------------------
   The scheduler returns structured facts, not sentences, so the wording lives
   here where both languages are. Anything the engine phrases itself would be
   English-only — which is exactly how the Arabic ends up half-translated. */

const confNote = (level) =>
  ({ high: T().confHigh, medium: T().confMedium, low: T().confLow })[level] || '';

function leverLabel(o) {
  const t = T();
  const team = (k) => TEAM_LABEL[S.lang][k] || k;
  const sizeName = (k) => t.sizes[k] || k;
  if (o.action === 'add_person')   return `${t.leverAdd} ${team(S.result?.bottleneck?.team)}`;
  if (o.action === 'reduce_scope') {
    const m = /from (\w+) to (\w+)/.exec(o.label);
    return m ? `${t.leverScope} ${sizeName(m[1])} ${t.leverTo} ${sizeName(m[2])}` : o.label;
  }
  if (o.action === 'defer_stage')  return `${t.leverDefer} ${team(S.result?.bottleneck?.team)} ${t.leverDeferTail}`;
  return o.label;
}

/* --------------------------------- render -------------------------------- */

/* Routes are hash-based on purpose: the whole product is one static file, so
   there is no server to teach about paths, and a deep link still survives a
   refresh. Swap for the History API the day there is a backend. */
function currentRoute() {
  const h = location.hash || '#/';
  if (h.startsWith('#/estimate')) return { name: 'estimate' };
  if (h.startsWith('#/highlights')) return { name: 'highlights' };
  if (h.startsWith('#/signin'))   return { name: 'signin' };
  if (h.startsWith('#/reset'))    return { name: 'signin' };   // recovery lands here
  if (h.startsWith('#/home'))     return { name: 'home' };
  if (h.startsWith('#/projects')) return { name: 'projects' };
  // Must be tested before '#/p' would ever be reached by a prefix match, and
  // after '#/projects' for the same reason — '#/projects' starts with '#/p'.
  if (h.startsWith('#/p/'))       return { name: 'project', id: h.slice(4) };
  // Before '#/leads' is irrelevant (different prefix), but the trailing slash
  // still matters: '#/l/' must not swallow a future '#/list'.
  if (h.startsWith('#/l/'))       return { name: 'lead', id: h.slice(4) };
  if (h.startsWith('#/new'))      return { name: 'new' };
  if (h.startsWith('#/leads'))    return { name: 'leads' };
  if (h.startsWith('#/docs'))     return { name: 'docs' };
  if (h.startsWith('#/admin'))    return { name: 'admin' };
  return { name: 'home' };
}

/* The signed-in routes, named once. This used to be two hardcoded lists —
   the one render() guards on and the one the boot/hashchange handler loads
   data for — and they had already drifted: 'projects' was in the first and
   missing from the second, so the screen only ever had rows if you happened
   to arrive from a page that had loaded them. A deep link or a refresh
   showed an empty table and called it zero projects. */
const APP_ROUTES = ['home', 'projects', 'project', 'new', 'leads', 'lead', 'docs', 'admin',
  'estimate', 'highlights'];

function render() {
  document.documentElement.lang = S.lang;
  document.documentElement.dir = S.lang === 'ar' ? 'rtl' : 'ltr';
  const r = currentRoute();
  document.body.dataset.route = r.name;

  const APP = APP_ROUTES;
  // An app route with no session is not an error, it is a sign-in prompt.
  // Redirecting instead of rendering an empty dashboard means a deep link
  // survives the login rather than dumping the user on a blank home.
  if (APP.includes(r.name) && !db.state.session) {
    // The body must describe what is on screen, not what was asked for.
    // Leaving it as "home" while showing a sign-in form is the kind of small
    // lie that makes tests and screen readers disagree with the page.
    document.body.dataset.route = 'signin';
    $('#root').innerHTML = shell({ name: 'signin' }, signInView(S.lang, C.ctx.authMode, C.ctx.authMsg, C.ctx.authErr, C.ctx.authAddr));
    C.wireAuth(S.lang); wire();
    return;
  }

  /* Every route except sign-in is now an APP route, so this is the whole
     dispatch. The estimator is the one screen that carries no company data
     of its own, but it sits behind the door with everything else: "a
     stranger sees a sign-in page and nothing else" is a rule that survives
     somebody later adding a real project to it, and "mostly private" is not
     a property anyone can check. */
  const body =
    r.name === 'signin'   ? signInView(S.lang, C.ctx.authMode, C.ctx.authMsg, C.ctx.authErr, C.ctx.authAddr)
  : r.name === 'estimate' ? estimatorBody()
  : C.appBody(S.lang, r.name, r.id);

  $('#root').innerHTML = shell(r, body);
  wire();
  if (r.name === 'signin') C.wireAuth(S.lang);
  if (APP.includes(r.name)) C.wireApp(S.lang);
}

/* The calendar is the one block on this screen made of real rows rather than
   the sandbox beside it: the actual roster, the actual open stages, the
   actual sizes. The cards above it answer "what if"; this answers "what is".
   Keeping them on one screen is deliberate — the moment you see February is
   the first month with room is the moment you want to model February. */
function realWorkloadCard() {
  const { people, stages, projects } = C.ctx;
  if (!people?.length || !projects?.length) return '';
  let built;
  try { built = buildScheduler(people, stages || [], projects); }
  catch { return ''; }                       // a broken row must not blank the page
  if (!built.members.length) return '';
  const load = monthlyLoad(built.sched, 6);
  return workloadCalendar(S.lang, load, built.stages, S.size, {
    staleHolidays: CAL.holidayCoverageEndsBefore(load[load.length - 1].to),
  });
}

const estimatorBody = () => `
    <div class="grid">
      <aside class="col">${teamsCard()}${pipelineCard()}</aside>
      <main class="col">${formCard()}${S.result ? resultCard() : emptyResult()}</main>
      <aside class="col">${utilCard()}${S.whatIf ? leversCard() : ''}</aside>
    </div>
    ${realWorkloadCard()}
    ${S.result ? timelineCard() : ''}`;

function headTitle(r) {
  const d = DSTR[S.lang];
  if (r.name === 'home')       return { h1: d.home, sub: d.homeSub };
  if (r.name === 'new')        return { h1: d.newProject, sub: '' };
  if (r.name === 'leads')      return { h1: d.leads, sub: d.leadsSub };
  if (r.name === 'docs')       return { h1: d.documents, sub: '' };
  if (r.name === 'admin')      return { h1: d.people, sub: d.peopleSub };
  if (r.name === 'signin')     return { h1: d.signIn, sub: '' };
  if (r.name === 'estimate')   return { h1: T().title, sub: T().sub };
  if (r.name === 'highlights') return { h1: d.highlights, sub: d.highlightsSub };
  if (r.name === 'projects')   return { h1: d.projects, sub: '' };
  return { h1: 'expand', sub: '' };
}

/* ------------------------------------------------------------------ icons
   Inline rather than a font or a sprite sheet: the whole product is one
   file, so a second request for six glyphs is a request too many. */
const ICON = {
  home:   'M3 10.5 12 3l9 7.5M5.5 9.5V21h13V9.5',
  plus:   'M12 5v14M5 12h14',
  users:  'M16 20v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20M9 10.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M22 20v-1.5a4 4 0 0 0-3-3.9M16 3.6a4 4 0 0 1 0 7.7',
  doc:    'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h4',
  team:   'M17 20v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M10 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M21 20v-2a4 4 0 0 0-3-3.9',
  chart:  'M4 20V10M10 20V4M16 20v-7M22 20H2',
  spark:  'M12 3v3M12 18v3M4.2 7.2l2.1 2.1M17.7 17.7l2.1 2.1M3 12h3M18 12h3M4.2 16.8l2.1-2.1M17.7 6.3l2.1-2.1',
  board:  'M4 4h6v7H4zM14 4h6v11h-6zM4 15h6v5H4zM14 19h6v1h-6z',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM21 21l-4.3-4.3',
};
const icon = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICON[n]}"/></svg>`;

/* Two navigations, because a signed-out visitor and a signed-in colleague
   want different things. The public one shows the product; the private one
   shows the work. Admin appears only for admins — a link that always 403s is
   worse than no link. */
/* There is no public nav any more. A signed-out visitor gets the sign-in
   card and a rail with nothing on it, because every screen this product has
   is about who works here and what they are working on. */
const PUBLIC_NAV = [];

function appNav() {
  const me = db.state.me, d = DSTR[S.lang];
  if (!me) return [];
  const items = [{ group: 'work', route: '#/home', icon: 'home', label: () => d.home }];
  /* Everyone gets Projects. What the company is building is not privileged
     information here — the read policy already lets any active user see it,
     and a designer who cannot find the project their stage belongs to is
     being kept from context rather than from data. Only the people who can
     actually create one see "New project"; a link that 403s is worse than
     no link. */
  items.push({ group: 'work', route: '#/projects', icon: 'board', label: () => d.projects });
  if (canPlan(me)) {
    items.push({ group: 'work', route: '#/new', icon: 'plus', label: () => d.newProject });
  }
  items.push({ group: 'work', route: '#/leads', icon: 'users', label: () => d.leads });
  items.push({ group: 'work', route: '#/docs',  icon: 'doc',   label: () => d.documents });
  /* Business highlights is a management screen — it names people and says how
     much each is carrying — so it is offered to the same people the database
     lets plan. A designer seeing their own name at the top of a workload
     chart is a different product decision from the one this makes. */
  if (canPlan(me)) {
    items.push({ group: 'insight', route: '#/highlights', icon: 'chart', label: () => d.highlights });
  }
  items.push({ group: 'insight', route: '#/estimate', icon: 'spark', label: () => d.openEstimator });
  if (me.role === 'admin') items.push({ group: 'workspace', route: '#/admin', icon: 'team', label: () => d.people });
  return items;
}

const GROUP_LABEL = {
  en: { product: 'Product', work: 'Work', insight: 'Insight', workspace: 'Workspace' },
  ar: { product: 'المنتج', work: 'العمل', insight: 'التحليل', workspace: 'مساحة العمل' },
};

/* The active item is the LONGEST matching route, not the first. With
   `startsWith`, `#/` matches everything and every row lights up at once. */
function isOn(route) {
  const h = location.hash || '#/';
  return h === route || h.startsWith(route + '/');
}

function sidebar() {
  const items = db.state.session ? appNav() : PUBLIC_NAV;
  const me = db.state.me;
  const groups = [];
  for (const it of items) {
    const g = groups.find(x => x.key === it.group);
    (g || (groups[groups.push({ key: it.group, items: [] }) - 1])).items.push(it);
  }

  return `
  <aside class="side">
    <button class="side__brand" data-act="go" data-route="#/" aria-label="expand — home">
      <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="7" cy="12" r="5.4" fill="none" stroke="var(--brand)" stroke-width="2.4"/>
        <rect x="4.4" y="10.6" width="5.2" height="2.8" fill="var(--s-1)"/>
        <circle cx="7" cy="12" r="1.6" fill="var(--brand)"/>
      </svg>
      <span class="wordmark">expand</span>
    </button>

    ${groups.map(g => `
      <div class="side__label">${esc(GROUP_LABEL[S.lang][g.key] || g.key)}</div>
      <nav class="side__nav">
        ${g.items.map(n => `
          <button class="navbtn${isOn(n.route) ? ' is-on' : ''}" data-act="go" data-route="${n.route}">
            ${icon(n.icon)}<span>${esc(n.label())}</span>
          </button>`).join('')}
      </nav>`).join('')}

    <div class="side__foot${me ? '' : ' side__foot--cta'}">
      ${me ? `
        <div class="mecard">
          <span class="ava">${esc((me.full_name || me.email || '?').trim().slice(0, 1).toUpperCase())}</span>
          <span class="mecard__t">
            <span class="mecard__n">${esc(me.full_name || me.email || '')}</span>
            <span class="mecard__r">${esc(me.role || '')}</span>
          </span>
        </div>`
      : `<button class="btn btn--primary" style="width:100%" data-act="go" data-route="#/signin">${esc(DSTR[S.lang].signIn)}</button>`}
    </div>
  </aside>`;
}

/* Only routes that actually render a filterable table get a search box. A
   search field that filters nothing is worse than no search field. */
const SEARCHABLE = ['home', 'leads', 'docs', 'admin'];

function topbar(r) {
  const { h1, sub } = headTitle(r);
  const d = DSTR[S.lang];
  return `
  <header class="head">
    <div class="headtext"><div class="h1">${esc(h1)}</div>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</div>
    ${SEARCHABLE.includes(r.name) ? `
    <div class="search">
      ${icon('search')}
      <input id="q" type="search" autocomplete="off" placeholder="${esc(d.searchPlaceholder)}" value="${esc(S.q)}" />
    </div>` : ''}
    <div class="head__actions">
      ${r.name === 'estimate' ? `<button class="btn btn--ghost" data-act="reset">${esc(T().reset)}</button>` : ''}
      ${db.state.session
        ? `<button class="btn btn--ghost" data-act="signout">${esc(d.signOut)}</button>`
        : `<button class="btn btn--primary btn--sm" data-act="go" data-route="#/signin">${esc(d.signIn)}</button>`}
      <button class="btn btn--lang" data-act="lang">${S.lang === 'en' ? 'العربية' : 'English'}</button>
    </div>
  </header>`;
}

const shell = (r, body) => sidebar() + `<div class="main">${topbar(r)}<div class="page">${body}</div></div>`;

function teamsCard() {
  return `
  <section class="card">
    <div class="card__h">${esc(T().teams)}</div>
    <div class="card__b stack">
      ${Object.keys(S.headcount).map(t => `
        <div class="row">
          <span class="dot" style="background:${TEAM_COLOR[t]}"></span>
          <span class="row__label">${esc(TEAM_LABEL[S.lang][t])}</span>
          <span class="row__meta">${(() => {
            /* The team's effort across the three sizes, not a single base
               figure — there is no longer any such thing. Read from the same
               table the engine schedules with, so this row and the date below
               it cannot disagree. */
            const d = DEFAULT_STAGES[t]?.days;
            if (!d) return '—';
            const lo = d.S, hi = d.L;
            return lo === hi ? `${lo}d` : `${lo}–${hi}d`;
          })()}</span>
          <div class="stepper">
            <button data-hc="${t}" data-d="-1" aria-label="minus">−</button>
            <b>${S.headcount[t]}</b>
            <button data-hc="${t}" data-d="1" aria-label="plus">+</button>
          </div>
        </div>`).join('')}
      <p class="hint">${S.lang === 'en'
        ? 'Base effort per stage at Medium size. Headcount is what turns effort into a date.'
        : 'الجهد الأساسي لكل مرحلة بحجم متوسط. عدد الأفراد هو ما يحوّل الجهد إلى تاريخ.'}</p>
    </div>
  </section>`;
}

function pipelineCard() {
  return `
  <section class="card">
    <div class="card__h">${esc(T().pipeline)}<span class="badge">${S.pipeline.length}</span></div>
    <div class="card__b stack">
      ${S.pipeline.length ? S.pipeline.map(p => `
        <div class="row row--proj">
          <span class="row__label">${esc(p.name)}</span>
          <span class="tag">${esc(T().sizes[p.size])}</span>
          <span class="row__meta">${fmtDate(p.start)}</span>
          <button class="x" data-del="${esc(p.id)}" aria-label="remove">×</button>
        </div>`).join('')
        : `<p class="hint">${esc(T().noProjects)}</p>`}
    </div>
  </section>`;
}

function formCard() {
  return `
  <section class="card card--form">
    <div class="card__h">${esc(T().newProposal)}</div>
    <div class="card__b">
      <div class="fields">
        <label class="f f--wide"><span>${esc(T().name)}</span>
          <input id="pName" value="Riyadh Expo pavilion" /></label>
        <label class="f"><span>${esc(T().size)}</span>
          <select id="pSize">${sizeOptionsHtml(S.lang, S.size, DEFAULT_STAGES)}</select></label>
        <label class="f"><span>${esc(T().start)}</span>
          <input id="pStart" type="date" value="${today()}" /></label>
        <label class="f"><span>${esc(T().deadline)}</span>
          <input id="pDeadline" type="date" /></label>
      </div>
      <div class="actions">
        <button class="btn btn--primary" data-act="estimate">${esc(T().estimate)}</button>
        <button class="btn" data-act="add">${esc(T().addPipeline)}</button>
      </div>
    </div>
  </section>`;
}

const emptyResult = () => `
  <section class="card card--empty">
    <div class="card__b empty">
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--ink3)" stroke-width="1.4">
        <rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>
      </svg>
      <p>${S.lang === 'en'
        ? 'Set your headcount, add a few live projects, then estimate. The more the team is committed, the further the two answers drift apart.'
        : 'حدّد عدد أفراد الفرق، أضف بعض المشاريع الجارية، ثم احسب. كلما زاد انشغال الفريق، اتسعت الفجوة بين الإجابتين.'}</p>
    </div>
  </section>`;

function resultCard() {
  const r = S.result;
  const naive = r._naive;
  const gap = r.leadWorkingDays - naive.leadWorkingDays;
  const workDays = r.leadWorkingDays - r.queueDays;
  const qPct = Math.round(r.queueShare * 100);

  return `
  <section class="card card--result">
    <div class="card__b">
      <div class="compare">
        <div class="compare__side compare__side--naive">
          <div class="compare__k">${esc(T().naive)}</div>
          <div class="compare__v">${fmtDate(naive.delivery)}</div>
          <div class="compare__n">${plural(naive.leadWorkingDays, T().day, T().days)} · ${esc(T().naiveNote)}</div>
        </div>
        <div class="compare__arrow">${gap > 0 ? `<b>+${plural(gap, T().day, T().days)}</b><span>${esc(T().later)}</span>` : '—'}</div>
        <div class="compare__side compare__side--real">
          <div class="compare__k">${esc(T().real)}</div>
          <div class="compare__v">${fmtDate(r.delivery)}</div>
          <div class="compare__n">${plural(r.leadWorkingDays, T().day, T().days)} · ${esc(T().realNote)}</div>
        </div>
      </div>

      ${r.deadline ? `
        <div class="deadline ${r.meetsDeadline ? 'ok' : 'bad'}">
          ${r.meetsDeadline
            ? `✓ ${esc(T().meets)} — ${plural(r.slackWorkingDays, T().day, T().days)} ${esc(T().slack)}`
            : `✕ ${esc(T().misses)} ${plural(r.overrunWorkingDays, T().day, T().days)}`}
        </div>` : ''}

      <div class="split" role="img" aria-label="queue versus work">
        <div class="split__bar">
          <span style="width:${qPct}%" class="split__q"></span>
          <span style="width:${100 - qPct}%" class="split__w"></span>
        </div>
        <div class="split__legend">
          <span><i class="sw sw--q"></i>${plural(r.queueDays, T().day, T().days)} ${esc(T().queue)}</span>
          <span><i class="sw sw--w"></i>${plural(workDays, T().day, T().days)} ${esc(T().work)}</span>
        </div>
      </div>

      <div class="facts">
        <div class="fact">
          <span class="fact__k">${esc(T().bottleneck)}</span>
          <span class="fact__v"><i class="dot" style="background:${TEAM_COLOR[r.bottleneck.team]}"></i>${esc(TEAM_LABEL[S.lang][r.bottleneck.team])}</span>
          <span class="fact__n">${esc(r.bottleneck.member)}</span>
        </div>
        <div class="fact">
          <span class="fact__k">${esc(T().confidence)}</span>
          <span class="fact__v conf conf--${r.confidence.level}">${esc(T().confLevel[r.confidence.level])}</span>
          <span class="fact__n">${esc(confNote(r.confidence.level))}</span>
        </div>
        <div class="fact">
          <span class="fact__k">${esc(T().effortNote)}</span>
          <span class="fact__v">${r.totalEffortDays}</span>
          <span class="fact__n">${r.stages.filter(x => !x.error).length} ${esc(T().stages)}</span>
        </div>
      </div>

      <div class="sec">${esc(T().breakdown)}</div>
      <table class="tbl">
        <thead><tr><th></th><th>${esc(T().name)}</th><th class="n">${esc(T().queue)}</th><th class="n">${esc(T().work)}</th><th class="n">${esc(T().start)}</th><th class="n">→</th></tr></thead>
        <tbody>${r.stages.map(s => s.error ? `
          <tr class="err"><td colspan="6">${esc(s.message)}</td></tr>` : `
          <tr${s.finish === r.delivery ? ' class="drive"' : ''}>
            <td><i class="dot" style="background:${TEAM_COLOR[s.team]}"></i></td>
            <td>${esc(TEAM_LABEL[S.lang][s.team])} <span class="who">${esc(s.memberName)}</span></td>
            <td class="n">${s.queueDays}</td>
            <td class="n">${s.effortDays}</td>
            <td class="n">${fmtDate(s.start)}</td>
            <td class="n">${fmtDate(s.finish)}</td>
          </tr>`).join('')}</tbody>
      </table>
    </div>
  </section>`;
}

function utilCard() {
  const s = loaded();
  const from = today();
  const to = iso(CAL.addWorkingDays(from, 20));
  const u = s.utilisation(from, to);
  return `
  <section class="card">
    <div class="card__h">${esc(T().utilisation)}<span class="card__sub">${esc(T().next20)}</span></div>
    <div class="card__b stack">
      ${Object.entries(u).map(([team, v]) => {
        const pct = Math.round(v.utilisation * 100);
        const hot = pct >= 95, warm = pct >= 75;
        return `
        <div class="util">
          <div class="util__h">
            <i class="dot" style="background:${TEAM_COLOR[team]}"></i>
            <span>${esc(TEAM_LABEL[S.lang][team])}</span>
            <span class="util__n">${plural(v.headcount, T().person, T().people)}</span>
            <b class="${hot ? 'hot' : warm ? 'warm' : ''}">${pct}%</b>
          </div>
          <div class="util__bar"><span style="width:${Math.min(pct, 100)}%;background:${
            hot ? 'var(--critical)' : warm ? 'var(--warn)' : TEAM_COLOR[team]}"></span></div>
        </div>`;
      }).join('')}
      <p class="hint">${S.lang === 'en'
        ? 'Above 95% a team has no absorption left — the next project queues behind everything.'
        : 'فوق ٩٥٪ لا يبقى للفريق أي فائض — المشروع التالي ينتظر خلف الجميع.'}</p>
    </div>
  </section>`;
}

function leversCard() {
  const { options } = S.whatIf;
  if (!options.length) return '';
  return `
  <section class="card">
    <div class="card__h">${esc(T().levers)}</div>
    <div class="card__b stack">
      ${options.map(o => `
        <div class="lever">
          <div class="lever__t">${esc(leverLabel(o))}</div>
          <div class="lever__v">${fmtDate(o.delivery)}
            <span class="lever__s">${esc(T().saves)} ${plural(o.savedWorkingDays, T().day, T().days)}</span></div>
        </div>`).join('')}
    </div>
  </section>`;
}

function timelineCard() {
  const s = S.result._sched;
  const rows = [...s.assignments].sort((a, b) => a.memberName.localeCompare(b.memberName));
  if (!rows.length) return '';

  const all = rows.flatMap(r => [r.start, r.finish]);
  const min = all.reduce((a, b) => (a < b ? a : b));
  const max = all.reduce((a, b) => (a > b ? a : b));
  const days = CAL.workingDaysBetween(min, max);
  const idx = new Map(days.map((d, i) => [d, i]));
  const W = Math.max(days.length, 1);

  const byMember = new Map();
  for (const r of rows) {
    if (!byMember.has(r.memberName)) byMember.set(r.memberName, []);
    byMember.get(r.memberName).push(r);
  }

  return `
  <section class="card card--wide">
    <div class="card__h">${esc(T().timeline)}<span class="card__sub">${days.length} ${esc(T().days)}</span></div>
    <div class="card__b">
      <div class="gantt" style="--cols:${W}">
        <div class="gantt__axis">
          ${days.map((d, i) => (i % Math.ceil(W / 12) === 0
            ? `<span style="grid-column:${i + 1}">${parse(d).getUTCDate()}/${parse(d).getUTCMonth() + 1}</span>` : '')).join('')}
        </div>
        ${[...byMember].map(([name, items]) => `
          <div class="gantt__row">
            <div class="gantt__name">${esc(name)}</div>
            <div class="gantt__track">
              ${items.map(it => {
                const a = idx.get(it.start) ?? 0;
                const b = idx.get(it.finish) ?? a;
                const isNew = it.projectId === S.result.id;
                return `<span class="bar${isNew ? ' bar--new' : ''}"
                  style="grid-column:${a + 1} / ${b + 2};background:${TEAM_COLOR[it.team]}"
                  title="${esc(it.projectName)} — ${esc(it.label)}">${esc(it.projectName)}</span>`;
              }).join('')}
            </div>
          </div>`).join('')}
      </div>
      <p class="hint">${S.lang === 'en'
        ? 'The outlined bar is the proposal you just estimated. Everything else is what the team is already committed to.'
        : 'الشريط المحدّد هو العرض الذي قدّرته للتو. الباقي هو ما التزم به الفريق بالفعل.'}</p>
    </div>
  </section>`;
}

/* ---------------------------------- wire --------------------------------- */

function wire() {
  document.querySelectorAll('[data-hc]').forEach(b => b.onclick = () => {
    const t = b.dataset.hc;
    S.headcount[t] = Math.max(0, Math.min(12, S.headcount[t] + Number(b.dataset.d)));
    if (S.result) estimate(false);
    render();
  });
  document.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
    S.pipeline = S.pipeline.filter(p => p.id !== b.dataset.del);
    if (S.result) estimate(false); else render();
  });
  document.querySelectorAll('[data-act="go"]').forEach(b => b.onclick = () => {
    location.hash = b.dataset.route;   // hashchange re-renders
  });
  /* The filter runs over the rendered rows rather than re-rendering the view.
     Re-rendering on every keystroke would rebuild the input the user is
     typing into and throw away the caret — the classic search box that eats
     the second character. This also means it works on every table without
     each view having to know about it. */
  const q = $('#q');
  if (q) {
    q.oninput = () => { S.q = q.value; applyFilter(); };
    applyFilter();
  }

  const act = (name, fn) => { const el = document.querySelector(`[data-act="${name}"]`); if (el) el.onclick = fn; };
  act('lang', () => { S.lang = S.lang === 'en' ? 'ar' : 'en'; render(); });
  act('signout', async () => { db.leavePresence(); await db.signOut(); location.hash = '#/'; render(); });
  act('reset', () => { S.pipeline = []; S.result = null; S.whatIf = null; S.seq = 0; render(); });
  const sizeSel = $('#pSize');
  if (sizeSel) sizeSel.onchange = () => {
    /* The calendar's answer is size-dependent — three free days is a slot for
       a Small project and not for a Large one — so the picker has to repaint
       it. Re-estimating too would be wrong: nobody asked for a new date. */
    S.size = sizeSel.value;
    if (S.result) estimate(false); else render();
  };
  act('estimate', () => estimate(true));
  act('add', () => {
    const f = readForm();
    S.pipeline.push({ id: `p${++S.seq}`, ...f });
    if (S.result) estimate(false); else render();
  });
}

/** Hide table rows that do not contain the query, and say so when none do. */
function applyFilter() {
  const needle = S.q.trim().toLowerCase();
  document.querySelectorAll('.tbl tbody').forEach(body => {
    let shown = 0;
    body.querySelectorAll('tr').forEach(tr => {
      if (tr.dataset.empty) return;
      const hit = !needle || tr.textContent.toLowerCase().includes(needle);
      // Record WHY a row is hidden so the chip filter and the search box can
      // both hide rows without either one un-hiding the other's.
      tr.dataset.searchHidden = hit ? '' : '1';
      tr.hidden = !hit || tr.dataset.chipHidden === '1';
      if (hit) shown++;
    });
    // One "nothing matched" row per table, created once and reused, so
    // repeated typing cannot stack up placeholder rows.
    let none = body.querySelector('tr[data-empty]');
    if (!none) {
      none = document.createElement('tr');
      none.dataset.empty = '1';
      none.innerHTML = `<td class="tbl__empty" colspan="9"></td>`;
      body.appendChild(none);
    }
    none.firstElementChild.textContent =
      S.lang === 'ar' ? `لا نتائج لـ "${S.q}"` : `Nothing matches “${S.q}”`;
    none.hidden = shown > 0 || !needle;
  });
}

const readForm = () => ({
  name: ($('#pName')?.value || 'Untitled').trim(),
  size: (S.size = $('#pSize')?.value || S.size),
  start: $('#pStart')?.value || today(),
  deadline: $('#pDeadline')?.value || null,
});

function estimate(fromForm) {
  const f = fromForm ? readForm() : (S.result?._form || readForm());
  const sched = loaded();
  const r = sched.scheduleProject({
    id: '__new__', name: f.name, size: f.size,
    earliestStart: f.start, deadline: f.deadline || null,
  });

  // The naive answer, computed the way a spreadsheet would: an empty team.
  const naive = new Scheduler({ members: members(), calendar: CAL })
    .scheduleProject({ id: 'n', name: f.name, size: f.size, earliestStart: f.start, commit: false });

  r._naive = naive;
  r._sched = sched;
  r._form = f;
  S.result = r;
  S.whatIf = loaded().whatIf({ id: '__new__', name: f.name, size: f.size, earliestStart: f.start });
  render();
}

/* --------------------------------- seed ---------------------------------- */

(function seed() {
  const start = today();
  const demo = [
    ['Jeddah Season stand', 'L'], ['LEAP tech booth', 'M'],
    ['Ministry pavilion', 'L'], ['Retail activation', 'S'],
  ];
  for (const [name, size] of demo) S.pipeline.push({ id: `p${++S.seq}`, name, size, start });

  C.bindRender(() => render());

  /* Data is fetched for the route BEFORE painting it, so a dashboard never
     flashes empty and then fills — which reads as "you have no work" for the
     half-second it takes to find out you do. */
  const go = async () => {
    scrollTo(0, 0);
    /* Check on EVERY navigation, not only at boot: someone already on the
       site who taps the link in their email arrives by hash change, and the
       app would otherwise route a `#error=...` fragment to the landing page
       and explain nothing. */
    const urlErr = db.takeAuthErrorFromUrl?.();
    if (urlErr) { C.ctx.authErr = urlErr; C.ctx.authMode = 'in'; }
    render();                       // paint the shell immediately
    const r = currentRoute();
    if (APP_ROUTES.includes(r.name) && db.state.session) {
      await C.loadFor(r.name, r.id);
      render();
    }
  };

  addEventListener('hashchange', go);

  if (db.sb) {
    /* Read any auth failure out of the fragment BEFORE the router sees it —
       an `#error=...` fragment is not a route, and left in place it renders
       the landing page while the user waits for an explanation. */
    db.onAuthChange((event) => {
      // A recovery link signs the user in with the sole purpose of letting
      // them set a new password. Send them to that screen rather than a
      // dashboard they cannot get back into next time.
      if (event === 'PASSWORD_RECOVERY') {
        C.ctx.authMode = 'reset';
        location.hash = '#/reset';
      }
      render();
    });

    /* Paint BEFORE asking Supabase anything.

       Waiting on loadSession() first means a slow or unreachable network
       shows a blank page for as long as that call takes to settle — and the
       one moment a user is most likely to be on a bad connection is when
       they have just tapped a link in an email. The shell is renderable from
       local state alone, so render it, then reconcile. */
    render();
    db.loadSession().then(async (session) => {
      /* Join the presence channel as soon as there is a session, on EVERY
         screen — not just the admin one. Presence only knows about people who
         joined it, so if a designer never opened the People tab they would
         never appear online to the admin who did. */
      if (session) {
        db.joinPresence();
        // A repaint when somebody arrives or leaves, but only where it shows.
        db.onOnlineChange(() => { if (currentRoute().name === 'admin') render(); });
      }
      await go();
    }).catch(() => go());
  } else {
    render();
  }
})();

export { S, estimate };
