/* ==========================================================================
   Which organisations should sales call — ranked from everything the tender
   team already knows:

     · Etimad tenders in our scopes (events, exhibitions, fit-out, marketing),
       how many, how recent, how many still open, their estimated value, and
       which ones the team shortlisted;
     · the AI analyses of those tenders (fit score);
     · our own tender bids to that client, won and lost;
     · the archived tender analyses (tasks imported from the old tool).

   Pure: the edge function feeds it rows and stores the result; the tests feed
   it fixtures.
   ========================================================================== */

const AR = (s) => String(s ?? '')
  .replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 0x0660))
  .normalize('NFKC').toLowerCase()
  .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
  .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ی/g, 'ي').replace(/ک/g, 'ك');

/** An agency name as Etimad prints it → something a person would recognise.
    Some rows carry a date code in front ("20251231SAUDI IRRIGATION…") or are
    nothing but a code. */
export function cleanAgency(name) {
  let s = String(name ?? '').replace(/\s+/g, ' ').trim();
  s = s.replace(/^\d{6,}\s*/, '').replace(/\s*\($/, '').replace(/\s*\([a-z]?$/i, '').trim();
  s = s.replace(/^العميل\s*:\s*/, '').replace(/[.\s]+$/, '').trim();
  const letters = s.replace(/[^A-Za-z\u0621-\u064A]/g, '');
  return letters.length >= 3 ? s : null;
}

/** The comparison key: case, Arabic letter variants, punctuation and the
    usual prefixes folded away, so "وزارة الصحة الديوان العام" and "وزارة
    الصحة - الديوان العام." meet. */
export function orgKey(name) {
  // A department after a dash ("حرس الحدود - الإعلام والاتصال") is the same
  // organisation for sales purposes.
  const c = cleanAgency(String(name ?? '').split(/\s[-–—]\s/)[0]);
  if (!c) return null;
  return AR(c).replace(/[^a-z0-9\u0621-\u064A]+/g, ' ')
    .replace(/\b(the|of|and|ksa|saudi arabia)\b/g, ' ')
    .replace(/\s+/g, ' ').trim() || null;
}

const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const day = (x) => (x ? String(x).slice(0, 10) : null);

/**
 * @param etimad    etimad_tenders rows
 * @param analyses  etimad_analyses rows (etimad_tender_id, result.fit_score)
 * @param ours      tenders rows (client, status, value_sar, created_at)
 * @param outcomes  tender_outcomes rows (tender_id, bid_status)
 * @param archive   archived analysis tasks ({ client, day })
 * @param leads     existing leads (company) — organisations already worked
 */
export function rankOrgs({ etimad = [], analyses = [], ours = [], outcomes = [], archive = [], leads = [], today }) {
  const orgs = new Map();
  const get = (name, extra = {}) => {
    const key = orgKey(name);
    if (!key) return null;
    if (!orgs.has(key)) orgs.set(key, {
      key, agency: cleanAgency(name), name_en: null, domain: null,
      s: { scoped: 0, recent12: 0, open: 0, shortlisted: 0, est: 0, fitSum: 0, fitN: 0, ourBids: 0, ourWon: 0, ourLost: 0,
           archived: 0, lastSeen: null, nextDeadline: null, hasLeads: false },
      scopes: {}, tenders: [],
    });
    const o = orgs.get(key);
    if (extra.name_en && !o.name_en) o.name_en = extra.name_en;
    if (extra.domain && !o.domain) o.domain = extra.domain;
    // Prefer an Arabic display name when one exists.
    if (/[\u0600-\u06FF]/.test(extra.display || '') && !/[\u0600-\u06FF]/.test(o.agency || '')) o.agency = cleanAgency(extra.display);
    return o;
  };
  const fit = new Map();
  for (const a of analyses) {
    const f = Number(a?.result?.fit_score);
    if (Number.isFinite(f)) fit.set(a.etimad_tender_id, f);
  }

  for (const t of etimad) {
    if (t.dismissed || !(t.scopes || []).length) continue;
    const o = get(t.agency, { name_en: t.agency_en, domain: t.agency_domain, display: t.agency });
    if (!o) continue;
    const s = o.s;
    const seen = day(t.published_on) || day(t.first_seen_at);
    const deadline = day(t.last_offer_at);
    s.scoped++;
    if (seen && daysBetween(seen, today) <= 365) s.recent12++;
    if (deadline && deadline >= today) {
      s.open++;
      if (!s.nextDeadline || deadline < s.nextDeadline) s.nextDeadline = deadline;
    }
    if (t.shortlisted) s.shortlisted++;
    if (Number(t.est_value_sar) > 0) s.est += Number(t.est_value_sar);
    if (fit.has(t.id)) { s.fitSum += fit.get(t.id); s.fitN++; }
    if (seen && (!s.lastSeen || seen > s.lastSeen)) s.lastSeen = seen;
    for (const sc of t.scopes || []) o.scopes[sc] = (o.scopes[sc] || 0) + 1;
    o.tenders.push({ name: t.name, deadline, value: Number(t.est_value_sar) || null, open: !!(deadline && deadline >= today), fit: fit.get(t.id) ?? null });
  }

  const outcomeOf = new Map(outcomes.map(x => [x.tender_id, x.bid_status]));
  for (const t of ours) {
    const o = get(t.client, { display: t.client });
    if (!o) continue;
    o.s.ourBids++;
    const st = outcomeOf.get(t.id);
    if (st === 'won') o.s.ourWon++;
    if (st === 'lost') o.s.ourLost++;
    const d = day(t.created_at);
    if (d && (!o.s.lastSeen || d > o.s.lastSeen)) o.s.lastSeen = d;
    o.tenders.push({ name: t.title, deadline: day(t.submission_due), value: Number(t.value_sar) || null, ours: true, status: t.status });
  }
  for (const a of archive) {
    const o = get(a.client, { display: a.client });
    if (!o) continue;
    o.s.archived++;
    if (a.day && (!o.s.lastSeen || a.day > o.s.lastSeen)) o.s.lastSeen = a.day;
    o.tenders.push({ name: a.name, deadline: null, value: null, archived: true });
  }
  const leadKeys = new Set(leads.map(l => orgKey(l.company)).filter(Boolean));
  for (const o of orgs.values()) o.s.hasLeads = leadKeys.has(o.key);

  const out = [...orgs.values()].map(o => {
    const s = o.s;
    const fitAvg = s.fitN ? Math.round(s.fitSum / s.fitN) : null;
    const fresh = s.lastSeen ? daysBetween(s.lastSeen, today) : 9999;
    const score =
      Math.min(s.scoped, 10) * 3 +              // buys what we sell, again and again
      Math.min(s.recent12, 8) * 2 +             // …recently
      Math.min(s.open, 4) * 5 +                 // …and right now
      s.shortlisted * 4 +                       // the tender team already liked one
      (fitAvg !== null ? fitAvg * 0.25 : 0) +   // the AI analysis fit
      s.ourBids * 6 + s.ourWon * 10 + s.ourLost * 3 +   // we know them
      s.archived * 4 +
      (s.est > 0 ? Math.log10(s.est) * 2 : 0) +
      (fresh <= 90 ? 8 : fresh <= 180 ? 4 : 0);
    const scopes = Object.entries(o.scopes).sort((a, b) => b[1] - a[1]).map(([k]) => k);
    const top = o.tenders.slice().sort((a, b) => (b.open - a.open) || String(b.deadline || '').localeCompare(String(a.deadline || ''))).slice(0, 5);
    return { key: o.key, agency: o.agency, name_en: o.name_en, domain: o.domain, score: Math.round(score * 10) / 10,
      signals: { ...s, fitAvg, fitSum: undefined, fitN: s.fitN, scopes }, top_tenders: top };
  }).filter(o => o.score > 0)
    .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
  out.forEach((o, i) => { o.rank = i + 1; });
  return out;
}

/* Lusha job-title words for the three roles the user chose. Order matters:
   when an organisation has more people than we pull, the earlier roles win. */
export const ROLE_TITLES = {
  marketing: ['marketing', 'communication', 'communications', 'media', 'public relations', 'brand', 'corporate communication'],
  events: ['events', 'event', 'exhibition', 'exhibitions', 'protocol', 'conference', 'conferences'],
  procurement: ['procurement', 'purchasing', 'tenders', 'tender', 'contracts', 'sourcing', 'supply'],
};
export const ALL_TITLES = [...new Set(Object.values(ROLE_TITLES).flat())];

/** Which of the roles a job title belongs to (null if none). */
export function roleOf(title) {
  const t = String(title || '').toLowerCase();
  for (const [role, words] of Object.entries(ROLE_TITLES)) if (words.some(w => t.includes(w))) return role;
  return null;
}

/** What Lusha says it can reveal for a search result: ['emails', 'phones']. */
export function revealable(r) {
  const out = new Set();
  for (const c of Array.isArray(r?.canReveal) ? r.canReveal : []) if (c?.field === 'emails' || c?.field === 'phones') out.add(c.field);
  for (const h of Array.isArray(r?.has) ? r.has : []) if (h === 'emails' || h === 'phones') out.add(h);
  return [...out];
}

/** From a Lusha search result, the people worth paying to reveal: at most
    `max`, only people Lusha can actually reveal an email or phone for (when
    anyone qualifies), one per role first, then by data and seniority. */
export function pickContacts(results, max = 2) {
  const senior = (t) => (/(chief|head|director|vp|vice president|general manager|gm\b)/i.test(t) ? 2 : /manager|lead/i.test(t) ? 1 : 0);
  let cands = (results || []).filter(r => r?.id).map(r => {
    const title = r.jobTitle?.title || (typeof r.jobTitle === 'string' ? r.jobTitle : '');
    const data = revealable(r);
    return { r, role: roleOf(title), senior: senior(title), data, rich: (data.includes('phones') ? 2 : 0) + (data.includes('emails') ? 2 : 0) };
  }).filter(c => c.role);
  if (cands.some(c => c.rich)) cands = cands.filter(c => c.rich);
  cands.sort((a, b) => (b.rich - a.rich) || (b.senior - a.senior));
  const picked = [];
  for (const role of Object.keys(ROLE_TITLES)) {
    const c = cands.find(x => x.role === role && !picked.includes(x));
    if (c && picked.length < max) picked.push(c);
  }
  for (const c of cands) if (picked.length < max && !picked.includes(c)) picked.push(c);
  return picked.map(c => ({ ...c.r, _role: c.role, _reveal: c.data }));
}

/** Is a revealed contact really at this organisation? Lusha sometimes matches
    a Saudi body by name to a namesake abroad ("Ministry of Sport" → a club in
    Israel, "General Security" → the Turkish police) or to a local company
    ("Al-Jouf Municipality" → Jouf Cement).
    · Any email must be Saudi (.sa) or on the organisation's own domain.
    · Found by name (no domain, or the domain found nobody): an email or a
      +966 phone is required, and a government body's email cannot be .com.sa. */
export function trustContact({ email, phone, matchedBy, orgDomain, sector }) {
  const d = String(email || '').split('@')[1]?.toLowerCase() || '';
  const own = orgDomain && (d === orgDomain || d.endsWith('.' + orgDomain));
  if (d && !own && !d.endsWith('.sa')) return false;
  if (matchedBy === 'domain') return true;
  const ksaPhone = /^\+?966/.test(String(phone || '').replace(/[\s()-]/g, ''));
  if (!d && !ksaPhone) return false;
  if (d && !own && d.endsWith('.com.sa') && !['private', 'semi_government'].includes(sector)) return false;
  return true;
}
