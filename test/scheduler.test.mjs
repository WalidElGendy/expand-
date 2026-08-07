/* Engine tests. Run: node test/scheduler.test.mjs
   The first two cases are the argument for the whole approach. */

import assert from 'node:assert/strict';
import { WorkCalendar, iso } from '../engine/calendar.js';
import { Scheduler, calibrate, backtest } from '../engine/scheduler.js';

let passed = 0, failed = 0;
const test = (name, fn) => {
  try { fn(); console.log(`  ok   ${name}`); passed++; }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); failed++; }
};
const section = (s) => console.log(`\n${s}`);

const cal = new WorkCalendar({ holidays: [] });   // holidays off for clarity
const team = (prefix, n, t) =>
  Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i + 1}`, name: `${t} ${i + 1}`, team: t }));

const staff = () => [...team('a', 2, '3d'), ...team('b', 2, '2d'), ...team('c', 1, 'content')];
const mk = (members = staff()) => new Scheduler({ members, calendar: cal });

/* ------------------------------------------------------------------ */
section('Working calendar (KSA: Sun–Thu)');

test('Friday and Saturday are not working days', () => {
  assert.equal(cal.isWorking('2026-08-07'), false); // Friday
  assert.equal(cal.isWorking('2026-08-08'), false); // Saturday
  assert.equal(cal.isWorking('2026-08-09'), true);  // Sunday
});

test('5 working days from Wednesday lands the following Wednesday, not Monday', () => {
  // Wed 5 Aug + 5 working days: Thu 6, Sun 9, Mon 10, Tue 11, Wed 12
  assert.equal(iso(cal.addWorkingDays('2026-08-05', 5)), '2026-08-12');
});

/* ------------------------------------------------------------------ */
section('Why addition is the wrong model');

test('idle team: delivery is the LONGEST stage, not the sum', () => {
  const s = mk();
  const r = s.scheduleProject({ id: 'p1', name: 'Booth', size: 'M', earliestStart: '2026-08-09' });
  // Stages run in parallel: 3D=5d, 2D=2d, content=3d -> 5 working days, not 10.
  assert.equal(r.leadWorkingDays, 5);
  assert.equal(r.bottleneck.team, '3d');
  assert.equal(r.queueDays, 0);
  assert.equal(r.confidence.level, 'high');
});

test('busy team: the same project takes far longer, and addition never sees it', () => {
  const s = mk();
  // Four proposals already in the system.
  for (let i = 1; i <= 4; i++) {
    s.scheduleProject({ id: `q${i}`, name: `Queued ${i}`, size: 'M', earliestStart: '2026-08-09' });
  }
  const r = s.scheduleProject({ id: 'p2', name: 'Fifth', size: 'M', earliestStart: '2026-08-09' });

  assert.ok(r.leadWorkingDays > 5,
    `expected the fifth project to wait; got ${r.leadWorkingDays} working days`);
  assert.ok(r.queueDays > 0, 'expected queue time');
  assert.ok(r.confidence.level !== 'high', 'a mostly-queue date should not claim high confidence');
  console.log(`       naive answer: 5 days · engine: ${r.leadWorkingDays} working days ` +
              `(${r.queueDays} of it queue, driver = ${r.bottleneck.team})`);
});

test('the bottleneck is the busiest team, not the longest task', () => {
  // One content person, two 3D people. Content is 3 days of work vs 3D's 5,
  // but with a single body it saturates first.
  const s = mk();
  for (let i = 1; i <= 3; i++) {
    s.scheduleProject({ id: `w${i}`, name: `W${i}`, size: 'M', earliestStart: '2026-08-09' });
  }
  const r = s.scheduleProject({ id: 'p3', name: 'Next', size: 'M', earliestStart: '2026-08-09' });
  assert.equal(r.bottleneck.team, 'content',
    `expected content (1 person) to drive the date, got ${r.bottleneck.team}`);
  console.log(`       3D has 2 people and 5d tasks; content has 1 person and 3d tasks — ` +
              `content sets the date.`);
});

/* ------------------------------------------------------------------ */
section('Capacity and size');

test('adding a second content person pulls the date in', () => {
  const base = mk();
  for (let i = 1; i <= 3; i++) base.scheduleProject({ id: `x${i}`, name: `X${i}`, size: 'M', earliestStart: '2026-08-09' });
  const before = base.scheduleProject({ id: 'p', name: 'P', size: 'M', earliestStart: '2026-08-09', commit: false });

  const bigger = mk([...staff(), { id: 'c2', name: 'content 2', team: 'content' }]);
  for (let i = 1; i <= 3; i++) bigger.scheduleProject({ id: `x${i}`, name: `X${i}`, size: 'M', earliestStart: '2026-08-09' });
  const after = bigger.scheduleProject({ id: 'p', name: 'P', size: 'M', earliestStart: '2026-08-09', commit: false });

  assert.ok(after.delivery <= before.delivery,
    `more capacity must not delay delivery (${before.delivery} -> ${after.delivery})`);
});

test('size bands scale effort', () => {
  const s = mk();
  const m = s.scheduleProject({ id: 'm', name: 'M', size: 'M', earliestStart: '2026-08-09', commit: false });
  const l = s.scheduleProject({ id: 'l', name: 'L', size: 'L', earliestStart: '2026-08-09', commit: false });
  assert.ok(l.totalEffortDays > m.totalEffortDays);
  assert.equal(l.totalEffortDays, 18);   // (5+2+3) * 1.8
});

test('a team with nobody in it is reported, not silently skipped', () => {
  const s = new Scheduler({ members: team('a', 1, '3d'), calendar: cal });
  const r = s.scheduleProject({ id: 'p', name: 'P', size: 'M', earliestStart: '2026-08-09' });
  assert.equal(r.failed.length, 2);
  assert.equal(r.failed[0].error, 'no_members');
});

test('leave is respected', () => {
  const s = new Scheduler({
    members: [{ id: 'a1', name: 'Solo', team: '3d', leave: ['2026-08-09', '2026-08-10', '2026-08-11'] }],
    calendar: cal,
  });
  const r = s.scheduleStage({ projectId: 'p', stageKey: '3d', size: 'S', earliestStart: '2026-08-09' });
  assert.ok(r.start > '2026-08-11', `work should start after leave, began ${r.start}`);
});

/* ------------------------------------------------------------------ */
section('Deadlines and what-if');

test('a missed deadline is flagged with the overrun', () => {
  const s = mk();
  for (let i = 1; i <= 6; i++) s.scheduleProject({ id: `z${i}`, name: `Z${i}`, size: 'L', earliestStart: '2026-08-09' });
  const r = s.scheduleProject({
    id: 'p', name: 'Urgent', size: 'L', earliestStart: '2026-08-09', deadline: '2026-08-20',
  });
  assert.equal(r.meetsDeadline, false);
  assert.ok(r.overrunWorkingDays > 0);
});

test('what-if returns options that actually move the date', () => {
  const s = mk();
  for (let i = 1; i <= 5; i++) s.scheduleProject({ id: `y${i}`, name: `Y${i}`, size: 'L', earliestStart: '2026-08-09' });
  const { base, options } = s.whatIf({ id: 'p', name: 'P', size: 'L', earliestStart: '2026-08-09' });
  assert.ok(options.length > 0, 'expected at least one lever');
  for (const o of options) {
    assert.ok(o.delivery < base.delivery, `${o.action} claimed a saving but did not deliver earlier`);
    assert.ok(o.savedWorkingDays > 0);
  }
  console.log(`       ${options.map(o => `${o.label} -> saves ${o.savedWorkingDays}d`).join(' · ')}`);
});

test('what-if never mutates the live plan', () => {
  const s = mk();
  s.scheduleProject({ id: 'a', name: 'A', size: 'M', earliestStart: '2026-08-09' });
  const before = s.assignments.length;
  s.whatIf({ id: 'p', name: 'P', size: 'L', earliestStart: '2026-08-09' });
  assert.equal(s.assignments.length, before);
});

/* ------------------------------------------------------------------ */
section('Learning from actuals');

test('calibration ignores small samples', () => {
  const { factors, detail } = calibrate([
    { team: '3d', predictedDays: 5, actualDays: 8 },
    { team: '3d', predictedDays: 5, actualDays: 7 },
  ]);
  assert.equal(factors['3d'], 1);
  assert.match(detail['3d'].note, /not enough/);
});

test('a team that always runs over gets stretched estimates', () => {
  const hist = Array.from({ length: 6 }, () => ({ team: '3d', predictedDays: 5, actualDays: 7.5 }));
  const { factors, detail } = calibrate(hist);
  assert.ok(factors['3d'] > 1.1, `expected stretch, got ${factors['3d']}`);
  assert.equal(detail['3d'].median, 1.5);

  const s = new Scheduler({ members: staff(), calendar: cal, calibration: factors });
  const r = s.scheduleProject({ id: 'p', name: 'P', size: 'M', earliestStart: '2026-08-09', commit: false });
  assert.ok(r.leadWorkingDays > 5, 'calibrated estimate should exceed the naive 5 days');
  console.log(`       6 projects at 1.5x -> factor ${detail['3d'].applied}, ` +
              `estimate moves 5 -> ${r.leadWorkingDays} working days`);
});

test('one disastrous project does not reprice the team', () => {
  const hist = [
    ...Array.from({ length: 5 }, () => ({ team: '2d', predictedDays: 2, actualDays: 2 })),
    { team: '2d', predictedDays: 2, actualDays: 20 },
  ];
  const { factors } = calibrate(hist);
  assert.ok(factors['2d'] <= 1.05, `median must absorb the outlier, got ${factors['2d']}`);
});

/* ------------------------------------------------------------------ */
section('Backtest against history');

test('backtest scores predictions and states whether to trust them', () => {
  const history = [
    { id: '1', name: 'A', size: 'M', start: '2026-08-09', actualDelivery: '2026-08-13' },
    { id: '2', name: 'B', size: 'L', start: '2026-08-09', actualDelivery: '2026-08-19' },
    { id: '3', name: 'C', size: 'S', start: '2026-08-09', actualDelivery: '2026-08-12' },
  ];
  const r = backtest(history, () => mk());
  assert.equal(r.summary.n, 3);
  assert.ok(typeof r.summary.meanAbsErrorDays === 'number');
  assert.ok(typeof r.summary.verdict === 'string');
  console.log(`       MAE ${r.summary.meanAbsErrorDays}d · bias ${r.summary.biasDays}d · ${r.summary.verdict}`);
});

/* ------------------------------------------------------------------ */
section('Utilisation');

test('utilisation reports per team and per person', () => {
  const s = mk();
  for (let i = 1; i <= 4; i++) s.scheduleProject({ id: `u${i}`, name: `U${i}`, size: 'M', earliestStart: '2026-08-09' });
  const u = s.utilisation('2026-08-09', '2026-08-20');
  assert.ok(u['3d'].utilisation > 0);
  assert.equal(u['content'].headcount, 1);
  assert.ok(u['content'].utilisation >= u['3d'].utilisation,
    'the single-person team should be the most loaded');
  console.log(`       3d ${Math.round(u['3d'].utilisation * 100)}% · ` +
              `2d ${Math.round(u['2d'].utilisation * 100)}% · ` +
              `content ${Math.round(u['content'].utilisation * 100)}%`);
});

console.log(`\n${failed ? 'FAILED' : 'PASS'} — ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
