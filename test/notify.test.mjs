/* Assignment pop-ups: the words on each card, in both languages. */
import { notifText } from '../web/notify.js';

let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log('  - ' + msg); } };

let x = notifText({ kind: 'task', data: { task: 'Call supplier', project: 'Expo', due: '2026-11-20', by: 'Walid' } }, 'en');
check(x.heading === 'New task for you' && x.what === 'Call supplier', `task heading / name: ${JSON.stringify(x)}`);
check(x.ctx === 'Expo · due 20 Nov 2026 · from Walid', `task context: ${x.ctx}`);

x = notifText({ kind: 'lead_task', data: { task: 'Follow up', lead: 'Turki · Al Rubaie', project: 'ignored', by: 'Sara' } }, 'en');
check(x.ctx === 'Turki · Al Rubaie · from Sara', `a lead action names the lead, not a project: ${x.ctx}`);

x = notifText({ kind: 'stage', data: { dept: 'nonexistent-team', project: 'Expo' } }, 'en');
check(x.heading === 'You were added to a project team' && x.what.includes('team') && x.ctx === 'Expo', `stage: ${JSON.stringify(x)}`);

x = notifText({ kind: 'pricing', data: { item: 'Booth', project: 'Expo', by: 'Walid' } }, 'ar');
check(x.heading === 'بند تسعير مطلوب منك' && x.what === 'Booth' && x.ctx === 'Expo · من Walid', `Arabic pricing: ${JSON.stringify(x)}`);

x = notifText({ kind: 'task', data: { task: 'X' } }, 'ar');
check(x.heading === 'مهمة جديدة لك' && x.ctx === '', 'no project, date or sender → no empty separators');

x = notifText({ kind: 'mystery', data: {} }, 'en');
check(x.heading === 'New task for you', 'an unknown kind still reads as a task');

if (failed) { console.log(`notify: ${failed} failed`); process.exit(1); }
console.log('notify: ok');
