/* ==========================================================================
   Etimad award results — the public "نتائج الترسية" panel of a tender.

   Etimad shows visitors, for a tender that has been awarded:
     · قائمة الموردين المتقدمين   every bidder, their financial offer and
                                    whether their technical offer passed
                                    (مطابق / غير مطابق);
     · قائمة الموردين المرسى عليهم who was awarded, their offer and the
                                    award value (ترسية كاملة / جزئية).

   parseAwards turns that HTML into rows in the shape etimad_tenders.awards
   already uses ({ supplier, value_sar, won }), plus `tech` and `award_sar`.
   Pure: the edge function feeds it the HTML; the tests feed it fixtures.
   ========================================================================== */

const ENT = { nbsp: ' ', amp: '&', quot: '"', lt: '<', gt: '>', apos: "'" };
export const strip = (s) => String(s ?? '')
  .replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => e[0] === '#'
    ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
    : (ENT[e.toLowerCase()] ?? m))
  .replace(/\s+/g, ' ').trim();

/** "1,234,567.50", "١٢٣٤", "SAR 900" → a number, or null. */
export function money(s) {
  const t = String(s ?? '')
    .replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u066B]/g, '.').replace(/[,\u066C\s]/g, '').replace(/[^\d.]/g, '');
  if (!t) return null;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

/** مطابق → true, غير مطابق / مستبعد → false, anything else → null. */
export function techOf(s) {
  const t = String(s ?? '');
  if (/غير\s*مطابق|غير\s*مجتاز|لم\s*يجتز|مستبعد|مرفوض|not\s*(compliant|qualified)|fail/i.test(t)) return false;
  if (/مطابق|مجتاز|ناجح|compliant|qualified|pass/i.test(t)) return true;
  return null;
}

/** The panel's sections: each <h4> heading and the rows of the table under it. */
export function sections(html) {
  return String(html ?? '').split(/<h4[^>]*>/i).slice(1).map(part => {
    const [head, ...rest] = part.split(/<\/h4>/i);
    const body = rest.join('</h4>');
    const rows = [...body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
      .map(m => [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(c => strip(c[1])))
      .filter(r => r.length && r.some(Boolean));
    return { title: strip(head), rows };
  });
}

/**
 * @returns {{ rows: {supplier, value_sar, won, tech, award_sar}[], kind: 'full'|'partial'|null, note: string|null }}
 *   rows: one per bidder (and per awarded supplier missing from the bidder list).
 *   kind: the award type when Etimad says it.
 *   note: what the panel said when it had no tables (e.g. not awarded yet).
 */
export function parseAwards(html) {
  const secs = sections(html);
  const bidders = new Map();
  const key = (n) => strip(n).replace(/\s+/g, ' ');
  let kind = null;
  for (const s of secs) {
    if (/المتقدمين|المتقدمة|bidders|offers/i.test(s.title)) {
      for (const r of s.rows) {
        const name = key(r[0]);
        if (!name) continue;
        bidders.set(name, { supplier: name, value_sar: money(r[1]), won: false, tech: techOf(r[2]), award_sar: null });
      }
    }
  }
  for (const s of secs) {
    if (!/المرسى|الترسية|ترسية|awarded/i.test(s.title) || /المتقدمين/.test(s.title)) continue;
    if (/جزئي/.test(s.title)) kind = 'partial'; else if (/كامل/.test(s.title)) kind = kind || 'full';
    for (const r of s.rows) {
      const name = key(r[0]);
      if (!name) continue;
      const offer = money(r[1]);
      const award = money(r[2] ?? r[1]);
      const b = bidders.get(name) || { supplier: name, value_sar: offer, won: false, tech: null, award_sar: null };
      b.won = true;
      b.award_sar = award ?? offer;
      if (b.value_sar == null) b.value_sar = offer;
      if (b.tech == null) b.tech = true;           // an awarded offer passed the technical check
      bidders.set(name, b);
    }
  }
  const rows = [...bidders.values()];
  const note = rows.length ? null : (strip(html).slice(0, 200) || null);
  return { rows, kind, note };
}

/** The visitor URL of the panel for one tender. */
export const awardsUrl = (tenderIdString) =>
  `https://tenders.etimad.sa/Tender/GetAwardingResultsForVisitorViewComponenet?tenderIdStr=${encodeURIComponent(tenderIdString)}`;

/** Does this look like the panel (or a "no results" panel) rather than a
    block page or the site's error page? */
export const looksLikePanel = (html) => {
  const h = String(html ?? '');
  if (/request rejected|access denied|captcha|incapsula|cloudflare/i.test(h)) return false;
  return /<h4|<table|الموردين|الترسية|لا توجد|لا يوجد/i.test(h) && h.length < 400000;
};
