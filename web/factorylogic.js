/* ==========================================================================
   Factory production — the rules behind Insights → Factory production.

   Pure: (projects, procurement items, production rows, today) → what the
   screen and the Excel export show. No DOM, no database, so the tests read
   the same rules the page does.

   A project's production phase, in the order work flows through the factory:
     upcoming   has a production stage but is not won yet (still bidding)
     procure    won, buying what the build needs
     making     on the factory floor (in production, or the production
                stage has started)
     ready      the production stage is done, waiting to go to site
     delivered  delivered
   ========================================================================== */

export const PHASES = ['upcoming', 'procure', 'making', 'ready', 'delivered'];
export const PROC_STATUS = ['pending', 'in_process', 'done', 'not_available', 'expensive'];

const BIDDING = ['intake', 'in_design', 'pricing', 'submitted'];
const DAY = 86400000;
export const SOON_DAYS = 14;        // a delivery this close counts as "soon"
export const STALE_DAYS = 7;        // an open item untouched this long needs a nudge

const ymd = (s) => {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null;
};
/** Whole days from today to a date; negative when it has passed. */
export const daysUntil = (iso, today) => {
  const a = ymd(iso), b = ymd(today);
  return a === null || b === null ? null : Math.round((a - b) / DAY);
};

export const productionStage = (p) =>
  (p.project_stages || []).find(s => s.department_id === 'production') || null;

export function phaseOf(p) {
  if (p.status === 'delivered') return 'delivered';
  if (BIDDING.includes(p.status)) return 'upcoming';
  const st = productionStage(p);
  if (st?.status === 'done') return 'ready';
  if (p.status === 'in_production' || st?.status === 'in_progress') return 'making';
  return 'procure';
}

/** The date the factory works to: the site delivery date production set,
    else the project's estimated delivery. Not the project's deadline: that is
    when the proposal is due, and reading it as a delivery date called every
    project still being bid "late". */
export function deliveryOf(p, prod) {
  if (prod?.site_delivery_on) return { on: prod.site_delivery_on, src: 'site' };
  if (p.estimated_delivery) return { on: p.estimated_delivery, src: 'estimate' };
  return { on: null, src: null };
}

/**
 * Why an item needs somebody to chase it, or null.
 *   notAvailable / expensive   the procurement team flagged it
 *   late / soon                the project delivers (or should have) and it is not bought
 *   stale                      open and untouched for STALE_DAYS
 */
export function followUpOf(item, deliveryDays, today) {
  if (item.status === 'done') return null;
  if (item.status === 'not_available') return { code: 'notAvailable' };
  if (item.status === 'expensive') return { code: 'expensive' };
  if (deliveryDays !== null && deliveryDays !== undefined) {
    if (deliveryDays < 0) return { code: 'late', n: -deliveryDays };
    if (deliveryDays <= SOON_DAYS) return { code: 'soon', n: deliveryDays };
  }
  const idle = daysUntil(today, item.updated_at || item.created_at);
  if (idle !== null && idle >= STALE_DAYS) return { code: 'stale', n: idle };
  return null;
}

/**
 * Everything the Factory screens need.
 * @returns {{ rows, items, kpi, phaseCount, proc }}
 */
export function factoryData({ projects = [], items = [], production = [] } = {}, today) {
  const prodBy = new Map(production.map(r => [r.project_id, r]));
  const itemsBy = new Map();
  for (const it of items) {
    if (!itemsBy.has(it.project_id)) itemsBy.set(it.project_id, []);
    itemsBy.get(it.project_id).push(it);
  }

  /* Which projects the factory cares about: won or later, or anything that
     already has a production stage, a production row or items to buy. Lost and
     archived work is not the factory's; delivered work stays for 60 days. */
  const rows = [];
  for (const p of projects) {
    if (p.is_crm_list || ['lost', 'archived'].includes(p.status)) continue;
    const prod = prodBy.get(p.id) || null;
    const its = itemsBy.get(p.id) || [];
    const stage = productionStage(p);
    const relevant = ['won', 'in_production', 'delivered'].includes(p.status) || stage || prod || its.length;
    if (!relevant) continue;
    if (p.status === 'delivered') {
      const ago = daysUntil(today, p.delivered_on || p.updated_at);
      if (ago !== null && ago > 60) continue;
    }
    const delivery = deliveryOf(p, prod);
    const phase = phaseOf(p);
    const left = phase === 'delivered' ? null : daysUntil(delivery.on, today);
    const done = its.filter(i => i.status === 'done').length;
    rows.push({ project: p, prod, stage, phase, delivery, left, late: left !== null && left < 0,
      items: its, itemsDone: done, itemsFollow: 0 });
  }
  const byId = new Map(rows.map(r => [r.project.id, r]));

  /* Items, each with its project's delivery and its follow-up reason. */
  const all = [];
  for (const it of items) {
    const r = byId.get(it.project_id);
    const p = r?.project || projects.find(x => x.id === it.project_id) || null;
    const left = r ? r.left : null;
    const follow = followUpOf(it, left, today);
    if (follow && r) r.itemsFollow++;
    all.push({ ...it, project: p, row: r || null, follow, deliveryOn: r?.delivery.on || null, deliveryLeft: left });
  }
  /* Follow-ups first (late before soon before flagged before stale), then
     open items, then done; within a group, the nearest delivery first. */
  const rank = (x) => !x.follow ? (x.status === 'done' ? 9 : 6)
    : ({ late: 0, notAvailable: 1, soon: 2, expensive: 3, stale: 4 })[x.follow.code];
  all.sort((a, b) => rank(a) - rank(b)
    || (a.deliveryLeft ?? 1e9) - (b.deliveryLeft ?? 1e9)
    || String(a.project?.name || '').localeCompare(String(b.project?.name || ''))
    || (a.sort ?? 0) - (b.sort ?? 0));

  const phaseCount = Object.fromEntries(PHASES.map(k => [k, rows.filter(r => r.phase === k).length]));
  const active = rows.filter(r => ['procure', 'making', 'ready'].includes(r.phase));
  const kpi = {
    active: active.length,
    upcoming: phaseCount.upcoming,
    soon: active.filter(r => r.left !== null && r.left >= 0 && r.left <= SOON_DAYS).length,
    late: active.filter(r => r.late).length,
    noDate: active.filter(r => !r.delivery.on).length,
    delivered30: rows.filter(r => r.phase === 'delivered'
      && (daysUntil(today, r.project.delivered_on || r.project.updated_at) ?? 99) <= 30).length,
  };
  const proc = {
    total: all.length,
    done: all.filter(i => i.status === 'done').length,
    inProcess: all.filter(i => i.status === 'in_process').length,
    pending: all.filter(i => i.status === 'pending').length,
    flagged: all.filter(i => ['not_available', 'expensive'].includes(i.status)).length,
    follow: all.filter(i => i.follow).length,
  };
  proc.open = proc.total - proc.done;
  proc.pct = proc.total ? Math.round(proc.done / proc.total * 100) : null;

  /* Rows: late first, then by delivery date; undated last; delivered at the end. */
  rows.sort((a, b) => (a.phase === 'delivered') - (b.phase === 'delivered')
    || (a.phase === 'upcoming') - (b.phase === 'upcoming')
    || (a.left ?? 1e9) - (b.left ?? 1e9)
    || String(a.project.name).localeCompare(String(b.project.name)));

  return { rows, items: all, kpi, phaseCount, proc };
}

/** Item list as the Procurement tab filters it. */
export function filterItems(items, { show = 'all', project = '', q = '' } = {}) {
  let out = items;
  if (show === 'follow') out = out.filter(i => i.follow);
  else if (show === 'open') out = out.filter(i => i.status !== 'done');
  else if (show === 'done') out = out.filter(i => i.status === 'done');
  if (project) out = out.filter(i => i.project_id === project);
  const n = String(q || '').trim().toLowerCase();
  if (n) out = out.filter(i => [i.name, i.description, i.project?.name, i.project?.client]
    .some(v => String(v || '').toLowerCase().includes(n)));
  return out;
}

/** Production rows as the Production tab filters them. */
export function filterRows(rows, { phase = '', q = '' } = {}) {
  let out = phase ? rows.filter(r => r.phase === phase) : rows;
  const n = String(q || '').trim().toLowerCase();
  if (n) out = out.filter(r => [r.project.name, r.project.client, r.project.owner?.full_name, r.stage?.assignee?.full_name]
    .some(v => String(v || '').toLowerCase().includes(n)));
  return out;
}
