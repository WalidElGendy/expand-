/* ==========================================================================
   Tenders — screens. Pure functions of (lang, ctx) → HTML; tenderctl.js
   loads the data and wires the events.

   The analyst records the tender and what we know about it; the Operations
   Director reads that and approves (choosing the project manager, which
   creates the project) or rejects (with a reason, which feeds the dashboard).
   ========================================================================== */

import * as db from './db.js';
import * as L from './tenderlogic.js';
import { esc, fmt, deptName, statusPill as projectPill, dropField } from './dash.js';

export const TSTR = {
  en: {
    nav: 'Tenders', title: 'Tenders', sub: 'What to apply for, and why',
    tabs: { dashboard: 'Dashboard', list: 'All tenders', settings: 'Settings' },
    newT: 'New tender', edit: 'Edit', save: 'Save', saveDraft: 'Save draft', cancel: 'Cancel', del: 'Delete',
    st: { draft: 'Draft', review: 'Awaiting decision', approved: 'Approved', rejected: 'Rejected' },
    src: { etimad: 'Etimad', direct: 'Direct invitation', email: 'Email', portal: 'Client portal', other: 'Other' },
    reasons: { price: 'Price / budget too low', timeline: 'Timeline too short', capacity: 'No capacity',
      scope: 'Outside our scope', requirements: 'Requirements not met', competition: 'Strong competition',
      client_risk: 'Client / payment risk', terms: 'Bond or contract terms', other: 'Other' },
    rec: { apply: 'Apply', consider: 'Consider', skip: 'Do not apply' },
    req: { met: 'Met', partial: 'Partly', gap: 'Gap' },
    kinds: { rfp: 'RFP / terms', boq: 'BOQ', drawings: 'Drawings', award: 'Award / result', other: 'Other' },
    f: { title: 'Tender title', client: 'Client', tender_no: 'Client reference no.', source: 'Source', category: 'Category',
      location: 'Location', issued_on: 'Issued', questions_due: 'Questions due', site_visit_on: 'Site visit',
      submission_due: 'Submission deadline', value_sar: 'Tender value (SAR)', client_budget_sar: 'Client budget (SAR)',
      bond_sar: 'Bid bond (SAR)', scope: 'Project scope', client_history: 'Client background & previous business (notes)',
      risks: 'Risks', summary: 'Analysis summary', recommendation: 'Analyst recommendation', win_chance: 'Chance of success (%)',
      analyst: 'Analyst', pm: 'Project manager', ref: 'Ref', deadline: 'Deadline', value: 'Value', status: 'Status',
      decided: 'Decided', decidedBy: 'Decided by', reason: 'Rejection reason', note: 'Note', project: 'Project' },
    sec: { details: 'Tender details', scope: 'Scope', reqs: 'Requirements to succeed', comps: 'Competitors on this project (previous rounds)',
      bg: 'Client background', analysis: 'Analyst’s view', docs: 'Documents', activity: 'Activity', decision: 'Decision' },
    reqAdd: 'Add requirement', reqPh: 'e.g. ISO 9001, 5 similar projects, local content 30%',
    compAdd: 'Add competitor', comp: { name: 'Competitor', year: 'Year', project: 'Project', price: 'Price (SAR)', won: 'Won' },
    reqScore: '{p}% ready · {m} met, {pa} partly, {g} gaps',
    bg: { ourTenders: 'Our tenders with this client', projects: 'Projects for this client', winRate: 'Win rate with this client',
      leads: 'Leads at this company', newClient: 'No history with this client yet — first time we see them.',
      prevTenders: 'Earlier tenders', prevProjects: 'Earlier projects', compAll: 'Competitors seen at this client',
      winning: 'Prices that won', times: 'Seen', wins: 'Won', lastPrice: 'Last price', avgPrice: 'Average',
      approvedOf: '{a} approved · {r} rejected', wonOf: '{w} won · {l} lost · {a} open', known: 'Known client: {t} tenders, {p} projects.' },
    act: { send: 'Send to {who} for decision', pull: 'Pull back to draft', approve: 'Approve & assign', reject: 'Reject',
      ret: 'Return to analyst', reopen: 'Reopen for decision', reassign: 'Change project manager', addNote: 'Add note', upload: 'Upload' },
    dec: { pickPm: 'Project manager to submit it', pmHint: 'Approving creates the project in Projects, owned by this PM, due on the submission deadline.',
      reasonPh: 'Choose a reason', notePh: 'Note for the analyst and the PM (optional)', approvedBy: 'Approved by {who} on {d}',
      rejectedBy: 'Rejected by {who} on {d}', waiting: 'Waiting for {who} to decide.', openProject: 'Open project',
      confirmReject: 'Reject this tender?', confirmDel: 'Delete this draft?', confirmSend: 'Send this tender for a decision?',
      needPm: 'Choose the project manager first.', needReason: 'Choose a rejection reason.' },
    ev: { created: 'created the tender', sent: 'sent it for decision', pulled: 'pulled it back to draft', returned: 'returned it to the analyst',
      approved: 'approved it', rejected: 'rejected it', reopened: 'reopened it', reassigned: 'changed the project manager', note: 'added a note' },
    dash: { total: 'Tenders', awaiting: 'Awaiting decision', approved: 'Approved', rejected: 'Rejected', conversion: 'Approval rate',
      convSub: 'approved ÷ decided', approvedVal: 'Approved value', rejectedVal: 'Rejected value', pendingVal: 'Value awaiting decision',
      avgDays: 'Average time to decide', days: '{n} days', monthly: 'Approved vs rejected, by month of decision',
      reasons: 'Top reasons for rejection', pms: 'Project managers with the most approved tenders', clients: 'Clients with the most approved tenders',
      queue: 'Waiting for your decision', year: 'Year', dueSoon: 'Submission deadlines in the next 14 days', allYears: 'All years', noData: 'Nothing yet.',
      ofTotal: '{n} of {t}', daysLeft: '{n} days left', today: 'Due today' },
    list: { search: 'Search title, client, ref…', anyStatus: 'Any status', anyClient: 'Any client', none: 'No tenders match.', csv: 'Export CSV' },
    set: { approvers: 'Approvers (decide on tenders)', analysts: 'Tender analysts (add and analyse tenders)',
      hint: 'Admins can always do both. Approvers usually means the Operations Director.', person: 'Person', approver: 'Approver', analyst: 'Analyst',
      saved: 'Saved.', notSigned: 'not signed in yet' },
    denied: 'Tenders are open to tender analysts, the approvers and the project manager assigned to a tender.',
    notFound: 'This tender does not exist or you cannot see it.',
    draftRestored: 'Restored what you were typing.', unsaved: 'Unsaved changes',
    up: { title: 'Tender documents', rfp: 'RFP / terms booklet', rfpHint: 'Drop the RFP here or click to choose — PDF, Word, Excel or ZIP',
      other: 'Other documents (BOQ, drawings…)', otherHint: 'Optional — add as many as you need',
      note: 'Files are uploaded when you save. A file picked but not saved is not kept if you leave the page.',
      uploading: 'Saving and uploading {n} file(s)…', failed: 'The tender was saved, but {n} file(s) did not upload: {names}. Add them again from the tender page.' },
    dept: 'Department',
  },
  ar: {
    nav: 'المناقصات', title: 'المناقصات', sub: 'ما نتقدم له، ولماذا',
    tabs: { dashboard: 'لوحة المؤشرات', list: 'كل المناقصات', settings: 'الإعدادات' },
    newT: 'مناقصة جديدة', edit: 'تعديل', save: 'حفظ', saveDraft: 'حفظ كمسودة', cancel: 'إلغاء', del: 'حذف',
    st: { draft: 'مسودة', review: 'بانتظار القرار', approved: 'معتمدة', rejected: 'مرفوضة' },
    src: { etimad: 'اعتماد', direct: 'دعوة مباشرة', email: 'بريد إلكتروني', portal: 'بوابة العميل', other: 'أخرى' },
    reasons: { price: 'السعر / الميزانية منخفضة', timeline: 'المدة قصيرة', capacity: 'لا توجد طاقة استيعابية',
      scope: 'خارج نطاق عملنا', requirements: 'المتطلبات غير مستوفاة', competition: 'منافسة قوية',
      client_risk: 'مخاطر العميل / الدفع', terms: 'الضمان أو شروط العقد', other: 'أخرى' },
    rec: { apply: 'التقدم', consider: 'للدراسة', skip: 'عدم التقدم' },
    req: { met: 'مستوفى', partial: 'جزئياً', gap: 'غير مستوفى' },
    kinds: { rfp: 'كراسة الشروط', boq: 'جدول الكميات', drawings: 'المخططات', award: 'الترسية / النتيجة', other: 'أخرى' },
    f: { title: 'عنوان المناقصة', client: 'العميل', tender_no: 'رقم المناقصة لدى العميل', source: 'المصدر', category: 'الفئة',
      location: 'الموقع', issued_on: 'تاريخ الطرح', questions_due: 'آخر موعد للاستفسارات', site_visit_on: 'زيارة الموقع',
      submission_due: 'آخر موعد للتقديم', value_sar: 'قيمة المناقصة (ر.س)', client_budget_sar: 'ميزانية العميل (ر.س)',
      bond_sar: 'الضمان الابتدائي (ر.س)', scope: 'نطاق المشروع', client_history: 'خلفية العميل والأعمال السابقة (ملاحظات)',
      risks: 'المخاطر', summary: 'ملخص التحليل', recommendation: 'توصية المحلل', win_chance: 'فرصة النجاح (%)',
      analyst: 'المحلل', pm: 'مدير المشروع', ref: 'المرجع', deadline: 'آخر موعد', value: 'القيمة', status: 'الحالة',
      decided: 'تاريخ القرار', decidedBy: 'صاحب القرار', reason: 'سبب الرفض', note: 'ملاحظة', project: 'المشروع' },
    sec: { details: 'بيانات المناقصة', scope: 'النطاق', reqs: 'متطلبات النجاح', comps: 'المنافسون على المشروع (جولات سابقة)',
      bg: 'خلفية العميل', analysis: 'رأي المحلل', docs: 'المستندات', activity: 'السجل', decision: 'القرار' },
    reqAdd: 'إضافة متطلب', reqPh: 'مثال: ISO 9001، خمسة مشاريع مماثلة، محتوى محلي 30%',
    compAdd: 'إضافة منافس', comp: { name: 'المنافس', year: 'السنة', project: 'المشروع', price: 'السعر (ر.س)', won: 'فاز' },
    reqScore: 'الجاهزية {p}% · {m} مستوفى، {pa} جزئياً، {g} غير مستوفى',
    bg: { ourTenders: 'مناقصاتنا مع هذا العميل', projects: 'مشاريع هذا العميل', winRate: 'نسبة الفوز مع العميل',
      leads: 'عملاء محتملون في الجهة', newClient: 'لا يوجد تاريخ مع هذا العميل — أول تعامل.',
      prevTenders: 'مناقصات سابقة', prevProjects: 'مشاريع سابقة', compAll: 'المنافسون لدى هذا العميل',
      winning: 'الأسعار الفائزة', times: 'مرات الظهور', wins: 'مرات الفوز', lastPrice: 'آخر سعر', avgPrice: 'المتوسط',
      approvedOf: '{a} معتمدة · {r} مرفوضة', wonOf: '{w} فوز · {l} خسارة · {a} جارية', known: 'عميل معروف: {t} مناقصات، {p} مشاريع.' },
    act: { send: 'إرسال إلى {who} للقرار', pull: 'إعادة إلى المسودة', approve: 'اعتماد وتعيين', reject: 'رفض',
      ret: 'إعادة إلى المحلل', reopen: 'إعادة فتح للقرار', reassign: 'تغيير مدير المشروع', addNote: 'إضافة ملاحظة', upload: 'رفع' },
    dec: { pickPm: 'مدير المشروع المسؤول عن التقديم', pmHint: 'الاعتماد ينشئ المشروع في المشاريع باسم مدير المشروع وموعد التسليم هو آخر موعد للتقديم.',
      reasonPh: 'اختر السبب', notePh: 'ملاحظة للمحلل ومدير المشروع (اختياري)', approvedBy: 'اعتمدها {who} بتاريخ {d}',
      rejectedBy: 'رفضها {who} بتاريخ {d}', waiting: 'بانتظار قرار {who}.', openProject: 'فتح المشروع',
      confirmReject: 'رفض هذه المناقصة؟', confirmDel: 'حذف هذه المسودة؟', confirmSend: 'إرسال المناقصة للقرار؟',
      needPm: 'اختر مدير المشروع أولاً.', needReason: 'اختر سبب الرفض.' },
    ev: { created: 'أنشأ المناقصة', sent: 'أرسلها للقرار', pulled: 'أعادها إلى المسودة', returned: 'أعادها إلى المحلل',
      approved: 'اعتمدها', rejected: 'رفضها', reopened: 'أعاد فتحها', reassigned: 'غيّر مدير المشروع', note: 'أضاف ملاحظة' },
    dash: { total: 'المناقصات', awaiting: 'بانتظار القرار', approved: 'معتمدة', rejected: 'مرفوضة', conversion: 'نسبة الاعتماد',
      convSub: 'المعتمدة ÷ ما تم البت فيه', approvedVal: 'قيمة المعتمدة', rejectedVal: 'قيمة المرفوضة', pendingVal: 'قيمة بانتظار القرار',
      avgDays: 'متوسط مدة القرار', days: '{n} يوم', monthly: 'المعتمدة مقابل المرفوضة حسب شهر القرار',
      reasons: 'أكثر أسباب الرفض', pms: 'مدراء المشاريع الأكثر مناقصات معتمدة', clients: 'العملاء الأكثر مناقصات معتمدة',
      queue: 'بانتظار قرارك', year: 'السنة', dueSoon: 'مواعيد التقديم خلال 14 يوماً', allYears: 'كل السنوات', noData: 'لا يوجد شيء بعد.',
      ofTotal: '{n} من {t}', daysLeft: 'متبقٍ {n} يوم', today: 'اليوم آخر موعد' },
    list: { search: 'ابحث بالعنوان أو العميل أو المرجع…', anyStatus: 'كل الحالات', anyClient: 'كل العملاء', none: 'لا توجد مناقصات مطابقة.', csv: 'تصدير CSV' },
    set: { approvers: 'أصحاب القرار (اعتماد المناقصات)', analysts: 'محللو المناقصات (إضافة وتحليل)',
      hint: 'المدراء العامون (admin) لديهم الصلاحيتان دائماً. صاحب القرار عادةً مدير العمليات.', person: 'الموظف', approver: 'صاحب قرار', analyst: 'محلل',
      saved: 'تم الحفظ.', notSigned: 'لم يسجل الدخول بعد' },
    denied: 'المناقصات متاحة لمحللي المناقصات وأصحاب القرار ومدير المشروع المعيّن على المناقصة.',
    notFound: 'هذه المناقصة غير موجودة أو لا يمكنك رؤيتها.',
    draftRestored: 'تمت استعادة ما كنت تكتبه.', unsaved: 'تغييرات غير محفوظة',
    up: { title: 'مستندات المناقصة', rfp: 'كراسة الشروط والمواصفات (RFP)', rfpHint: 'اسحب الكراسة هنا أو اضغط للاختيار — PDF أو Word أو Excel أو ZIP',
      other: 'مستندات أخرى (جدول الكميات، المخططات…)', otherHint: 'اختياري — أضف ما تحتاج',
      note: 'تُرفع الملفات عند الحفظ. الملف المختار دون حفظ لا يُحتفظ به إذا غادرت الصفحة.',
      uploading: 'جارٍ الحفظ ورفع {n} ملف…', failed: 'تم حفظ المناقصة، لكن لم يُرفع {n} ملف: {names}. أضفها مرة أخرى من صفحة المناقصة.' },
    dept: 'القسم',
  },
};

const T = (lang) => TSTR[lang];
const role = () => db.state.me?.tender || {};
export const canSeeTenders = (me = db.state.me) => !!(me && (me.tender?.approver || me.tender?.analyst || me.tender?.assigned));

/* ---------------------------------------------------------------- helpers */
const ST_C = { draft: 'var(--ink3)', review: 'var(--warn)', approved: 'var(--ok)', rejected: 'var(--critical)' };
const REC_C = { apply: 'var(--ok)', consider: 'var(--warn)', skip: 'var(--critical)' };
const REQ_C = { met: 'var(--ok)', partial: 'var(--warn)', gap: 'var(--critical)' };
const pill = (label, colour) => `<span class="st" style="--c:${colour}"><i></i>${esc(label)}</span>`;
export const statusPill = (s, lang) => pill(T(lang).st[s] || s, ST_C[s] || 'var(--ink3)');
const opt = (v, label, sel) => `<option value="${esc(v)}"${String(v) === String(sel ?? '') ? ' selected' : ''}>${esc(label)}</option>`;
const fld = (label, inner, wide = false) => `<label class="f${wide ? ' f--wide' : ''}"><span>${esc(label)}</span>${inner}</label>`;
const go = (route, label, cls = 'link') => `<button class="${cls}" data-act="go" data-route="${esc(route)}">${esc(label)}</button>`;
const card = (title, body, extra = '') => `<section class="card"><div class="card__head"><h2>${esc(title)}</h2>${extra}</div>${body}</section>`;
const empty = (text) => `<p class="note">${esc(text)}</p>`;
const tbl = (head, rows) => `<div class="tblwrap"><table class="tbl tbl--tight"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
const kpi = (n, label, { sub = '', colour = '', bad = false } = {}) => `<div class="kpi${bad ? ' kpi--bad' : ''}">
  <span class="kpi__l">${colour ? `<i style="--c:${colour}"></i>` : ''}${esc(label)}</span>
  <span class="kpi__n">${n}</span>${sub ? `<span class="kpi__s">${esc(sub)}</span>` : ''}</div>`;
const fact = (label, value) => `<div class="fact"><span class="fact__l">${esc(label)}</span><span class="fact__v">${value}</span></div>`;
const nm = (people, id) => { const p = (people || []).find(x => x.id === id); return p ? (p.full_name || p.email || '—') : '—'; };
const todayISO = () => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);   // Riyadh
const fill = (s, o) => Object.entries(o).reduce((a, [k, v]) => a.replaceAll(`{${k}}`, v), s);
const money = (v) => (v == null || v === '' ? '—' : esc(L.sar(v)));
const when = (ts, lang) => ts ? esc(fmt(String(ts).slice(0, 10), lang)) : '—';

function deadlineCell(t, lang, today = todayISO()) {
  if (!t.submission_due) return '<span class="muted">—</span>';
  const left = L.daysLeft(t.submission_due, today);
  const open = ['draft', 'review'].includes(t.status);
  const tag = !open || left === null ? '' : left < 0 ? ' bad' : left <= 7 ? ' bad' : '';
  const sub = open && left !== null && left >= 0 ? `<span class="block small muted">${esc(left === 0 ? T(lang).dash.today : fill(T(lang).dash.daysLeft, { n: left }))}</span>` : '';
  return `<span class="${tag.trim()}">${esc(fmt(t.submission_due, lang))}</span>${sub}`;
}

function hbars(rows, { fillC = 'var(--brand)', fmtN = (n) => String(n) } = {}) {
  if (!rows.length) return '';
  const max = Math.max(...rows.map(r => r.n), 1);
  return `<ul class="hbars">${rows.map(r => `
    <li class="hb" title="${esc(r.label)} — ${esc(fmtN(r.n))}${r.sub ? ' · ' + esc(r.sub) : ''}">
      <span class="hb__l">${r.route ? go(r.route, r.label) : esc(r.label)}${r.sub ? `<span class="hb__sub">${esc(r.sub)}</span>` : ''}</span>
      <span class="hb__track"><span class="hb__fill" style="width:${(r.n / max) * 100}%;background:${fillC}"></span></span>
      <span class="hb__n">${esc(fmtN(r.n))}</span>
    </li>`).join('')}</ul>`;
}

/** Approved and rejected per month: two series, so a legend; labels only on
    the largest bar of each series. Colours are categorical slots 1 and 4:
    the green/red status pair fails colour-blind separation (deutan ΔE 4.1),
    these pass in both themes, and the legend names each one. */
function monthlyChart(lang, months) {
  const t = T(lang);
  if (!months.some(m => m.approved || m.rejected)) return empty(t.dash.noData);
  const W = 620, H = 210, PT = 22, PB = 28, PL = 8, PR = 8;
  const series = lang === 'ar' ? [...months].reverse() : months;
  const step = (W - PL - PR) / series.length, bw = Math.max(5, Math.min(16, (step - 8) / 2));
  const ph = H - PT - PB, base = PT + ph;
  const max = Math.max(1, ...series.map(m => Math.max(m.approved, m.rejected)));
  const maxA = series.reduce((b, m, i) => (m.approved > series[b].approved ? i : b), 0);
  const maxR = series.reduce((b, m, i) => (m.rejected > series[b].rejected ? i : b), 0);
  const bar = (x, y, w, h) => { const r = Math.min(4, w / 2, h); return h <= 0 ? '' : `M${x} ${y + h}V${y + r}q0-${r} ${r}-${r}h${w - 2 * r}q${r} 0 ${r} ${r}V${y + h}Z`; };
  const mlabel = (k) => new Date(k + '-01T00:00:00Z').toLocaleDateString(lang === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', { month: 'short', timeZone: 'UTC' });
  return `<div class="split__legend" style="padding:8px 16px 0;margin:0">
      <span><i class="sw" style="background:var(--s1)"></i>${esc(t.dash.approved)}</span>
      <span><i class="sw" style="background:var(--s4)"></i>${esc(t.dash.rejected)}</span></div>
    <div class="chartwrap"><svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${esc(t.dash.monthly)}">
    <g class="grid"><line x1="${PL}" x2="${W - PR}" y1="${base}" y2="${base}"/></g>
    ${series.map((m, i) => {
      const cx = PL + i * step + step / 2;
      const ha = (m.approved / max) * ph, hr = (m.rejected / max) * ph;
      const xa = cx - bw - 1, xr = cx + 1;
      return `<g class="bar"><title>${esc(mlabel(m.month))} ${esc(m.month.slice(0, 4))} — ${esc(t.dash.approved)} ${m.approved}, ${esc(t.dash.rejected)} ${m.rejected}</title>
        <rect x="${PL + i * step}" y="${PT}" width="${step}" height="${ph}" fill="transparent"/>
        <path d="${bar(xa, base - ha, bw, ha)}" style="fill:var(--s1)"/>
        <path d="${bar(xr, base - hr, bw, hr)}" style="fill:var(--s4)"/>
        ${i === maxA && m.approved ? `<text x="${xa + bw / 2}" y="${base - ha - 5}" class="val" text-anchor="middle">${m.approved}</text>` : ''}
        ${i === maxR && m.rejected ? `<text x="${xr + bw / 2}" y="${base - hr - 5}" class="val" text-anchor="middle">${m.rejected}</text>` : ''}
        <text x="${cx}" y="${H - 9}" class="axis" text-anchor="middle">${esc(mlabel(m.month))}</text></g>`;
    }).join('')}
  </svg></div>`;
}

function tabs(lang, on, extra = '') {
  const t = T(lang);
  const items = [['dashboard', '#/tenders'], ['list', '#/tenders/list']];
  if (db.state.me?.role === 'admin') items.push(['settings', '#/tenders/settings']);
  return `<nav class="hrtabs">${items.map(([k, r]) =>
    `<button class="hrtab${k === on ? ' is-on' : ''}" data-act="go" data-route="${r}">${esc(t.tabs[k])}</button>`).join('')}
    <span style="margin-inline-start:auto;display:flex;gap:8px;align-items:center">${extra}
    ${role().analyst ? `<button class="btn btn--primary btn--sm" data-act="go" data-route="#/tenders/new">${esc(t.newT)}</button>` : ''}</span></nav>`;
}
const denied = (lang) => card(T(lang).title, empty(T(lang).denied));

/* ============================================================== dashboard */

export function tendersDashView(lang, ctx) {
  const t = T(lang), d = t.dash;
  if (!canSeeTenders()) return denied(lang);
  const all = ctx.tenders || [];
  const today = todayISO();
  const year = ctx.tnYear || '';
  const s = L.tenderStats(all, { year: year || null, today });
  const people = ctx.people || [];
  const years = L.yearsOf(all);
  const queue = role().approver ? all.filter(x => x.status === 'review')
    .sort((a, b) => String(a.submission_due || '9999').localeCompare(String(b.submission_due || '9999'))) : [];
  const pct = (n) => (s.total ? Math.round((n / s.total) * 100) : 0);
  return `
${tabs(lang, 'dashboard', `<select class="procsel" data-tn-year aria-label="${esc(d.year)}">${opt('', d.allYears, year)}${years.map(y => opt(y, y, year)).join('')}</select>`)}
<div class="kpis">
  ${kpi(s.total, d.total, { colour: 'var(--brand)', sub: `${s.draft} ${t.st.draft}` })}
  ${kpi(s.review, d.awaiting, { colour: 'var(--warn)', sub: L.sar(s.pendingValue, { compact: true }) })}
  ${kpi(s.approved, d.approved, { colour: 'var(--ok)', sub: `${pct(s.approved)}%` })}
  ${kpi(s.rejected, d.rejected, { colour: 'var(--critical)', sub: `${pct(s.rejected)}%` })}
  ${kpi(s.conversion === null ? '—' : `${s.conversion}%`, d.conversion, { colour: 'var(--info)', sub: `${d.convSub} · ${s.approved}/${s.decided}` })}
  ${kpi(s.avgDecisionDays === null ? '—' : esc(fill(d.days, { n: s.avgDecisionDays })), d.avgDays, { colour: 'var(--ink3)' })}
</div>
<div class="kpis kpis--in" style="margin:0 0 14px">
  ${kpi(esc(L.sar(s.approvedValue, { compact: true })), d.approvedVal, { colour: 'var(--ok)', sub: L.sar(s.approvedValue) })}
  ${kpi(esc(L.sar(s.rejectedValue, { compact: true })), d.rejectedVal, { colour: 'var(--critical)', sub: L.sar(s.rejectedValue) })}
  ${kpi(esc(L.sar(s.pendingValue, { compact: true })), d.pendingVal, { colour: 'var(--warn)', sub: L.sar(s.pendingValue) })}
</div>
${queue.length ? card(`${d.queue} · ${queue.length}`, listTable(lang, ctx, queue, { compact: true })) : ''}
<div class="chartrow" style="margin:14px 0">
  ${card(d.monthly, monthlyChart(lang, s.monthly))}
  ${card(d.reasons, hbars(s.reasons.map(r => ({ label: t.reasons[r.key], n: r.n, sub: L.sar(r.value, { compact: true }) })), { fillC: 'var(--critical)' }) || empty(d.noData))}
</div>
<div class="chartrow" style="margin:14px 0">
  ${card(d.pms, hbars(s.pms.slice(0, 10).map(r => ({ label: nm(people, r.id), n: r.n, sub: L.sar(r.value, { compact: true }) }))) || empty(d.noData))}
  ${card(d.clients, hbars(s.clients.slice(0, 10).map(r => ({ label: r.name, n: r.n, sub: L.sar(r.value, { compact: true }) })), { fillC: 'var(--info)' }) || empty(d.noData))}
</div>
${s.dueSoon.length ? card(d.dueSoon, listTable(lang, ctx, s.dueSoon.map(x => x.t), { compact: true })) : ''}`;
}

/* ================================================================== list */

function listTable(lang, ctx, list, { compact = false } = {}) {
  const t = T(lang);
  if (!list.length) return empty(t.list.none);
  const people = ctx.people || [];
  return tbl(`<th>${t.f.ref}</th><th>${t.f.title}</th><th>${t.f.client}</th><th>${t.f.deadline}</th><th class="num">${t.f.value}</th>
    ${compact ? '' : `<th>${t.f.analyst}</th>`}<th>${t.f.status}</th><th>${t.f.pm}</th>`,
    list.map(x => `<tr>
      <td class="small muted" style="white-space:nowrap">${esc(x.ref || '')}</td>
      <td>${go(`#/t/${x.id}`, x.title)}</td>
      <td>${esc(x.client)}</td>
      <td style="white-space:nowrap">${deadlineCell(x, lang)}</td>
      <td class="num" style="white-space:nowrap">${money(x.value_sar)}</td>
      ${compact ? '' : `<td class="small">${esc(nm(people, x.analyst_id))}</td>`}
      <td>${statusPill(x.status, lang)}${x.status === 'rejected' && x.reject_reason ? `<span class="block small muted">${esc(t.reasons[x.reject_reason] || '')}</span>` : ''}</td>
      <td class="small">${x.pm_id ? esc(nm(people, x.pm_id)) : '—'}</td>
    </tr>`).join(''));
}

export function tendersListView(lang, ctx) {
  const t = T(lang);
  if (!canSeeTenders()) return denied(lang);
  const all = ctx.tenders || [];
  const f = ctx.tnFilter || {};
  const clients = [...new Map(all.map(x => [L.normClient(x.client), x.client.trim()])).values()].sort((a, b) => a.localeCompare(b));
  const rows = L.filterTenders(all, f);
  return `
${tabs(lang, 'list')}
<section class="card">
  <div class="filterbar">
    <label class="f f--sm"><span>${esc(t.list.search)}</span><input type="search" data-tn-f="q" value="${esc(f.q || '')}" placeholder="${esc(t.list.search)}" /></label>
    <label class="f f--sm"><span>${esc(t.f.status)}</span><select data-tn-f="status">${opt('', t.list.anyStatus, f.status)}${L.STATUSES.map(s => opt(s, t.st[s], f.status)).join('')}</select></label>
    <label class="f f--sm"><span>${esc(t.f.client)}</span><select data-tn-f="client">${opt('', t.list.anyClient, f.client)}${clients.map(c => opt(c, c, f.client)).join('')}</select></label>
    <button class="btn btn--sm" data-tn-csv>${esc(t.list.csv)}</button>
  </div>
  <div data-tn-rows>${listTable(lang, ctx, rows)}</div>
</section>`;
}
export const listRowsHtml = (lang, ctx) => listTable(lang, ctx, L.filterTenders(ctx.tenders || [], ctx.tnFilter || {}));

export function tendersCSV(lang, ctx) {
  const t = T(lang), people = ctx.people || [];
  const rows = L.filterTenders(ctx.tenders || [], ctx.tnFilter || {}).map(x => [x.ref, x.title, x.client, x.tender_no || '',
    t.src[x.source] || '', x.submission_due || '', x.value_sar ?? '', t.st[x.status], x.status === 'rejected' ? (t.reasons[x.reject_reason] || '') : '',
    nm(people, x.analyst_id), x.pm_id ? nm(people, x.pm_id) : '', x.decided_at ? x.decided_at.slice(0, 10) : '', x.win_chance ?? '']);
  return L.toCSV([[t.f.ref, t.f.title, t.f.client, t.f.tender_no, t.f.source, t.f.submission_due, t.f.value_sar, t.f.status, t.f.reason,
    t.f.analyst, t.f.pm, t.f.decided, t.f.win_chance], ...rows]);
}

/* ================================================================ detail */

function backgroundCard(lang, ctx, x) {
  const t = T(lang), b = t.bg;
  const bg = L.clientBackground(x, { tenders: ctx.tenders || [], projects: ctx.projects || [], leads: ctx.leads || [] });
  if (!bg) return '';
  const tiles = `<div class="kpis kpis--in">
    ${kpi(bg.tStats.total, b.ourTenders, { colour: 'var(--brand)', sub: fill(b.approvedOf, { a: bg.tStats.approved, r: bg.tStats.rejected }) })}
    ${kpi(bg.pStats.total, b.projects, { colour: 'var(--info)', sub: fill(b.wonOf, { w: bg.pStats.won, l: bg.pStats.lost, a: bg.pStats.active }) })}
    ${kpi(bg.pStats.winRate === null ? '—' : `${bg.pStats.winRate}%`, b.winRate, { colour: 'var(--ok)' })}
    ${kpi(bg.leads.length, b.leads, { colour: 'var(--ink3)' })}
  </div>`;
  const prevT = bg.tenders.length ? `<h3 class="subhead" style="padding:0 16px">${esc(b.prevTenders)}</h3>${tbl(
    `<th>${t.f.ref}</th><th>${t.f.title}</th><th class="num">${t.f.value}</th><th>${t.f.status}</th><th>${t.f.decided}</th>`,
    bg.tenders.slice(0, 15).map(o => `<tr><td class="small muted">${esc(o.ref || '')}</td><td>${go(`#/t/${o.id}`, o.title)}</td>
      <td class="num">${money(o.value_sar)}</td><td>${statusPill(o.status, lang)}${o.status === 'rejected' && o.reject_reason ? `<span class="block small muted">${esc(t.reasons[o.reject_reason])}</span>` : ''}</td>
      <td class="small">${when(o.decided_at, lang)}</td></tr>`).join(''))}` : '';
  const prevP = bg.projects.length ? `<h3 class="subhead" style="padding:0 16px">${esc(b.prevProjects)}</h3>${tbl(
    `<th>${t.f.project}</th><th>${t.f.status}</th><th>${t.f.deadline}</th>`,
    bg.projects.slice(0, 15).map(p => `<tr><td>${go(`#/p/${p.id}`, p.name)}</td><td>${projectPill(p.status, lang)}</td>
      <td class="small">${when(p.due_on || p.delivered_on, lang)}</td></tr>`).join(''))}` : '';
  const comps = bg.competitors.length ? `<h3 class="subhead" style="padding:0 16px">${esc(b.compAll)}</h3>${tbl(
    `<th>${t.comp.name}</th><th class="num">${b.times}</th><th class="num">${b.wins}</th><th class="num">${b.lastPrice}</th><th class="num">${b.avgPrice}</th>`,
    bg.competitors.map(c => `<tr><td>${esc(c.name)}</td><td class="num">${c.times}</td><td class="num">${c.wins}</td>
      <td class="num">${c.lastPrice ? money(c.lastPrice) : '—'}${c.lastYear ? ` <span class="small muted">(${c.lastYear})</span>` : ''}</td>
      <td class="num">${c.avgPrice ? money(c.avgPrice) : '—'}</td></tr>`).join(''))}` : '';
  const wins = bg.winningPrices.length ? `<h3 class="subhead" style="padding:0 16px">${esc(b.winning)}</h3><ul class="alerts">${bg.winningPrices.slice(0, 8).map(w =>
    `<li class="alert"><span class="alert__dot" style="background:var(--ok)"></span><b>${money(w.price)}</b> <span>${esc(w.name)}</span>
      <span class="alert__t">${esc([w.project, w.year].filter(Boolean).join(' · '))}</span></li>`).join('')}</ul>` : '';
  const notes = x.client_history ? `<div style="padding:4px 16px 14px"><p class="prose">${esc(x.client_history)}</p></div>` : '';
  return card(`${t.sec.bg} · ${x.client}`, `<div style="padding:0 16px">${bg.isNew ? `<p class="note">${esc(b.newClient)}</p>` : ''}${tiles}</div>${notes}${prevT}${prevP}${comps}${wins}`);
}

function analysisCard(lang, x) {
  const t = T(lang);
  const rs = L.reqStats(x.requirements);
  const chance = x.win_chance ?? null;
  const facts = `<div class="factgrid">
    ${fact(t.f.recommendation, x.recommendation ? pill(t.rec[x.recommendation], REC_C[x.recommendation]) : '—')}
    ${fact(t.f.win_chance, chance === null ? '—' : `<span style="display:flex;align-items:center;gap:8px;width:100%"><b>${chance}%</b>
      <span class="hb__track" style="flex:1;max-width:160px"><span class="hb__fill" style="width:${chance}%;background:${chance >= 60 ? 'var(--ok)' : chance >= 35 ? 'var(--warn)' : 'var(--critical)'}"></span></span></span>`)}
    ${fact(t.sec.reqs, rs.total ? esc(fill(t.reqScore, { p: rs.score, m: rs.met, pa: rs.partial, g: rs.gap })) : '—')}
  </div>`;
  const prose = [[t.f.summary, x.summary], [t.f.risks, x.risks]].filter(([, v]) => v)
    .map(([k, v]) => `<h3 class="subhead" style="padding:0 16px;margin-top:6px">${esc(k)}</h3><div style="padding:0 16px 12px"><p class="prose">${esc(v)}</p></div>`).join('');
  return card(t.sec.analysis, facts + prose);
}

function decisionCard(lang, ctx, x) {
  const t = T(lang), dc = t.dec;
  const r = role();
  const people = (ctx.people || []).filter(p => p.is_active);
  const approverName = (ctx.tnSettings?.approvers || []).map(id => nm(ctx.people, id)).filter(n => n !== '—').join(', ') || '—';
  if (x.status === 'approved') {
    return card(t.sec.decision, `<div class="factgrid">
      ${fact(t.f.status, statusPill('approved', lang))}
      ${fact(t.f.decidedBy, esc(fill(dc.approvedBy, { who: nm(ctx.people, x.decided_by), d: fmt(x.decided_at.slice(0, 10), lang) })))}
      ${fact(t.f.pm, esc(nm(ctx.people, x.pm_id)))}
      ${fact(t.f.project, x.project_id ? go(`#/p/${x.project_id}`, dc.openProject) : '—')}
      ${x.decision_note ? fact(t.f.note, esc(x.decision_note)) : ''}</div>
      ${r.approver ? `<form class="inlineform" data-tn-reassign style="border-bottom:0"><div class="fields">
        ${fld(t.act.reassign, pmSelect(lang, people, x.pm_id))}
        <div class="f" style="align-self:end"><button class="btn btn--sm">${esc(t.act.reassign)}</button></div></div></form>` : ''}`);
  }
  if (x.status === 'rejected') {
    return card(t.sec.decision, `<div class="factgrid">
      ${fact(t.f.status, statusPill('rejected', lang))}
      ${fact(t.f.reason, esc(t.reasons[x.reject_reason] || '—'))}
      ${fact(t.f.decidedBy, esc(fill(dc.rejectedBy, { who: nm(ctx.people, x.decided_by), d: fmt(x.decided_at.slice(0, 10), lang) })))}
      ${x.decision_note ? fact(t.f.note, esc(x.decision_note)) : ''}</div>
      ${r.approver ? `<div class="actions" style="padding:0 16px 14px"><button class="btn btn--sm" data-tn-do="reopen">${esc(t.act.reopen)}</button></div>` : ''}`);
  }
  if (x.status === 'review' && r.approver) {
    return card(t.sec.decision, `<form class="inlineform" data-tn-decide style="border-bottom:0">
      <div class="fields">
        ${fld(dc.pickPm, pmSelect(lang, people, ''))}
        ${fld(t.f.reason, `<select name="reason">${opt('', dc.reasonPh, '')}${L.REASONS.map(k => opt(k, t.reasons[k], '')).join('')}</select>`)}
        ${fld(t.f.note, `<textarea name="note" rows="2" placeholder="${esc(dc.notePh)}"></textarea>`, true)}
      </div>
      <p class="note">${esc(dc.pmHint)}</p>
      <div class="actions">
        <button type="button" class="btn btn--primary" data-tn-do="approve">${esc(t.act.approve)}</button>
        <button type="button" class="btn btn--danger" data-tn-do="reject">${esc(t.act.reject)}</button>
        <button type="button" class="btn btn--ghost" data-tn-do="return">${esc(t.act.ret)}</button>
      </div></form>`);
  }
  if (x.status === 'review') return card(t.sec.decision, `<p class="note">${esc(fill(dc.waiting, { who: approverName }))}</p>`);
  return '';
}

function pmSelect(lang, people, sel) {
  const pmDept = people.filter(p => p.department_id === 'pm').sort((a, b) => String(a.full_name).localeCompare(String(b.full_name)));
  const others = people.filter(p => p.department_id !== 'pm').sort((a, b) => String(a.full_name).localeCompare(String(b.full_name)));
  const o = (p) => opt(p.id, p.full_name || p.email, sel);
  return `<select name="pm">${opt('', '—', sel)}<optgroup label="${esc(deptName('pm', lang))}">${pmDept.map(o).join('')}</optgroup>
    <optgroup label="—">${others.map(o).join('')}</optgroup></select>`;
}

export function tenderView(lang, ctx) {
  const t = T(lang);
  if (!canSeeTenders()) return denied(lang);
  const x = ctx.tender;
  if (!x) return card(t.title, empty(t.notFound));
  const r = role();
  const people = ctx.people || [];
  const editable = r.analyst && ['draft', 'review'].includes(x.status);
  const approverName = (ctx.tnSettings?.approvers || []).map(id => nm(people, id)).filter(n => n !== '—')[0] || t.dash.approved;
  const actions = [
    editable ? `<button class="btn btn--sm" data-act="go" data-route="#/t/${x.id}/edit">${esc(t.edit)}</button>` : '',
    r.analyst && x.status === 'draft' ? `<button class="btn btn--primary btn--sm" data-tn-send>${esc(fill(t.act.send, { who: approverName }))}</button>` : '',
    r.analyst && x.status === 'review' ? `<button class="btn btn--ghost btn--sm" data-tn-pull>${esc(t.act.pull)}</button>` : '',
    (r.analyst && x.status === 'draft') || db.state.me?.role === 'admin' && x.status !== 'approved' ? `<button class="btn btn--danger btn--sm" data-tn-del>${esc(t.del)}</button>` : '',
  ].filter(Boolean).join('');
  const reqs = Array.isArray(x.requirements) ? x.requirements : [];
  const comps = Array.isArray(x.competitors) ? x.competitors : [];
  const files = ctx.tnFiles || [];
  const events = ctx.tnEvents || [];
  return `
<nav class="crumb">${go('#/tenders', t.title)} <span class="muted">/</span> <span class="muted">${esc(x.ref || '')}</span></nav>
${ctx.tnUploadError ? `<p class="note note--warn">${esc(ctx.tnUploadError)}</p>` : ''}
<section class="card">
  <div class="card__head"><h2>${esc(x.title)}</h2>${statusPill(x.status, lang)}
    <span style="margin-inline-start:auto;display:flex;gap:8px;flex-wrap:wrap">${actions}</span></div>
  <div class="factgrid">
    ${fact(t.f.client, esc(x.client))}
    ${fact(t.f.ref, esc([x.ref, x.tender_no].filter(Boolean).join(' · ')))}
    ${fact(t.f.submission_due, deadlineCell(x, lang))}
    ${fact(t.f.value_sar, money(x.value_sar))}
    ${fact(t.f.analyst, esc(nm(people, x.analyst_id)))}
    ${x.pm_id ? fact(t.f.pm, esc(nm(people, x.pm_id))) : ''}
  </div>
</section>
${decisionCard(lang, ctx, x)}
${analysisCard(lang, x)}
${backgroundCard(lang, ctx, x)}
${card(t.sec.details, `<div class="factgrid">
  ${fact(t.f.source, esc(t.src[x.source] || '—'))}${fact(t.f.category, esc(x.category || '—'))}${fact(t.f.location, esc(x.location || '—'))}
  ${fact(t.f.issued_on, when(x.issued_on, lang))}${fact(t.f.questions_due, when(x.questions_due, lang))}${fact(t.f.site_visit_on, when(x.site_visit_on, lang))}
  ${fact(t.f.client_budget_sar, money(x.client_budget_sar))}${fact(t.f.bond_sar, money(x.bond_sar))}</div>`)}
${x.scope ? card(t.sec.scope, `<div style="padding:4px 16px 14px"><p class="prose">${esc(x.scope)}</p></div>`) : ''}
${card(t.sec.reqs, reqs.length ? `<ul class="alerts">${reqs.map(q => `<li class="alert">${pill(t.req[q.status] || q.status, REQ_C[q.status] || 'var(--ink3)')} <span>${esc(q.text)}</span></li>`).join('')}</ul>` : empty('—'))}
${card(t.sec.comps, comps.length ? tbl(`<th>${t.comp.name}</th><th>${t.comp.year}</th><th>${t.comp.project}</th><th class="num">${t.comp.price}</th><th>${t.comp.won}</th>`,
  comps.map(c => `<tr><td>${esc(c.name)}</td><td class="small">${esc(c.year || '—')}</td><td class="small">${esc(c.project || '—')}</td>
    <td class="num">${c.price_sar != null ? money(c.price_sar) : '—'}</td><td>${c.won ? pill(t.comp.won, 'var(--ok)') : ''}</td></tr>`).join('')) : empty('—'))}
${card(t.sec.docs, `${files.length ? `<ul class="alerts">${files.map(f => `<li class="alert"><span class="alert__dot" style="background:var(--brand)"></span>
    <button class="link" data-tn-file="${esc(f.id)}">${esc(f.file_name)}</button><span class="alert__t">${esc(t.kinds[f.kind] || f.kind)} · ${when(f.created_at, lang)}</span>
    ${r.approver || r.analyst ? `<button class="x" data-tn-file-del="${esc(f.id)}" aria-label="${esc(t.del)}">✕</button>` : ''}</li>`).join('')}</ul>` : ''}
  <form class="inlineform" data-tn-upload style="border-bottom:0"><div class="fields">
    ${fld(t.sec.docs, `<input type="file" name="file" multiple required />`)}
    ${fld('', `<select name="kind">${Object.keys(t.kinds).map(k => opt(k, t.kinds[k], 'rfp')).join('')}</select>`)}
  </div><div class="actions"><button class="btn btn--sm">${esc(t.act.upload)}</button></div></form>`)}
${card(t.sec.activity, `<form class="inlineform" data-tn-note style="border-bottom:0"><div class="fields">
    ${fld(t.f.note, `<textarea name="body" rows="2" required maxlength="2000"></textarea>`, true)}</div>
    <div class="actions"><button class="btn btn--sm">${esc(t.act.addNote)}</button></div></form>
  ${events.length ? `<ul class="alerts">${events.map(e => `<li class="alert"><span class="alert__dot" style="background:${e.kind === 'approved' ? 'var(--ok)' : e.kind === 'rejected' ? 'var(--critical)' : e.kind === 'note' ? 'var(--info)' : 'var(--ink4)'}"></span>
    <b>${esc(nm(people, e.created_by))}</b> <span>${esc(t.ev[e.kind] || e.kind)}</span>
    <span class="alert__t">${esc(new Date(e.created_at).toLocaleString(lang === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Riyadh' }))}</span>
    ${e.body ? `<span class="block prose" style="width:100%;padding-inline-start:16px">${esc(e.kind === 'rejected' ? e.body.replace(/^(\w+)/, (m) => t.reasons[m] || m) : e.body)}</span>` : ''}</li>`).join('')}</ul>` : ''}`)}`;
}

/* ================================================================== form */

function reqRow(lang, q = {}, i = 0) {
  const t = T(lang);
  return `<tr data-req-row><td><input class="cellinput" name="req_text" value="${esc(q.text || '')}" placeholder="${esc(t.reqPh)}" style="min-width:240px" /></td>
    <td><select class="procsel" name="req_status">${L.REQ_STATES.map(s => opt(s, t.req[s], q.status || 'gap')).join('')}</select></td>
    <td class="num"><button type="button" class="x" data-row-del aria-label="${esc(t.del)}">✕</button></td></tr>`;
}
function compRow(lang, c = {}) {
  const t = T(lang);
  return `<tr data-comp-row><td><input class="cellinput" name="c_name" value="${esc(c.name || '')}" /></td>
    <td><input class="cellinput num" type="number" name="c_year" min="2000" max="2100" value="${esc(c.year ?? '')}" style="max-width:80px" /></td>
    <td><input class="cellinput" name="c_project" value="${esc(c.project || '')}" /></td>
    <td><input class="cellinput num" type="number" min="0" step="1" name="c_price" value="${esc(c.price_sar ?? '')}" /></td>
    <td><input type="checkbox" name="c_won"${c.won ? ' checked' : ''} /></td>
    <td class="num"><button type="button" class="x" data-row-del aria-label="${esc(t.del)}">✕</button></td></tr>`;
}
export const blankReqRow = (lang) => reqRow(lang, {});
export { reqRow, compRow };
export const blankCompRow = (lang) => compRow(lang, {});

export function tenderFormView(lang, ctx) {
  const t = T(lang), f = t.f;
  if (!role().analyst) return denied(lang);
  const x = ctx.tender || {};
  const isNew = !x.id;
  if (!isNew && !['draft', 'review'].includes(x.status)) return card(t.title, empty(t.notFound));
  const v = (k) => x[k] ?? '';
  const inp = (k, type = 'text', attrs = '') => fld(f[k], `<input name="${k}" type="${type}" value="${esc(v(k))}" ${attrs} />`);
  const area = (k, rows = 3, wide = true) => fld(f[k], `<textarea name="${k}" rows="${rows}">${esc(v(k))}</textarea>`, wide);
  const clients = [...new Set([...(ctx.tenders || []).map(o => o.client), ...(ctx.projects || []).map(p => p.client), ...(ctx.leads || []).map(l => l.company)]
    .filter(Boolean).map(s => String(s).trim()))].sort((a, b) => a.localeCompare(b)).slice(0, 2000);
  const reqs = Array.isArray(x.requirements) && x.requirements.length ? x.requirements : [{}];
  const comps = Array.isArray(x.competitors) && x.competitors.length ? x.competitors : [{}];
  return `
<nav class="crumb">${go('#/tenders', t.title)} <span class="muted">/</span> <span class="muted">${esc(isNew ? t.newT : x.ref)}</span></nav>
<form id="tndForm" data-tn-id="${esc(x.id || '')}">
${card(isNew ? t.newT : `${t.edit} · ${x.ref}`, `<div class="inlineform" style="border-bottom:0"><div class="fields">
  ${fld(f.title, `<input name="title" required maxlength="300" value="${esc(v('title'))}" />`, true)}
  ${fld(f.client, `<input name="client" required maxlength="200" list="tnClients" value="${esc(v('client'))}" autocomplete="off" /><datalist id="tnClients">${clients.map(c => `<option value="${esc(c)}"></option>`).join('')}</datalist><span class="small muted" data-tn-known></span>`)}
  ${inp('tender_no', 'text', 'maxlength="100"')}
  ${fld(f.source, `<select name="source">${opt('', '—', v('source'))}${L.SOURCES.map(s => opt(s, t.src[s], v('source'))).join('')}</select>`)}
  ${inp('category', 'text', 'maxlength="120"')}${inp('location', 'text', 'maxlength="120"')}
  ${inp('issued_on', 'date')}${inp('questions_due', 'date')}${inp('site_visit_on', 'date')}${inp('submission_due', 'date')}
  ${inp('value_sar', 'number', 'min="0" step="1"')}${inp('client_budget_sar', 'number', 'min="0" step="1"')}${inp('bond_sar', 'number', 'min="0" step="1"')}
  ${area('scope', 4)}</div></div>`)}
${card(t.up.title, `<div class="inlineform" style="border-bottom:0"><div class="fields">
  <div class="f">${dropField('tnRfp', t.up.rfp, t.up.rfpHint, { multiple: true, accept: '.pdf,.doc,.docx,.xls,.xlsx,.zip,.rar,.png,.jpg,.jpeg' })}</div>
  <div class="f">${dropField('tnOther', t.up.other, t.up.otherHint, { multiple: true })}</div>
  </div><p class="note">${esc(t.up.note)}</p></div>`)}
${card(t.sec.reqs, `<div style="padding:0 16px">${tbl(`<th>${t.sec.reqs}</th><th>${f.status}</th><th></th>`, reqs.map(q => reqRow(lang, q)).join(''))}</div>
  <div class="actions" style="padding:8px 16px 14px"><button type="button" class="btn btn--sm" data-add-req>${esc(t.reqAdd)}</button></div>`)}
${card(t.sec.comps, `<div style="padding:0 16px">${tbl(`<th>${t.comp.name}</th><th>${t.comp.year}</th><th>${t.comp.project}</th><th class="num">${t.comp.price}</th><th>${t.comp.won}</th><th></th>`,
  comps.map(c => compRow(lang, c)).join(''))}</div>
  <div class="actions" style="padding:8px 16px 14px"><button type="button" class="btn btn--sm" data-add-comp>${esc(t.compAdd)}</button></div>`)}
${card(t.sec.analysis, `<div class="inlineform" style="border-bottom:0"><div class="fields">
  ${area('client_history', 4)}
  ${fld(f.recommendation, `<select name="recommendation">${opt('', '—', v('recommendation'))}${['apply', 'consider', 'skip'].map(s => opt(s, t.rec[s], v('recommendation'))).join('')}</select>`)}
  ${inp('win_chance', 'number', 'min="0" max="100" step="5"')}
  ${area('summary', 4)}${area('risks', 3)}</div></div>`)}
<div class="actions" style="margin:4px 0 24px">
  <button type="submit" class="btn btn--primary">${esc(isNew ? t.saveDraft : t.save)}</button>
  <button type="button" class="btn btn--ghost" data-act="go" data-route="${isNew ? '#/tenders' : `#/t/${x.id}`}">${esc(t.cancel)}</button>
  <span class="small muted" data-tn-draftmsg></span>
</div>
</form>`;
}

/* ============================================================== settings */

export function tenderSettingsView(lang, ctx) {
  const t = T(lang), s = t.set;
  if (db.state.me?.role !== 'admin') return denied(lang);
  const st = ctx.tnSettings || { approvers: [], analysts: [] };
  const people = (ctx.people || []).filter(p => p.is_active)
    .sort((a, b) => String(a.full_name || a.email).localeCompare(String(b.full_name || b.email)));
  const on = (arr, id) => (arr || []).includes(id) ? ' checked' : '';
  return `
${tabs(lang, 'settings')}
${card(`${s.approvers} / ${s.analysts}`, `<p class="note" style="margin:8px 16px">${esc(s.hint)}</p>
<form data-tn-settings>
${tbl(`<th>${s.person}</th><th>${t.dept}</th><th>${s.approver}</th><th>${s.analyst}</th>`, people.map(p => `<tr>
  <td>${esc(p.full_name || p.email)}${p.user_id ? '' : ` <span class="small muted">(${esc(s.notSigned)})</span>`}</td>
  <td class="small muted">${esc(p.department_id ? deptName(p.department_id, lang) : '—')} · ${esc(p.role)}</td>
  <td><input type="checkbox" data-tn-ap="${esc(p.id)}"${on(st.approvers, p.id)} /></td>
  <td><input type="checkbox" data-tn-an="${esc(p.id)}"${on(st.analysts, p.id)} /></td></tr>`).join(''))}
<div class="actions" style="padding:12px 16px"><button class="btn btn--primary btn--sm">${esc(t.save)}</button>
  <span class="small muted" data-tn-saved>${esc(ctx.tnSavedMsg || '')}</span></div>
</form>`)}`;
}
