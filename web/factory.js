/* ==========================================================================
   Insights → Factory production. Two tabs:

     Production    every project the factory is building or about to build:
                   its phase (upcoming → procurement → manufacturing → ready →
                   delivered), the production team, the site delivery date and
                   how much of its shopping list is bought.
     Procurement   every item on every project's list: what is bought, what
                   is not, and what needs somebody to chase it.

   Pure views over ctx (factoryctl.js loads and wires). Everyone signed in can
   read; the production team, planners and leads can change statuses and
   dates (can_edit_production() in the database).
   ========================================================================== */

import { esc, fmt, statusPill, procStatusPill, canEditProduction, DSTR } from './dash.js';
import * as F from './factorylogic.js';

export const FSTR = {
  en: {
    nav: 'Factory production', title: 'Factory production',
    sub: 'What the factory is building, when it delivers, and what is still to buy.',
    tabs: { prod: 'Production', proc: 'Procurement' },
    phase: { upcoming: 'Upcoming', procure: 'Procurement', making: 'Manufacturing', ready: 'Ready to deliver', delivered: 'Delivered' },
    phaseHint: { upcoming: 'has a production stage, not won yet', procure: 'won, buying materials', making: 'on the factory floor', ready: 'production done, waiting for site', delivered: 'in the last 60 days' },
    k: { active: 'In production', activeSub: 'procurement, manufacturing or ready', soon: 'Delivering in 14 days', late: 'Past delivery date', upcoming: 'Coming up', upcomingSub: 'still being bid', delivered: 'Delivered (30 days)', noDate: '{n} without a delivery date' },
    pk: { total: 'Items', done: 'Bought', inProcess: 'In process', pending: 'Pending', follow: 'Need follow-up', pct: '{p}% of the list bought' },
    flow: 'Production phases', list: 'Production & delivery', items: 'Purchased items',
    col: { project: 'Project', client: 'Client', pm: 'Project manager', phase: 'Phase', team: 'Production team', delivery: 'Delivery to site', left: 'Days left', proc: 'Procurement', schedule: 'Schedule notes',
      item: 'Item', desc: 'Description', status: 'Status', why: 'Follow-up', updated: 'Last update' },
    src: { site: 'site date set by production', estimate: 'estimated delivery', deadline: 'project deadline' },
    all: 'All', search: 'Search project, client or person…', searchItems: 'Search item or project…',
    show: { all: 'All items', follow: 'Need follow-up', open: 'Not done', done: 'Done' },
    anyProject: 'All projects', addItem: 'Add item', addTo: 'Project', itemName: 'What needs buying', add: 'Add',
    follow: { notAvailable: 'Not available — find another supplier', expensive: 'Over budget — needs a decision', late: 'Delivery passed {n} days ago', soon: 'Delivery in {n} days', stale: 'No update for {n} days' },
    left: { late: '{n} late', today: 'today', in: '{n}' }, days: 'days',
    unassigned: 'Unassigned', noStage: 'No production stage', open: 'Open project', none: '—',
    emptyProd: 'No project is in production yet. Projects appear here when they are won, or as soon as a production stage is added to them.',
    emptyProc: 'No purchased items yet. Add items here or on a project’s Procurement section once it is won.',
    noMatch: 'Nothing matches these filters.', readOnly: 'Only the production team, planners and leads can change statuses and dates.',
    of: '{d} of {n}', export: 'Export Excel', exporting: 'Preparing…', saved: 'Saved',
  },
  ar: {
    nav: 'إنتاج المصنع', title: 'إنتاج المصنع',
    sub: 'ما ينتجه المصنع، ومتى يسلّم، وما بقي شراؤه.',
    tabs: { prod: 'الإنتاج', proc: 'المشتريات' },
    phase: { upcoming: 'قادم', procure: 'المشتريات', making: 'التصنيع', ready: 'جاهز للتسليم', delivered: 'تم التسليم' },
    phaseHint: { upcoming: 'له مرحلة إنتاج ولم يُرسَ بعد', procure: 'تمت الترسية، جارٍ شراء المواد', making: 'في خط التصنيع', ready: 'انتهى الإنتاج، بانتظار الموقع', delivered: 'خلال آخر 60 يوماً' },
    k: { active: 'قيد الإنتاج', activeSub: 'مشتريات أو تصنيع أو جاهز', soon: 'تسليم خلال 14 يوماً', late: 'تجاوز موعد التسليم', upcoming: 'قادمة', upcomingSub: 'ما زالت في مرحلة العرض', delivered: 'سُلّمت (30 يوماً)', noDate: '{n} بلا موعد تسليم' },
    pk: { total: 'البنود', done: 'تم شراؤها', inProcess: 'قيد التنفيذ', pending: 'قيد الانتظار', follow: 'تحتاج متابعة', pct: 'تم شراء {p}% من القائمة' },
    flow: 'مراحل الإنتاج', list: 'الإنتاج والتسليم', items: 'بنود المشتريات',
    col: { project: 'المشروع', client: 'العميل', pm: 'مدير المشروع', phase: 'المرحلة', team: 'فريق الإنتاج', delivery: 'التسليم للموقع', left: 'الأيام المتبقية', proc: 'المشتريات', schedule: 'ملاحظات الجدول',
      item: 'البند', desc: 'الوصف', status: 'الحالة', why: 'المتابعة', updated: 'آخر تحديث' },
    src: { site: 'موعد الموقع من الإنتاج', estimate: 'التسليم المتوقع', deadline: 'الموعد النهائي للمشروع' },
    all: 'الكل', search: 'ابحث عن مشروع أو عميل أو شخص…', searchItems: 'ابحث عن بند أو مشروع…',
    show: { all: 'كل البنود', follow: 'تحتاج متابعة', open: 'غير منجزة', done: 'منجزة' },
    anyProject: 'كل المشاريع', addItem: 'إضافة بند', addTo: 'المشروع', itemName: 'ما المطلوب شراؤه', add: 'إضافة',
    follow: { notAvailable: 'غير متوفر — ابحث عن مورد آخر', expensive: 'أعلى من الميزانية — يحتاج قراراً', late: 'تجاوز موعد التسليم بـ {n} يوم', soon: 'التسليم بعد {n} يوم', stale: 'بلا تحديث منذ {n} يوم' },
    left: { late: 'متأخر {n}', today: 'اليوم', in: '{n}' }, days: 'يوم',
    unassigned: 'غير مسند', noStage: 'بلا مرحلة إنتاج', open: 'فتح المشروع', none: '—',
    emptyProd: 'لا يوجد مشروع في الإنتاج بعد. تظهر المشاريع هنا عند ترسيتها، أو بمجرد إضافة مرحلة إنتاج لها.',
    emptyProc: 'لا توجد بنود مشتريات بعد. أضف البنود هنا أو في قسم المشتريات بالمشروع بعد ترسيته.',
    noMatch: 'لا شيء يطابق هذه التصفية.', readOnly: 'يمكن لفريق الإنتاج والمخططين والقادة فقط تغيير الحالات والمواعيد.',
    of: '{d} من {n}', export: 'تصدير Excel', exporting: 'جارٍ التجهيز…', saved: 'تم الحفظ',
  },
};

const fill = (s, o) => Object.entries(o).reduce((a, [k, v]) => a.replaceAll(`{${k}}`, v), String(s));
const PHASE_C = { upcoming: 'var(--ink3)', procure: 'var(--warn)', making: 'var(--info)', ready: 'var(--s1, var(--brand))', delivered: 'var(--ok)' };
const STAGE_ST = { en: { pending: 'Pending', in_progress: 'In progress', blocked: 'Blocked', done: 'Done' },
  ar: { pending: 'قيد الانتظار', in_progress: 'قيد التنفيذ', blocked: 'متوقفة', done: 'منجزة' } };

export const localToday = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export function factoryState(ctx) {
  return F.factoryData({ projects: ctx.fProjects || [], items: ctx.fItems || [], production: ctx.fProd || [] }, ctx.fToday || localToday());
}

const kpi = (n, label, { sub = '', colour = '', bad = false } = {}) => `<div class="kpi${bad ? ' kpi--bad' : ''}">
  <span class="kpi__l">${colour ? `<i style="--c:${colour}"></i>` : ''}${esc(label)}</span>
  <span class="kpi__n">${n}</span>${sub ? `<span class="kpi__s">${esc(sub)}</span>` : ''}</div>`;

function tabs(lang, on) {
  const t = FSTR[lang];
  return `<nav class="hrtabs">${[['prod', '#/factory'], ['proc', '#/factory/procurement']].map(([k, r]) =>
    `<button class="hrtab${k === on ? ' is-on' : ''}" data-act="go" data-route="${r}">${esc(t.tabs[k])}</button>`).join('')}
  <button class="btn btn--sm" style="margin-inline-start:auto" data-fx-xlsx>${esc(t.export)}</button></nav>`;
}

/* Five dots on a line, filled up to the project's phase. The label says the
   phase in words, so the colour is never the only thing carrying it. */
function stepper(lang, phase) {
  const t = FSTR[lang];
  const at = F.PHASES.indexOf(phase);
  return `<span class="fstep" title="${esc(t.phase[phase])}">
    <span class="fstep__dots">${F.PHASES.map((k, i) => `<i class="${i < at ? 'is-past' : i === at ? 'is-on' : ''}" style="--c:${PHASE_C[phase]}"></i>`).join('')}</span>
    <span class="fstep__l">${esc(t.phase[phase])}</span></span>`;
}

function leftCell(lang, r) {
  const t = FSTR[lang];
  if (r.phase === 'delivered') return `<td class="num muted">${esc(fmt(r.project.delivered_on, lang) || '—')}</td>`;
  if (r.left === null) return `<td class="num muted">—</td>`;
  if (r.left < 0) return `<td class="num bad">${esc(fill(t.left.late, { n: -r.left }))}</td>`;
  if (r.left === 0) return `<td class="num warn">${esc(t.left.today)}</td>`;
  return `<td class="num${r.left <= F.SOON_DAYS ? ' warn' : ''}">${r.left}</td>`;
}

function procCell(lang, r) {
  const t = FSTR[lang];
  const n = r.items.length;
  if (!n) return `<td class="muted small">—</td>`;
  const pct = Math.round(r.itemsDone / n * 100);
  return `<td><span class="fprog" title="${esc(fill(t.of, { d: r.itemsDone, n }))}">
    <span class="fprog__track"><span class="fprog__fill" style="width:${pct}%"></span></span>
    <span class="fprog__n">${r.itemsDone}/${n}</span></span>
    ${r.itemsFollow ? `<button class="chip chip--warn chip--btn fchip" data-fp-project="${esc(r.project.id)}">${esc(t.pk.follow)} ${r.itemsFollow}</button>` : ''}</td>`;
}

/* ------------------------------------------------------------ Production */

export function factoryProductionView(lang, ctx) {
  const t = FSTR[lang];
  const D = factoryState(ctx);
  const edit = canEditProduction();
  const f = ctx.fpf || {};
  const rows = F.filterRows(D.rows, f);

  const flow = `<div class="fflow">${F.PHASES.map(k => `
    <button class="fflow__c${f.phase === k ? ' is-on' : ''}" data-fp-phase="${k}" style="--c:${PHASE_C[k]}">
      <span class="fflow__n">${D.phaseCount[k]}</span>
      <span class="fflow__l"><i></i>${esc(t.phase[k])}</span>
      <span class="fflow__s">${esc(t.phaseHint[k])}</span>
    </button>`).join('')}</div>`;

  const team = (r) => {
    if (!r.stage) return `<span class="muted small">${esc(t.noStage)}</span>`;
    const people = (r.stage.members || []).map(m => m.profile?.full_name).filter(Boolean);
    if (!people.length && r.stage.assignee?.full_name) people.push(r.stage.assignee.full_name);
    return `<span class="small ${people.length ? '' : 'muted'}">${esc(people.join(', ') || t.unassigned)}</span>
      <span class="st block" style="--c:${({ pending: 'var(--ink3)', in_progress: 'var(--info)', blocked: 'var(--critical)', done: 'var(--ok)' })[r.stage.status] || 'var(--ink3)'}"><i></i>${esc(STAGE_ST[lang][r.stage.status] || r.stage.status)}</span>`;
  };

  const deliveryCell = (r) => {
    const src = r.delivery.src ? `<span class="block small muted">${esc(t.src[r.delivery.src])}</span>` : '';
    if (edit && r.phase !== 'delivered') {
      return `<td><input type="date" class="cellinput fdate" data-fd-date="${esc(r.project.id)}" value="${esc(r.prod?.site_delivery_on || '')}"
        aria-label="${esc(t.col.delivery)}: ${esc(r.project.name)}" />${r.delivery.src && r.delivery.src !== 'site' ? `<span class="block small muted">${esc(t.src[r.delivery.src])}: ${esc(fmt(r.delivery.on, lang))}</span>` : ''}</td>`;
    }
    return `<td class="num">${esc(r.delivery.on ? fmt(r.delivery.on, lang) : '—')}${src}</td>`;
  };

  const body = rows.length ? rows.map(r => `<tr>
      <td><button class="link" data-act="go" data-route="#/p/${esc(r.project.id)}">${esc(r.project.name)}</button>
        <span class="block small muted">${esc(r.project.client || r.project.lead?.company || '')}</span></td>
      <td class="small ${r.project.owner ? '' : 'muted'}">${esc(r.project.owner?.full_name || t.unassigned)}</td>
      <td>${stepper(lang, r.phase)}<span class="block" style="margin-top:4px">${statusPill(r.project.status, lang)}</span></td>
      <td>${team(r)}</td>
      ${deliveryCell(r)}
      ${leftCell(lang, r)}
      ${procCell(lang, r)}
      <td class="small fsched ${r.prod?.schedule ? '' : 'muted'}" title="${esc(r.prod?.schedule || '')}">${esc(r.prod?.schedule || '—')}</td>
    </tr>`).join('')
    : `<tr><td class="tbl__empty" colspan="8">${esc(D.rows.length ? t.noMatch : t.emptyProd)}</td></tr>`;

  return `
${tabs(lang, 'prod')}
<div class="kpis kpis--5">
  ${kpi(D.kpi.active, t.k.active, { colour: 'var(--info)', sub: D.kpi.noDate ? fill(t.k.noDate, { n: D.kpi.noDate }) : t.k.activeSub })}
  ${kpi(D.kpi.soon, t.k.soon, { colour: 'var(--warn)' })}
  ${kpi(D.kpi.late, t.k.late, { colour: 'var(--critical)', bad: D.kpi.late > 0 })}
  ${kpi(D.kpi.upcoming, t.k.upcoming, { colour: 'var(--ink3)', sub: t.k.upcomingSub })}
  ${kpi(D.proc.follow, t.pk.follow, { colour: 'var(--warn)', bad: D.proc.follow > 0, sub: D.proc.pct === null ? '' : fill(t.pk.pct, { p: D.proc.pct }) })}
</div>
<section class="card">
  <div class="card__head"><h2>${esc(t.flow)}</h2>
    ${f.phase ? `<button class="link small" style="margin-inline-start:auto" data-fp-phase="">${esc(t.all)}</button>` : ''}</div>
  ${flow}
</section>
<section class="card">
  <div class="card__head"><h2>${esc(t.list)}</h2><span class="muted small">${rows.length}</span>
    <input class="cellinput" data-fp-q value="${esc(f.q || '')}" placeholder="${esc(t.search)}" style="margin-inline-start:auto;max-width:280px" /></div>
  <div class="tblwrap"><table class="tbl tbl--tight ftbl">
    <thead><tr><th>${esc(t.col.project)}</th><th>${esc(t.col.pm)}</th><th>${esc(t.col.phase)}</th><th>${esc(t.col.team)}</th>
      <th>${esc(t.col.delivery)}</th><th class="num">${esc(t.col.left)}</th><th>${esc(t.col.proc)}</th><th>${esc(t.col.schedule)}</th></tr></thead>
    <tbody>${body}</tbody>
  </table></div>
  ${edit ? '' : `<p class="note">${esc(t.readOnly)}</p>`}
</section>`;
}

/* ----------------------------------------------------------- Procurement */

export function factoryProcurementView(lang, ctx) {
  const t = FSTR[lang], d = DSTR[lang];
  const D = factoryState(ctx);
  const edit = canEditProduction();
  const f = { show: 'all', project: '', q: '', ...(ctx.fif || {}) };
  const items = F.filterItems(D.items, f);
  const projects = [...new Map(D.items.filter(i => i.project).map(i => [i.project_id, i.project])).values()]
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const addable = D.rows.filter(r => r.phase !== 'delivered').map(r => r.project);
  const counts = { all: D.items.length, follow: D.proc.follow, open: D.proc.open, done: D.proc.done };

  const statusCell = (it) => edit
    ? `<select class="procsel" data-fp-status="${esc(it.id)}" aria-label="${esc(t.col.status)}: ${esc(it.name || '')}">
        ${F.PROC_STATUS.map(s => `<option value="${s}"${s === it.status ? ' selected' : ''}>${esc(d.procSt[s])}</option>`).join('')}</select>`
    : procStatusPill(it.status, lang);
  const why = (it) => it.follow
    ? `<span class="fwhy fwhy--${it.follow.code}">${esc(fill(t.follow[it.follow.code], { n: it.follow.n ?? '' }))}</span>`
    : (it.status === 'done' ? `<span class="good small">✓</span>` : '<span class="muted">—</span>');

  const body = items.length ? items.map(it => `<tr${it.follow ? ' class="frow--follow"' : ''}>
      <td><strong>${esc(it.name || '—')}</strong>${it.description ? `<span class="block small muted">${esc(it.description)}</span>` : ''}</td>
      <td>${it.project ? `<button class="link" data-act="go" data-route="#/p/${esc(it.project.id)}">${esc(it.project.name)}</button>` : '<span class="muted">—</span>'}</td>
      <td>${statusCell(it)}</td>
      <td>${why(it)}</td>
      <td class="num">${esc(it.deliveryOn ? fmt(it.deliveryOn, lang) : '—')}</td>
      <td class="num small muted">${esc(fmt(String(it.updated_at || it.created_at || '').slice(0, 10), lang) || '—')}</td>
    </tr>`).join('')
    : `<tr><td class="tbl__empty" colspan="6">${esc(D.items.length ? t.noMatch : t.emptyProc)}</td></tr>`;

  return `
${tabs(lang, 'proc')}
<div class="kpis kpis--5">
  ${kpi(D.proc.total, t.pk.total, { colour: 'var(--brand)', sub: D.proc.pct === null ? '' : fill(t.pk.pct, { p: D.proc.pct }) })}
  ${kpi(D.proc.done, t.pk.done, { colour: 'var(--ok)' })}
  ${kpi(D.proc.inProcess, t.pk.inProcess, { colour: 'var(--info)' })}
  ${kpi(D.proc.pending, t.pk.pending, { colour: 'var(--ink3)' })}
  ${kpi(D.proc.follow, t.pk.follow, { colour: 'var(--warn)', bad: D.proc.follow > 0 })}
</div>
<section class="card">
  <div class="card__head"><h2>${esc(t.items)}</h2><span class="muted small">${items.length}</span>
    <select class="cellinput" data-fi-project style="margin-inline-start:auto;max-width:260px" aria-label="${esc(t.addTo)}">
      <option value="">${esc(t.anyProject)}</option>
      ${projects.map(p => `<option value="${esc(p.id)}"${p.id === f.project ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}
    </select>
    <input class="cellinput" data-fi-q value="${esc(f.q)}" placeholder="${esc(t.searchItems)}" style="max-width:240px" /></div>
  <div class="chipbar">${Object.keys(t.show).map(k =>
    `<button class="chip chip--btn${f.show === k ? ' is-on' : ''}${k === 'follow' && counts.follow ? ' chip--warn' : ''}" data-fi-show="${k}">${esc(t.show[k])} ${counts[k]}</button>`).join('')}</div>
  <div class="tblwrap"><table class="tbl tbl--tight ftbl">
    <thead><tr><th>${esc(t.col.item)}</th><th>${esc(t.col.project)}</th><th>${esc(t.col.status)}</th><th>${esc(t.col.why)}</th>
      <th class="num">${esc(t.col.delivery)}</th><th class="num">${esc(t.col.updated)}</th></tr></thead>
    <tbody>${body}</tbody>
  </table></div>
  ${edit && addable.length ? `<form class="inlineform faddform" data-fi-add style="border-bottom:0">
    <div class="fields">
      <label class="f"><span>${esc(t.addTo)}</span><select id="fiProject" required>
        ${addable.map(p => `<option value="${esc(p.id)}"${p.id === f.project ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
      <label class="f"><span>${esc(t.itemName)}</span><input id="fiName" required maxlength="200" /></label>
    </div>
    <div class="actions"><button type="submit" class="btn btn--primary btn--sm">${esc(t.add)}</button></div>
  </form>` : ''}
  ${edit ? '' : `<p class="note">${esc(t.readOnly)}</p>`}
</section>`;
}
