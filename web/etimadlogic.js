/* ==========================================================================
   Etimad Insights — the arithmetic, with no DOM and no database, so it can be
   tested. The screens are in etimad.js.
   ========================================================================== */

import { normClient } from './tenderlogic.js';

export const SCOPE_KEYS = ['stands', 'events', 'fitout', 'marketing'];
export const BID_STATES = ['preparing', 'submitted', 'won', 'lost', 'cancelled', 'not_submitted'];

const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const day = (ts) => (ts ? String(ts).slice(0, 10) : '');

/** Whole days from `today` to the offer deadline (negative once passed). */
export function daysToOffer(t, today) {
  const d = day(t?.last_offer_at);
  if (!d || !today) return null;
  return Math.round((Date.parse(d + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000);
}
export const isOpen = (t, today) => { const d = daysToOffer(t, today); return d === null ? true : d >= 0; };

/** The latest analysis per tender id. */
export function latestAnalyses(list) {
  const m = new Map();
  for (const a of list || []) {
    const p = m.get(a.etimad_tender_id);
    if (!p || String(a.created_at) > String(p.created_at)) m.set(a.etimad_tender_id, a);
  }
  return m;
}

/**
 * A 0–100 score before (or without) an AI analysis: how many of our scopes
 * it touches, whether there is still time, and whether we know the agency.
 */
export function ruleScore(t, { today, ours = [] } = {}) {
  let s = 0;
  const sc = (t.scopes || []).length;
  s += Math.min(40, sc * 25);
  const d = daysToOffer(t, today);
  if (d === null) s += 10;
  else if (d >= 14) s += 30;
  else if (d >= 7) s += 22;
  else if (d >= 3) s += 12;
  else if (d >= 0) s += 4;
  else return Math.min(s, 20);
  const key = normClient(t.agency);
  const mine = key ? ours.filter(o => normClient(o.client) === key) : [];
  if (mine.length) s += 15 + (mine.some(o => o.status === 'approved') ? 5 : 0);
  if (num(t.documents_price) && num(t.documents_price) >= 500) s += 10;
  return Math.max(0, Math.min(100, s));
}

export function scoreOf(t, analyses, ctx) {
  const a = analyses?.get?.(t.id);
  return a?.result?.fit_score ?? ruleScore(t, ctx);
}

/** The list screen. view: all | shortlist | dismissed | analysed. */
export function filterEtimad(list, { q = '', scope = '', region = '', open = false, view = '', analysed = null } = {}, today) {
  const nq = normClient(q);
  return (list || []).filter(t => {
    if (view === 'dismissed') { if (!t.dismissed) return false; } else if (t.dismissed) return false;
    if (view === 'shortlist' && !t.shortlisted) return false;
    if (view === 'analysed' && !(analysed && analysed.has(t.id))) return false;
    if (open && !isOpen(t, today)) return false;
    if (scope && !(t.scopes || []).includes(scope)) return false;
    if (region && !(t.regions || []).some(r => normClient(r).includes(normClient(region)))) return false;
    if (nq && !normClient(`${t.name} ${t.agency || ''} ${t.tender_number || ''} ${t.reference_number || ''} ${t.activity || ''}`).includes(nq)) return false;
    return true;
  });
}

const tally = (rows, keyOf, nameOf = keyOf) => {
  const m = new Map();
  for (const r of rows) {
    for (const k of [].concat(keyOf(r) || [])) {
      if (!k) continue;
      const e = m.get(k) || { key: k, name: nameOf(r, k), n: 0 };
      e.n++; m.set(k, e);
    }
  }
  return [...m.values()].sort((a, b) => b.n - a.n || String(a.name).localeCompare(String(b.name)));
};

/** The 360 overview: the market of matching Etimad tenders. */
export function etimadOverview(list, analyses = [], today) {
  const live = (list || []).filter(t => !t.dismissed);
  const open = live.filter(t => isOpen(t, today));
  const an = latestAnalyses(analyses);
  const recs = { apply: 0, consider: 0, skip: 0 };
  for (const t of live) { const r = an.get(t.id)?.result?.recommendation; if (r in recs) recs[r]++; }
  const comp = new Map();
  for (const t of live) {
    for (const a of t.awards || []) {
      const k = normClient(a.supplier);
      if (!k) continue;
      const e = comp.get(k) || { name: a.supplier, seen: 0, wins: 0, value: 0 };
      e.seen++; if (a.won) { e.wins++; e.value += num(a.value_sar) || 0; }
      comp.set(k, e);
    }
  }
  const weeks = [];
  for (let i = 0; i < 6; i++) weeks.push({ i, n: 0 });
  for (const t of open) { const d = daysToOffer(t, today); if (d !== null) { const w = Math.floor(d / 7); if (w < 6) weeks[w].n++; } }
  return {
    total: live.length,
    open: open.length,
    closing7: open.filter(t => { const d = daysToOffer(t, today); return d !== null && d <= 7; }).length,
    shortlisted: live.filter(t => t.shortlisted).length,
    analysed: live.filter(t => an.has(t.id)).length,
    recs,
    fees: open.reduce((s, t) => s + (num(t.documents_price) || 0), 0),
    estValue: open.reduce((s, t) => s + (num(t.est_value_sar) || 0), 0),
    byScope: SCOPE_KEYS.map(k => ({ key: k, n: open.filter(t => (t.scopes || []).includes(k)).length })),
    agencies: tally(open, t => normClient(t.agency) || null, t => t.agency).slice(0, 10),
    regions: tally(open, t => (t.regions || []).map(r => r.trim()), (t, k) => k).slice(0, 10),
    types: tally(open, t => t.tender_type || null).slice(0, 8),
    weeks,
    competitors: [...comp.values()].sort((a, b) => b.wins - a.wins || b.seen - a.seen).slice(0, 10),
  };
}

/** How our own bids went: the "applied" ones are the tenders the approver
    approved (we decided to submit) or that carry a bid outcome. */
export function ourStats(tenders = [], outcomes = []) {
  const out = new Map((outcomes || []).map(o => [o.tender_id, o]));
  const applied = tenders.filter(t => t.status === 'approved' || out.has(t.id));
  const s = { applied: applied.length, preparing: 0, submitted: 0, won: 0, lost: 0, cancelled: 0, not_submitted: 0,
    wonValue: 0, lostValue: 0, winRate: null, avgGapPct: null, rivals: [], lostReasons: [], byClient: [], rejected: 0, rejectReasons: [] };
  const gaps = [], rivals = new Map(), reasons = new Map(), clients = new Map(), rej = new Map();
  const rival = (name) => { const k = normClient(name); if (!k) return null; const e = rivals.get(k) || { name: String(name).trim(), seen: 0, wins: 0, beatUs: 0, prices: [] }; rivals.set(k, e); return e; };
  for (const t of tenders) {
    if (t.status === 'rejected') { s.rejected++; const r = t.reject_reason || 'other'; rej.set(r, (rej.get(r) || 0) + 1); }
  }
  for (const t of applied) {
    const o = out.get(t.id);
    const st = o?.bid_status || 'preparing';
    s[st] = (s[st] || 0) + 1;
    const our = num(o?.our_price_sar) ?? num(t.value_sar);
    const ck = normClient(t.client);
    const ce = clients.get(ck) || { name: t.client, applied: 0, won: 0, lost: 0 };
    ce.applied++;
    if (st === 'won') { s.wonValue += our || 0; ce.won++; }
    if (st === 'lost') {
      s.lostValue += our || 0; ce.lost++;
      const win = num(o?.winning_price_sar);
      if (our && win) gaps.push(((our - win) / win) * 100);
      if (o?.lost_reason) reasons.set(o.lost_reason, (reasons.get(o.lost_reason) || 0) + 1);
    }
    clients.set(ck, ce);
    const beaten = new Set();
    for (const c of t.competitors || []) {
      const e = rival(c.name); if (!e) continue;
      e.seen++; if (c.won) e.wins++;
      if (num(c.price_sar)) e.prices.push(num(c.price_sar));
      if (st === 'lost' && c.won) beaten.add(normClient(c.name));
    }
    if (st === 'lost' && o?.winner) {
      const k = normClient(o.winner);
      const e = rival(o.winner);
      if (e && !(t.competitors || []).some(c => normClient(c.name) === k)) { e.seen++; e.wins++; }
      if (num(o.winning_price_sar)) e?.prices.push(num(o.winning_price_sar));
      beaten.add(k);
    }
    for (const k of beaten) { const e = rivals.get(k); if (e) e.beatUs++; }
  }
  const decided = s.won + s.lost;
  s.winRate = decided ? Math.round((s.won / decided) * 1000) / 10 : null;
  s.avgGapPct = gaps.length ? Math.round((gaps.reduce((a, b) => a + b, 0) / gaps.length) * 10) / 10 : null;
  s.rivals = [...rivals.values()].map(r => ({ ...r, avgPrice: r.prices.length ? Math.round(r.prices.reduce((a, b) => a + b, 0) / r.prices.length) : null }))
    .sort((a, b) => b.beatUs - a.beatUs || b.wins - a.wins || b.seen - a.seen).slice(0, 12);
  s.lostReasons = [...reasons.entries()].map(([key, n]) => ({ key, n })).sort((a, b) => b.n - a.n);
  s.rejectReasons = [...rej.entries()].map(([key, n]) => ({ key, n })).sort((a, b) => b.n - a.n);
  s.byClient = [...clients.values()].sort((a, b) => b.applied - a.applied).slice(0, 10);
  return s;
}

const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pctl = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.round((s.length - 1) * p)))]; };

/**
 * Price points from everything we know: winning prices (one per tender:
 * the recorded outcome first, else a competitor marked as winner, else our
 * own price when we won), losing prices, Etimad awards, and the contract
 * values of our projects. `scopes` narrows the Etimad awards to similar work.
 */
export function priceHistory({ ours = [], outcomes = [], etimad = [], projects = [], scopes = null } = {}) {
  const out = new Map((outcomes || []).map(o => [o.tender_id, o]));
  const winning = [], losing = [], contracts = [];
  for (const t of ours) {
    const o = out.get(t.id);
    let w = null;
    if (o?.bid_status === 'won') w = num(o.our_price_sar) ?? num(t.value_sar);
    else if (num(o?.winning_price_sar)) w = num(o.winning_price_sar);
    else { const c = (t.competitors || []).find(c => c.won && num(c.price_sar)); if (c) w = num(c.price_sar); }
    if (w) winning.push(w);
    for (const c of t.competitors || []) if (!c.won && num(c.price_sar)) losing.push(num(c.price_sar));
    if (o?.bid_status === 'lost' && num(o.our_price_sar)) losing.push(num(o.our_price_sar));
  }
  for (const t of etimad) {
    if (scopes && scopes.length && !(t.scopes || []).some(s => scopes.includes(s))) continue;
    for (const a of t.awards || []) { if (num(a.value_sar)) (a.won ? winning : losing).push(num(a.value_sar)); }
  }
  for (const p of projects) if (num(p.contract_value_sar)) contracts.push(num(p.contract_value_sar));
  return {
    winning, losing, contracts,
    n: winning.length + losing.length + contracts.length,
    median: median(winning.length ? winning : contracts),
    p25: pctl(winning.length ? winning : contracts, 0.25),
    p75: pctl(winning.length ? winning : contracts, 0.75),
  };
}

/** Text in the reader's language from an {en, ar} pair (or a plain string). */
export const bi = (v, lang) => (v && typeof v === 'object' ? (v[lang] || v.en || v.ar || '') : (v || ''));

/* Claude list prices in USD per million tokens [input, output]. The model id
   that comes back can carry a date suffix, so it is matched by prefix. */
export const CLAUDE_PRICE = { 'claude-sonnet-5-5': [2, 10] };
const priceFor = (model) => {
  const k = Object.keys(CLAUDE_PRICE).find(p => String(model || '').startsWith(p));
  return k ? CLAUDE_PRICE[k] : CLAUDE_PRICE['claude-sonnet-5-5'];
};

/** Tokens and an estimated cost from the analyses' recorded usage. */
export function claudeCost(rows = []) {
  let input = 0, output = 0, usd = 0, n = 0, rate = CLAUDE_PRICE['claude-sonnet-5-5'];
  for (const r of rows) {
    const i = Number(r.input_tokens) || 0, o = Number(r.output_tokens) || 0;
    if (!i && !o) continue;
    rate = priceFor(r.model);
    input += i; output += o; n++;
    usd += (i * rate[0] + o * rate[1]) / 1e6;
  }
  return { input, output, usd: Math.round(usd * 100) / 100, n, rate };
}
