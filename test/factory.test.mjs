/* Insights → Factory production: phases, delivery dates, procurement
   follow-ups, the two screens, and the Projects / Factory Excel exports. */
import * as F from '../web/factorylogic.js';
import * as db from '../web/db.js';
import * as V from '../web/factory.js';
import * as PX from '../web/projxlsx.js';
import * as XL from '../web/xlsx.js';
import { filterSentence } from '../web/factoryctl.js';

let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log('  - ' + msg); } };
const today = '2026-11-05';

const stage = (status, who = 'Bawarith') => ({ id: 's-' + status, department_id: 'production', status, sort: 4, assignee: { full_name: who } });
const P = [
  { id: 'a', name: 'Won, buying', client: 'NCPD', status: 'won', due_on: '2026-11-12', owner: { full_name: 'Manal' }, project_stages: [stage('pending')] },
  { id: 'b', name: 'On the floor', status: 'in_production', due_on: '2026-09-01', estimated_delivery: '2026-10-30', project_stages: [stage('in_progress')] },
  { id: 'c', name: 'Built', status: 'won', estimated_delivery: '2026-12-20', project_stages: [stage('done')] },
  { id: 'd', name: 'Still bidding', status: 'in_design', due_on: '2026-12-01', project_stages: [stage('pending')] },
  { id: 'e', name: 'Not the factory\'s', status: 'in_design', project_stages: [] },
  { id: 'f', name: 'Delivered', status: 'delivered', delivered_on: '2026-10-20', project_stages: [stage('done')] },
  { id: 'g', name: 'Old delivery', status: 'delivered', delivered_on: '2026-05-01', project_stages: [] },
  { id: 'h', name: 'Lost', status: 'lost', project_stages: [stage('pending')] },
];
const production = [{ project_id: 'a', site_delivery_on: '2026-11-15', schedule: 'Carpentry week 1, paint week 2' }];
const items = [
  { id: 'i1', project_id: 'a', name: 'MDF boards', status: 'done', updated_at: '2026-11-04T10:00:00Z' },
  { id: 'i2', project_id: 'a', name: 'LED screens', status: 'pending', updated_at: '2026-11-04T10:00:00Z' },
  { id: 'i3', project_id: 'c', name: 'Vinyl', status: 'in_process', updated_at: '2026-10-20T10:00:00Z' },
  { id: 'i4', project_id: 'c', name: 'Acrylic', status: 'not_available', updated_at: '2026-11-05T08:00:00Z' },
  { id: 'i5', project_id: 'c', name: 'Paint', status: 'pending', updated_at: '2026-11-03T08:00:00Z' },
  { id: 'i6', project_id: 'b', name: 'Fabric', status: 'expensive', updated_at: '2026-11-05T08:00:00Z' },
];

/* ---------------------------------------------------------------- rules */
check(F.daysUntil('2026-11-15', today) === 10, 'days until');
check(F.daysUntil('2026-11-01', today) === -4, 'days since');
check(F.phaseOf(P[0]) === 'procure', 'won + production pending = procurement');
check(F.phaseOf(P[1]) === 'making', 'in production = manufacturing');
check(F.phaseOf(P[2]) === 'ready', 'production stage done = ready');
check(F.phaseOf(P[3]) === 'upcoming', 'bidding = upcoming');
check(F.phaseOf(P[5]) === 'delivered', 'delivered');
check(F.deliveryOf(P[0], production[0]).src === 'site', 'site date wins');
check(F.deliveryOf(P[2], null).on === '2026-12-20', 'then estimate');
check(F.deliveryOf(P[3], null).on === null, 'a proposal deadline is not a delivery date');
check(F.followUpOf({ status: 'done' }, -5, today) === null, 'done never needs follow-up');
check(F.followUpOf({ status: 'not_available' }, 99, today).code === 'notAvailable', 'not available');
check(F.followUpOf({ status: 'pending', updated_at: today }, -2, today).code === 'late', 'late delivery');
check(F.followUpOf({ status: 'pending', updated_at: today }, 10, today).code === 'soon', 'soon delivery');
check(F.followUpOf({ status: 'in_process', updated_at: '2026-10-20' }, 45, today)?.n === 16, 'stale for 16 days');
check(F.followUpOf({ status: 'pending', updated_at: '2026-11-03' }, 45, today) === null, 'fresh open item is fine');

const D = F.factoryData({ projects: P, items, production }, today);
const ids = D.rows.map(r => r.project.id);
check(ids.length === 5 && !ids.includes('e') && !ids.includes('g') && !ids.includes('h'), `factory rows: ${ids}`);
check(ids[0] === 'b', `late project first, got ${ids[0]}`);
check(ids.at(-1) === 'f', 'delivered last');
check(D.kpi.active === 3 && D.kpi.late === 1 && D.kpi.soon === 1 && D.kpi.upcoming === 1 && D.kpi.delivered30 === 1, `kpis ${JSON.stringify(D.kpi)}`);
check(D.phaseCount.procure === 1 && D.phaseCount.making === 1 && D.phaseCount.ready === 1, 'phase counts');
const a = D.rows.find(r => r.project.id === 'a');
check(a.left === 10 && a.itemsDone === 1 && a.itemsFollow === 1, 'row a: 10 days, 1 bought, LED screens due soon');
check(D.proc.total === 6 && D.proc.done === 1 && D.proc.follow === 4 && D.proc.pct === 17, `proc ${JSON.stringify(D.proc)}`);
check(D.items[0].follow?.code === 'notAvailable' && D.items[1].follow?.code === 'soon' && D.items.at(-1).status === 'done', 'items: flagged and soon first, done last');
check(F.filterItems(D.items, { show: 'follow' }).length === 4, 'follow filter');
check(F.filterItems(D.items, { project: 'c' }).length === 3, 'project filter');
check(F.filterItems(D.items, { q: 'led' }).length === 1, 'item search');
check(F.filterRows(D.rows, { phase: 'ready' }).length === 1, 'phase filter');
check(F.filterRows(D.rows, { q: 'manal' }).length === 1, 'row search by PM');

/* -------------------------------------------------------------- screens */
const ctx = { fProjects: P, fItems: items, fProd: production, fToday: today };
db.state.me = { id: 'x', role: 'member', department_id: 'production', is_active: true };
for (const lang of ['en', 'ar']) {
  const h = V.factoryProductionView(lang, ctx);
  check(h.includes('data-fd-date="a"') && h.includes('fflow__c') && h.includes(V.FSTR[lang].phase.making), `${lang} production view, editable`);
  check(h.includes('data-fp-project="c"'), `${lang} follow-up chip links to procurement`);
  const q = V.factoryProcurementView(lang, ctx);
  check(q.includes('data-fp-status="i4"') && q.includes('data-fi-add') && q.includes('fwhy--notAvailable'), `${lang} procurement view, editable`);
}
db.state.me = { id: 'y', role: 'member', department_id: 'bd', is_active: true };
const ro = V.factoryProcurementView('en', ctx);
check(!ro.includes('data-fp-status') && !ro.includes('data-fi-add') && ro.includes(V.FSTR.en.readOnly), 'read-only for others');
const none = V.factoryProductionView('en', { fProjects: [P[4]], fItems: [], fProd: [], fToday: today });
check(none.includes(V.FSTR.en.emptyProd), 'empty state');
const filtered = V.factoryProcurementView('en', { ...ctx, fif: { show: 'done' } });
check(filtered.includes('MDF boards') && !filtered.includes('LED screens'), 'done filter on screen');

/* ------------------------------------------------- purchase requests */
{
  const req = { id: 'r1', project_id: 'c', name: 'Acrylic sheets', status: 'pending', updated_at: '2026-11-05T08:00:00Z',
    qty: 12, unit: 'sheet', needed_by: '2026-11-09', description: '3 mm clear, 1220×2440', created_by: 'x', created_at: '2026-11-04T08:00:00Z',
    suppliers: [{ name: 'Gulf Plastics', contact: '0551234567', price: 180 }, { name: 'Al Waha', contact: '', price: '150.5' },
      { name: 'No quote yet', contact: 'x@y.sa', price: null }, { name: '', contact: '', price: 99 }, { name: 'Bad', price: -3 }] };
  const sups = F.suppliersOf(req);
  check(sups.length === 4 && sups[3].price === null, `suppliers cleaned: nameless dropped, a negative price is no price (${JSON.stringify(sups)})`);
  const q = F.bestQuote(req);
  check(q && q.name === 'Al Waha' && q.price === 150.5 && q.total === 1806 && q.n === 2, `lowest quote × qty: ${JSON.stringify(q)}`);
  check(F.bestQuote({ suppliers: [{ name: 'x' }] }) === null && F.bestQuote({}) === null, 'no prices → no quote');
  // Its own needed-by date (4 days off) drives the follow-up, not the project's delivery (45 days off).
  const D2 = F.factoryData({ projects: P, items: [req], production }, today);
  const r = D2.items[0];
  check(r.deliveryOn === '2026-11-09' && r.deliverySrc === 'need' && r.follow?.code === 'soon' && r.follow.need, `needed-by drives follow-up: ${JSON.stringify(r.follow)}`);
  check(V.followSentence('en', r.follow) === 'Needed in 4 days' && V.followSentence('ar', r.follow).includes('4'), 'needed-by sentence');
  const late = F.factoryData({ projects: P, items: [{ ...req, needed_by: '2026-11-01' }], production }, today).items[0];
  check(V.followSentence('en', late.follow) === 'Was needed 4 days ago', 'needed-by passed');
  const site = F.factoryData({ projects: P, items: [{ ...req, needed_by: null }], production }, today).items[0];
  check(site.deliverySrc === 'site' && site.deliveryOn === '2026-12-20' && site.follow?.code !== 'soon', 'without needed-by: the project date');
  check(F.filterItems(D2.items, { q: 'waha' }).length === 1, 'search finds a supplier');

  db.state.me = { id: 'x', role: 'member', department_id: 'production', is_active: true };
  const photos = [{ id: 'ph1', procurement_item_id: 'r1', filename: 'sample.jpg', mime: 'image/jpeg', url: 'https://example.test/s.jpg' },
    { id: 'ph2', procurement_item_id: 'r1', filename: 'spec.pdf', mime: 'application/pdf', url: 'https://example.test/s.pdf' }];
  const c2 = { fProjects: P, fItems: [req], fProd: production, fToday: today, fPhotos: photos, people: [{ id: 'x', full_name: 'Bawarith' }] };
  for (const lang of ['en', 'ar']) {
    const r_ = V.FSTR[lang].req;
    const list = V.factoryProcurementView(lang, c2);
    check(list.includes('12 sheet') && list.includes('src="https://example.test/s.jpg"') && list.includes('Gulf Plastics, Al Waha +2'),
      `${lang}: the line shows quantity, a thumbnail and the suppliers`);
    check(list.includes('SAR 150.50') && list.includes('data-fi-open="r1"') && !list.includes('data-freq'), `${lang}: lowest quote shown, details closed`);
    check(['fiQty', 'fiUnit', 'fiNeed', 'fiSpec', 'fiPhotos', 'data-fi-sups', 'data-fi-supadd'].every(k => list.includes(k)), `${lang}: the request form has every field`);
    const open = V.factoryProcurementView(lang, { ...c2, fOpen: 'r1' });
    check(open.includes('data-freq="r1"') && open.includes('data-fphoto-add="r1"') && open.includes('data-fphoto-del="ph2"') && open.includes('>PDF<'),
      `${lang}: details: photos, add and remove; a PDF shows as a tile`);
    check(open.includes('data-fs-item="r1"') && (open.match(/data-fs-row=/g) || []).length === 5 && open.includes(`>${r_.lowest}<`) && open.includes('1,806'),
      `${lang}: details: every supplier line, the lowest marked, totals at the quantity`);
    check(open.includes('value="3 mm clear, 1220×2440"') === false && open.includes('3 mm clear, 1220×2440') && open.includes('Bawarith'), `${lang}: specs and who asked`);
  }
  db.state.me = { id: 'y', role: 'member', department_id: 'bd', is_active: true };
  const roOpen = V.factoryProcurementView('en', { ...c2, fOpen: 'r1' });
  check(!roOpen.includes('data-fs-row') && !roOpen.includes('data-fphoto-add') && roOpen.includes(' disabled') && roOpen.includes('Gulf Plastics'),
    'others see the request but cannot change it');

  // The Factory export carries the request.
  const sheets = PX.factoryWorkbook('en', D2, { today, who: 'T', phaseName: x => x, statusName: x => x, procName: x => x, stageName: x => x, srcName: x => x,
    followText: f => V.followSentence('en', f) });
  const flat = sheets[1].rows.flat().map(c => c?.v);
  check(flat.includes(12) && flat.includes('sheet') && flat.includes(150.5) && flat.includes(1806) && flat.some(v => String(v).includes('Gulf Plastics · 0551234567 · 180 SAR')),
    'export: qty, unit, suppliers, lowest price and total');
}

/* -------------------------------------------------------------- exports */
const unzipNames = (bytes) => {
  const names = []; const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i + 30 < bytes.length; i++) {
    if (dv.getUint32(i, true) === 0x04034b50) {
      const n = dv.getUint16(i + 26, true), x = dv.getUint16(i + 28, true), sz = dv.getUint32(i + 18, true);
      names.push(new TextDecoder().decode(bytes.subarray(i + 30, i + 30 + n)));
      i += 29 + n + x + sz;
    }
  }
  return names;
};
const text = (bytes) => new TextDecoder().decode(bytes);
const fx = PX.factoryWorkbook('en', D, { today, who: 'Walid', phaseName: k => V.FSTR.en.phase[k], followText: f => f.code });
check(fx.length === 2 && fx[0].rows.length === 3 + D.rows.length && fx[1].rows.length === 3 + D.items.length, 'factory workbook rows');
check(fx[0].autoFilter === `A3:N${3 + D.rows.length}`, `factory autofilter ${fx[0].autoFilter}`);
const fbytes = XL.buildWorkbook(fx, { title: 'Factory' });
const fnames = unzipNames(fbytes);
check(fnames.includes('xl/worksheets/sheet2.xml') && text(fbytes).includes('_xlnm._FilterDatabase'), `factory xlsx parts ${fnames}`);

const px = PX.projectsWorkbook('ar', P.slice(0, 4), { today, who: 'وليد' });
check(px.length === 3 && px.every(s => s.rtl), 'projects workbook: three right-to-left sheets');
const proj = px[1];
check(proj.rows[3].length === 12 && proj.freezeRow === 4 && proj.autoFilter === 'A4:L8', 'projects sheet header, freeze, filter');
check(proj.rows.at(-1)[2].f === 'SUBTOTAL(103,B5:B8)', 'projects totals follow the filter');
const lateCell = proj.rows[5][9];
check(lateCell.v === -65 && /tdBad$/.test(lateCell.s), 'overdue days in red');
const pbytes = XL.buildWorkbook(px, { title: 'Projects' });
check(unzipNames(pbytes).filter(n => n.startsWith('xl/worksheets/')).length === 3, 'three sheets in the file');
check(XL.excelDate('2026-11-05') === 46331, 'excel date serial');

check(filterSentence('en', { status: 'won', due: 'overdue' }) === 'Status: Accepted · Deadline: overdue', `filter sentence: ${filterSentence('en', { status: 'won', due: 'overdue' })}`);

if (failed) { console.log(`factory: ${failed} failed`); process.exit(1); }
console.log('factory: ok');
