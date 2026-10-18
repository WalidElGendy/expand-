/* ==========================================================================
   Home for admins and managers: one screen per department, built to answer
   "where do we stand, and what needs a decision". Pure (lang, ctx) → HTML;
   the numbers come from mgmtlogic.js and tenderlogic.js.

   Chart rules, so every chart reads the same way:
   · one series → one hue (brand), no legend, the title names it;
   · two or three series → the validated categorical slots in fixed order
     (--s1, --s4 for pairs; --s1, --s2, --s3 for three), always with a legend;
   · departments wear their own colour from the departments table;
   · status colours only on status (overdue, risk), never as a series;
   · only the largest bar is labelled; every bar has a hover title.
   ========================================================================== */

import * as db from './db.js';
import * as M from './mgmtlogic.js';
import * as TL from './tenderlogic.js';
import { esc, fmt, deptName, keyPersonRisk, DSTR } from './dash.js';

export const MSTR = {
  en: {
    title: 'Management', sub: 'Every department at a glance — and what needs a decision',
    tabs: { overview: 'Overview', projects: 'Projects', sales: 'Sales', tenders: 'Tenders', leads: 'Business & leads', hr: 'HR' },
    open: 'Open {x}', noData: 'Nothing to show yet.',
    k: { live: 'Live projects', overdueSub: '{n} overdue', due30: 'Due in 30 days', atEtemad: 'At Etemad', winRate: 'Win rate',
      winSub: '{a} accepted · {l} rejected', winNoLost: '{a} accepted · no rejections recorded yet', valueWon: 'Contract value won', valueSub: 'across {n} of {t} accepted projects',
      tenders: 'Tenders awaiting decision', tendersSub: 'approval rate {p}', leads: 'Open leads', leadsSub: '{n} follow-ups overdue',
      staff: 'Active employees', staffSub: '{p} in today · {l} on leave' },
    att: { title: 'Needs attention', none: 'Nothing urgent right now.', more: 'Show {n} more',
      projectsOverdue: '{n} live projects are past their deadline', projectsNoOwner: '{n} live projects have no owner',
      stagesUnassigned: '{n} open stages have nobody assigned', projectsDue30: '{n} projects are due in the next 30 days',
      keyPerson: '{who} holds {share}% of the {dept} team’s open work', tendersUrgent: '{n} tenders awaiting decision are due for submission within 7 days',
      tendersAwaiting: '{n} tenders are waiting for a decision', followOverdue: '{n} lead follow-ups are overdue',
      leadsNoOwner: '{n} open leads have no owner', atEtemad: '{n} projects are waiting for an Etemad verdict',
      contractsExpired: '{n} employee contracts have expired', contractsEnding: '{n} employee contracts end in the next 60 days',
      hrPending: '{n} HR requests are waiting for approval', probationEnding: '{n} probation periods end in the next 30 days',
      hrNoFile: '{n} employees have no HR file yet (no joining date)',
      one: { projectsOverdue: '1 live project is past its deadline', projectsNoOwner: '1 live project has no owner',
        stagesUnassigned: '1 open stage has nobody assigned', projectsDue30: '1 project is due in the next 30 days',
        tendersUrgent: '1 tender awaiting decision is due for submission within 7 days', tendersAwaiting: '1 tender is waiting for a decision',
        followOverdue: '1 lead follow-up is overdue', leadsNoOwner: '1 open lead has no owner', atEtemad: '1 project is waiting for an Etemad verdict',
        contractsExpired: '1 employee contract has expired', contractsEnding: '1 employee contract ends in the next 60 days',
        hrPending: '1 HR request is waiting for approval', probationEnding: '1 probation period ends in the next 30 days',
        hrNoFile: '1 employee has no HR file yet (no joining date)' } },
    p: { pipeline: 'Projects by stage', pipelineNote: 'Every project in the system, by where it is now.',
      deliveries: 'Projects delivered per month', onTime: 'On time', late: 'Late', noDue: 'No deadline set',
      deliveriesNote: 'Delivered date against the deadline; a project with no deadline cannot be judged.',
      onTimeRate: 'On-time delivery (12 months)', delivered12: 'Delivered (12 months)', openStages: 'Open stages',
      byDept: 'Open work by department', byDeptNote: 'Unfinished stages on live projects. The shaded part has nobody assigned.',
      byOwner: 'Live projects by project manager', overdue: 'overdue', unassigned: 'unassigned', noOwner: 'No owner',
      weeks: 'Deadlines in the next 8 weeks', weekOf: 'Week of {d}', details: 'Business highlights' },
    s: { funnel: 'Bids and outcomes', submitted: 'Submitted, awaiting verdict', accepted: 'Accepted', lost: 'Rejected',
      pipelineValue: 'Value in the pipeline', pipelineSub: '{n} of {t} open projects have a value', avg: 'Average contract',
      byClient: 'Accepted projects by client', byClientValue: 'Contract value by client', byOwner: 'Results by project manager',
      winRate: 'Win rate', value: 'Value', noClient: '{n} of {t} accepted projects have no client recorded.', delivered: 'Contract value delivered per month',
      valueNote: 'Contract values are new: they fill in from approved tenders and from the project page. Older projects show as counts only.' },
    t: { approvedVal: 'Approved value', rejectedVal: 'Rejected value', reasons: 'Why tenders are rejected', clients: 'Clients with the most approved tenders',
      pms: 'PMs with the most approved tenders', monthly: 'Approved vs rejected, by month', approved: 'Approved', rejected: 'Rejected',
      awaiting: 'Awaiting decision', conversion: 'Approval rate', none: 'No tenders recorded yet.' },
    l: { stages: 'Where the leads are', stage: { new: 'New / not contacted', contacted: 'Contacted', interested: 'Interested', proposal: 'Proposal', won: 'Won', dead: 'Closed / not interested' },
      conversion: 'Lead conversion', convSub: 'won ÷ (won + lost + not interested)', noOwner: 'Open leads without an owner',
      bySource: 'Leads by source', noSource: 'Source not recorded', byOwner: 'Open leads by owner', wonSub: '{n} won', overdueSub: '{n} overdue', value: 'Open pipeline value', wonK: 'Leads won', totalSub: 'of {n} leads in total' },
    h: { active: 'Active employees', present: 'In today', onLeave: 'On leave today', sick: 'Sick today', pending: 'HR requests pending',
      ending: 'Contracts ending (60 days)', saudization: 'Saudization', saudi: 'Saudi', nonSaudi: 'Non-Saudi', unknown: 'Not recorded',
      byDept: 'Headcount by department', leave: 'Leave days per month', annual: 'Annual', sickL: 'Sick', other: 'Other',
      attendance: 'People clocked in, last 30 days', joined: 'Joined this year', left: 'Left this year',
      payroll: 'Last payroll ({p})', payrollSub: '{n} payslips · GOSI (employer) {g}', fileNote: 'Saudization and contract alerts need each employee’s HR file filled in.' },
  },
  ar: {
    title: 'الإدارة', sub: 'كل الأقسام في نظرة واحدة — وما يحتاج إلى قرار',
    tabs: { overview: 'نظرة عامة', projects: 'المشاريع', sales: 'المبيعات', tenders: 'المناقصات', leads: 'الأعمال والعملاء المحتملون', hr: 'الموارد البشرية' },
    open: 'فتح {x}', noData: 'لا يوجد ما يُعرض بعد.',
    k: { live: 'المشاريع الجارية', overdueSub: '{n} متأخرة', due30: 'مستحقة خلال 30 يوماً', atEtemad: 'على منصة اعتماد', winRate: 'نسبة الفوز',
      winSub: '{a} مقبولة · {l} مرفوضة', winNoLost: '{a} مقبولة · لا توجد مرفوضة مسجلة بعد', valueWon: 'قيمة العقود المكتسبة', valueSub: 'من {n} مشروع من أصل {t} مقبولة',
      tenders: 'مناقصات بانتظار القرار', tendersSub: 'نسبة الاعتماد {p}', leads: 'عملاء محتملون مفتوحون', leadsSub: '{n} متابعة متأخرة',
      staff: 'الموظفون النشطون', staffSub: '{p} حاضر اليوم · {l} في إجازة' },
    att: { title: 'يحتاج إلى انتباه', none: 'لا يوجد شيء عاجل الآن.', more: 'عرض {n} أخرى',
      projectsOverdue: '{n} مشروع جارٍ تجاوز موعده النهائي', projectsNoOwner: '{n} مشروع جارٍ بدون مسؤول',
      stagesUnassigned: '{n} مرحلة مفتوحة غير مسندة لأحد', projectsDue30: '{n} مشروع مستحق خلال 30 يوماً',
      keyPerson: '{who} يحمل {share}% من الأعمال المفتوحة لفريق {dept}', tendersUrgent: '{n} مناقصة بانتظار القرار وموعد تقديمها خلال 7 أيام',
      tendersAwaiting: '{n} مناقصة بانتظار القرار', followOverdue: '{n} متابعة لعملاء محتملين متأخرة',
      leadsNoOwner: '{n} عميل محتمل مفتوح بدون مسؤول', atEtemad: '{n} مشروع بانتظار نتيجة اعتماد',
      contractsExpired: '{n} عقد موظف منتهٍ', contractsEnding: '{n} عقد موظف ينتهي خلال 60 يوماً',
      hrPending: '{n} طلب موارد بشرية بانتظار الاعتماد', probationEnding: '{n} فترة تجربة تنتهي خلال 30 يوماً',
      hrNoFile: '{n} موظف بدون ملف موارد بشرية (لا يوجد تاريخ مباشرة)' },
    p: { pipeline: 'المشاريع حسب المرحلة', pipelineNote: 'كل المشاريع في النظام حسب مرحلتها الحالية.',
      deliveries: 'المشاريع المسلّمة شهرياً', onTime: 'في الموعد', late: 'متأخرة', noDue: 'بدون موعد نهائي',
      deliveriesNote: 'تاريخ التسليم مقابل الموعد النهائي؛ المشروع بدون موعد لا يمكن الحكم عليه.',
      onTimeRate: 'التسليم في الموعد (12 شهراً)', delivered12: 'المسلّمة (12 شهراً)', openStages: 'المراحل المفتوحة',
      byDept: 'الأعمال المفتوحة حسب القسم', byDeptNote: 'المراحل غير المنجزة في المشاريع الجارية. الجزء المظلل غير مسند لأحد.',
      byOwner: 'المشاريع الجارية حسب مدير المشروع', overdue: 'متأخرة', unassigned: 'غير مسندة', noOwner: 'بدون مسؤول',
      weeks: 'المواعيد النهائية خلال 8 أسابيع', weekOf: 'أسبوع {d}', details: 'أبرز مؤشرات الأعمال' },
    s: { funnel: 'العروض ونتائجها', submitted: 'مُقدَّمة بانتظار النتيجة', accepted: 'مقبولة', lost: 'مرفوضة',
      pipelineValue: 'القيمة قيد التنفيذ', pipelineSub: '{n} من {t} مشروع مفتوح لها قيمة', avg: 'متوسط قيمة العقد',
      byClient: 'المشاريع المقبولة حسب العميل', byClientValue: 'قيمة العقود حسب العميل', byOwner: 'النتائج حسب مدير المشروع',
      winRate: 'نسبة الفوز', value: 'القيمة', noClient: '{n} من {t} مشروع مقبول بدون اسم عميل مسجل.', delivered: 'قيمة العقود المسلّمة شهرياً',
      valueNote: 'قيم العقود جديدة: تُعبّأ من المناقصات المعتمدة ومن صفحة المشروع. المشاريع القديمة تظهر كأعداد فقط.' },
    t: { approvedVal: 'قيمة المعتمدة', rejectedVal: 'قيمة المرفوضة', reasons: 'أسباب رفض المناقصات', clients: 'العملاء الأكثر مناقصات معتمدة',
      pms: 'مدراء المشاريع الأكثر مناقصات معتمدة', monthly: 'المعتمدة مقابل المرفوضة شهرياً', approved: 'معتمدة', rejected: 'مرفوضة',
      awaiting: 'بانتظار القرار', conversion: 'نسبة الاعتماد', none: 'لا توجد مناقصات بعد.' },
    l: { stages: 'أين العملاء المحتملون الآن', stage: { new: 'جديد / لم يتم التواصل', contacted: 'تم التواصل', interested: 'مهتم', proposal: 'عرض', won: 'تم الفوز', dead: 'مغلق / غير مهتم' },
      conversion: 'نسبة التحويل', convSub: 'الفوز ÷ (الفوز + الخسارة + غير مهتم)', noOwner: 'عملاء محتملون مفتوحون بدون مسؤول',
      bySource: 'العملاء المحتملون حسب المصدر', noSource: 'المصدر غير مسجل', byOwner: 'العملاء المحتملون المفتوحون حسب المسؤول', wonSub: '{n} فوز', overdueSub: '{n} متأخرة', value: 'قيمة الفرص المفتوحة', wonK: 'عملاء تم الفوز بهم', totalSub: 'من أصل {n} عميل محتمل' },
    h: { active: 'الموظفون النشطون', present: 'حاضر اليوم', onLeave: 'في إجازة اليوم', sick: 'مريض اليوم', pending: 'طلبات بانتظار الاعتماد',
      ending: 'عقود تنتهي (60 يوماً)', saudization: 'السعودة', saudi: 'سعودي', nonSaudi: 'غير سعودي', unknown: 'غير مسجل',
      byDept: 'عدد الموظفين حسب القسم', leave: 'أيام الإجازات شهرياً', annual: 'سنوية', sickL: 'مرضية', other: 'أخرى',
      attendance: 'عدد الحاضرين، آخر 30 يوماً', joined: 'انضموا هذا العام', left: 'غادروا هذا العام',
      payroll: 'آخر مسير رواتب ({p})', payrollSub: '{n} كشف · التأمينات (صاحب العمل) {g}', fileNote: 'السعودة وتنبيهات العقود تحتاج إلى تعبئة ملف كل موظف.' },
  },
};

const T = (lang) => MSTR[lang];
export const isManagement = (me = db.state.me) => !!(me && me.is_active && ['admin', 'manager'].includes(me.role));

/* ------------------------------------------------------------- helpers */
const fill = (s, o) => Object.entries(o).reduce((a, [k, v]) => a.replaceAll(`{${k}}`, v), s);
const card = (title, body, extra = '') => `<section class="card"><div class="card__head"><h2>${esc(title)}</h2>${extra}</div>${body}</section>`;
const empty = (text) => `<p class="note">${esc(text)}</p>`;
const kpi = (n, label, { sub = '', colour = '', bad = false, route = '' } = {}) => `<div class="kpi${bad ? ' kpi--bad' : ''}${route ? ' kpi--link' : ''}"${route ? ` data-act="go" data-route="${esc(route)}" role="link" tabindex="0"` : ''}>
  <span class="kpi__l">${colour ? `<i style="--c:${colour}"></i>` : ''}${esc(label)}</span>
  <span class="kpi__n">${n}</span>${sub ? `<span class="kpi__s">${esc(sub)}</span>` : ''}</div>`;
const go = (route, label) => `<button class="link" data-act="go" data-route="${esc(route)}">${esc(label)}</button>`;
const more = (lang, route, label) => `<span style="margin-inline-start:auto">${go(route, fill(T(lang).open, { x: label }))}</span>`;
const sar = (v, compact = true) => esc(TL.sar(v, { compact }));
const todayRiyadh = () => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
const deptColour = (id) => db.dept(id)?.colour || 'var(--ink3)';
/* A win rate means nothing until a rejection has been recorded. */
const winKpi = (lang, ss, colour) => {
  const k = T(lang).k, known = ss.lost > 0 && ss.winRate !== null;
  return kpi(known ? `${ss.winRate}%` : '—', k.winRate, { colour, sub: fill(known ? k.winSub : k.winNoLost, { a: ss.accepted, l: ss.lost }) });
};
const monthLabel = (k, lang) => new Date(k + '-01T00:00:00Z').toLocaleDateString(lang === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', { month: 'short', timeZone: 'UTC' });
const statusLabel = (s, lang) => DSTR[lang].st?.[s] || String(s).replace(/_/g, ' ');

/** Horizontal bars. `part` draws a shaded share inside the bar (e.g. unassigned). */
function hbars(rows, { fillC = 'var(--brand)', fmtN = (n) => String(n), max = null } = {}) {
  if (!rows.length) return '';
  const top = max ?? Math.max(...rows.map(r => r.n), 1);
  return `<ul class="hbars hbars--wide">${rows.map(r => {
    const w = top ? Math.max(r.n ? 1.5 : 0, (r.n / top) * 100) : 0;
    const colour = r.colour || fillC;
    const part = r.part ? Math.min(100, (r.part / (r.n || 1)) * 100) : 0;
    return `<li class="hb" title="${esc(r.label)} — ${esc(fmtN(r.n))}${r.sub ? ' · ' + esc(r.sub) : ''}">
      <span class="hb__l">${r.route ? go(r.route, r.label) : esc(r.label)}${r.sub ? `<span class="hb__sub">${esc(r.sub)}</span>` : ''}</span>
      <span class="hb__track"><span class="hb__fill" style="width:${w}%;background:${colour}">${part ? `<span class="hb__part" style="width:${part}%"></span>` : ''}</span></span>
      <span class="hb__n">${esc(fmtN(r.n))}</span></li>`;
  }).join('')}</ul>`;
}

/**
 * Columns, one per category. `keys` are stacked bottom-up in the given order,
 * each with a colour and a legend label; a 2px surface gap separates segments.
 */
function columns(lang, cats, keys, { title, fmtN = (n) => String(n), height = 210 } = {}) {
  const totals = cats.map(c => keys.reduce((a, k) => a + (c[k.key] || 0), 0));
  if (!totals.some(Boolean)) return empty(T(lang).noData);
  const series = lang === 'ar' ? cats.map((c, i) => ({ c, t: totals[i] })).reverse() : cats.map((c, i) => ({ c, t: totals[i] }));
  const W = 620, H = height, PT = 22, PB = 26, PL = 6, PR = 6;
  const step = (W - PL - PR) / series.length, bw = Math.max(8, Math.min(30, step - 8));
  const ph = H - PT - PB, base = PT + ph;
  const max = Math.max(1, ...totals);
  const maxI = series.reduce((b, s, i) => (s.t > series[b].t ? i : b), 0);
  const topRound = (x, y, w, h) => { const r = Math.min(4, w / 2, h); return `M${x} ${y + h}V${y + r}q0-${r} ${r}-${r}h${w - 2 * r}q${r} 0 ${r} ${r}V${y + h}Z`; };
  const legend = keys.length > 1 ? `<div class="split__legend" style="padding:8px 16px 0;margin:0">${keys.map(k =>
    `<span><i class="sw" style="background:${k.colour}"></i>${esc(k.label)}</span>`).join('')}</div>` : '';
  return `${legend}<div class="chartwrap"><svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${esc(title || '')}">
    <g class="grid"><line x1="${PL}" x2="${W - PR}" y1="${base}" y2="${base}"/></g>
    ${series.map(({ c, t }, i) => {
      const x = PL + i * step + (step - bw) / 2;
      let y = base, segs = '';
      const nonzero = keys.filter(k => c[k.key] > 0);
      nonzero.forEach((k, j) => {
        const h = (c[k.key] / max) * ph;
        const isTop = j === nonzero.length - 1;
        const hh = Math.max(0, h - (j > 0 ? 2 : 0));
        y -= h;
        segs += isTop ? `<path d="${topRound(x, y + (j > 0 ? 2 : 0), bw, hh)}" style="fill:${k.colour}"/>`
          : `<rect x="${x}" y="${y + (j > 0 ? 2 : 0)}" width="${bw}" height="${hh}" style="fill:${k.colour}"/>`;
      });
      const tip = `${c.label}${c.sub ? ' ' + c.sub : ''} — ${keys.map(k => `${k.label} ${fmtN(c[k.key] || 0)}`).join(', ')}`;
      return `<g class="bar"><title>${esc(tip)}</title>
        <rect x="${PL + i * step}" y="${PT}" width="${step}" height="${ph}" fill="transparent"/>${segs}
        ${i === maxI && t ? `<text x="${x + bw / 2}" y="${y - 5}" class="val" text-anchor="middle">${esc(fmtN(t))}</text>` : ''}
        <text x="${x + bw / 2}" y="${H - 8}" class="axis" text-anchor="middle">${esc(c.label)}</text></g>`;
    }).join('')}
  </svg></div>`;
}

/** One bar split into shares (Saudization). Legend carries the numbers. */
function split(parts) {
  const total = parts.reduce((a, p) => a + p.n, 0);
  if (!total) return '';
  return `<div class="split" style="padding:0 16px 14px"><div class="split__bar" style="height:14px;gap:2px">${parts.filter(p => p.n).map(p =>
    `<span title="${esc(p.label)} — ${p.n}" style="width:${(p.n / total) * 100}%;background:${p.colour}"></span>`).join('')}</div>
    <div class="split__legend">${parts.map(p => `<span><i class="sw" style="background:${p.colour}"></i>${esc(p.label)} · ${p.n} (${Math.round((p.n / total) * 100)}%)</span>`).join('')}</div></div>`;
}

function tabs(lang, on) {
  const t = T(lang);
  return `<nav class="hrtabs">${Object.keys(t.tabs).map(k =>
    `<button class="hrtab${k === on ? ' is-on' : ''}" data-mg-tab="${k}">${esc(t.tabs[k])}</button>`).join('')}</nav>`;
}

/* ------------------------------------------------------------ sections */

function compute(ctx) {
  const today = todayRiyadh();
  const projects = (ctx.projects || []).filter(p => !p.is_crm_list);
  const ps = M.projectStats(projects, today);
  const ss = M.salesStats(projects, today);
  const ls = M.leadStats(ctx.leads || [], today);
  const tenders = ctx.mgTenders || [];
  const ts = TL.tenderStats(tenders, { today });
  const hr = ctx.mgHR || null;
  const risks = keyPersonRisk(projects);
  return { today, projects, ps, ss, ls, ts, hr, risks, tenders, att: M.attention({ ps, ss, ls, ts, hr, risks }) };
}

function attentionCard(lang, D) {
  const t = T(lang).att;
  const C = { critical: 'var(--critical)', warn: 'var(--warn)', info: 'var(--info)' };
  const li = (a) => `<li class="alert alert--${a.level === 'info' ? '' : a.level}">
      <span class="alert__dot" style="background:${C[a.level]}"></span>
      ${go(a.route, fill((a.n === 1 && t.one?.[a.key]) || t[a.key], { n: a.n, who: a.who || '', share: a.share ?? '', dept: a.dept ? deptName(a.dept, lang) : '' }))}</li>`;
  /* The first eight carry every critical item; the rest fold away. */
  const head = D.att.slice(0, Math.max(8, D.att.filter(a => a.level === 'critical').length));
  const rest = D.att.slice(head.length);
  const body = D.att.length ? `<ul class="alerts">${head.map(li).join('')}</ul>${rest.length
    ? `<details class="alerts__more"><summary class="link">${esc(fill(t.more, { n: rest.length }))}</summary><ul class="alerts">${rest.map(li).join('')}</ul></details>` : ''}`
    : empty(t.none);
  return card(t.title, body, `<span class="muted small">${D.att.length}</span>`);
}

function deliveriesChart(lang, D) {
  const t = T(lang).p;
  return columns(lang, D.ps.monthly.map(m => ({ label: monthLabel(m.month, lang), sub: m.month.slice(0, 4), onTime: m.onTime, late: m.late, noDue: m.noDue })),
    [{ key: 'onTime', label: t.onTime, colour: 'var(--s1)' }, { key: 'late', label: t.late, colour: 'var(--s4)' }, { key: 'noDue', label: t.noDue, colour: 'var(--ink4)' }],
    { title: t.deliveries });
}
function pipelineBars(lang, D) {
  return hbars(M.PROJECT_ORDER.map(s => ({ label: statusLabel(s, lang), n: D.ps.byStatus[s] })).filter(r => r.n));
}
function deptBars(lang, D) {
  const t = T(lang).p;
  return hbars(D.ps.byDept.map(r => ({ label: deptName(r.dept, lang), n: r.n, part: r.unassigned, colour: deptColour(r.dept),
    sub: r.unassigned ? `${r.unassigned} ${t.unassigned}` : '' })));
}
function leadStageBars(lang, D) {
  const t = T(lang).l;
  return hbars(Object.keys(M.LEAD_STAGES).map(k => ({ label: t.stage[k], n: D.ls.stages[k] })));
}

function overviewTab(lang, ctx, D) {
  const t = T(lang), k = t.k;
  const hr = D.hr;
  return `
<div class="kpis kpis--4">
  ${kpi(D.ps.live, k.live, { colour: 'var(--s1)', sub: fill(k.overdueSub, { n: D.ps.overdue }), bad: D.ps.overdue > 0, route: '#/projects' })}
  ${kpi(D.ps.due30, k.due30, { colour: 'var(--s2)', route: '#/projects' })}
  ${kpi(D.ss.submitted, k.atEtemad, { colour: 'var(--s3)', route: '#/pipeline' })}
  ${winKpi(lang, D.ss, 'var(--s4)')}
  ${kpi(sar(D.ss.valueWon), k.valueWon, { colour: 'var(--s1)', sub: fill(k.valueSub, { n: D.ss.valuedCount, t: D.ss.accepted }) })}
  ${kpi(D.ts.review, k.tenders, { colour: 'var(--s2)', sub: fill(k.tendersSub, { p: D.ts.conversion === null ? '—' : `${D.ts.conversion}%` }), route: '#/tenders' })}
  ${kpi(D.ls.open, k.leads, { colour: 'var(--s3)', sub: fill(k.leadsSub, { n: D.ls.overdue }), bad: D.ls.overdue > 0, route: '#/leads' })}
  ${kpi(hr ? hr.active : '—', k.staff, { colour: 'var(--s4)', sub: hr ? fill(k.staffSub, { p: hr.present_today, l: hr.on_leave_today + hr.sick_today }) : '', route: '#/hr' })}
</div>
${attentionCard(lang, D)}
<div class="chartrow" style="margin:14px 0">
  ${card(t.p.deliveries, deliveriesChart(lang, D), more(lang, '#/projects', t.tabs.projects))}
  ${card(t.p.pipeline, pipelineBars(lang, D) || empty(t.noData))}
</div>
<div class="chartrow" style="margin:14px 0">
  ${card(t.p.byDept, deptBars(lang, D) || empty(t.noData), more(lang, '#/highlights', t.p.details))}
  ${card(t.l.stages, leadStageBars(lang, D) || empty(t.noData), more(lang, '#/leads', t.tabs.leads))}
</div>`;
}

function projectsTab(lang, ctx, D) {
  const t = T(lang), p = t.p, ps = D.ps;
  return `
<div class="kpis kpis--4">
  ${kpi(ps.live, t.k.live, { colour: 'var(--s1)', sub: fill(t.k.overdueSub, { n: ps.overdue }), bad: ps.overdue > 0 })}
  ${kpi(ps.due30, t.k.due30, { colour: 'var(--s2)' })}
  ${kpi(ps.onTimeRate === null ? '—' : `${ps.onTimeRate}%`, p.onTimeRate, { colour: 'var(--s3)', sub: `${ps.onTime} ${p.onTime} · ${ps.late} ${p.late}` })}
  ${kpi(ps.openStages, p.openStages, { colour: 'var(--s4)', sub: `${ps.unassignedStages} ${p.unassigned}` })}
</div>
<div class="chartrow" style="margin:14px 0">
  ${card(p.deliveries, deliveriesChart(lang, D) + `<p class="note">${esc(p.deliveriesNote)}</p>`)}
  ${card(p.weeks, columns(lang, ps.weeks.map(w => ({ label: fmt(w.from, lang).replace(/\s\d{4}$/, ''), n: w.n })), [{ key: 'n', label: p.weeks, colour: 'var(--brand)' }], { title: p.weeks }))}
</div>
<div class="chartrow" style="margin:14px 0">
  ${card(p.pipeline, (pipelineBars(lang, D) || empty(t.noData)) + `<p class="note">${esc(p.pipelineNote)}</p>`)}
  ${card(p.byDept, (deptBars(lang, D) || empty(t.noData)) + `<p class="note">${esc(p.byDeptNote)}</p>`, more(lang, '#/highlights', p.details))}
</div>
${card(p.byOwner, hbars(ps.byOwner.slice(0, 15).map(o => ({ label: o.name || p.noOwner, n: o.n, colour: o.id ? 'var(--brand)' : 'var(--ink4)',
    sub: o.overdue ? `${o.overdue} ${p.overdue}` : '' }))) || empty(t.noData))}`;
}

function salesTab(lang, ctx, D) {
  const t = T(lang), s = t.s, ss = D.ss;
  const people = ctx.people || [];
  const nm = (id, fallback) => (people.find(x => x.id === id)?.full_name) || fallback || '—';
  const named = ss.byClient.filter(c => c.name !== '—');
  const noClient = ss.byClient.find(c => c.name === '—')?.n || 0;
  return `
<div class="kpis kpis--4">
  ${winKpi(lang, ss, 'var(--s1)')}
  ${kpi(sar(ss.valueWon), t.k.valueWon, { colour: 'var(--s2)', sub: fill(t.k.valueSub, { n: ss.valuedCount, t: ss.accepted }) })}
  ${kpi(ss.avgValue === null ? '—' : sar(ss.avgValue), s.avg, { colour: 'var(--s3)' })}
  ${kpi(sar(ss.pipelineValue), s.pipelineValue, { colour: 'var(--s4)', sub: fill(s.pipelineSub, { n: ss.pipelineValued, t: ss.pipeline }) })}
</div>
<p class="note" style="margin:0 0 14px">${esc(s.valueNote)}</p>
<div class="chartrow" style="margin:14px 0">
  ${card(s.funnel, hbars([{ label: s.submitted, n: ss.submitted }, { label: s.accepted, n: ss.accepted }, { label: s.lost, n: ss.lost }]), more(lang, '#/pipeline', DSTR[lang].pipeline))}
  ${card(s.delivered, columns(lang, ss.deliveredValue.map(m => ({ label: monthLabel(m.month, lang), sub: m.month.slice(0, 4), value: m.value })),
    [{ key: 'value', label: s.value, colour: 'var(--brand)' }], { title: s.delivered, fmtN: (v) => TL.sar(v, { compact: true }) }))}
</div>
<div class="chartrow" style="margin:14px 0">
  ${card(s.byClient, (hbars(named.slice(0, 10).map(c => ({ label: c.name, n: c.n, sub: c.value ? TL.sar(c.value, { compact: true }) : '' }))) || empty(t.noData))
    + (noClient ? `<p class="note">${esc(fill(s.noClient, { n: noClient, t: ss.accepted }))}</p>` : ''))}
  ${card(s.byClientValue, hbars(ss.byClientValue.slice(0, 10).map(c => ({ label: c.name, n: c.value, sub: `${c.n}` })), { fmtN: (v) => TL.sar(v, { compact: true }) }) || empty(s.valueNote))}
</div>
${card(s.byOwner, ss.byOwner.length ? `<div class="tblwrap"><table class="tbl tbl--tight"><thead><tr><th>${esc(DSTR[lang].owner)}</th>
  <th class="num">${esc(s.accepted)}</th><th class="num">${esc(s.lost)}</th><th class="num">${esc(s.submitted)}</th><th class="num">${esc(s.winRate)}</th><th class="num">${esc(s.value)}</th></tr></thead>
  <tbody>${ss.byOwner.slice(0, 20).map(o => `<tr><td>${esc(nm(o.id, o.name || T(lang).p.noOwner))}</td><td class="num">${o.accepted}</td><td class="num">${o.lost}</td>
    <td class="num">${o.submitted}</td><td class="num">${o.winRate === null || !ss.lost ? '—' : `${o.winRate}%`}</td><td class="num">${o.value ? sar(o.value) : '—'}</td></tr>`).join('')}</tbody></table></div>` : empty(t.noData))}`;
}

function tendersTab(lang, ctx, D) {
  const t = T(lang), tt = t.t, ts = D.ts;
  if (!D.tenders.length) return card(t.tabs.tenders, empty(tt.none), more(lang, '#/tenders', t.tabs.tenders));
  const people = ctx.people || [];
  const reasons = (TSTR_REASONS[lang]);
  return `
<div class="kpis kpis--4">
  ${kpi(ts.review, tt.awaiting, { colour: 'var(--s2)', sub: TL.sar(ts.pendingValue, { compact: true }), route: '#/tenders' })}
  ${kpi(ts.conversion === null ? '—' : `${ts.conversion}%`, tt.conversion, { colour: 'var(--s1)', sub: `${ts.approved}/${ts.decided}` })}
  ${kpi(sar(ts.approvedValue), tt.approvedVal, { colour: 'var(--s3)', sub: `${ts.approved} ${tt.approved}` })}
  ${kpi(sar(ts.rejectedValue), tt.rejectedVal, { colour: 'var(--s4)', sub: `${ts.rejected} ${tt.rejected}` })}
</div>
<div class="chartrow" style="margin:14px 0">
  ${card(tt.monthly, columns(lang, ts.monthly.map(m => ({ label: monthLabel(m.month, lang), sub: m.month.slice(0, 4), approved: m.approved, rejected: m.rejected })),
    [{ key: 'approved', label: tt.approved, colour: 'var(--s1)' }, { key: 'rejected', label: tt.rejected, colour: 'var(--s4)' }], { title: tt.monthly }), more(lang, '#/tenders', t.tabs.tenders))}
  ${card(tt.reasons, hbars(ts.reasons.map(r => ({ label: reasons[r.key] || r.key, n: r.n, sub: TL.sar(r.value, { compact: true }) }))) || empty(t.noData))}
</div>
<div class="chartrow" style="margin:14px 0">
  ${card(tt.clients, hbars(ts.clients.slice(0, 10).map(c => ({ label: c.name, n: c.n, sub: TL.sar(c.value, { compact: true }) }))) || empty(t.noData))}
  ${card(tt.pms, hbars(ts.pms.slice(0, 10).map(r => ({ label: people.find(p => p.id === r.id)?.full_name || '—', n: r.n, sub: TL.sar(r.value, { compact: true }) }))) || empty(t.noData))}
</div>`;
}

function leadsTab(lang, ctx, D) {
  const t = T(lang), l = t.l, ls = D.ls;
  return `
<div class="kpis kpis--4">
  ${kpi(ls.open, t.k.leads, { colour: 'var(--s1)', sub: fill(t.k.leadsSub, { n: ls.overdue }), bad: ls.overdue > 0, route: '#/leads' })}
  ${kpi(ls.conversion === null ? '—' : `${ls.conversion}%`, l.conversion, { colour: 'var(--s2)', sub: l.convSub })}
  ${kpi(ls.noOwner, l.noOwner, { colour: 'var(--s3)', bad: ls.noOwner > 0 })}
  ${ls.valued ? kpi(sar(ls.value), l.value, { colour: 'var(--s4)', sub: `${ls.valued}/${ls.open}` })
    : kpi(ls.stages.won, l.wonK, { colour: 'var(--s4)', sub: fill(l.totalSub, { n: ls.total }) })}
</div>
<div class="chartrow" style="margin:14px 0">
  ${card(l.stages, leadStageBars(lang, D) || empty(t.noData), more(lang, '#/leads', t.tabs.leads))}
  ${card(l.bySource, hbars(ls.bySource.slice(0, 10).map(s => ({ label: s.label === '—' ? l.noSource : s.label, n: s.n, colour: s.label === '—' ? 'var(--ink4)' : '', sub: s.won ? fill(l.wonSub, { n: s.won }) : '' }))) || empty(t.noData))}
</div>
${card(l.byOwner, hbars(ls.byOwner.slice(0, 15).map(o => ({ label: o.name || T(lang).p.noOwner, n: o.n, colour: o.id ? 'var(--brand)' : 'var(--ink4)',
  sub: o.overdue ? fill(l.overdueSub, { n: o.overdue }) : '' }))) || empty(t.noData))}`;
}

function hrTab(lang, ctx, D) {
  const t = T(lang), h = t.h, hr = D.hr;
  if (!hr) return card(t.tabs.hr, empty(t.noData));
  const months = M.monthKeys(hr.today || D.today, 12);
  const lm = new Map((hr.leave_by_month || []).map(x => [x.month, x]));
  const days = [];
  for (let i = 29; i >= 0; i--) days.push(M.addDays(hr.today || D.today, -i));
  const pd = new Map((hr.present_by_day || []).map(x => [x.day, x.n]));
  return `
<div class="kpis kpis--4">
  ${kpi(hr.active, h.active, { colour: 'var(--s1)', sub: `${hr.joined_ytd} ${h.joined} · ${hr.left_ytd} ${h.left}`, route: '#/hr' })}
  ${kpi(hr.present_today, h.present, { colour: 'var(--s2)', sub: `${hr.on_leave_today} ${h.onLeave} · ${hr.sick_today} ${h.sick}`, route: '#/hr/attendance' })}
  ${kpi(hr.pending_requests, h.pending, { colour: 'var(--s3)', bad: hr.pending_requests > 0, route: '#/hr/requests' })}
  ${kpi(hr.contracts_ending, h.ending, { colour: 'var(--s4)', bad: hr.contracts_expired > 0, route: '#/hr/people' })}
</div>
${hr.payroll ? `<div class="kpis kpis--in" style="margin:0 0 14px">${kpi(sar(hr.payroll.gross), fill(h.payroll, { p: hr.payroll.period }),
  { colour: 'var(--ink3)', sub: fill(h.payrollSub, { n: hr.payroll.people, g: TL.sar(hr.payroll.gosi_employer, { compact: true }) }) })}</div>` : ''}
<div class="chartrow" style="margin:14px 0">
  ${card(h.byDept, hbars((hr.by_dept || []).map(r => ({ label: deptName(r.dept, lang), n: r.n, colour: deptColour(r.dept) }))) || empty(t.noData), more(lang, '#/hr', t.tabs.hr))}
  ${card(h.saudization, split([{ label: h.saudi, n: hr.saudi, colour: 'var(--s1)' }, { label: h.nonSaudi, n: hr.non_saudi, colour: 'var(--s4)' },
    { label: h.unknown, n: hr.nat_unknown, colour: 'var(--ink4)' }]) + (hr.no_file ? `<p class="note">${esc(h.fileNote)}</p>` : ''))}
</div>
<div class="chartrow" style="margin:14px 0">
  ${card(h.leave, columns(lang, months.map(m => ({ label: monthLabel(m, lang), sub: m.slice(0, 4), annual: lm.get(m)?.annual || 0, sick: lm.get(m)?.sick || 0, other: lm.get(m)?.other || 0 })),
    [{ key: 'annual', label: h.annual, colour: 'var(--s1)' }, { key: 'sick', label: h.sickL, colour: 'var(--s2)' }, { key: 'other', label: h.other, colour: 'var(--s3)' }], { title: h.leave }))}
  ${card(h.attendance, columns(lang, days.map((d, i) => ({ label: i % 5 === 4 ? d.slice(8) : '', sub: d, n: pd.get(d) || 0 })), [{ key: 'n', label: h.present, colour: 'var(--brand)' }], { title: h.attendance }))}
</div>`;
}

/* Rejection reasons live with the tender strings; a small copy avoids a
   circular import between the two screens. */
const TSTR_REASONS = {
  en: { price: 'Price / budget too low', timeline: 'Timeline too short', capacity: 'No capacity', scope: 'Outside our scope',
    requirements: 'Requirements not met', competition: 'Strong competition', client_risk: 'Client / payment risk', terms: 'Bond or contract terms', other: 'Other' },
  ar: { price: 'السعر / الميزانية منخفضة', timeline: 'المدة قصيرة', capacity: 'لا توجد طاقة استيعابية', scope: 'خارج نطاق عملنا',
    requirements: 'المتطلبات غير مستوفاة', competition: 'منافسة قوية', client_risk: 'مخاطر العميل / الدفع', terms: 'الضمان أو شروط العقد', other: 'أخرى' },
};

export function mgmtView(lang, ctx) {
  const tab = ctx.mgTab || 'overview';
  const D = compute(ctx);
  const body = { overview: overviewTab, projects: projectsTab, sales: salesTab, tenders: tendersTab, leads: leadsTab, hr: hrTab }[tab] || overviewTab;
  return tabs(lang, tab) + body(lang, ctx, D);
}
