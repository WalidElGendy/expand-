/* ==========================================================================
   Delivery estimator — interactive proof of the scheduling engine.

   This is not the CRM. It is the one screen that has to be right before the
   CRM is worth building: given who is on each team and what they are already
   committed to, when can a new proposal actually be delivered.

   It deliberately shows the naive answer next to the real one, because the
   gap between them is the whole reason the tool exists.
   ========================================================================== */

import { Scheduler, calibrate, backtest, DEFAULT_STAGES, DEFAULT_SIZE_FACTORS } from '../engine/scheduler.js';
import { WorkCalendar, iso, parse } from '../engine/calendar.js';

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
    sizes: { S: 'Small', M: 'Medium', L: 'Large', XL: 'Very large' },
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
    sizes: { S: 'صغير', M: 'متوسط', L: 'كبير', XL: 'كبير جداً' },
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
  headcount: { '3d': 2, '2d': 2, content: 1 },
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

function render() {
  document.documentElement.lang = S.lang;
  document.documentElement.dir = S.lang === 'ar' ? 'rtl' : 'ltr';
  $('#root').innerHTML = `
    ${header()}
    <div class="grid">
      <aside class="col">${teamsCard()}${pipelineCard()}</aside>
      <main class="col">${formCard()}${S.result ? resultCard() : emptyResult()}</main>
      <aside class="col">${utilCard()}${S.whatIf ? leversCard() : ''}</aside>
    </div>
    ${S.result ? timelineCard() : ''}`;
  wire();
}

const header = () => `
  <header class="head">
    <div class="brand">
      <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="7" cy="12" r="5.4" fill="none" stroke="var(--brand)" stroke-width="2.4"/>
        <rect x="4.4" y="10.6" width="5.2" height="2.8" fill="var(--bg)"/>
        <circle cx="7" cy="12" r="1.6" fill="var(--brand)"/>
      </svg>
      <span class="wordmark">expand</span>
      <span class="sep"></span>
      <div><div class="h1">${esc(T().title)}</div><div class="sub">${esc(T().sub)}</div></div>
    </div>
    <div class="head__actions">
      <button class="btn btn--ghost" data-act="reset">${esc(T().reset)}</button>
      <button class="btn btn--lang" data-act="lang">${S.lang === 'en' ? 'العربية' : 'English'}</button>
    </div>
  </header>`;

function teamsCard() {
  return `
  <section class="card">
    <div class="card__h">${esc(T().teams)}</div>
    <div class="card__b stack">
      ${Object.keys(S.headcount).map(t => `
        <div class="row">
          <span class="dot" style="background:${TEAM_COLOR[t]}"></span>
          <span class="row__label">${esc(TEAM_LABEL[S.lang][t])}</span>
          <span class="row__meta">${DEFAULT_STAGES[t].baseDays}d</span>
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
          <select id="pSize">${Object.keys(DEFAULT_SIZE_FACTORS).map(k =>
            `<option value="${k}"${k === 'M' ? ' selected' : ''}>${esc(T().sizes[k])} ×${DEFAULT_SIZE_FACTORS[k]}</option>`).join('')}</select></label>
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
  const act = (name, fn) => { const el = document.querySelector(`[data-act="${name}"]`); if (el) el.onclick = fn; };
  act('lang', () => { S.lang = S.lang === 'en' ? 'ar' : 'en'; render(); });
  act('reset', () => { S.pipeline = []; S.result = null; S.whatIf = null; S.seq = 0; render(); });
  act('estimate', () => estimate(true));
  act('add', () => {
    const f = readForm();
    S.pipeline.push({ id: `p${++S.seq}`, ...f });
    if (S.result) estimate(false); else render();
  });
}

const readForm = () => ({
  name: ($('#pName')?.value || 'Untitled').trim(),
  size: $('#pSize')?.value || 'M',
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
    ['Ministry pavilion', 'XL'], ['Retail activation', 'S'],
  ];
  for (const [name, size] of demo) S.pipeline.push({ id: `p${++S.seq}`, name, size, start });
  render();
})();

export { S, estimate };
