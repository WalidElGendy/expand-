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

import { esc, fmt, statusPill, procStatusPill, canEditProduction, DSTR, sarFmt } from './dash.js';
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
      item: 'Item', desc: 'Description', status: 'Status', why: 'Follow-up', updated: 'Last update', qty: 'Qty', need: 'Needed by', sup: 'Suppliers' },
    src: { site: 'site date set by production', estimate: 'estimated delivery', deadline: 'project deadline' },
    all: 'All', search: 'Search project, client or person…', searchItems: 'Search item or project…',
    show: { all: 'All items', follow: 'Need follow-up', open: 'Not done', done: 'Done' },
    anyProject: 'All projects', addItem: 'Add item', addTo: 'Project', itemName: 'What needs buying', add: 'Add',
    follow: { notAvailable: 'Not available — find another supplier', expensive: 'Over budget — needs a decision', late: 'Delivery passed {n} days ago', soon: 'Delivery in {n} days', stale: 'No update for {n} days',
      needLate: 'Was needed {n} days ago', needSoon: 'Needed in {n} days' },
    req: { title: 'New purchase request', qty: 'Quantity', unit: 'Unit', unitHint: 'pcs, m², set…', needBy: 'Needed by',
      spec: 'Specifications', specHint: 'Size, material, colour, brand or model — what a supplier needs to quote',
      photos: 'Reference photos', photosHint: 'Photos or a PDF of what is needed', addPhotos: '+ Add photos', noPhotos: 'No reference photo yet.',
      suppliers: 'Suppliers', suppliersOpt: 'Suppliers (if already known)', supName: 'Supplier', supContact: 'Phone or email', supPrice: 'Unit price (SAR)',
      supNote: 'Note', supTotal: 'Total (SAR)', addSup: '+ Another supplier', addSupRow: '+ Add supplier', noSup: 'No supplier yet.', lowest: 'Lowest',
      send: 'Send request', sending: 'Sending…', details: 'Details', hide: 'Hide', by: 'Requested by {who} · {d}',
      quotes: '{n} quotes', quote1: '1 quote', best: 'from {p}', unquoted: '{n} without price', delPhoto: 'Remove this photo?', delSup: 'Remove this supplier?',
      site: 'site date', badQty: 'Quantity must be more than zero.', badPrice: 'Prices must be numbers of zero or more.' },
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
      item: 'البند', desc: 'الوصف', status: 'الحالة', why: 'المتابعة', updated: 'آخر تحديث', qty: 'الكمية', need: 'مطلوب بتاريخ', sup: 'الموردون' },
    src: { site: 'موعد الموقع من الإنتاج', estimate: 'التسليم المتوقع', deadline: 'الموعد النهائي للمشروع' },
    all: 'الكل', search: 'ابحث عن مشروع أو عميل أو شخص…', searchItems: 'ابحث عن بند أو مشروع…',
    show: { all: 'كل البنود', follow: 'تحتاج متابعة', open: 'غير منجزة', done: 'منجزة' },
    anyProject: 'كل المشاريع', addItem: 'إضافة بند', addTo: 'المشروع', itemName: 'ما المطلوب شراؤه', add: 'إضافة',
    follow: { notAvailable: 'غير متوفر — ابحث عن مورد آخر', expensive: 'أعلى من الميزانية — يحتاج قراراً', late: 'تجاوز موعد التسليم بـ {n} يوم', soon: 'التسليم بعد {n} يوم', stale: 'بلا تحديث منذ {n} يوم',
      needLate: 'كان مطلوباً قبل {n} يوم', needSoon: 'مطلوب خلال {n} يوم' },
    req: { title: 'طلب شراء جديد', qty: 'الكمية', unit: 'الوحدة', unitHint: 'حبة، م²، طقم…', needBy: 'مطلوب بتاريخ',
      spec: 'المواصفات', specHint: 'المقاس والخامة واللون والعلامة أو الموديل — ما يحتاجه المورد لتقديم السعر',
      photos: 'صور مرجعية', photosHint: 'صور أو ملف PDF لما هو مطلوب', addPhotos: '+ إضافة صور', noPhotos: 'لا توجد صورة مرجعية بعد.',
      suppliers: 'الموردون', suppliersOpt: 'الموردون (إن وُجدوا)', supName: 'المورد', supContact: 'الجوال أو البريد', supPrice: 'سعر الوحدة (ر.س)',
      supNote: 'ملاحظة', supTotal: 'الإجمالي (ر.س)', addSup: '+ مورد آخر', addSupRow: '+ إضافة مورد', noSup: 'لا يوجد مورد بعد.', lowest: 'الأقل',
      send: 'إرسال الطلب', sending: 'جارٍ الإرسال…', details: 'التفاصيل', hide: 'إخفاء', by: 'طلبه {who} · {d}',
      quotes: '{n} عروض', quote1: 'عرض واحد', best: 'من {p}', unquoted: '{n} بلا سعر', delPhoto: 'حذف هذه الصورة؟', delSup: 'حذف هذا المورد؟',
      site: 'موعد الموقع', badQty: 'يجب أن تكون الكمية أكبر من صفر.', badPrice: 'الأسعار يجب أن تكون أرقاماً صفراً أو أكثر.' },
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

/* ----------------------------------------------------------- Procurement

   Each item is a purchase request: what, how many, by when, the reference
   photos, and the suppliers found so far with their quotes. The list shows
   one line per request; "Details" opens the whole request under its line,
   editable by the production team, planners and leads. */

/** The follow-up reason as a sentence. A request with its own "needed by"
    date says so; otherwise the date is the project's delivery to site. */
export function followSentence(lang, f) {
  const t = FSTR[lang];
  if (!f) return '';
  const key = f.need && (f.code === 'late' || f.code === 'soon') ? (f.code === 'late' ? 'needLate' : 'needSoon') : f.code;
  return fill(t.follow[key] || t.follow[f.code] || '', { n: f.n ?? '' });
}

const qtyText = (it) => {
  const q = Number(it.qty) > 0 ? Number(it.qty) : 1;
  return `${q.toLocaleString('en-US', { maximumFractionDigits: 3 })}${it.unit ? ` ${it.unit}` : ''}`;
};
const money = (v) => (v === null || v === undefined || v === '' ? '' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 }));
const photosOf = (ctx, id) => (ctx.fPhotos || []).filter(f => f.procurement_item_id === id);
const isImg = (f) => /^image\//.test(f.mime || '') || /\.(jpe?g|png|gif|webp|heic|bmp)$/i.test(f.filename || '');

function thumb(f, { big = false } = {}) {
  const cls = big ? 'fthumb fthumb--big' : 'fthumb';
  return f.url && isImg(f)
    ? `<button type="button" class="${cls}" data-fphoto-open="${esc(f.id)}" title="${esc(f.filename || '')}"><img src="${esc(f.url)}" alt="${esc(f.filename || '')}" loading="lazy" /></button>`
    : `<button type="button" class="${cls} fthumb--file" data-fphoto-open="${esc(f.id)}" title="${esc(f.filename || '')}">${esc(String(f.filename || 'file').split('.').pop().toUpperCase().slice(0, 4))}</button>`;
}

/** The supplier summary on an item's line. */
function supSummary(lang, it) {
  const t = FSTR[lang].req;
  const sups = F.suppliersOf(it);
  if (!sups.length) return `<span class="muted">—</span>`;
  const q = it.quote;
  const names = sups.slice(0, 2).map(x => x.name || x.contact).join(', ') + (sups.length > 2 ? ` +${sups.length - 2}` : '');
  const priced = q ? (q.n === 1 ? t.quote1 : fill(t.quotes, { n: q.n })) : '';
  return `<span class="small">${esc(names)}</span>${q ? `<span class="block small muted">${esc(priced)} · ${esc(fill(t.best, { p: sarFmt(q.price) }))}</span>` : ''}`;
}

/** The whole request, opened under its line. */
export function requestPanel(lang, ctx, it, edit) {
  const t = FSTR[lang], r = t.req;
  const photos = photosOf(ctx, it.id);
  const sups = Array.isArray(it.suppliers) ? it.suppliers : [];
  const qty = Number(it.qty) > 0 ? Number(it.qty) : 1;
  const priced = F.suppliersOf(it).filter(x => x.price !== null).map(x => x.price);
  const low = priced.length > 1 ? Math.min(...priced) : null;
  const who = (ctx.people || []).find(p => p.id === it.created_by)?.full_name;
  const fld = (label, inner, wide = false) => `<label class="f${wide ? ' f--wide' : ''}"><span>${esc(label)}</span>${inner}</label>`;
  const ro = edit ? '' : ' disabled';

  const fields = `<div class="fields">
    ${fld(t.col.item, `<input dir="auto" data-fe="name" data-fe-id="${esc(it.id)}" value="${esc(it.name || '')}" maxlength="200"${ro} />`)}
    ${fld(r.qty, `<input type="number" min="0" step="any" inputmode="decimal" data-fe="qty" data-fe-id="${esc(it.id)}" value="${esc(String(qty))}"${ro} />`)}
    ${fld(r.unit, `<input dir="auto" data-fe="unit" data-fe-id="${esc(it.id)}" value="${esc(it.unit || '')}" placeholder="${esc(r.unitHint)}" maxlength="40"${ro} />`)}
    ${fld(r.needBy, `<input type="date" data-fe="needed_by" data-fe-id="${esc(it.id)}" value="${esc(it.needed_by || '')}"${ro} />`)}
    ${fld(r.spec, `<textarea rows="3" dir="auto" data-fe="description" data-fe-id="${esc(it.id)}" placeholder="${esc(r.specHint)}"${ro}>${esc(it.description || '')}</textarea>`, true)}
  </div>`;

  const photoBlock = `<h3 class="subhead">${esc(r.photos)}</h3>
    <div class="fphotos">
      ${photos.map(f => `<span class="fphoto">${thumb(f, { big: true })}${edit ? `<button type="button" class="x fphoto__x" data-fphoto-del="${esc(f.id)}" aria-label="✕">✕</button>` : ''}</span>`).join('')}
      ${!photos.length ? `<span class="muted small">${esc(r.noPhotos)}</span>` : ''}
      ${edit ? `<label class="miniup">${esc(r.addPhotos)}<input type="file" multiple accept="image/*,.pdf" data-fphoto-add="${esc(it.id)}" /></label>` : ''}
    </div>`;

  const supRow = (x, i) => {
    const price = x?.price === null || x?.price === undefined ? '' : String(x.price);
    const total = price === '' || !Number.isFinite(Number(price)) ? '' : money(Number(price) * qty);
    const isLow = low !== null && price !== '' && Number(price) === low;
    return edit ? `<tr data-fs-row="${i}">
        <td><input class="cellinput" dir="auto" data-fs="name" value="${esc(x?.name || '')}" placeholder="${esc(r.supName)}" maxlength="120" /></td>
        <td><input class="cellinput" data-fs="contact" value="${esc(x?.contact || '')}" placeholder="${esc(r.supContact)}" maxlength="120" /></td>
        <td class="num"><input class="cellinput cellinput--num" type="number" min="0" step="any" inputmode="decimal" data-fs="price" value="${esc(price)}" /></td>
        <td class="num">${esc(total)}${isLow ? ` <span class="chip chip--ok">${esc(r.lowest)}</span>` : ''}</td>
        <td><input class="cellinput" dir="auto" data-fs="note" value="${esc(x?.note || '')}" placeholder="${esc(r.supNote)}" maxlength="200" /></td>
        <td class="proc-actions"><button type="button" class="x" data-fs-del="${i}" aria-label="✕">✕</button></td>
      </tr>`
      : `<tr><td>${esc(x?.name || '—')}</td><td class="small">${esc(x?.contact || '')}</td><td class="num">${esc(money(price) || '—')}</td>
        <td class="num">${esc(total || '—')}${isLow ? ` <span class="chip chip--ok">${esc(r.lowest)}</span>` : ''}</td><td class="small muted">${esc(x?.note || '')}</td></tr>`;
  };
  const supBlock = `<h3 class="subhead">${esc(r.suppliers)}</h3>
    ${sups.length ? `<div class="tblwrap"><table class="tbl tbl--tight fsups" data-fs-item="${esc(it.id)}">
      <thead><tr><th>${esc(r.supName)}</th><th>${esc(r.supContact)}</th><th class="num">${esc(r.supPrice)}</th><th class="num">${esc(r.supTotal)}</th><th>${esc(r.supNote)}</th>${edit ? '<th></th>' : ''}</tr></thead>
      <tbody>${sups.map(supRow).join('')}</tbody></table></div>` : `<p class="muted small" style="margin:0 0 8px">${esc(r.noSup)}</p>`}
    ${edit ? `<button type="button" class="btn btn--sm" data-fs-add="${esc(it.id)}">${esc(r.addSupRow)}</button>` : ''}`;

  return `<div class="freq" data-freq="${esc(it.id)}">
    ${fields}
    ${photoBlock}
    ${supBlock}
    ${who || it.created_at ? `<p class="muted small" style="margin:10px 0 0">${esc(fill(r.by, { who: who || '—', d: fmt(String(it.created_at || '').slice(0, 10), lang) }))}</p>` : ''}
  </div>`;
}

/** The new-request form. Supplier lines are added in the page (no redraw),
    so whatever was typed stays put. */
export function supplierInputs(lang) {
  const r = FSTR[lang].req;
  return `<div class="fsupin" data-fi-sup>
    <input data-fis="name" placeholder="${esc(r.supName)}" maxlength="120" aria-label="${esc(r.supName)}" />
    <input data-fis="contact" placeholder="${esc(r.supContact)}" maxlength="120" aria-label="${esc(r.supContact)}" />
    <input data-fis="price" type="number" min="0" step="any" inputmode="decimal" placeholder="${esc(r.supPrice)}" aria-label="${esc(r.supPrice)}" />
  </div>`;
}

export function factoryProcurementView(lang, ctx) {
  const t = FSTR[lang], d = DSTR[lang], r = t.req;
  const D = factoryState(ctx);
  const edit = canEditProduction();
  const f = { show: 'all', project: '', q: '', ...(ctx.fif || {}) };
  const items = F.filterItems(D.items, f);
  const projects = [...new Map(D.items.filter(i => i.project).map(i => [i.project_id, i.project])).values()]
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const addable = D.rows.filter(r => r.phase !== 'delivered').map(r => r.project);
  const counts = { all: D.items.length, follow: D.proc.follow, open: D.proc.open, done: D.proc.done };
  const COLS = 9;

  const statusCell = (it) => edit
    ? `<select class="procsel" data-fp-status="${esc(it.id)}" aria-label="${esc(t.col.status)}: ${esc(it.name || '')}">
        ${F.PROC_STATUS.map(s => `<option value="${s}"${s === it.status ? ' selected' : ''}>${esc(d.procSt[s])}</option>`).join('')}</select>`
    : procStatusPill(it.status, lang);
  const why = (it) => it.follow
    ? `<span class="fwhy fwhy--${it.follow.code}">${esc(followSentence(lang, it.follow))}</span>`
    : (it.status === 'done' ? `<span class="good small">✓</span>` : '<span class="muted">—</span>');

  const line = (it) => {
    const open = ctx.fOpen === it.id;
    const ph = photosOf(ctx, it.id)[0];
    return `<tr class="${it.follow ? 'frow--follow' : ''}${open ? ' is-open' : ''}">
      <td><span class="fitem">${ph ? thumb(ph) : ''}<span><strong dir="auto">${esc(it.name || '—')}</strong>${it.description ? `<span class="block small muted fclip" dir="auto">${esc(it.description)}</span>` : ''}</span></span></td>
      <td class="num nowrap"><bdi>${esc(qtyText(it))}</bdi></td>
      <td>${it.project ? `<button class="link" data-act="go" data-route="#/p/${esc(it.project.id)}">${esc(it.project.name)}</button>` : '<span class="muted">—</span>'}</td>
      <td>${statusCell(it)}</td>
      <td>${why(it)}</td>
      <td class="num nowrap">${esc(it.deliveryOn ? fmt(it.deliveryOn, lang) : '—')}${it.deliverySrc === 'site' ? `<span class="block small muted">${esc(r.site)}</span>` : ''}</td>
      <td>${supSummary(lang, it)}</td>
      <td class="num small muted">${esc(fmt(String(it.updated_at || it.created_at || '').slice(0, 10), lang) || '—')}</td>
      <td class="num"><button type="button" class="btn btn--sm" data-fi-open="${esc(it.id)}" aria-expanded="${open}">${esc(open ? r.hide : r.details)}</button></td>
    </tr>${open ? `<tr class="reqdet"><td colspan="${COLS}">${requestPanel(lang, ctx, it, edit)}</td></tr>` : ''}`;
  };
  const body = items.length ? items.map(line).join('')
    : `<tr><td class="tbl__empty" colspan="${COLS}">${esc(D.items.length ? t.noMatch : t.emptyProc)}</td></tr>`;

  const fld = (label, inner, wide = false) => `<label class="f${wide ? ' f--wide' : ''}"><span>${esc(label)}</span>${inner}</label>`;
  const form = edit && addable.length ? `<form class="inlineform faddform" data-fi-add style="border-bottom:0">
    <h3 class="subhead" style="margin-top:0">${esc(r.title)}</h3>
    <div class="fields">
      ${fld(t.addTo, `<select id="fiProject" required>
        ${addable.map(p => `<option value="${esc(p.id)}"${p.id === f.project ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select>`)}
      ${fld(t.itemName, `<input id="fiName" dir="auto" required maxlength="200" />`)}
      ${fld(r.qty, `<input id="fiQty" type="number" min="0" step="any" inputmode="decimal" value="1" required />`)}
      ${fld(r.unit, `<input id="fiUnit" maxlength="40" placeholder="${esc(r.unitHint)}" />`)}
      ${fld(r.needBy, `<input id="fiNeed" type="date" />`)}
      ${fld(r.spec, `<textarea id="fiSpec" dir="auto" rows="3" maxlength="4000" placeholder="${esc(r.specHint)}"></textarea>`, true)}
      ${fld(r.photos, `<input id="fiPhotos" type="file" multiple accept="image/*,.pdf" /><span class="muted small">${esc(r.photosHint)}</span>`, true)}
      <div class="f f--wide"><span>${esc(r.suppliersOpt)}</span>
        <div data-fi-sups>${supplierInputs(lang)}</div>
        <div><button type="button" class="btn btn--sm" data-fi-supadd>${esc(r.addSup)}</button></div></div>
    </div>
    <div class="actions"><button type="submit" class="btn btn--primary btn--sm">${esc(r.send)}</button></div>
  </form>` : '';

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
    <thead><tr><th>${esc(t.col.item)}</th><th class="num">${esc(t.col.qty)}</th><th>${esc(t.col.project)}</th><th>${esc(t.col.status)}</th><th>${esc(t.col.why)}</th>
      <th class="num">${esc(t.col.need)}</th><th>${esc(t.col.sup)}</th><th class="num">${esc(t.col.updated)}</th><th></th></tr></thead>
    <tbody>${body}</tbody>
  </table></div>
  ${form}
  ${edit ? '' : `<p class="note">${esc(t.readOnly)}</p>`}
</section>`;
}
