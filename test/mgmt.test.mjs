import assert from 'node:assert/strict';
import * as M from '../web/mgmtlogic.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.error('FAIL', name); throw e; } };
const today = '2026-10-18';
const st = (dept, assignee, status = 'pending') => ({ department_id: dept, assignee_id: assignee, status });
const projects = [
  { id: 1, status: 'in_design', due_on: '2026-10-10', owner_id: 'a', owner: { full_name: 'A' }, client: 'NEOM', project_stages: [st('3d', 'x'), st('3d', null), st('2d', 'y', 'done')] },
  { id: 2, status: 'submitted', due_on: '2026-11-01', owner_id: 'a', owner: { full_name: 'A' }, client: 'neom', contract_value_sar: 500000, project_stages: [st('pm', null)] },
  { id: 3, status: 'delivered', due_on: '2026-09-01', delivered_on: '2026-08-20', owner_id: 'b', owner: { full_name: 'B' }, client: 'NEOM', contract_value_sar: 1000000, project_stages: [st('3d', 'x')] },
  { id: 4, status: 'delivered', due_on: '2026-07-01', delivered_on: '2026-07-15', owner_id: 'b', owner: { full_name: 'B' }, client: 'Red Sea' },
  { id: 5, status: 'delivered', delivered_on: '2026-07-20', owner_id: null, client: 'Red Sea' },
  { id: 6, status: 'lost', owner_id: 'a', owner: { full_name: 'A' }, client: 'GEA' },
  { id: 7, status: 'won', owner_id: 'b', owner: { full_name: 'B' }, client: 'GEA', contract_value_sar: 250000, due_on: '2026-10-25', project_stages: [] },
  { id: 8, status: 'archived', client: 'X' },
  { id: 9, status: 'intake', is_crm_list: true },
  { id: 10, status: 'pricing', owner_id: null, due_on: '2026-12-31', contract_value_sar: 0 },
  { id: 11, status: 'delivered', delivered_on: '2025-01-05', due_on: '2025-01-01', client: 'old' },
];
t('monthKeys', () => {
  assert.deepEqual(M.monthKeys('2026-02-10', 3), ['2025-12', '2026-01', '2026-02']);
  assert.equal(M.monthKeys(today).length, 12);
});
t('projectStats', () => {
  const s = M.projectStats(projects, today);
  assert.equal(s.total, 10);
  assert.equal(s.live, 4);              // in design, submitted, won, pricing
  assert.equal(s.byStatus.delivered, 4);
  assert.equal(s.overdue, 1);
  assert.equal(s.due30, 2);             // 2 (Nov 1), 7 (Oct 25)
  assert.deepEqual([s.onTime, s.late, s.noDue, s.delivered12], [1, 1, 1, 3]);
  assert.equal(s.onTimeRate, 50);
  assert.deepEqual(s.byDept.map(d => [d.dept, d.n, d.unassigned]), [['3d', 2, 1], ['pm', 1, 1]]);
  assert.equal(s.unassignedStages, 2); assert.equal(s.openStages, 3);
  assert.equal(s.noOwner, 1);
  assert.equal(s.weeks.reduce((a, w) => a + w.n, 0), 2);
  assert.equal(s.monthly.find(m => m.month === '2026-07').late, 1);
});
t('salesStats', () => {
  const s = M.salesStats(projects, today);
  assert.deepEqual([s.submitted, s.accepted, s.lost, s.winRate], [1, 5, 1, 83]);
  assert.equal(s.valueWon, 1250000); assert.equal(s.valuedCount, 2); assert.equal(s.avgValue, 625000);
  assert.equal(s.pipeline, 3); assert.equal(s.pipelineValue, 500000); assert.equal(s.pipelineValued, 1);
  assert.deepEqual(s.byClient.slice(0, 2).map(c => [c.name, c.n]), [['Red Sea', 2], ['NEOM', 1]]);
  assert.deepEqual(s.byClientValue.map(c => c.name), ['NEOM', 'GEA']);
  const a = s.byOwner.find(o => o.id === 'a'); assert.deepEqual([a.accepted, a.lost, a.submitted, a.winRate], [0, 1, 1, 0]);
  const b = s.byOwner.find(o => o.id === 'b'); assert.deepEqual([b.accepted, b.value, b.winRate], [3, 1250000, 100]);
  assert.equal(s.deliveredValue.find(m => m.month === '2026-08').value, 1000000);
});
t('leadStats', () => {
  const leads = [
    { status: 'new', source: 'LinkedIn', owner_id: null, next_follow_up_on: '2026-10-01' },
    { status: 'not_contacted', source: 'linkedin' },
    { status: 'contacted', source: 'Expo', owner_id: 'o', owner: { full_name: 'O' }, next_follow_up_on: '2026-10-30', value_sar: 100 },
    { status: 'proposal', source: 'Expo', owner_id: 'o', owner: { full_name: 'O' }, next_follow_up_on: '2026-10-17' },
    { status: 'won', source: 'Expo' }, { status: 'lost' }, { status: 'not_interested' }, { status: 'wrong_number' },
  ];
  const s = M.leadStats(leads, today);
  assert.deepEqual(s.stages, { new: 2, contacted: 1, interested: 0, proposal: 1, won: 1, dead: 3 });
  assert.deepEqual([s.open, s.overdue, s.noOwner, s.conversion, s.value, s.valued], [4, 2, 2, 33, 100, 1]);
  assert.deepEqual(s.bySource.map(x => [x.label, x.n, x.won]), [['Expo', 3, 1], ['—', 3, 0], ['LinkedIn', 2, 0]]);
  assert.deepEqual(s.byOwner.map(o => [o.id, o.n, o.overdue]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))), [[null, 2, 1], ['o', 2, 1]]);
});
t('attention', () => {
  const ps = M.projectStats(projects, today), ss = M.salesStats(projects, today);
  const a = M.attention({ ps, ss, ls: { overdue: 3, noOwner: 0 }, ts: { review: 2, dueSoon: [{ t: { status: 'review' }, left: 3 }] },
    hr: { contracts_expired: 1, contracts_ending: 0, pending_requests: 4, probation_ending: 0, no_file: 0 },
    risks: [{ risk: true, dept: '3d', top: { name: 'X', n: 5 }, share: 0.8 }] });
  assert.equal(a[0].level, 'critical');
  assert.ok(a.findIndex(x => x.level === 'warn') > a.findIndex(x => x.key === 'followOverdue'));
  assert.ok(a.some(x => x.key === 'keyPerson' && x.share === 80 && x.who === 'X'));
  assert.ok(!a.some(x => x.key === 'contractsEnding'));   // zero counts are dropped
  assert.equal(a.at(-1).level, 'info');
});
console.log(`PASS — mgmt: ${n} groups`);
