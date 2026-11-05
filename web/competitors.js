/* ==========================================================================
   Competitors — who we meet on Etimad, how often they win, at what price,
   whether they pass the technical check, and the rounds they took from us.

   A "round" is one tender with its bidders. Rounds come from:
     · Etimad award results (etimad_tenders.awards): every bidder, their
       financial offer, the technical result, the winner and award value;
     · the competitor prices our analysts recorded on our own tenders
       (tenders.competitors, grouped by the past project they describe);
     · the outcomes recorded on "Our bids" (tender_outcomes).
   Pure functions; the screens are in etimad.js, the tests feed fixtures.
   ========================================================================== */

const AR = (s) => String(s ?? '')
  .replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 0x0660))
  .normalize('NFKC').toLowerCase()
  .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
  .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي');

/** The comparison key for a company name: legal-form words, letter variants
    and punctuation folded away, so "شركة أعالي التقنية للتجارة" and
    "شركه اعالي التقنيه للتجاره" meet. Words that tell companies apart (the
    trade, "للتجارة") are kept. */
export function compKey(name) {
  const s = AR(name)
    .replace(/\(.*?\)/g, ' ')
    .replace(/شركه شخص واحد|شخص واحد|ذات مسوولي[هة] محدود[هة]|المحدود[هة]|محدود[هة]|مساهم[هة] مقفل[هة]|مساهم[هة] سعودي[هة]|شركه مساهم[هة]/g, ' ')
    .replace(/^(?:\s*(?:شركه|مؤسسه|موسسه|موسسة|مكتب|وكاله|مجموعه|company|co\.?|est\.?|establishment)\s+)+/g, ' ')
    .replace(/[^a-z0-9\u0621-\u064A]+/g, ' ')
    .replace(/\b(ltd|llc|co|company|est|the)\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
  return s || null;
}

/** Is this bidder us? `names`: how Expand appears on Etimad (settings). */
export function isUs(name, names = []) {
  const k = compKey(name);
  if (!k) return false;
  return names.some(n => { const m = compKey(n); return m && (k === m || k.includes(m)); });
}

const median = (xs) => {
  const a = xs.filter(v => Number.isFinite(v)).sort((p, q) => p - q);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
const day = (x) => (x ? String(x).slice(0, 10) : null);
const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/**
 * @returns rounds: [{ id, source, title, agency, date, scopes, route,
 *   bidders: [{ name, key, price, tech, won, award, us }] }]
 */
export function buildRounds({ etimad = [], ours = [], outcomes = [], ourNames = [] }) {
  const rounds = [];
  const sig = new Set();
  const signature = (bs) => bs.filter(b => b.price).map(b => `${b.key}:${Math.round(b.price)}`).sort().join('|');
  const bidder = (name, extra) => ({ name: String(name).trim(), key: compKey(name), us: isUs(name, ourNames), ...extra });

  for (const t of etimad) {
    const rows = Array.isArray(t.awards) ? t.awards : [];
    const bs = rows.filter(r => r && r.supplier && compKey(r.supplier)).map(r => bidder(r.supplier, {
      price: num(r.value_sar), tech: r.tech === true ? true : r.tech === false ? false : null,
      won: !!r.won, award: num(r.award_sar) ?? (r.won ? num(r.value_sar) : null),
    }));
    if (!bs.length) continue;
    const s = signature(bs); if (s) sig.add(s);
    rounds.push({ id: `e:${t.id}`, source: 'etimad', title: t.name || t.tender_number || '—', agency: t.agency || null,
      date: day(t.last_offer_at) || day(t.published_on), scopes: t.scopes || [], route: `#/etimad/t/${t.id}`, bidders: bs });
  }

  /* Our analysts' notes: each past project they priced is a round. */
  for (const t of ours) {
    const comps = Array.isArray(t.competitors) ? t.competitors : [];
    const groups = new Map();
    for (const c of comps) {
      if (!c || !c.name || !compKey(c.name)) continue;
      if (c.price_sar == null && !c.won) continue;          // a name on a "likely" list, not a result
      const g = `${c.project || t.title}|${c.year || ''}`;
      if (!groups.has(g)) groups.set(g, { project: c.project || t.title, year: c.year || null, list: [] });
      groups.get(g).list.push(c);
    }
    for (const [g, x] of groups) {
      const bs = x.list.map(c => bidder(c.name, { price: num(c.price_sar), tech: null, won: !!c.won, award: c.won ? num(c.price_sar) : null }));
      const s = signature(bs);
      if (s && sig.has(s)) continue;                         // the same round Etimad already gave us
      if (s) sig.add(s);
      rounds.push({ id: `a:${t.id}:${g}`, source: 'analysis', title: x.project, agency: t.client || null,
        date: x.year ? `${x.year}-12-31` : day(t.created_at), scopes: [], route: `#/t/${t.id}`, bidders: bs });
    }
  }

  /* Outcomes recorded on "Our bids". */
  const byId = new Map(ours.map(t => [t.id, t]));
  for (const o of outcomes) {
    if (!['won', 'lost'].includes(o.bid_status)) continue;
    const t = byId.get(o.tender_id);
    if (!t) continue;
    const bs = [{ name: 'Expand', key: 'expand', us: true, price: num(o.our_price_sar), tech: null, won: o.bid_status === 'won', award: o.bid_status === 'won' ? num(o.our_price_sar) : null }];
    if (o.winner && o.bid_status === 'lost') bs.push(bidder(o.winner, { price: num(o.winning_price_sar), tech: true, won: true, award: num(o.winning_price_sar) }));
    rounds.push({ id: `o:${t.id}`, source: 'ours', title: t.title, agency: t.client || null, date: day(o.submitted_on) || day(t.submission_due),
      scopes: [], route: `#/t/${t.id}`, bidders: bs, lostReason: o.lost_reason || null });
  }
  return rounds.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

/** Within one round: the median offer of the bidders who passed the technical
    check (all bidders when nobody's result is known). */
export function roundMedian(r) {
  const known = r.bidders.some(b => b.tech !== null);
  return median(r.bidders.filter(b => b.price && (!known || b.tech)).map(b => b.price));
}

/** Why the winner beat `loser` in this round, as a code and numbers. */
export function whyLost(r, winner, loser) {
  if (!winner || !loser) return { code: 'unknown' };
  if (loser.tech === false) return { code: 'failed_tech' };
  if (winner.price && loser.price) {
    const pct = Math.round((loser.price / winner.price - 1) * 100);
    if (pct > 0) return { code: 'cheaper', pct };
    if (pct < 0) return { code: 'higher_won', pct: -pct };
    return { code: 'same_price' };
  }
  return { code: 'unknown' };
}

/**
 * One profile per company.
 * @returns [{ key, name, rounds, part, wins, losses, winRate, value, techKnown, techPass, techRate,
 *   vsMedian, wonNotCheapest, cheapestLost, rivals[], agencies[], scopes[], vsUs, lastSeen, avgBidders, threat }]
 */
export function competitorStats(rounds) {
  const P = new Map();
  const get = (b) => {
    if (!P.has(b.key)) P.set(b.key, { key: b.key, names: new Map(), rounds: [], part: 0, wins: 0, value: 0, techKnown: 0, techPass: 0,
      ratios: [], wonNotCheapest: 0, cheapestLost: 0, rivals: new Map(), agencies: new Map(), scopes: new Map(),
      vsUs: { met: 0, theyWon: 0, weWon: 0, rounds: [] }, lastSeen: null, bidders: 0, us: b.us });
    const p = P.get(b.key);
    p.names.set(b.name, (p.names.get(b.name) || 0) + 1);
    return p;
  };
  for (const r of rounds) {
    const med = roundMedian(r);
    const winner = r.bidders.find(b => b.won);
    const compliant = r.bidders.filter(b => b.price && b.tech !== false);
    const cheapest = compliant.length ? compliant.reduce((a, b) => (b.price < a.price ? b : a)) : null;
    const us = r.bidders.find(b => b.us);
    for (const b of r.bidders) {
      const p = get(b);
      if (p.rounds.some(x => x.round.id === r.id)) continue;
      p.rounds.push({ round: r, me: b, winner, med });
      p.part++; p.bidders += r.bidders.length;
      if (b.won) { p.wins++; p.value += b.award || b.price || 0; }
      if (b.tech !== null) { p.techKnown++; if (b.tech) p.techPass++; }
      if (b.price && med) p.ratios.push(b.price / med);
      if (b.won && cheapest && cheapest.key !== b.key && cheapest.price < (b.price || Infinity)) p.wonNotCheapest++;
      if (!b.won && cheapest && cheapest.key === b.key && winner) p.cheapestLost++;
      if (r.date && (!p.lastSeen || r.date > p.lastSeen)) p.lastSeen = r.date;
      const ag = r.agency || '—';
      const a = p.agencies.get(ag) || { name: ag, n: 0, wins: 0, value: 0 };
      a.n++; if (b.won) { a.wins++; a.value += b.award || b.price || 0; }
      p.agencies.set(ag, a);
      for (const sc of r.scopes || []) {
        const s = p.scopes.get(sc) || { key: sc, n: 0, wins: 0 };
        s.n++; if (b.won) s.wins++;
        p.scopes.set(sc, s);
      }
      for (const o of r.bidders) {
        if (o.key === b.key) continue;
        const v = p.rivals.get(o.key) || { key: o.key, name: o.name, met: 0, won: 0, lost: 0, us: o.us };
        v.met++; if (b.won) v.won++; if (o.won) v.lost++;
        p.rivals.set(o.key, v);
      }
      if (us && !b.us) {
        p.vsUs.met++;
        if (b.won) p.vsUs.theyWon++;
        if (us.won) p.vsUs.weWon++;
        p.vsUs.rounds.push({ round: r, them: b, us, winner,
          why: b.won ? whyLost(r, b, us) : us.won ? whyLost(r, us, b) : null });
      }
    }
  }
  return [...P.values()].map(p => {
    const name = [...p.names.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const losses = p.part - p.wins;
    const ratio = p.ratios.length ? p.ratios.reduce((a, b) => a + b, 0) / p.ratios.length : null;
    const rivals = [...p.rivals.values()].sort((a, b) => b.met - a.met || b.won - a.won);
    const agencies = [...p.agencies.values()].sort((a, b) => b.value - a.value || b.wins - a.wins || b.n - a.n);
    const scopes = [...p.scopes.values()].sort((a, b) => b.wins - a.wins || b.n - a.n);
    p.rounds.sort((a, b) => String(b.round.date || '').localeCompare(String(a.round.date || '')));
    const out = {
      key: p.key, name, us: p.us, rounds: p.rounds, part: p.part, wins: p.wins, losses,
      winRate: p.part ? Math.round((p.wins / p.part) * 100) : null, value: p.value,
      techKnown: p.techKnown, techPass: p.techPass, techRate: p.techKnown ? Math.round((p.techPass / p.techKnown) * 100) : null,
      vsMedian: ratio === null ? null : Math.round(ratio * 100), wonNotCheapest: p.wonNotCheapest, cheapestLost: p.cheapestLost,
      rivals, agencies, scopes, vsUs: p.vsUs, lastSeen: p.lastSeen, avgBidders: p.part ? Math.round((p.bidders / p.part) * 10) / 10 : null,
    };
    // How much this company matters to us: met us, wins, and how active it is.
    out.threat = out.vsUs.met * 6 + out.vsUs.theyWon * 8 + out.wins * 3 + Math.min(out.part, 30);
    out.strengths = strengths(out);
    out.weaknesses = weaknesses(out);
    return out;
  }).sort((a, b) => b.threat - a.threat || b.wins - a.wins || a.name.localeCompare(b.name));
}

/* Strengths and weaknesses as codes with numbers; the screen words them in
   Arabic or English. Each needs enough rounds to mean something. */
export function strengths(c) {
  const out = [];
  if (c.part >= 4 && c.winRate >= 30) out.push({ code: 'high_win_rate', n: c.winRate });
  if (c.techKnown >= 4 && c.techRate >= 85) out.push({ code: 'tech_strong', n: c.techRate });
  if (c.vsMedian !== null && c.vsMedian <= 92 && c.rounds.length >= 3) out.push({ code: 'price_aggressive', n: 100 - c.vsMedian });
  if (c.wonNotCheapest >= 2) out.push({ code: 'wins_on_quality', n: c.wonNotCheapest });
  const ag = c.agencies.find(a => a.wins >= 2 && a.name !== '—');
  if (ag) out.push({ code: 'agency_hold', agency: ag.name, n: ag.wins, value: ag.value });
  const sc = c.scopes.find(s => s.n >= 3 && s.wins / s.n >= 0.3);
  if (sc) out.push({ code: 'scope_strong', scope: sc.key, n: sc.wins, of: sc.n });
  if (c.vsUs.met >= 1 && c.vsUs.theyWon > c.vsUs.weWon) out.push({ code: 'beats_us', n: c.vsUs.theyWon, of: c.vsUs.met });
  return out;
}
export function weaknesses(c) {
  const out = [];
  if (c.part >= 5 && c.winRate < 12) out.push({ code: 'low_win_rate', n: c.winRate });
  if (c.techKnown >= 3 && c.techRate < 65) out.push({ code: 'tech_weak', n: 100 - c.techRate });
  if (c.vsMedian !== null && c.vsMedian >= 112 && c.rounds.length >= 3) out.push({ code: 'price_high', n: c.vsMedian - 100 });
  if (c.cheapestLost >= 2) out.push({ code: 'cheap_but_loses', n: c.cheapestLost });
  const sc = [...c.scopes].reverse().find(s => s.n >= 3 && s.wins === 0);
  if (sc) out.push({ code: 'scope_weak', scope: sc.key, n: sc.n });
  if (c.vsUs.met >= 1 && c.vsUs.weWon > c.vsUs.theyWon) out.push({ code: 'we_beat_them', n: c.vsUs.weWon, of: c.vsUs.met });
  return out;
}

/** The market at a glance, for the tab header. */
export function marketStats(rounds, comps) {
  const withUs = rounds.filter(r => r.bidders.some(b => b.us));
  const usWon = withUs.filter(r => r.bidders.some(b => b.us && b.won)).length;
  const discounts = rounds.map(r => { const w = r.bidders.find(b => b.won); const m = roundMedian(r); return w?.price && m ? w.price / m : null; })
    .filter(v => v !== null);
  return {
    rounds: rounds.length, etimad: rounds.filter(r => r.source === 'etimad').length,
    companies: comps.filter(c => !c.us).length,
    withUs: withUs.length, usWon, usRate: withUs.length ? Math.round((usWon / withUs.length) * 100) : null,
    medBidders: median(rounds.map(r => r.bidders.length)),
    winVsMedian: discounts.length ? Math.round(median(discounts) * 100) : null,
    techFail: (() => { const k = rounds.flatMap(r => r.bidders).filter(b => b.tech !== null); return k.length ? Math.round((k.filter(b => !b.tech).length / k.length) * 100) : null; })(),
  };
}
