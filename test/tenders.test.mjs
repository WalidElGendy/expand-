import assert from 'node:assert/strict';
import * as L from '../web/tenderlogic.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.error('FAIL', name); throw e; } };

t('normClient', () => {
  assert.equal(L.normClient('  Ministry of  Culture. '), 'ministry of culture');
  assert.equal(L.normClient('وزارة الثقافة'), L.normClient('وزاره الثقافه'));
  assert.equal(L.normClient('هيئة الأفلام'), L.normClient('هيئة الافلام'));
  assert.ok(L.sameClient('NEOM', 'neom'));
  assert.ok(!L.sameClient('', ''));
});
t('sar', () => {
  assert.equal(L.sar(1234567), 'SAR 1,234,567');
  assert.equal(L.sar(1234567, { compact: true }), 'SAR 1.2M');
  assert.equal(L.sar(25_000_000, { compact: true }), 'SAR 25M');
  assert.equal(L.sar(950, { compact: true }), 'SAR 950');
  assert.equal(L.sar(null), 'SAR 0');
});
t('daysLeft', () => {
  assert.equal(L.daysLeft('2026-10-20', '2026-10-18'), 2);
  assert.equal(L.daysLeft('2026-10-17', '2026-10-18'), -1);
  assert.equal(L.daysLeft(null, '2026-10-18'), null);
});
t('reqStats', () => {
  const r = L.reqStats([{ text: 'ISO', status: 'met' }, { text: 'Exp', status: 'partial' }, { text: 'Bond', status: 'gap' }, { text: ' ' }, { text: 'X', status: 'weird' }]);
  assert.deepEqual([r.total, r.met, r.partial, r.gap, r.score], [4, 1, 1, 2, 38]);
  assert.equal(L.reqStats([]).score, null);
});
const tenders = [
  { id: 'a', client: 'Ministry of Culture', title: 'Booth', status: 'approved', value_sar: 1000000, pm_id: 'p1', created_at: '2026-01-05T08:00:00Z', sent_at: '2026-01-06T08:00:00Z', decided_at: '2026-01-10T08:00:00Z',
    competitors: [{ name: 'Rival Co', year: 2025, price_sar: 900000, won: true, project: 'Booth 2025' }, { name: 'Other', year: 2025, price_sar: 1100000 }] },
  { id: 'b', client: 'ministry of culture ', title: 'Pavilion', status: 'rejected', reject_reason: 'price', value_sar: 400000, created_at: '2026-02-01T08:00:00Z', decided_at: '2026-02-03T08:00:00Z',
    competitors: [{ name: 'rival co.', year: 2026, price_sar: 950000, won: true }] },
  { id: 'c', client: 'NEOM', title: 'Expo', status: 'approved', value_sar: 2500000, pm_id: 'p1', created_at: '2025-11-01T08:00:00Z', decided_at: '2025-11-20T08:00:00Z' },
  { id: 'd', client: 'NEOM', title: 'Stand', status: 'approved', value_sar: 500000, pm_id: 'p2', created_at: '2026-03-01T08:00:00Z', decided_at: '2026-03-02T08:00:00Z' },
  { id: 'e', client: 'NEOM', title: 'Kiosk', status: 'rejected', reject_reason: 'timeline', value_sar: 100000, created_at: '2026-03-03T08:00:00Z', decided_at: '2026-03-04T08:00:00Z' },
  { id: 'f', client: 'Red Sea', title: 'Gala', status: 'review', value_sar: 300000, submission_due: '2026-10-25', created_at: '2026-10-01T08:00:00Z' },
  { id: 'g', client: 'Red Sea', title: 'Draft', status: 'draft', value_sar: null, submission_due: '2026-10-19', created_at: '2026-10-10T08:00:00Z' },
  { id: 'h', client: 'NEOM', title: 'Old', status: 'rejected', reject_reason: 'price', value_sar: 50, created_at: '2026-04-01T08:00:00Z', decided_at: '2026-04-02T08:00:00Z' },
];
t('stats all', () => {
  const s = L.tenderStats(tenders, { today: '2026-10-18' });
  assert.equal(s.total, 8); assert.equal(s.approved, 3); assert.equal(s.rejected, 3); assert.equal(s.review, 1); assert.equal(s.draft, 1);
  assert.equal(s.decided, 6); assert.equal(s.conversion, 50);
  assert.equal(s.approvedValue, 4000000); assert.equal(s.rejectedValue, 500050); assert.equal(s.pendingValue, 300000);
  assert.deepEqual(s.reasons.map(r => [r.key, r.n]), [['price', 2], ['timeline', 1]]);
  assert.deepEqual(s.pms.map(p => [p.id, p.n]), [['p1', 2], ['p2', 1]]);
  assert.deepEqual(s.clients.map(c => [c.name, c.n]), [['NEOM', 2], ['Ministry of Culture', 1]]);
  assert.equal(s.monthly.length, 12); assert.equal(s.monthly.at(-1).month, '2026-10');
  assert.deepEqual(s.monthly.find(m => m.month === '2026-03'), { month: '2026-03', approved: 1, rejected: 1 });
  assert.equal(s.monthly.find(m => m.month === '2025-11').approved, 1);
  assert.deepEqual(s.dueSoon.map(x => x.t.id), ['g', 'f']);
  assert.ok(s.avgDecisionDays > 0);
});
t('stats year', () => {
  const s = L.tenderStats(tenders, { year: 2025, today: '2026-10-18' });
  assert.equal(s.total, 1); assert.equal(s.approved, 1); assert.equal(s.conversion, 100);
  assert.deepEqual(L.yearsOf(tenders), [2026, 2025]);
  assert.equal(L.tenderStats([], {}).conversion, null);
});
t('clientBackground', () => {
  const projects = [{ id: 'p', client: 'Ministry  of Culture', status: 'delivered', created_at: '2025-01-01' },
    { id: 'q', client: 'MINISTRY OF CULTURE', status: 'lost', created_at: '2025-06-01' },
    { id: 'r', client: 'Ministry of Culture', status: 'in_design', created_at: '2026-06-01' },
    { id: 's', client: 'NEOM', status: 'won' }];
  const leads = [{ id: 'l', company: 'ministry of culture' }];
  const bg = L.clientBackground({ id: 'new', client: 'Ministry of Culture', competitors: [{ name: 'Rival Co', year: 2024, price_sar: 800000 }] }, { tenders, projects, leads });
  assert.equal(bg.tStats.total, 2); assert.equal(bg.tStats.approved, 1); assert.equal(bg.tStats.rejected, 1); assert.equal(bg.tStats.approvedValue, 1000000);
  assert.deepEqual([bg.pStats.total, bg.pStats.won, bg.pStats.lost, bg.pStats.active, bg.pStats.winRate], [3, 1, 1, 1, 50]);
  assert.equal(bg.leads.length, 1); assert.ok(bg.hasBusiness); assert.ok(!bg.isNew);
  const rival = bg.competitors.find(c => c.name === 'Rival Co');
  assert.deepEqual([rival.times, rival.wins, rival.lastYear, rival.lastPrice, rival.avgPrice], [3, 2, 2026, 950000, 883333]);
  assert.deepEqual(bg.winningPrices.map(w => w.year), [2026, 2025]);
  assert.equal(bg.tenders[0].id, 'b');   // newest first
  const none = L.clientBackground({ id: 'x', client: 'Brand New Co' }, { tenders, projects, leads });
  assert.ok(none.isNew); assert.equal(L.clientBackground({ client: '' }), null);
});
t('filter & clean', () => {
  assert.deepEqual(L.filterTenders(tenders, { q: 'neom' }).map(x => x.id), ['c', 'd', 'e', 'h']);
  assert.deepEqual(L.filterTenders(tenders, { status: 'review' }).map(x => x.id), ['f']);
  assert.deepEqual(L.filterTenders(tenders, { client: 'MINISTRY OF CULTURE' }).map(x => x.id), ['a', 'b']);
  assert.deepEqual(L.cleanRequirements([{ text: ' a ', status: 'met' }, { text: '' }, { text: 'b', status: 'zzz' }]), [{ text: 'a', status: 'met' }, { text: 'b', status: 'gap' }]);
  assert.deepEqual(L.cleanCompetitors([{ name: 'X', year: '2025', price_sar: '1000', won: true }, { name: ' ' }, { name: 'Y', price_sar: 'abc' }]),
    [{ name: 'X', year: 2025, project: null, price_sar: 1000, won: true }, { name: 'Y', year: null, project: null, price_sar: null, won: false }]);
  assert.ok(L.toCSV([['a,b', 'c"d']]).includes('"a,b","c""d"'));
});
console.log(`PASS — tenders: ${n} groups`);
