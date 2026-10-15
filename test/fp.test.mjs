import assert from 'node:assert/strict';
import { spanMin, localToISO, recordToRow, mergeRow, matchEmployees, syncRange, tzOffsetMin } from '../supabase/functions/hr-attendance-sync/map.js';

let n = 0; const t = (name, fn) => { fn(); n++; };

t('spanMin', () => {
  assert.equal(spanMin('06:47:00'), 407);
  assert.equal(spanMin('1.02:00:00'), 1560);
  assert.equal(spanMin('00:15:00'), 15);
  assert.equal(spanMin('00:00:59'), 0);
  assert.equal(spanMin('-00:05:00'), 0);
  assert.equal(spanMin(null), 0);
  assert.equal(spanMin('garbage'), 0);
  assert.equal(spanMin('08:00'), 480);
});
t('tz', () => {
  assert.equal(tzOffsetMin('Asia/Riyadh', new Date('2026-10-15T12:00:00Z')), 180);
  assert.equal(localToISO('2026-10-15T08:22:00'), '2026-10-15T05:22:00.000Z');
  assert.equal(localToISO('2026-10-15T08:22:00Z'), '2026-10-15T08:22:00.000Z');
  assert.equal(localToISO('2026-10-15T08:22:00+03:00'), '2026-10-15T05:22:00.000Z');
  assert.equal(localToISO(null), null);
});
const rec = { id: 'x', employeeNumber: '10293', date: '2026-10-15T00:00:00', firstCheckIn: '2026-10-15T08:22:00', lastCheckOut: '2026-10-15T15:09:00',
  totalDuration: '06:47:00', totalRequiredDuration: '08:00:00', lateDuration: '00:15:00', earlyCheckOutDuration: '00:53:00',
  isOvertime: false, overtimeDuration: '01:12:00', isRemoteWork: false, status: { english: 'Present', arabic: 'حاضر' },
  location: { nameEn: 'Head Quarter' }, shiftInfo: { nameEn: 'Morning Shift' } };
t('recordToRow', () => {
  const r = recordToRow(rec, 'p1');
  assert.equal(r.day, '2026-10-15');
  assert.equal(r.clock_in, '2026-10-15T05:22:00.000Z');
  assert.equal(r.clock_out, '2026-10-15T12:09:00.000Z');
  assert.equal(r.late_minutes, 15); assert.equal(r.early_minutes, 53);
  assert.equal(r.source, 'fingerprint'); assert.equal(r.ext.worked_min, 407); assert.equal(r.ext.overtime_min, 0);
  assert.equal(recordToRow({ ...rec, firstCheckIn: null, lastCheckOut: null }, 'p1'), null);
  const single = recordToRow({ ...rec, lastCheckOut: rec.firstCheckIn }, 'p1');
  assert.equal(single.clock_out, null); assert.equal(single.early_minutes, 0);
  const outOnly = recordToRow({ ...rec, firstCheckIn: null }, 'p1');
  assert.equal(outOnly.clock_in, '2026-10-15T12:09:00.000Z'); assert.equal(outOnly.clock_out, null);
});
t('mergeRow', () => {
  const r = recordToRow(rec, 'p1');
  assert.equal(mergeRow({ source: 'manual' }, r), null);
  assert.deepEqual(mergeRow(null, r), r);
  assert.deepEqual(mergeRow({ source: 'fingerprint', clock_in: 'x' }, r), r);
  const m = mergeRow({ source: 'app', clock_in: '2026-10-15T05:00:00Z', clock_out: null, in_remote: true }, r);
  assert.equal(m.clock_in, '2026-10-15T05:00:00.000Z'); assert.equal(m.clock_out, '2026-10-15T12:09:00.000Z'); assert.equal(m.in_remote, true);
});
t('matchEmployees', () => {
  const remote = [
    { employeeNumber: '1', name: { english: 'Ali Hassan' }, contact: { email: 'ALI@x.com' } },
    { employeeNumber: '2', name: { english: 'Sara  Omar', arabic: 'سارة عمر' }, contact: { email: 'other@y.com' } },
    { employeeNumber: '3', name: { english: 'Mona' }, contact: {} },
    { employeeNumber: '4', name: { english: 'Dup Name' } },
    { employeeNumber: '5', name: { english: 'Nobody' } },
  ];
  const local = [
    { id: 'a', email: 'ali@x.com', full_name: 'Ali H' },
    { id: 'b', email: 'sara@x.com', full_name: 'sara omar' },
    { id: 'c', email: 'm@x.com', full_name: 'Someone', device_no: '3' },
    { id: 'd1', email: 'd1@x.com', full_name: 'Dup Name' },
    { id: 'd2', email: 'd2@x.com', full_name: 'Dup Name' },
  ];
  const m = matchEmployees(remote, local);
  assert.equal(m.byNo.get('1'), 'a'); assert.equal(m.byNo.get('2'), 'b'); assert.equal(m.byNo.get('3'), 'c');
  assert.equal(m.byNo.has('4'), false); assert.equal(m.byNo.has('5'), false);
  assert.deepEqual(m.links.map(l => l.how), ['email', 'name']);
  assert.deepEqual(m.unmatchedRemote.map(u => u.no), ['4', '5']);
  assert.deepEqual(m.unmatchedLocal.map(u => u.id), ['d1', 'd2']);
});
t('syncRange', () => {
  assert.deepEqual(syncRange({ today: '2026-10-20' }), { from: '2026-10-18', to: '2026-10-20' });
  assert.deepEqual(syncRange({ today: '2026-10-20', attendanceStart: '2026-10-19' }), { from: '2026-10-19', to: '2026-10-20' });
  assert.deepEqual(syncRange({ today: '2026-10-15', attendanceStart: '2026-10-18' }), { from: '2026-10-15', to: '2026-10-15' });
  assert.deepEqual(syncRange({ today: '2026-10-20', from: '2026-10-01', to: '2026-10-31' }), { from: '2026-10-01', to: '2026-10-20' });
  assert.deepEqual(syncRange({ today: '2026-12-31', from: '2026-01-01' }), { from: '2026-10-31', to: '2026-12-31' });
});
console.log(`fp: ${n} groups passed`);
