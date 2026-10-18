/* ==========================================================================
   Tenders — the arithmetic, with no DOM and no database, so it can be tested.

   A tender moves draft → review → approved | rejected. "Accepted" on the
   dashboard means the Operations Director approved applying for it; there is
   no won/lost here (the project that an approval creates carries that).
   ========================================================================== */

export const STATUSES = ['draft', 'review', 'approved', 'rejected'];
export const REASONS = ['price', 'timeline', 'capacity', 'scope', 'requirements',
  'competition', 'client_risk', 'terms', 'other'];
export const SOURCES = ['etimad', 'direct', 'email', 'portal', 'other'];
export const REQ_STATES = ['met', 'partial', 'gap'];

/** A client name reduced to what identifies it: case, punctuation, Arabic
    diacritics and repeated spaces do not make a different client. */
export function normClient(s) {
  return String(s || '').toLowerCase().normalize('NFKD')
    .replace(/[ً-ٰٟـ]/g, '')          // harakat, tatweel
    .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
export const sameClient = (a, b) => !!normClient(a) && normClient(a) === normClient(b);

const day = (ts) => (ts ? String(ts).slice(0, 10) : '');
const num = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : 0);

export function daysLeft(due, today) {
  if (!due || !today) return null;
  return Math.round((Date.parse(due + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000);
}

/** SAR with Latin digits; compact for headline numbers. */
export function sar(n, { compact = false } = {}) {
  const v = num(n);
  if (compact) {
    const a = Math.abs(v);
    if (a >= 1e9) return `SAR ${(v / 1e9).toFixed(a >= 1e10 ? 0 : 1)}B`;
    if (a >= 1e6) return `SAR ${(v / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
    if (a >= 1e3) return `SAR ${(v / 1e3).toFixed(a >= 1e4 ? 0 : 1)}K`;
  }
  return `SAR ${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

export function reqStats(list) {
  const r = { met: 0, partial: 0, gap: 0, total: 0 };
  for (const x of Array.isArray(list) ? list : []) {
    if (!String(x?.text || '').trim()) continue;
    r.total++;
    r[REQ_STATES.includes(x.status) ? x.status : 'gap']++;
  }
  r.score = r.total ? Math.round(((r.met + r.partial * 0.5) / r.total) * 100) : null;
  return r;
}

/**
 * Everything already known about this tender's client: our earlier tenders
 * with them, the projects we did for them (and how those ended), leads at
 * that company, and every competitor price recorded against them.
 */
export function clientBackground(t, { tenders = [], projects = [], leads = [] } = {}) {
  const key = normClient(t?.client);
  if (!key) return null;
  const mine = (x) => normClient(x) === key;
  const others = tenders.filter(x => x.id !== t.id && mine(x.client))
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  const proj = projects.filter(p => mine(p.client))
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  const lds = leads.filter(l => mine(l.company));

  const tStats = { total: others.length, approved: 0, rejected: 0, pending: 0, approvedValue: 0 };
  for (const x of others) {
    if (x.status === 'approved') { tStats.approved++; tStats.approvedValue += num(x.value_sar); }
    else if (x.status === 'rejected') tStats.rejected++;
    else tStats.pending++;
  }
  const pStats = { total: proj.length, won: 0, lost: 0, delivered: 0, active: 0 };
  for (const p of proj) {
    if (['won', 'in_production', 'delivered'].includes(p.status)) pStats.won++;
    if (p.status === 'delivered') pStats.delivered++;
    if (p.status === 'lost') pStats.lost++;
    if (['intake', 'in_design', 'pricing', 'submitted'].includes(p.status)) pStats.active++;
  }
  const decidedVerdicts = pStats.won + pStats.lost;
  pStats.winRate = decidedVerdicts ? Math.round((pStats.won / decidedVerdicts) * 100) : null;

  /* Competitors: this tender's own list plus every earlier one for the client. */
  const comp = new Map();
  for (const x of [t, ...others]) {
    for (const c of Array.isArray(x.competitors) ? x.competitors : []) {
      const name = String(c?.name || '').trim();
      if (!name) continue;
      const k = normClient(name);
      const e = comp.get(k) || { name, times: 0, wins: 0, prices: [], lastYear: null, lastPrice: null };
      e.times++;
      if (c.won) e.wins++;
      const price = num(c.price_sar);
      const yr = Number(c.year) || null;
      if (price) e.prices.push(price);
      if (yr && (!e.lastYear || yr >= e.lastYear)) { e.lastYear = yr; if (price) e.lastPrice = price; }
      else if (!e.lastYear && price && e.lastPrice === null) e.lastPrice = price;
      comp.set(k, e);
    }
  }
  const competitors = [...comp.values()].map(e => ({
    name: e.name, times: e.times, wins: e.wins, lastYear: e.lastYear, lastPrice: e.lastPrice,
    avgPrice: e.prices.length ? Math.round(e.prices.reduce((a, b) => a + b, 0) / e.prices.length) : null,
  })).sort((a, b) => b.wins - a.wins || b.times - a.times || a.name.localeCompare(b.name));
  const winningPrices = [];
  for (const x of [t, ...others]) {
    for (const c of Array.isArray(x.competitors) ? x.competitors : []) {
      if (c?.won && num(c.price_sar)) winningPrices.push({ name: c.name, year: Number(c.year) || null, price: num(c.price_sar), project: c.project || x.title });
    }
  }
  winningPrices.sort((a, b) => (b.year || 0) - (a.year || 0));

  return {
    tenders: others, tStats, projects: proj, pStats, leads: lds, competitors, winningPrices,
    hasBusiness: pStats.won > 0 || tStats.approved > 0,
    isNew: !others.length && !proj.length && !lds.length,
  };
}

/** The date a tender belongs to on the dashboard: when it was decided, else created. */
export const tenderDate = (t) => day(t.decided_at) || day(t.created_at);

export function yearsOf(tenders) {
  return [...new Set(tenders.map(tenderDate).filter(Boolean).map(d => Number(d.slice(0, 4))))].sort((a, b) => b - a);
}

/**
 * The Tenders dashboard. `year` narrows to tenders whose date falls in it.
 * Conversion = approved ÷ decided (approved + rejected).
 */
export function tenderStats(all, { year = null, today = null, months = 12 } = {}) {
  const list = year ? all.filter(t => tenderDate(t).startsWith(String(year))) : all;
  const s = {
    total: list.length, draft: 0, review: 0, approved: 0, rejected: 0,
    approvedValue: 0, rejectedValue: 0, pendingValue: 0,
    reasons: [], pms: [], clients: [], monthly: [], avgDecisionDays: null, dueSoon: [],
  };
  const reasons = new Map(), pms = new Map(), clients = new Map();
  let decisionDays = 0, decisionN = 0;
  for (const t of list) {
    const v = num(t.value_sar);
    if (t.status === 'approved') {
      s.approved++; s.approvedValue += v;
      if (t.pm_id) { const e = pms.get(t.pm_id) || { id: t.pm_id, n: 0, value: 0 }; e.n++; e.value += v; pms.set(t.pm_id, e); }
      const k = normClient(t.client);
      const name = String(t.client).trim();
      const e = clients.get(k) || { name, n: 0, value: 0 }; e.n++; e.value += v;
      if (e.name === e.name.toLowerCase() && name !== name.toLowerCase()) e.name = name;   // prefer the capitalised spelling
      clients.set(k, e);
    } else if (t.status === 'rejected') {
      s.rejected++; s.rejectedValue += v;
      const r = REASONS.includes(t.reject_reason) ? t.reject_reason : 'other';
      const e = reasons.get(r) || { key: r, n: 0, value: 0 }; e.n++; e.value += v; reasons.set(r, e);
    } else {
      s[t.status === 'review' ? 'review' : 'draft']++; s.pendingValue += v;
    }
    if (t.decided_at && (t.sent_at || t.created_at)) {
      const d = (Date.parse(t.decided_at) - Date.parse(t.sent_at || t.created_at)) / 86400000;
      if (d >= 0) { decisionDays += d; decisionN++; }
    }
  }
  s.decided = s.approved + s.rejected;
  s.conversion = s.decided ? Math.round((s.approved / s.decided) * 1000) / 10 : null;
  s.avgDecisionDays = decisionN ? Math.round((decisionDays / decisionN) * 10) / 10 : null;
  const byN = (a, b) => b.n - a.n || b.value - a.value;
  s.reasons = [...reasons.values()].sort(byN);
  s.pms = [...pms.values()].sort(byN);
  s.clients = [...clients.values()].sort((a, b) => byN(a, b) || a.name.localeCompare(b.name));

  /* Approved vs rejected per month, by decision date, for the window ending this month. */
  const end = today || day(new Date().toISOString());
  const keys = [];
  let y = Number(end.slice(0, 4)), m = Number(end.slice(5, 7));
  for (let i = 0; i < months; i++) { keys.unshift(`${y}-${String(m).padStart(2, '0')}`); m--; if (!m) { m = 12; y--; } }
  const mm = new Map(keys.map(k => [k, { month: k, approved: 0, rejected: 0 }]));
  for (const t of all) {
    if (!t.decided_at || !['approved', 'rejected'].includes(t.status)) continue;
    const e = mm.get(day(t.decided_at).slice(0, 7));
    if (e) e[t.status]++;
  }
  s.monthly = [...mm.values()];

  if (today) {
    s.dueSoon = all.filter(t => ['draft', 'review'].includes(t.status) && t.submission_due)
      .map(t => ({ t, left: daysLeft(t.submission_due, today) }))
      .filter(x => x.left !== null && x.left >= 0 && x.left <= 14)
      .sort((a, b) => a.left - b.left);
  }
  return s;
}

/** Filter the list screen. */
export function filterTenders(list, { q = '', status = '', client = '', pm = '' } = {}) {
  const nq = normClient(q);
  return list.filter(t =>
    (!status || t.status === status) &&
    (!client || sameClient(t.client, client)) &&
    (!pm || t.pm_id === pm) &&
    (!nq || normClient(`${t.ref} ${t.title} ${t.client} ${t.tender_no || ''}`).includes(nq)));
}

/** Clean the editable lists before saving: no blank rows, numbers as numbers. */
export function cleanRequirements(rows) {
  return (rows || []).map(r => ({ text: String(r?.text || '').trim(), status: REQ_STATES.includes(r?.status) ? r.status : 'gap' }))
    .filter(r => r.text);
}
export function cleanCompetitors(rows) {
  return (rows || []).map(r => ({
    name: String(r?.name || '').trim(),
    year: Number(r?.year) || null,
    project: String(r?.project || '').trim() || null,
    price_sar: r?.price_sar === '' || r?.price_sar == null || !Number.isFinite(Number(r.price_sar)) ? null : Number(r.price_sar),
    won: !!r?.won,
  })).filter(r => r.name);
}

export function toCSV(rows) {
  const q = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return '﻿' + rows.map(r => r.map(q).join(',')).join('\n');
}
