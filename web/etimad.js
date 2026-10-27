/* ==========================================================================
   Etimad Insights — screens. Pure functions of (lang, ctx) → HTML;
   etimadctl.js loads the data and wires the events.

   Overview   the market: matching Etimad tenders, deadlines, agencies,
              regions, who wins
   Tenders    the shortlist: filter, score, shortlist or dismiss
   Tender     one tender: details, AI analysis, suggested price, RFP files,
              agency contacts (Lusha)
   Our bids   how the tenders we applied for ended, and against whom
   Settings   search words, our company profile for the AI, API status
   ========================================================================== */

import * as db from './db.js';
import * as L from './etimadlogic.js';
import { sar, normClient } from './tenderlogic.js';
import { esc, fmt, fileSize } from './dash.js';

export const ESTR = {
  en: {
    nav: 'Etimad Insights', title: 'Etimad Insights', sub: 'Government tenders in exhibitions, events, fit-out and marketing',
    tabs: { overview: 'Overview', list: 'Tenders', ours: 'Our bids', settings: 'Settings' },
    scope: { stands: 'Exhibition stands', events: 'Events & conferences', fitout: 'Fit-out & interiors', marketing: 'Marketing & branding' },
    rec: { apply: 'Apply', consider: 'Consider', skip: 'Skip' },
    conf: { low: 'Low confidence', medium: 'Medium confidence', high: 'High confidence' },
    req: { met: 'Met', partial: 'Partly', gap: 'Gap', unknown: 'Unknown' },
    lvl: { low: 'Low', medium: 'Medium', high: 'High' },
    bid: { preparing: 'Preparing', submitted: 'Submitted', won: 'Won', lost: 'Lost', cancelled: 'Cancelled', not_submitted: 'Not submitted' },
    sync: 'Sync from Etimad', syncing: 'Searching Etimad…', lastSync: 'Last sync {d}', never: 'Never synced',
    synced: '{f} tenders found · {a} new · {c} Firecrawl credits',
    setup: { title: 'Connect the APIs', body: 'Etimad Insights needs these keys saved as Supabase Edge Function secrets (Project → Edge Functions → Secrets). They are kept on the server only — never in the browser or the code.',
      firecrawl: 'FIRECRAWL_API_KEY — Etimad tenders (firecrawl.dev → API keys)', anthropic: 'ANTHROPIC_API_KEY — the AI analysis (console.anthropic.com → API keys)',
      lusha: 'LUSHA_API_KEY — agency contacts (dashboard.lusha.com/api)', open: 'Open Supabase secrets', ok: 'Connected', missing: 'Missing' },
    ov: { open: 'Open matching tenders', closing: 'Closing in 7 days', short: 'Shortlisted', analysed: 'Analysed', fees: 'Document fees (open)',
      feesSub: 'Etimad fees scale with tender size', est: 'Estimated value (analysed)', byScope: 'Open tenders by scope', weeks: 'Deadlines by week',
      week0: 'This week', weekN: 'In {n} weeks', week1: 'Next week', agencies: 'Agencies with the most open tenders', regions: 'Regions',
      comp: 'Who wins similar tenders (Etimad awards)', compNone: 'No award results seen yet. Fetch details on closed tenders to collect them.',
      best: 'Best opportunities', empty: 'No tenders yet. Press “Sync from Etimad” to search with your keywords.', recs: '{a} apply · {c} consider · {s} skip' },
    f: { score: 'Score', name: 'Tender', agency: 'Agency', scopes: 'Scope', deadline: 'Offers due', fee: 'Doc fee', rec: 'Advice', status: 'Status',
      number: 'Tender no.', ref: 'Reference no.', type: 'Type', activity: 'Activity', regions: 'Regions', opening: 'Offers open', award: 'Expected award',
      duration: 'Duration', published: 'Published', est: 'Estimated value', seen: 'First seen', note: 'Note' },
    list: { search: 'Search name, agency, number…', anyScope: 'Any scope', region: 'Region', openOnly: 'Open only',
      view: { all: 'All', shortlist: 'Shortlist', analysed: 'Analysed', dismissed: 'Dismissed' }, none: 'No tenders match.', csv: 'Export CSV',
      short: 'Shortlist', unshort: 'Remove from shortlist', dismiss: 'Dismiss', undismiss: 'Restore', daysLeft: '{n} days left', today: 'Closes today', closed: 'Closed' },
    t: { back: 'Etimad Insights', etimad: 'Open on Etimad', refresh: 'Fetch full details', refreshing: 'Fetching…', toTender: 'Create in Tenders', openTender: 'Open in Tenders',
      notFound: 'This tender does not exist or you cannot see it.', details: 'Tender details', fetched: 'Details fetched {d}', notFetched: 'Only the search summary so far — fetch full details for dates, fees and award results.',
      created: 'Created {ref} in Tenders.', saveNote: 'Save note' },
    an: { title: 'Analysis & recommendation', run: 'Analyse with AI', rerun: 'Analyse again', running: 'Reading the tender…', none: 'Not analysed yet. The analysis reads the tender, our bid history and any RFP you upload below.',
      fit: 'Fit score', summary: 'Summary', deliverables: 'What they want', reqs: 'Requirements', for: 'Reasons to apply', against: 'Reasons not to', risks: 'Risks',
      timeline: 'Timeline', feasible: 'Feasible', tight: 'Tight', next: 'Next steps', questions: 'Questions for the agency', noRfp: 'No RFP was attached — requirements are from the Etimad page only.',
      by: '{model} · {d}', rfpRead: 'Read: {f}' },
    pr: { title: 'Suggested pricing', low: 'Low', target: 'Target', high: 'High', est: 'Estimated tender value', basis: 'Basis',
      hist: 'From our history', winning: 'Winning prices seen', median: 'Median winning price', range: 'Middle half', points: '{n} price points',
      noHist: 'No price history yet. Record competitor prices on tenders and outcomes on “Our bids” — every one makes this better.',
      awards: 'Award results on this tender', supplier: 'Supplier', value: 'Value', won: 'Awarded', comps: 'Likely competitors' },
    files: { title: 'RFP documents', hint: 'Download the booklet from Etimad (it needs your supplier login) and upload it here — the analysis reads PDFs.', pick: 'Upload RFP', del: 'Delete' },
    ct: { title: 'Agency contacts', hint: 'Found through Lusha. Searching shows names and titles; revealing an email and phone uses Lusha credits.',
      domain: 'Agency website domain', name: 'Agency name in English', find: 'Find contacts', finding: 'Searching Lusha…', none: 'No contacts yet.',
      reveal: 'Reveal email & phone', revealing: 'Revealing…', person: 'Name', job: 'Title', email: 'Email', phone: 'Phone', li: 'LinkedIn',
      found: '{n} contacts found', needAgency: 'Add the agency’s English name or website domain first (the analysis usually fills them in).' },
    hist: { title: 'Our history with this agency', none: 'No tenders or projects with this agency yet.', tenders: 'Our tenders', projects: 'Projects' },
    ours: { applied: 'Applied for', submitted: 'Submitted', won: 'Won', lost: 'Lost', winRate: 'Win rate', winSub: 'won ÷ (won + lost)', wonValue: 'Value won',
      gap: 'Our price vs winner', gapSub: 'average, on tenders we lost', rejected: 'Not pursued', rivals: 'Competitors', rival: 'Competitor', seenN: 'Seen', winsN: 'Won',
      beat: 'Beat us', avg: 'Avg price', lostWhy: 'Why we lost', rejWhy: 'Why we did not apply', clients: 'Agencies we bid with', table: 'Applied tenders — record the outcome',
      ourPrice: 'Our price', winner: 'Winner', winPrice: 'Winning price', bidders: 'Bidders', reason: 'Reason / notes', save: 'Save', saved: 'Saved.',
      none: 'No applied tenders yet. A tender the approver approves in Tenders appears here.', noRivals: 'No competitors recorded yet.' },
    set: { words: 'Search words', wordsHint: 'One per line. Each word is one Etimad search per sync (Firecrawl credits).', profile: 'Our company, for the AI',
      profileHint: 'What we do, our strengths, typical project sizes, certifications, past clients. The analysis judges fit against this.',
      save: 'Save settings', saved: 'Saved.', api: 'Connections', model: 'AI model', tools: 'Etimad tools known', discover: 'Read Etimad catalogue',
      usage: 'Usage, last 30 days', credits: '{n} credits', tokens: '{n} tokens', calls: '{n} calls', onlyApprover: 'Only an approver or admin can change these.' },
    denied: 'Etimad Insights is open to tender analysts, approvers and admins.',
    err: { missing_key: 'The {k} secret is not set yet — add it in Supabase (Edge Functions → Secrets).', needs_agency: 'Add the agency’s English name or website domain first.',
      not_allowed: 'Only tender staff can use Etimad Insights.' },
  },
  ar: {
    nav: 'تحليلات اعتماد', title: 'تحليلات اعتماد', sub: 'المنافسات الحكومية في المعارض والفعاليات والتجهيز والتسويق',
    tabs: { overview: 'نظرة عامة', list: 'المنافسات', ours: 'عروضنا', settings: 'الإعدادات' },
    scope: { stands: 'أجنحة المعارض', events: 'الفعاليات والمؤتمرات', fitout: 'التجهيز الداخلي', marketing: 'التسويق والهوية' },
    rec: { apply: 'التقدم', consider: 'للدراسة', skip: 'عدم التقدم' },
    conf: { low: 'ثقة منخفضة', medium: 'ثقة متوسطة', high: 'ثقة عالية' },
    req: { met: 'مستوفى', partial: 'جزئياً', gap: 'غير مستوفى', unknown: 'غير معروف' },
    lvl: { low: 'منخفض', medium: 'متوسط', high: 'مرتفع' },
    bid: { preparing: 'قيد الإعداد', submitted: 'تم التقديم', won: 'فزنا', lost: 'خسرنا', cancelled: 'ملغاة', not_submitted: 'لم نقدّم' },
    sync: 'مزامنة من اعتماد', syncing: 'جارٍ البحث في اعتماد…', lastSync: 'آخر مزامنة {d}', never: 'لم تتم مزامنة بعد',
    synced: 'وُجدت {f} منافسة · {a} جديدة · {c} رصيد Firecrawl',
    setup: { title: 'ربط الخدمات', body: 'تحتاج تحليلات اعتماد إلى حفظ هذه المفاتيح كأسرار في Supabase (المشروع ← Edge Functions ← Secrets). تبقى في الخادم فقط — لا تصل إلى المتصفح أو الكود.',
      firecrawl: 'FIRECRAWL_API_KEY — منافسات اعتماد (firecrawl.dev ← API keys)', anthropic: 'ANTHROPIC_API_KEY — التحليل بالذكاء الاصطناعي (console.anthropic.com)',
      lusha: 'LUSHA_API_KEY — جهات الاتصال (dashboard.lusha.com/api)', open: 'فتح أسرار Supabase', ok: 'متصل', missing: 'غير مضاف' },
    ov: { open: 'منافسات مفتوحة مطابقة', closing: 'تغلق خلال 7 أيام', short: 'في القائمة المختصرة', analysed: 'تم تحليلها', fees: 'رسوم الكراسات (المفتوحة)',
      feesSub: 'رسوم اعتماد ترتفع مع حجم المنافسة', est: 'القيمة التقديرية (المحللة)', byScope: 'المنافسات المفتوحة حسب النطاق', weeks: 'المواعيد حسب الأسبوع',
      week0: 'هذا الأسبوع', weekN: 'بعد {n} أسابيع', week1: 'الأسبوع القادم', agencies: 'الجهات الأكثر منافسات مفتوحة', regions: 'المناطق',
      comp: 'من يفوز بالمنافسات المشابهة (نتائج الترسية)', compNone: 'لا توجد نتائج ترسية بعد. اجلب التفاصيل للمنافسات المغلقة لجمعها.',
      best: 'أفضل الفرص', empty: 'لا توجد منافسات بعد. اضغط «مزامنة من اعتماد» للبحث بالكلمات المحددة.', recs: '{a} تقدم · {c} دراسة · {s} عدم تقدم' },
    f: { score: 'التقييم', name: 'المنافسة', agency: 'الجهة', scopes: 'النطاق', deadline: 'آخر موعد للعروض', fee: 'قيمة الكراسة', rec: 'التوصية', status: 'الحالة',
      number: 'رقم المنافسة', ref: 'الرقم المرجعي', type: 'النوع', activity: 'النشاط', regions: 'المناطق', opening: 'فتح العروض', award: 'الترسية المتوقعة',
      duration: 'المدة', published: 'تاريخ النشر', est: 'القيمة التقديرية', seen: 'أول ظهور', note: 'ملاحظة' },
    list: { search: 'ابحث بالاسم أو الجهة أو الرقم…', anyScope: 'كل النطاقات', region: 'المنطقة', openOnly: 'المفتوحة فقط',
      view: { all: 'الكل', shortlist: 'القائمة المختصرة', analysed: 'المحللة', dismissed: 'المستبعدة' }, none: 'لا توجد منافسات مطابقة.', csv: 'تصدير CSV',
      short: 'إضافة للقائمة المختصرة', unshort: 'إزالة من القائمة المختصرة', dismiss: 'استبعاد', undismiss: 'استعادة', daysLeft: 'متبقٍ {n} يوم', today: 'تغلق اليوم', closed: 'مغلقة' },
    t: { back: 'تحليلات اعتماد', etimad: 'فتح في اعتماد', refresh: 'جلب التفاصيل الكاملة', refreshing: 'جارٍ الجلب…', toTender: 'إنشاء في المناقصات', openTender: 'فتح في المناقصات',
      notFound: 'هذه المنافسة غير موجودة أو لا يمكنك رؤيتها.', details: 'بيانات المنافسة', fetched: 'جُلبت التفاصيل {d}', notFetched: 'ملخص البحث فقط حتى الآن — اجلب التفاصيل الكاملة للمواعيد والرسوم ونتائج الترسية.',
      created: 'تم إنشاء {ref} في المناقصات.', saveNote: 'حفظ الملاحظة' },
    an: { title: 'التحليل والتوصية', run: 'تحليل بالذكاء الاصطناعي', rerun: 'إعادة التحليل', running: 'جارٍ قراءة المنافسة…', none: 'لم تُحلل بعد. يقرأ التحليل المنافسة وتاريخ عروضنا وأي كراسة ترفعها أدناه.',
      fit: 'درجة الملاءمة', summary: 'الملخص', deliverables: 'المطلوب', reqs: 'المتطلبات', for: 'أسباب التقدم', against: 'أسباب عدم التقدم', risks: 'المخاطر',
      timeline: 'الجدول الزمني', feasible: 'ممكن', tight: 'ضيق', next: 'الخطوات التالية', questions: 'أسئلة للجهة', noRfp: 'لم تُرفق كراسة — المتطلبات من صفحة اعتماد فقط.',
      by: '{model} · {d}', rfpRead: 'تمت قراءة: {f}' },
    pr: { title: 'التسعير المقترح', low: 'الأدنى', target: 'المستهدف', high: 'الأعلى', est: 'القيمة التقديرية للمنافسة', basis: 'الأساس',
      hist: 'من تاريخنا', winning: 'الأسعار الفائزة', median: 'وسيط السعر الفائز', range: 'النصف الأوسط', points: '{n} نقطة سعرية',
      noHist: 'لا يوجد تاريخ أسعار بعد. سجّل أسعار المنافسين في المناقصات والنتائج في «عروضنا» — كل سجل يحسّن هذا.',
      awards: 'نتائج الترسية لهذه المنافسة', supplier: 'المورد', value: 'القيمة', won: 'مُرسى عليه', comps: 'المنافسون المتوقعون' },
    files: { title: 'كراسة الشروط', hint: 'نزّل الكراسة من اعتماد (تحتاج دخول المورد) وارفعها هنا — التحليل يقرأ ملفات PDF.', pick: 'رفع الكراسة', del: 'حذف' },
    ct: { title: 'جهات الاتصال في الجهة', hint: 'من Lusha. البحث يعرض الأسماء والمسميات؛ كشف البريد والجوال يستهلك رصيد Lusha.',
      domain: 'نطاق موقع الجهة', name: 'اسم الجهة بالإنجليزية', find: 'البحث عن جهات اتصال', finding: 'جارٍ البحث في Lusha…', none: 'لا توجد جهات اتصال بعد.',
      reveal: 'كشف البريد والجوال', revealing: 'جارٍ الكشف…', person: 'الاسم', job: 'المسمى', email: 'البريد', phone: 'الجوال', li: 'لينكدإن',
      found: 'وُجدت {n} جهة اتصال', needAgency: 'أضف اسم الجهة بالإنجليزية أو نطاق موقعها أولاً (عادةً يملؤها التحليل).' },
    hist: { title: 'تاريخنا مع هذه الجهة', none: 'لا توجد مناقصات أو مشاريع مع هذه الجهة بعد.', tenders: 'مناقصاتنا', projects: 'المشاريع' },
    ours: { applied: 'تقدمنا لها', submitted: 'تم التقديم', won: 'فزنا', lost: 'خسرنا', winRate: 'نسبة الفوز', winSub: 'الفوز ÷ (الفوز + الخسارة)', wonValue: 'قيمة ما فزنا به',
      gap: 'سعرنا مقابل الفائز', gapSub: 'المتوسط في المنافسات التي خسرناها', rejected: 'لم نتقدم', rivals: 'المنافسون', rival: 'المنافس', seenN: 'الظهور', winsN: 'فاز',
      beat: 'تفوّق علينا', avg: 'متوسط السعر', lostWhy: 'أسباب الخسارة', rejWhy: 'أسباب عدم التقدم', clients: 'الجهات التي قدمنا لها', table: 'المنافسات المقدّمة — سجّل النتيجة',
      ourPrice: 'سعرنا', winner: 'الفائز', winPrice: 'السعر الفائز', bidders: 'عدد المتقدمين', reason: 'السبب / ملاحظات', save: 'حفظ', saved: 'تم الحفظ.',
      none: 'لا توجد منافسات مقدّمة بعد. أي مناقصة يعتمدها صاحب القرار في المناقصات تظهر هنا.', noRivals: 'لم يُسجل منافسون بعد.' },
    set: { words: 'كلمات البحث', wordsHint: 'كلمة في كل سطر. كل كلمة بحث واحد في اعتماد لكل مزامنة (رصيد Firecrawl).', profile: 'شركتنا، للذكاء الاصطناعي',
      profileHint: 'ما نقدمه ونقاط قوتنا وأحجام مشاريعنا والشهادات والعملاء السابقون. يقيس التحليل الملاءمة على هذا.',
      save: 'حفظ الإعدادات', saved: 'تم الحفظ.', api: 'الاتصالات', model: 'نموذج الذكاء الاصطناعي', tools: 'أدوات اعتماد المعروفة', discover: 'قراءة دليل اعتماد',
      usage: 'الاستهلاك آخر 30 يوماً', credits: '{n} رصيد', tokens: '{n} وحدة', calls: '{n} طلب', onlyApprover: 'التعديل لصاحب القرار أو المدير فقط.' },
    denied: 'تحليلات اعتماد متاحة لمحللي المناقصات وأصحاب القرار والمدراء.',
    err: { missing_key: 'السر {k} غير مضاف بعد — أضفه في Supabase (Edge Functions ← Secrets).', needs_agency: 'أضف اسم الجهة بالإنجليزية أو نطاق موقعها أولاً.',
      not_allowed: 'تحليلات اعتماد لفريق المناقصات فقط.' },
  },
};

const T = (lang) => ESTR[lang];
const role = () => db.state.me?.tender || {};
export const canSeeEtimad = (me = db.state.me) => !!(me && (me.role === 'admin' || me.tender?.approver || me.tender?.analyst));

/* ---------------------------------------------------------------- helpers */
const REC_C = { apply: 'var(--ok)', consider: 'var(--warn)', skip: 'var(--critical)' };
const REQ_C = { met: 'var(--ok)', partial: 'var(--warn)', gap: 'var(--critical)', unknown: 'var(--ink3)' };
const LVL_C = { low: 'var(--ok)', medium: 'var(--warn)', high: 'var(--critical)' };
const BID_C = { preparing: 'var(--ink3)', submitted: 'var(--info)', won: 'var(--ok)', lost: 'var(--critical)', cancelled: 'var(--ink3)', not_submitted: 'var(--ink3)' };
const SC_C = { stands: 'var(--s1)', events: 'var(--s2)', fitout: 'var(--s3)', marketing: 'var(--s4)' };
const pill = (label, colour) => `<span class="st" style="--c:${colour}"><i></i>${esc(label)}</span>`;
const opt = (v, label, sel) => `<option value="${esc(v)}"${String(v) === String(sel ?? '') ? ' selected' : ''}>${esc(label)}</option>`;
const fld = (label, inner, wide = false) => `<label class="f${wide ? ' f--wide' : ''}"><span>${esc(label)}</span>${inner}</label>`;
const go = (route, label, cls = 'link') => `<button class="${cls}" data-act="go" data-route="${esc(route)}">${esc(label)}</button>`;
const card = (title, body, extra = '') => `<section class="card"><div class="card__head"><h2>${esc(title)}</h2>${extra}</div>${body}</section>`;
const empty = (text) => `<p class="note">${esc(text)}</p>`;
const tbl = (head, rows) => `<div class="tblwrap"><table class="tbl tbl--tight"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
const kpi = (n, label, { sub = '', colour = '' } = {}) => `<div class="kpi">
  <span class="kpi__l">${colour ? `<i style="--c:${colour}"></i>` : ''}${esc(label)}</span>
  <span class="kpi__n">${n}</span>${sub ? `<span class="kpi__s">${esc(sub)}</span>` : ''}</div>`;
const fact = (label, value) => `<div class="fact"><span class="fact__l">${esc(label)}</span><span class="fact__v">${value}</span></div>`;
const fill = (s, o) => Object.entries(o).reduce((a, [k, v]) => a.replaceAll(`{${k}}`, v), s);
const money = (v) => (v == null || v === '' ? '—' : esc(sar(v)));
const moneyC = (v) => (v == null || v === '' ? '—' : esc(sar(v, { compact: true })));
export const todayISO = () => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);   // Riyadh
const when = (ts, lang) => ts ? esc(fmt(String(ts).slice(0, 10), lang)) : '—';
const stamp = (ts, lang) => ts ? esc(new Date(ts).toLocaleString(lang === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB',
  { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Riyadh' })) : '—';
const bi = (v, lang) => esc(L.bi(v, lang));
const scopeChips = (t, lang) => (t.scopes || []).map(s => `<span class="etchip" style="--c:${SC_C[s] || 'var(--ink3)'}">${esc(T(lang).scope[s] || s)}</span>`).join('');
const scoreBadge = (n) => `<span class="etscore" style="--p:${Math.max(0, Math.min(100, n || 0))}">${n ?? '—'}</span>`;

function hbars(rows, { fillC = 'var(--brand)', fmtN = (n) => String(n) } = {}) {
  if (!rows.length) return '';
  const max = Math.max(...rows.map(r => r.n), 1);
  return `<ul class="hbars">${rows.map(r => `
    <li class="hb" title="${esc(r.label)} — ${esc(fmtN(r.n))}${r.sub ? ' · ' + esc(r.sub) : ''}">
      <span class="hb__l">${r.route ? go(r.route, r.label) : esc(r.label)}${r.sub ? `<span class="hb__sub">${esc(r.sub)}</span>` : ''}</span>
      <span class="hb__track"><span class="hb__fill" style="width:${(r.n / max) * 100}%;background:${r.c || fillC}"></span></span>
      <span class="hb__n">${esc(fmtN(r.n))}</span>
    </li>`).join('')}</ul>`;
}

export function deadlineCell(t, lang, today = todayISO()) {
  if (!t.last_offer_at) return '<span class="muted">—</span>';
  const d = L.daysToOffer(t, today), x = T(lang).list;
  const cls = d !== null && d >= 0 && d <= 7 ? 'bad' : d !== null && d < 0 ? 'muted' : '';
  const sub = d === null ? '' : d < 0 ? x.closed : d === 0 ? x.today : fill(x.daysLeft, { n: d });
  return `<span class="${cls}">${when(t.last_offer_at, lang)}</span><span class="block small muted">${esc(sub)}</span>`;
}

const recPill = (a, lang) => a?.result?.recommendation ? pill(T(lang).rec[a.result.recommendation], REC_C[a.result.recommendation]) : '<span class="muted small">—</span>';

function tabs(lang, on, ctx) {
  const t = T(lang);
  const items = [['overview', '#/etimad'], ['list', '#/etimad/list'], ['ours', '#/etimad/ours'], ['settings', '#/etimad/settings']];
  const s = ctx.etStatus || {};
  const last = s.last_sync_at ? fill(t.lastSync, { d: stamp(s.last_sync_at, lang) }) : t.never;
  return `<nav class="hrtabs">${items.map(([k, r]) =>
    `<button class="hrtab${k === on ? ' is-on' : ''}" data-act="go" data-route="${r}">${esc(t.tabs[k])}</button>`).join('')}
    <span style="margin-inline-start:auto;display:flex;gap:10px;align-items:center">
      <span class="small muted">${last}</span>
      <button class="btn btn--primary btn--sm" data-et-sync${s.keys && !s.keys.firecrawl ? ' disabled' : ''}>${esc(t.sync)}</button></span></nav>
    ${ctx.etFlash ? `<p class="note${ctx.etFlash.bad ? ' bad' : ''}" style="margin:0 0 12px">${esc(ctx.etFlash.text)}</p>` : ''}`;
}
const denied = (lang) => card(T(lang).title, empty(T(lang).denied));

function setupCard(lang, ctx, force = false) {
  const t = T(lang).setup, k = ctx.etStatus?.keys;
  if (!k) return '';
  if (!force && k.firecrawl && k.anthropic && k.lusha) return '';
  const row = (ok, text) => `<li class="alert"><span class="alert__dot" style="background:${ok ? 'var(--ok)' : 'var(--critical)'}"></span>
    <span>${esc(text)}</span><span class="alert__t">${esc(ok ? t.ok : t.missing)}</span></li>`;
  return card(t.title, `<p class="note" style="margin-top:0">${esc(t.body)}</p>
    <ul class="alerts">${row(k.firecrawl, t.firecrawl)}${row(k.anthropic, t.anthropic)}${row(k.lusha, t.lusha)}</ul>
    <div style="padding:0 16px 14px"><a class="btn btn--sm" target="_blank" rel="noopener" href="https://supabase.com/dashboard/project/ookiupgocavjbxcxquwl/functions/secrets">${esc(t.open)}</a></div>`);
}

/* =============================================================== overview */

export function etimadOverviewView(lang, ctx) {
  const t = T(lang), o = t.ov;
  if (!canSeeEtimad()) return denied(lang);
  const today = todayISO();
  const list = ctx.etTenders || [];
  const an = L.latestAnalyses(ctx.etAnalyses || []);
  const s = L.etimadOverview(list, ctx.etAnalyses || [], today);
  const sctx = { today, ours: ctx.tenders || [] };
  const best = list.filter(x => !x.dismissed && L.isOpen(x, today))
    .map(x => ({ x, sc: L.scoreOf(x, an, sctx) })).sort((a, b) => b.sc - a.sc).slice(0, 10);
  const wk = (i) => i === 0 ? o.week0 : i === 1 ? o.week1 : fill(o.weekN, { n: i });
  return `
${tabs(lang, 'overview', ctx)}
${setupCard(lang, ctx)}
${!list.length ? card(t.title, empty(o.empty)) : `
<div class="kpis">
  ${kpi(s.open, o.open, { colour: 'var(--brand)', sub: `${s.total} ${t.tabs.list}` })}
  ${kpi(s.closing7, o.closing, { colour: 'var(--critical)' })}
  ${kpi(s.shortlisted, o.short, { colour: 'var(--info)' })}
  ${kpi(s.analysed, o.analysed, { colour: 'var(--ok)', sub: fill(o.recs, { a: s.recs.apply, c: s.recs.consider, s: s.recs.skip }) })}
  ${kpi(moneyC(s.fees), o.fees, { colour: 'var(--warn)', sub: o.feesSub })}
  ${kpi(moneyC(s.estValue), o.est, { colour: 'var(--ink3)' })}
</div>
${card(o.best, bestTable(lang, ctx, best.map(b => b.x), an, sctx))}
<div class="chartrow" style="margin:14px 0">
  ${card(o.byScope, hbars(s.byScope.map(r => ({ label: t.scope[r.key], n: r.n, c: SC_C[r.key] }))) || empty('—'))}
  ${card(o.weeks, hbars(s.weeks.map(w => ({ label: wk(w.i), n: w.n })), { fillC: 'var(--warn)' }) || empty('—'))}
</div>
<div class="chartrow" style="margin:14px 0">
  ${card(o.agencies, hbars(s.agencies.map(r => ({ label: r.name, n: r.n })), { fillC: 'var(--info)' }) || empty('—'))}
  ${card(o.regions, hbars(s.regions.map(r => ({ label: r.name, n: r.n })), { fillC: 'var(--s3)' }) || empty('—'))}
</div>
${card(o.comp, s.competitors.length ? tbl(`<th>${t.pr.supplier}</th><th class="num">${t.ours.seenN}</th><th class="num">${t.ours.winsN}</th><th class="num">${t.pr.value}</th>`,
  s.competitors.map(c => `<tr><td>${esc(c.name)}</td><td class="num">${c.seen}</td><td class="num">${c.wins}</td><td class="num">${moneyC(c.value)}</td></tr>`).join('')) : empty(o.compNone))}`}`;
}

function bestTable(lang, ctx, rows, an, sctx) {
  const t = T(lang);
  if (!rows.length) return empty(t.list.none);
  return tbl(`<th class="num">${t.f.score}</th><th>${t.f.name}</th><th>${t.f.agency}</th><th>${t.f.scopes}</th><th>${t.f.deadline}</th><th class="num">${t.f.fee}</th><th>${t.f.rec}</th><th></th>`,
    rows.map(x => `<tr>
      <td class="num">${scoreBadge(L.scoreOf(x, an, sctx))}</td>
      <td style="min-width:240px">${go(`#/etimad/t/${x.id}`, x.name || x.tender_number || '—')}${x.tender_number ? `<span class="block small muted">${esc(x.tender_number)}</span>` : ''}</td>
      <td class="small">${esc(x.agency || '—')}</td>
      <td>${scopeChips(x, lang)}</td>
      <td style="white-space:nowrap">${deadlineCell(x, lang)}</td>
      <td class="num">${moneyC(x.documents_price)}</td>
      <td>${recPill(an.get(x.id), lang)}</td>
      <td style="white-space:nowrap"><button class="x etstar${x.shortlisted ? ' is-on' : ''}" data-et-short="${esc(x.id)}" title="${esc(x.shortlisted ? t.list.unshort : t.list.short)}" aria-label="${esc(x.shortlisted ? t.list.unshort : t.list.short)}">★</button>
        <button class="x" data-et-dismiss="${esc(x.id)}" title="${esc(x.dismissed ? t.list.undismiss : t.list.dismiss)}" aria-label="${esc(x.dismissed ? t.list.undismiss : t.list.dismiss)}">${x.dismissed ? '↺' : '✕'}</button></td>
    </tr>`).join(''));
}

/* =================================================================== list */

export function etimadRows(lang, ctx) {
  const today = todayISO();
  const an = L.latestAnalyses(ctx.etAnalyses || []);
  const f = ctx.etFilter || { open: true };
  const sctx = { today, ours: ctx.tenders || [] };
  const rows = L.filterEtimad(ctx.etTenders || [], { ...f, analysed: an }, today)
    .map(x => ({ x, sc: L.scoreOf(x, an, sctx) }))
    .sort((a, b) => (f.sort === 'deadline' ? String(a.x.last_offer_at || '9').localeCompare(String(b.x.last_offer_at || '9')) : b.sc - a.sc));
  return { rows: rows.map(r => r.x), an, sctx };
}

export function etimadListView(lang, ctx) {
  const t = T(lang), x = t.list;
  if (!canSeeEtimad()) return denied(lang);
  const f = ctx.etFilter || { open: true };
  const { rows, an, sctx } = etimadRows(lang, ctx);
  return `
${tabs(lang, 'list', ctx)}
<section class="card">
  <div class="filterbar">
    <label class="f f--sm"><span>${esc(x.search)}</span><input type="search" data-et-f="q" value="${esc(f.q || '')}" placeholder="${esc(x.search)}" /></label>
    <label class="f f--sm"><span>${esc(t.f.scopes)}</span><select data-et-f="scope">${opt('', x.anyScope, f.scope)}${L.SCOPE_KEYS.map(k => opt(k, t.scope[k], f.scope)).join('')}</select></label>
    <label class="f f--sm"><span>${esc(x.region)}</span><input data-et-f="region" value="${esc(f.region || '')}" /></label>
    <label class="f f--sm"><span>&nbsp;</span><select data-et-f="view">${Object.keys(x.view).map(k => opt(k === 'all' ? '' : k, x.view[k], f.view || '')).join('')}</select></label>
    <label class="f f--sm"><span>&nbsp;</span><select data-et-f="sort">${opt('', t.f.score, f.sort)}${opt('deadline', t.f.deadline, f.sort)}</select></label>
    <label class="chk" style="align-self:end;padding-bottom:6px"><input type="checkbox" data-et-f="open"${f.open ? ' checked' : ''} /> ${esc(x.openOnly)}</label>
    <button class="btn btn--sm" data-et-csv>${esc(x.csv)}</button>
  </div>
  <div data-et-rows>${bestTable(lang, ctx, rows, an, sctx)}</div>
</section>`;
}
export const listRowsHtml = (lang, ctx) => { const { rows, an, sctx } = etimadRows(lang, ctx); return bestTable(lang, ctx, rows, an, sctx); };

export function etimadCSV(lang, ctx, toCSV) {
  const t = T(lang);
  const { rows, an, sctx } = etimadRows(lang, ctx);
  return toCSV([[t.f.score, t.f.name, t.f.number, t.f.agency, t.f.scopes, t.f.deadline, t.f.fee, t.f.rec, 'Etimad'],
    ...rows.map(x => [L.scoreOf(x, an, sctx), x.name, x.tender_number || '', x.agency || '', (x.scopes || []).map(s => t.scope[s]).join(' / '),
      String(x.last_offer_at || '').slice(0, 10), x.documents_price ?? '', an.get(x.id) ? t.rec[an.get(x.id).result.recommendation] : '', x.source_url || ''])]);
}

/* ================================================================= detail */

function analysisCard(lang, ctx, x) {
  const t = T(lang), a = t.an;
  const cur = (ctx.etTenderAnalyses || [])[0];
  const canRun = ctx.etStatus?.keys?.anthropic !== false;
  const btn = `<button class="btn btn--primary btn--sm" data-et-analyze${canRun ? '' : ' disabled'}>${esc(cur ? a.rerun : a.run)}</button>`;
  if (!cur) return card(a.title, empty(a.none), btn);
  const r = cur.result || {};
  const list = (items, title) => items?.length ? `<h3 class="subhead" style="padding:0 16px">${esc(title)}</h3><ul class="etlist">${items.map(i => `<li>${bi(i, lang)}</li>`).join('')}</ul>` : '';
  const head = `<div class="kpis kpis--in">
    ${kpi(scoreBadge(r.fit_score), a.fit, { sub: t.conf[r.confidence] || '' })}
    ${kpi(pill(t.rec[r.recommendation] || r.recommendation, REC_C[r.recommendation] || 'var(--ink3)'), t.f.rec)}
    ${kpi(r.timeline ? pill(r.timeline.feasible ? a.feasible : a.tight, r.timeline.feasible ? 'var(--ok)' : 'var(--warn)') : '—', a.timeline, { sub: L.bi(r.timeline?.note, lang) })}
  </div>`;
  const reqs = r.requirements?.length ? `<h3 class="subhead" style="padding:0 16px">${esc(a.reqs)}</h3><ul class="alerts">${r.requirements.map(q =>
    `<li class="alert">${pill(t.req[q.status] || q.status, REQ_C[q.status] || 'var(--ink3)')} <span>${bi(q, lang)}</span></li>`).join('')}</ul>` : '';
  const risks = r.risks?.length ? `<h3 class="subhead" style="padding:0 16px">${esc(a.risks)}</h3><ul class="alerts">${r.risks.map(q =>
    `<li class="alert">${pill(t.lvl[q.level] || q.level, LVL_C[q.level] || 'var(--ink3)')} <span>${bi(q, lang)}</span></li>`).join('')}</ul>` : '';
  return card(a.title, `${head}
    <div style="padding:4px 16px 0"><p class="prose">${bi(r.summary, lang)}</p>
      ${r.rfp_read ? (cur.files?.length ? `<p class="small muted">${esc(fill(a.rfpRead, { f: cur.files.join(', ') }))}</p>` : '') : `<p class="note note--warn" style="margin:6px 0">${esc(a.noRfp)}</p>`}</div>
    ${list(r.deliverables, a.deliverables)}
    <div class="chartrow" style="margin:0;padding:0 0 4px">
      <div>${list(r.reasons_for, a.for)}</div><div>${list(r.reasons_against, a.against)}</div></div>
    ${reqs}${risks}
    ${list(r.next_steps, a.next)}${list(r.questions_for_agency, a.questions)}
    <p class="small muted" style="padding:6px 16px 12px">${esc(fill(a.by, { model: cur.model || '', d: '' }))}${stamp(cur.created_at, lang)}</p>`, btn);
}

function pricingCard(lang, ctx, x) {
  const t = T(lang), p = t.pr;
  const r = (ctx.etTenderAnalyses || [])[0]?.result || {};
  const ph = L.priceHistory({ ours: ctx.tenders || [], outcomes: ctx.etOutcomes || [], etimad: ctx.etTenders || [], projects: ctx.projects || [], scopes: x.scopes });
  const ai = r.price ? `<div class="kpis kpis--in">
      ${kpi(moneyC(r.price.low), p.low, { colour: 'var(--s2)', sub: money(r.price.low) })}
      ${kpi(moneyC(r.price.target), p.target, { colour: 'var(--brand)', sub: money(r.price.target) })}
      ${kpi(moneyC(r.price.high), p.high, { colour: 'var(--s4)', sub: money(r.price.high) })}
      ${r.price.est_tender_value ? kpi(moneyC(r.price.est_tender_value), p.est, { colour: 'var(--ink3)' }) : ''}
    </div><div style="padding:0 16px"><p class="small"><b>${esc(p.basis)}:</b> ${bi(r.price.basis, lang)}</p></div>` : '';
  const hist = ph.n ? `<h3 class="subhead" style="padding:0 16px">${esc(p.hist)} · ${esc(fill(p.points, { n: ph.n }))}</h3><div class="factgrid">
      ${fact(p.median, money(ph.median))}${fact(p.range, ph.p25 != null ? `${moneyC(ph.p25)} – ${moneyC(ph.p75)}` : '—')}
      ${fact(p.winning, esc(String(ph.winning.length)))}</div>` : empty(p.noHist);
  const awards = (x.awards || []).length ? `<h3 class="subhead" style="padding:0 16px">${esc(p.awards)}</h3>${tbl(`<th>${p.supplier}</th><th class="num">${p.value}</th><th>${p.won}</th>`,
    x.awards.map(a => `<tr><td>${esc(a.supplier)}</td><td class="num">${money(a.value_sar)}</td><td>${a.won ? pill(p.won, 'var(--ok)') : ''}</td></tr>`).join(''))}` : '';
  const comps = r.competitors?.length ? `<h3 class="subhead" style="padding:0 16px">${esc(p.comps)}</h3><ul class="alerts">${r.competitors.map(c =>
    `<li class="alert">${pill(t.lvl[c.likelihood] || c.likelihood, LVL_C[c.likelihood] || 'var(--ink3)')} <b>${esc(c.name)}</b> <span>${bi(c.note, lang)}</span></li>`).join('')}</ul>` : '';
  return card(p.title, ai + hist + awards + comps);
}

function filesCard(lang, ctx, x) {
  const t = T(lang).files;
  const files = ctx.etFiles || [];
  return card(t.title, `<p class="note" style="margin-top:0">${esc(t.hint)}</p>
    ${files.length ? `<ul class="alerts">${files.map(f => `<li class="alert"><span class="alert__dot" style="background:var(--brand)"></span>
      <button class="link" data-et-file="${esc(f.id)}">${esc(f.file_name)}</button><span class="alert__t">${f.size_bytes ? esc(fileSize(Number(f.size_bytes))) + ' · ' : ''}${when(f.created_at, lang)}</span>
      <button class="x" data-et-file-del="${esc(f.id)}" aria-label="${esc(t.del)}">✕</button></li>`).join('')}</ul>` : ''}
    <form class="inlineform" data-et-upload style="border-bottom:0"><div class="fields">
      ${fld(t.title, `<input type="file" name="file" multiple required accept=".pdf,application/pdf,image/*,.txt" />`)}
    </div><div class="actions"><button class="btn btn--sm">${esc(t.pick)}</button></div></form>`);
}

function contactsCard(lang, ctx, x) {
  const t = T(lang).ct;
  const list = ctx.etContacts || [];
  const canFind = ctx.etStatus?.keys?.lusha !== false;
  const form = `<form class="inlineform" data-et-contacts style="border-bottom:0"><div class="fields">
      ${fld(t.name, `<input name="name" value="${esc(x.agency_en || '')}" placeholder="Ministry of Culture" />`)}
      ${fld(t.domain, `<input name="domain" value="${esc(x.agency_domain || '')}" placeholder="moc.gov.sa" dir="ltr" />`)}
    </div><div class="actions"><button class="btn btn--sm"${canFind ? '' : ' disabled'}>${esc(t.find)}</button></div></form>`;
  const rows = list.length ? tbl(`<th>${t.person}</th><th>${t.job}</th><th>${t.email}</th><th>${t.phone}</th><th></th>`,
    list.map(c => `<tr>
      <td>${esc(c.full_name || '—')}${c.linkedin ? `<span class="block small"><a href="${esc(/^https?:/.test(c.linkedin) ? c.linkedin : 'https://' + c.linkedin)}" target="_blank" rel="noopener">${esc(t.li)}</a></span>` : ''}</td>
      <td class="small">${esc(c.job_title || '—')}${c.company ? `<span class="block muted">${esc(c.company)}</span>` : ''}</td>
      <td class="small" dir="ltr">${(c.emails || []).map(e => `<a href="mailto:${esc(e.email)}">${esc(e.email)}</a>`).join('<br>') || (c.revealed_at ? '—' : '')}</td>
      <td class="small" dir="ltr">${(c.phones || []).map(p => `<a href="tel:${esc(String(p.number).replace(/[^\d+]/g, ''))}">${esc(p.number)}</a>${p.type ? ` <span class="muted">${esc(p.type)}</span>` : ''}`).join('<br>') || (c.revealed_at ? '—' : '')}</td>
      <td>${c.revealed_at ? '' : `<button class="btn btn--sm" data-et-reveal="${esc(c.id)}"${canFind ? '' : ' disabled'}>${esc(t.reveal)}</button>`}</td>
    </tr>`).join('')) : empty(t.none);
  return card(t.title, `<p class="note" style="margin-top:0">${esc(t.hint)}</p>${form}${rows}`);
}

function historyCard(lang, ctx, x) {
  const t = T(lang).hist;
  const key = normClient(x.agency);
  if (!key) return '';
  const ours = (ctx.tenders || []).filter(o => normClient(o.client) === key);
  const projs = (ctx.projects || []).filter(p => normClient(p.client) === key);
  if (!ours.length && !projs.length) return card(t.title, empty(t.none));
  const out = new Map((ctx.etOutcomes || []).map(o => [o.tender_id, o]));
  return card(t.title, `${ours.length ? `<h3 class="subhead" style="padding:0 16px">${esc(t.tenders)}</h3>${tbl(
    `<th>${esc(T(lang).f.name)}</th><th class="num">${esc(T(lang).pr.value)}</th><th>${esc(T(lang).f.status)}</th>`,
    ours.map(o => `<tr><td>${go(`#/t/${o.id}`, o.title)}</td><td class="num">${money(o.value_sar)}</td>
      <td>${out.get(o.id) ? pill(T(lang).bid[out.get(o.id).bid_status], BID_C[out.get(o.id).bid_status]) : esc(o.status)}</td></tr>`).join(''))}` : ''}
    ${projs.length ? `<h3 class="subhead" style="padding:0 16px">${esc(t.projects)}</h3>${tbl(`<th>${esc(T(lang).f.name)}</th><th class="num">${esc(T(lang).pr.value)}</th>`,
      projs.slice(0, 15).map(p => `<tr><td>${go(`#/p/${p.id}`, p.name)}</td><td class="num">${money(p.contract_value_sar)}</td></tr>`).join(''))}` : ''}`);
}

export function etimadTenderView(lang, ctx) {
  const t = T(lang), f = t.f;
  if (!canSeeEtimad()) return denied(lang);
  const x = ctx.etTender;
  if (!x) return card(t.title, empty(t.t.notFound));
  const linked = x.tender_id ? (ctx.tenders || []).find(o => o.id === x.tender_id) : null;
  const actions = [
    `<button class="btn btn--sm etstar${x.shortlisted ? ' is-on' : ''}" data-et-short="${esc(x.id)}">★ ${esc(x.shortlisted ? t.list.unshort : t.list.short)}</button>`,
    `<button class="btn btn--ghost btn--sm" data-et-dismiss="${esc(x.id)}">${esc(x.dismissed ? t.list.undismiss : t.list.dismiss)}</button>`,
    ctx.etStatus?.keys?.firecrawl !== false ? `<button class="btn btn--sm" data-et-details>${esc(t.t.refresh)}</button>` : '',
    linked ? go(`#/t/${linked.id}`, `${t.t.openTender} · ${linked.ref || ''}`, 'btn btn--sm')
      : role().analyst ? `<button class="btn btn--primary btn--sm" data-et-totender>${esc(t.t.toTender)}</button>` : '',
    x.source_url ? `<a class="btn btn--ghost btn--sm" href="${esc(x.source_url)}" target="_blank" rel="noopener">${esc(t.t.etimad)} ↗</a>` : '',
  ].filter(Boolean).join('');
  return `
<nav class="crumb">${go('#/etimad/list', t.t.back)} <span class="muted">/</span> <span class="muted">${esc(x.tender_number || '')}</span></nav>
${ctx.etFlash ? `<p class="note${ctx.etFlash.bad ? ' bad' : ''}" style="margin:0 0 12px">${esc(ctx.etFlash.text)}</p>` : ''}
<section class="card">
  <div class="card__head"><h2>${esc(x.name || x.tender_number || '—')}</h2>${scopeChips(x, lang)}
    <span style="margin-inline-start:auto;display:flex;gap:8px;flex-wrap:wrap">${actions}</span></div>
  <div class="factgrid">
    ${fact(f.agency, esc(x.agency || '—') + (x.agency_en ? `<span class="block small muted">${esc(x.agency_en)}</span>` : ''))}
    ${fact(f.deadline, deadlineCell(x, lang))}
    ${fact(f.fee, money(x.documents_price))}
    ${fact(f.number, esc([x.tender_number, x.reference_number].filter(Boolean).join(' · ') || '—'))}
    ${fact(f.type, esc(x.tender_type || '—'))}
    ${fact(f.status, esc(x.status || '—'))}
    ${fact(f.opening, x.opening_at ? stamp(x.opening_at, lang) : '—')}
    ${fact(f.award, when(x.expected_award_on, lang))}
    ${fact(f.regions, esc((x.regions || []).join('، ') || '—'))}
    ${fact(f.activity, esc(x.activity || '—'))}
    ${x.contract_duration ? fact(f.duration, esc(x.contract_duration)) : ''}
    ${x.est_value_sar ? fact(f.est, money(x.est_value_sar)) : ''}
  </div>
  <p class="small muted" style="padding:0 16px 12px">${esc(x.details_at ? fill(t.t.fetched, { d: '' }) : t.t.notFetched)}${x.details_at ? stamp(x.details_at, lang) : ''}</p>
  <form class="inlineform" data-et-note style="border-bottom:0"><div class="fields">
    ${fld(f.note, `<textarea name="note" rows="2" maxlength="2000">${esc(x.note || '')}</textarea>`, true)}</div>
    <div class="actions"><button class="btn btn--sm">${esc(t.t.saveNote)}</button></div></form>
</section>
${analysisCard(lang, ctx, x)}
${pricingCard(lang, ctx, x)}
${filesCard(lang, ctx, x)}
${contactsCard(lang, ctx, x)}
${historyCard(lang, ctx, x)}`;
}

/* =============================================================== our bids */

export function etimadOursView(lang, ctx) {
  const t = T(lang), o = t.ours;
  if (!canSeeEtimad()) return denied(lang);
  const tenders = ctx.tenders || [];
  const outs = ctx.etOutcomes || [];
  const s = L.ourStats(tenders, outs);
  const out = new Map(outs.map(x => [x.tender_id, x]));
  const reasonsT = (k) => ({ en: { price: 'Price', timeline: 'Timeline', capacity: 'Capacity', scope: 'Scope', requirements: 'Requirements', competition: 'Competition', client_risk: 'Client risk', terms: 'Terms', other: 'Other' },
    ar: { price: 'السعر', timeline: 'المدة', capacity: 'الطاقة', scope: 'النطاق', requirements: 'المتطلبات', competition: 'المنافسة', client_risk: 'مخاطر العميل', terms: 'الشروط', other: 'أخرى' } })[lang][k] || k;
  const applied = tenders.filter(x => x.status === 'approved' || out.has(x.id))
    .sort((a, b) => String(b.submission_due || b.created_at || '').localeCompare(String(a.submission_due || a.created_at || '')));
  const row = (x) => {
    const r = out.get(x.id) || {};
    return `<tr data-out-row="${esc(x.id)}">
      <td style="min-width:200px">${go(`#/t/${x.id}`, x.title)}<span class="block small muted">${esc(x.client)} · ${esc(x.ref || '')}</span></td>
      <td><select class="procsel" name="bid_status">${L.BID_STATES.map(k => opt(k, t.bid[k], r.bid_status || 'preparing')).join('')}</select></td>
      <td><input class="cellinput num" type="number" min="0" step="1" name="our_price_sar" value="${esc(r.our_price_sar ?? x.value_sar ?? '')}" style="max-width:120px" /></td>
      <td><input class="cellinput" name="winner" value="${esc(r.winner || '')}" style="min-width:140px" /></td>
      <td><input class="cellinput num" type="number" min="0" step="1" name="winning_price_sar" value="${esc(r.winning_price_sar ?? '')}" style="max-width:120px" /></td>
      <td><input class="cellinput num" type="number" min="0" step="1" name="bidders" value="${esc(r.bidders ?? '')}" style="max-width:70px" /></td>
      <td><input class="cellinput" name="lost_reason" value="${esc(r.lost_reason || '')}" style="min-width:140px" /></td>
      <td><button class="btn btn--sm" data-out-save="${esc(x.id)}">${esc(o.save)}</button></td></tr>`;
  };
  return `
${tabs(lang, 'ours', ctx)}
<div class="kpis">
  ${kpi(s.applied, o.applied, { colour: 'var(--brand)', sub: `${s.submitted + s.won + s.lost} ${o.submitted}` })}
  ${kpi(s.won, o.won, { colour: 'var(--ok)', sub: moneyC(s.wonValue) })}
  ${kpi(s.lost, o.lost, { colour: 'var(--critical)', sub: moneyC(s.lostValue) })}
  ${kpi(s.winRate === null ? '—' : `${s.winRate}%`, o.winRate, { colour: 'var(--info)', sub: o.winSub })}
  ${kpi(s.avgGapPct === null ? '—' : `${s.avgGapPct > 0 ? '+' : ''}${s.avgGapPct}%`, o.gap, { colour: 'var(--warn)', sub: o.gapSub })}
  ${kpi(s.rejected, o.rejected, { colour: 'var(--ink3)' })}
</div>
<div class="chartrow" style="margin:14px 0">
  ${card(o.rivals, s.rivals.length ? tbl(`<th>${o.rival}</th><th class="num">${o.seenN}</th><th class="num">${o.winsN}</th><th class="num">${o.beat}</th><th class="num">${o.avg}</th>`,
    s.rivals.map(r => `<tr><td>${esc(r.name)}</td><td class="num">${r.seen}</td><td class="num">${r.wins}</td><td class="num">${r.beatUs}</td><td class="num">${moneyC(r.avgPrice)}</td></tr>`).join('')) : empty(o.noRivals))}
  <div>
    ${card(o.lostWhy, hbars(s.lostReasons.map(r => ({ label: r.key, n: r.n })), { fillC: 'var(--critical)' }) || empty('—'))}
    ${card(o.rejWhy, hbars(s.rejectReasons.map(r => ({ label: reasonsT(r.key), n: r.n })), { fillC: 'var(--ink3)' }) || empty('—'))}
  </div>
</div>
${s.byClient.length ? card(o.clients, hbars(s.byClient.map(c => ({ label: c.name, n: c.applied, sub: `${c.won} ${o.won} · ${c.lost} ${o.lost}` })), { fillC: 'var(--info)' })) : ''}
${card(o.table, applied.length ? tbl(`<th>${t.f.name}</th><th>${t.f.status}</th><th class="num">${o.ourPrice}</th><th>${o.winner}</th><th class="num">${o.winPrice}</th><th class="num">${o.bidders}</th><th>${o.reason}</th><th></th>`,
  applied.map(row).join('')) : empty(o.none))}`;
}

/* =============================================================== settings */

export function etimadSettingsView(lang, ctx) {
  const t = T(lang), x = t.set;
  if (!canSeeEtimad()) return denied(lang);
  const s = ctx.etSettings || {};
  const st = ctx.etStatus || {};
  const canEdit = db.state.me?.role === 'admin' || role().approver;
  const use = new Map();
  for (const u of ctx.etUsage || []) { const e = use.get(u.service) || { calls: 0, units: 0 }; e.calls++; e.units += Number(u.units) || 0; use.set(u.service, e); }
  const unit = (svc, n) => fill(svc === 'claude' ? x.tokens : x.credits, { n: Math.round(n).toLocaleString('en-US') });
  return `
${tabs(lang, 'settings', ctx)}
${setupCard(lang, ctx, true)}
${card(x.api, `<div class="factgrid">
  ${fact(x.model, esc(st.model || '—'))}${fact(x.tools, esc(String(st.tools ?? '—')))}
  ${fact(t.lastSync.replace(' {d}', ''), st.last_sync_at ? stamp(st.last_sync_at, lang) : esc(t.never))}
  </div>${st.last_sync_note ? `<p class="small muted" style="padding:0 16px">${esc(st.last_sync_note)}</p>` : ''}
  <div style="padding:0 16px 14px"><button class="btn btn--sm" data-et-discover${st.keys && !st.keys.firecrawl ? ' disabled' : ''}>${esc(x.discover)}</button></div>`)}
${card(x.usage, use.size ? `<div class="factgrid">${['firecrawl', 'claude', 'lusha'].filter(k => use.has(k)).map(k =>
  fact(k[0].toUpperCase() + k.slice(1), `${esc(unit(k, use.get(k).units))}<span class="block small muted">${esc(fill(x.calls, { n: use.get(k).calls }))}</span>`)).join('')}</div>` : empty('—'))}
<section class="card"><div class="card__head"><h2>${esc(t.tabs.settings)}</h2></div>
  <form class="inlineform" data-et-settings style="border-bottom:0">
    <div class="fields">
      ${fld(x.words, `<textarea name="keywords" rows="8"${canEdit ? '' : ' disabled'}>${esc((s.keywords || []).join('\n'))}</textarea><span class="small muted">${esc(x.wordsHint)}</span>`, true)}
      ${fld(x.profile, `<textarea name="company_profile" rows="6"${canEdit ? '' : ' disabled'}>${esc(s.company_profile || '')}</textarea><span class="small muted">${esc(x.profileHint)}</span>`, true)}
    </div>
    <div class="actions">${canEdit ? `<button class="btn btn--primary btn--sm">${esc(x.save)}</button>` : `<span class="small muted">${esc(x.onlyApprover)}</span>`}</div>
  </form></section>`;
}

/** An error sentence a person can act on. */
export function friendly(lang, err) {
  const m = String(err?.message || err);
  const t = T(lang).err;
  const k = m.match(/missing_key:(\w+)/);
  if (k) return new Error(fill(t.missing_key, { k: k[1] }));
  if (m.includes('needs_agency')) return new Error(t.needs_agency);
  if (m.includes('not_allowed')) return new Error(t.not_allowed);
  return err instanceof Error ? err : new Error(m);
}
