import assert from 'node:assert/strict';
import { fromAsana, teamFor, sizeFor, resolvePeople } from '../engine/asana-import.js';

let p = 0, f = 0;
const t = (n, fn) => { try { fn(); console.log('  ok   ' + n); p++; }
                       catch (e) { console.log('  FAIL ' + n + '\n       ' + e.message); f++; } };

const sample = [
  { gid: '1', name: 'Riyadh Expo pavilion', created_at: '2026-01-05T09:00:00Z',
    completed: true, completed_at: '2026-02-02T09:00:00Z', tasks: [
      { name: '3D renders hero view', assignee: { gid: 'u1', name: 'Sara' } },
      { name: '3D modelling', assignee: { gid: 'u1', name: 'Sara' } },
      { name: 'Shop drawing set', assignee: { gid: 'u2', name: 'Omar' } },
      { name: 'Content narrative', assignee: { gid: 'u3', name: 'Lina' } },
      { name: 'Client call', assignee: { gid: 'u4', name: 'Nada' } },
    ]},
  { gid: '2', name: 'Retail activation', created_at: '2026-01-12T09:00:00Z',
    completed: false, tasks: [
      { name: '2D technical package', assignee: { gid: 'u2', name: 'Omar' } },
    ]},
  { gid: '3', name: 'Untitled work', tasks: [] },
];

console.log('\nAsana import');
t('routes tasks to teams by keyword', () => {
  assert.equal(teamFor('3D renders hero view'), '3d');
  assert.equal(teamFor('Shop drawing set'), '2d');
  assert.equal(teamFor('Content narrative'), 'content');
  assert.equal(teamFor('Client call'), null);
});

t('infers size from the project name and says it guessed', () => {
  assert.deepEqual(sizeFor({ name: 'Riyadh Expo pavilion' }), { size: 'XL', inferred: true });
  assert.deepEqual(sizeFor({ name: 'X', custom_fields: [{ name: 'Size', enum_value: { name: 'Large' } }] }),
                   { size: 'L', inferred: false });
});

t('reports every guess instead of hiding it', () => {
  const r = fromAsana(sample);
  const kinds = r.warnings.map(w => w.kind);
  assert.ok(kinds.includes('inferred_size'), 'must warn about guessed sizes');
  assert.ok(kinds.includes('unrouted_tasks'), 'must warn about unroutable tasks');
  assert.ok(kinds.includes('no_start_date'), 'must warn about skipped projects');
  assert.ok(kinds.includes('thin_history'), 'must warn that history is too thin to backtest');
});

t('only completed projects become backtest history', () => {
  const r = fromAsana(sample);
  assert.equal(r.history.length, 1);
  assert.equal(r.history[0].actualDelivery, '2026-02-02');
});

t('ambiguous people are flagged, not guessed', () => {
  const mixed = [{ gid: 'x', name: 'P', created_at: '2026-01-01T00:00:00Z', tasks: [
    { name: '3D render', assignee: { gid: 'u9', name: 'Ali' } },
    { name: '2D drawing', assignee: { gid: 'u9', name: 'Ali' } },
  ]}];
  const { confident, ambiguous } = resolvePeople(mixed);
  assert.equal(confident.length, 0);
  assert.equal(ambiguous[0].name, 'Ali');
});

console.log(`\n${f ? 'FAILED' : 'PASS'} — ${p} passed, ${f} failed\n`);
process.exit(f ? 1 : 0);
