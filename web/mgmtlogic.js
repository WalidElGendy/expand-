/* ==========================================================================
   Management dashboard — the arithmetic. Pure functions of rows the app
   already loads, so every number on Home can be tested without a browser.

   Dates are ISO strings (YYYY-MM-DD) in Riyadh time; "today" is passed in.
   ========================================================================== */

export const PROJECT_ORDER = ['intake', 'in_design', 'pricing', 'submitted', 'won', 'in_production', 'delivered', 'lost', 'archived'];
export const ACCEPTED = ['won', 'in_production', 'delivered'];
export const OPEN_SALES = ['intake', 'in_design', 'pricing', 'submitted'];
export const CLOSED = ['delivered', 'archived', 'lost'];

const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? 0 : Number(v));
const DAY = 86400000;
export const addDays = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);
export const dayDiff = (a, b) => Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / DAY);

/** The last `n` months ending with the month of `end`, oldest first. */
export function monthKeys(end, n = 12) {
  let y = Number(end.slice(0, 4)), m = Number(end.slice(5, 7));
  const out = [];
  for (let i = 0; i < n; i++) { out.unshift(`${y}-${String(m).padStart(2, '0')}`); if (--m === 0) { m = 12; y--; } }
  return out;
}

const normName = (s) => String(s || '').toLowerCase().normalize('NFKD')
  .replace(/[ً-ٰٟـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
  .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

function tally(map, key, init) {
  if (!map.has(key)) map.set(key, init());
  return map.get(key);
}

/* ------------------------------------------------------------ projects */

export function projectStats(all, today) {
  const projects = all.filter(p => !p.is_crm_list);
  const byStatus = Object.fromEntries(PROJECT_ORDER.map(s => [s, 0]));
  for (const p of projects) if (p.status in byStatus) byStatus[p.status]++;
  const live = projects.filter(p => !CLOSED.includes(p.status));
  const overdue = live.filter(p => p.due_on && p.due_on < today);
  const due30 = live.filter(p => p.due_on && p.due_on >= today && p.due_on <= addDays(today, 30));

  /* Deliveries in the last 12 months, by month, on time or late. */
  const months = monthKeys(today, 12);
  const mm = new Map(months.map(k => [k, { month: k, onTime: 0, late: 0, noDue: 0 }]));
  let onTime = 0, late = 0, noDue = 0;
  for (const p of projects) {
    if (!p.delivered_on) continue;
    const e = mm.get(p.delivered_on.slice(0, 7));
    if (!e) continue;
    if (!p.due_on) { e.noDue++; noDue++; }
    else if (p.delivered_on <= p.due_on) { e.onTime++; onTime++; }
    else { e.late++; late++; }
  }
  const judged = onTime + late;

  /* Open work: unfinished stages on projects still in play. */
  const depts = new Map(), owners = new Map();
  let openStages = 0, unassignedStages = 0;
  for (const p of live) {
    for (const s of p.project_stages || []) {
      if (s.status === 'done') continue;
      openStages++;
      const d = tally(depts, s.department_id || '—', () => ({ dept: s.department_id || '—', n: 0, unassigned: 0 }));
      d.n++;
      if (!s.assignee_id) { d.unassigned++; unassignedStages++; }
    }
    const k = p.owner_id || '';
    const o = tally(owners, k, () => ({ id: p.owner_id || null, name: p.owner?.full_name || '', n: 0, overdue: 0 }));
    o.n++;
    if (p.due_on && p.due_on < today) o.overdue++;
  }

  /* Deadlines coming up: open projects due in each of the next 8 weeks. */
  const weeks = Array.from({ length: 8 }, (_, i) => ({ from: addDays(today, i * 7), to: addDays(today, i * 7 + 6), n: 0 }));
  for (const p of live) {
    if (!p.due_on || p.due_on < today) continue;
    const w = Math.floor(dayDiff(p.due_on, today) / 7);
    if (w < 8) weeks[w].n++;
  }

  return {
    total: projects.length, live: live.length, byStatus,
    overdue: overdue.length, due30: due30.length,
    monthly: [...mm.values()],
    delivered12: onTime + late + noDue, onTime, late, noDue,
    onTimeRate: judged ? Math.round((onTime / judged) * 100) : null,
    byDept: [...depts.values()].sort((a, b) => b.n - a.n),
    byOwner: [...owners.values()].sort((a, b) => b.n - a.n),
    openStages, unassignedStages,
    noOwner: live.filter(p => !p.owner_id).length,
    weeks,
  };
}

/* --------------------------------------------------------------- sales */

/**
 * Sales outcomes: a project submitted on Etemad is a bid; won / in production
 * / delivered means it was accepted; lost means rejected. Values come from
 * contract_value_sar, which is blank on older projects — so every SAR figure
 * travels with how many projects it covers.
 */
export function salesStats(all, today) {
  const projects = all.filter(p => !p.is_crm_list);
  const accepted = projects.filter(p => ACCEPTED.includes(p.status));
  const lost = projects.filter(p => p.status === 'lost');
  const submitted = projects.filter(p => p.status === 'submitted');
  const pipeline = projects.filter(p => OPEN_SALES.includes(p.status));
  const valued = accepted.filter(p => num(p.contract_value_sar) > 0);
  const valueWon = valued.reduce((a, p) => a + num(p.contract_value_sar), 0);
  const pipeValued = pipeline.filter(p => num(p.contract_value_sar) > 0);

  const clients = new Map(), owners = new Map();
  for (const p of accepted) {
    const k = normName(p.client) || '—';
    const name = String(p.client || '').trim() || '—';
    const c = tally(clients, k, () => ({ name, n: 0, value: 0 }));
    c.n++; c.value += num(p.contract_value_sar);
    if (c.name === c.name.toLowerCase() && name !== name.toLowerCase()) c.name = name;
  }
  for (const p of [...accepted, ...lost, ...submitted]) {
    const o = tally(owners, p.owner_id || '', () => ({ id: p.owner_id || null, name: p.owner?.full_name || '', accepted: 0, lost: 0, submitted: 0, value: 0 }));
    if (ACCEPTED.includes(p.status)) { o.accepted++; o.value += num(p.contract_value_sar); }
    else if (p.status === 'lost') o.lost++;
    else o.submitted++;
  }
  const ownerRows = [...owners.values()].map(o => ({ ...o, winRate: o.accepted + o.lost ? Math.round((o.accepted / (o.accepted + o.lost)) * 100) : null }))
    .sort((a, b) => b.accepted - a.accepted || b.value - a.value);

  /* Contract value delivered per month — what turned into finished work. */
  const months = monthKeys(today, 12);
  const mm = new Map(months.map(k => [k, { month: k, value: 0, n: 0 }]));
  for (const p of projects) {
    if (!p.delivered_on) continue;
    const e = mm.get(p.delivered_on.slice(0, 7));
    if (e) { e.n++; e.value += num(p.contract_value_sar); }
  }

  const decided = accepted.length + lost.length;
  return {
    submitted: submitted.length, accepted: accepted.length, lost: lost.length, decided,
    winRate: decided ? Math.round((accepted.length / decided) * 100) : null,
    valueWon, valuedCount: valued.length,
    avgValue: valued.length ? Math.round(valueWon / valued.length) : null,
    pipeline: pipeline.length, pipelineValue: pipeValued.reduce((a, p) => a + num(p.contract_value_sar), 0), pipelineValued: pipeValued.length,
    byClient: [...clients.values()].sort((a, b) => b.n - a.n || b.value - a.value || a.name.localeCompare(b.name)),
    byClientValue: [...clients.values()].filter(c => c.value > 0).sort((a, b) => b.value - a.value),
    byOwner: ownerRows,
    deliveredValue: [...mm.values()],
  };
}

/* ---------------------------------------------------------- attention */

/**
 * What needs a decision this week, most serious first. Each item names its
 * count and where to go; the view supplies the words.
 */
export function attention({ ps, ss, ts, hr, risks = [] }) {
  const out = [];
  const add = (level, key, n, route, extra = {}) => { if (n > 0) out.push({ level, key, n, route, ...extra }); };
  if (ps) {
    add('critical', 'projectsOverdue', ps.overdue, '#/projects');
    add('warn', 'projectsNoOwner', ps.noOwner, '#/projects');
    add('warn', 'stagesUnassigned', ps.unassignedStages, '#/highlights');
    add('info', 'projectsDue30', ps.due30, '#/projects');
  }
  for (const r of risks.filter(r => r.risk)) add('warn', 'keyPerson', r.top?.n || 0, '#/highlights', { dept: r.dept, who: r.top?.name || '', share: Math.round(r.share * 100) });
  if (ts) {
    const urgent = (ts.dueSoon || []).filter(x => x.t.status === 'review' && x.left <= 7).length;
    add('critical', 'tendersUrgent', urgent, '#/tenders');
    add('warn', 'tendersAwaiting', ts.review, '#/tenders');
  }
  if (ss) add('info', 'atEtemad', ss.submitted, '#/projects');
  if (hr) {
    add('critical', 'contractsExpired', hr.contracts_expired || 0, '#/hr');
    add('warn', 'contractsEnding', hr.contracts_ending || 0, '#/hr');
    add('warn', 'hrPending', hr.pending_requests || 0, '#/hr/requests');
    add('info', 'probationEnding', hr.probation_ending || 0, '#/hr');
    add('info', 'hrNoFile', hr.no_file || 0, '#/hr/people');
  }
  const rank = { critical: 0, warn: 1, info: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level] || b.n - a.n);
}
