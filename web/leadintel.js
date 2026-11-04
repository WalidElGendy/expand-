/* ==========================================================================
   Leads → "Recommended by tender insights".

   The organisations the tender data says sales should approach, best first:
   why now (the tender signals and Claude's explanation), what to pitch, and
   the people pulled from Lusha into Leads. Ranking, explanations and Lusha
   calls happen in the lead-intel function; this file only draws the panel.
   ========================================================================== */

import { esc, fmt } from './dash.js';

export const LSTR = {
  en: {
    title: 'Recommended by tender insights', sub: 'Organisations ranked from Etimad tenders in our scopes, the AI tender analyses, our own bids and the archived analyses.',
    refresh: 'Refresh insights', refreshing: 'Refreshing…', explaining: 'Writing insights {i}/{n}…', showAll: 'Show all {n}', showLess: 'Show top 10',
    none: 'No recommendations yet. Press Refresh insights to rank organisations from the tender data.',
    scoped: '{n} tenders in our scopes', open: '{n} open', next: 'next {d}', fit: 'fit {n}', bids: 'our bids {n}', won: 'won {n}', archived: '{n} past analyses',
    pitch: 'Pitch', pull: 'Pull contacts', pulling: 'Searching Lusha…', dismiss: 'Dismiss',
    added: '{n} in Leads', notFound: 'Not in Lusha', noRoles: 'No marketing, events or procurement people in Lusha', noDetails: 'No contact details available', otherOrg: 'Lusha only found namesakes at other organisations',
    pulled: '{a} added to Leads ({f} found in Lusha, {c} credits).', pulledNone: 'Nobody added — {why}.',
    needsAgency: 'This organisation has no English name or website yet — refresh insights first.',
    sc: { events: 'Events', stands: 'Exhibitions', fitout: 'Fit-out', marketing: 'Marketing' },
    sector: { government: 'Government', semi_government: 'Semi-government', military_security: 'Military / security', education: 'Education', health: 'Health', municipality: 'Municipality', private: 'Private', nonprofit: 'Non-profit' },
    chip: 'Tender insight', linkedin: 'LinkedIn',
  },
  ar: {
    title: 'توصيات من تحليل المنافسات', sub: 'جهات مرتبة بحسب منافسات اعتماد ضمن نطاقاتنا، وتحليلات الذكاء الاصطناعي، وعروضنا المقدمة، والتحليلات المؤرشفة.',
    refresh: 'تحديث التوصيات', refreshing: 'جارٍ التحديث…', explaining: 'جارٍ كتابة التوصيات {i}/{n}…', showAll: 'عرض الكل ({n})', showLess: 'عرض أفضل 10',
    none: 'لا توجد توصيات بعد. اضغط «تحديث التوصيات» لترتيب الجهات من بيانات المنافسات.',
    scoped: '{n} منافسة ضمن نطاقاتنا', open: '{n} مفتوحة', next: 'الأقرب {d}', fit: 'الملاءمة {n}', bids: 'عروضنا {n}', won: 'فزنا {n}', archived: '{n} تحليل سابق',
    pitch: 'زاوية العرض', pull: 'جلب جهات الاتصال', pulling: 'جارٍ البحث في Lusha…', dismiss: 'إخفاء',
    added: '{n} في العملاء المحتملين', notFound: 'غير موجودة في Lusha', noRoles: 'لا يوجد في Lusha مسؤولو تسويق أو فعاليات أو مشتريات', noDetails: 'لا تتوفر بيانات تواصل', otherOrg: 'وجد Lusha أشخاصاً في جهات أخرى بالاسم نفسه فقط',
    pulled: 'أُضيف {a} إلى العملاء المحتملين ({f} وُجدوا في Lusha، {c} رصيد).', pulledNone: 'لم يُضف أحد — {why}.',
    needsAgency: 'لا يوجد اسم إنجليزي أو موقع لهذه الجهة بعد — حدّث التوصيات أولاً.',
    sc: { events: 'فعاليات', stands: 'معارض وأجنحة', fitout: 'تجهيز داخلي', marketing: 'تسويق' },
    sector: { government: 'حكومي', semi_government: 'شبه حكومي', military_security: 'عسكري / أمني', education: 'تعليم', health: 'صحة', municipality: 'بلدية', private: 'خاص', nonprofit: 'غير ربحي' },
    chip: 'من تحليل المنافسات', linkedin: 'لينكدإن',
  },
};

const fill = (s, o) => String(s).replace(/\{(\w+)\}/g, (_, k) => (o[k] ?? ''));
export const whyNot = (t, note) => (note === 'no_people' ? t.notFound : note === 'no_roles' ? t.noRoles
  : note === 'no contact details' ? t.noDetails : note === 'other_org' ? t.otherOrg : note || '');

/** The panel above the Leads table. `canAct`: may pull and dismiss. */
export function leadIntelCard(lang, ctx, { canAct = false } = {}) {
  const t = LSTR[lang] || LSTR.en;
  const all = (ctx.leadIntel || []).filter(o => !o.dismissed && o.rank);
  if (!all.length && !canAct) return '';
  const shown = ctx.liAll ? all : all.slice(0, 10);
  const busy = ctx.liBusy || {};
  const row = (o) => {
    const s = o.signals || {};
    const chips = [
      s.scoped ? fill(t.scoped, { n: s.scoped }) : null,
      s.open ? `${fill(t.open, { n: s.open })}${s.nextDeadline ? ` · ${fill(t.next, { d: fmt(s.nextDeadline, lang) })}` : ''}` : null,
      s.fitAvg != null ? fill(t.fit, { n: s.fitAvg }) : null,
      s.ourBids ? `${fill(t.bids, { n: s.ourBids })}${s.ourWon ? ` · ${fill(t.won, { n: s.ourWon })}` : ''}` : null,
      s.archived ? fill(t.archived, { n: s.archived }) : null,
    ].filter(Boolean);
    const scopes = (s.scopes || []).map(k => t.sc[k] || k);
    const insight = lang === 'ar' ? (o.insight_ar || o.insight_en) : (o.insight_en || o.insight_ar);
    const angle = lang === 'ar' ? (o.angle_ar || o.angle_en) : (o.angle_en || o.angle_ar);
    const state = o.leads_added ? `<span class="li__ok">${esc(fill(t.added, { n: o.leads_added }))}</span>`
      : o.lusha_note ? `<span class="muted small">${esc(whyNot(t, o.lusha_note))}</span>` : '';
    return `<li class="li__row">
      <span class="li__rank">${o.rank}</span>
      <div class="li__b">
        <div class="li__h"><b dir="auto">${esc(o.agency)}</b>
          ${o.name_en ? `<span class="muted small" dir="ltr">${esc(o.name_en)}</span>` : ''}
          ${o.sector ? `<span class="li__tag">${esc(t.sector[o.sector] || o.sector)}</span>` : ''}
          ${scopes.map(x => `<span class="li__tag li__tag--sc">${esc(x)}</span>`).join('')}</div>
        ${chips.length ? `<div class="li__sig">${chips.map(c => `<span>${esc(c)}</span>`).join('')}</div>` : ''}
        ${insight ? `<p class="li__why" dir="auto">${esc(insight)}</p>` : ''}
        ${angle ? `<p class="li__pitch" dir="auto"><b>${esc(t.pitch)}:</b> ${esc(angle)}</p>` : ''}
      </div>
      <div class="li__act">
        ${state}
        ${canAct ? `<button class="btn btn--sm" data-li-pull="${esc(o.id)}"${busy[o.id] ? ' disabled' : ''}>${esc(busy[o.id] ? t.pulling : t.pull)}</button>
          <button class="link small" data-li-dismiss="${esc(o.id)}">${esc(t.dismiss)}</button>` : ''}
      </div>
    </li>`;
  };
  return `
<section class="card">
  <div class="card__head"><h2>${esc(t.title)}</h2><span class="muted small">${all.length}</span>
    ${canAct ? `<button class="btn btn--sm" style="margin-inline-start:auto" data-li-refresh${ctx.liRefreshing ? ' disabled' : ''}>${esc(ctx.liRefreshing || t.refresh)}</button>` : ''}</div>
  <p class="muted small" style="margin:0 16px 8px">${esc(t.sub)}</p>
  ${ctx.liNotice ? `<p class="note" style="margin:0 16px 10px">${esc(ctx.liNotice)}</p>` : ''}
  ${shown.length ? `<ul class="li">${shown.map(row).join('')}</ul>` : `<p class="note">${esc(t.none)}</p>`}
  ${all.length > 10 ? `<div style="padding:0 16px 14px"><button class="link small" data-li-all>${esc(ctx.liAll ? t.showLess : fill(t.showAll, { n: all.length }))}</button></div>` : ''}
</section>`;
}
