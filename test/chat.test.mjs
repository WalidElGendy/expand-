/* Quick chat: titles, message text, the order of people. */
import { titleOf, msgHtml, sortPeople, CSTR } from '../web/chat.js';

let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log('  - ' + msg); } };

check(titleOf({ job_title: 'Project manager', department_id: 'nonexistent', role: 'lead' }, 'en').startsWith('Project manager · ') &&
  titleOf({ job_title: 'Project manager', department_id: 'nonexistent', role: 'lead' }, 'en').endsWith(' · Lead'), 'title: job title, team, role');
check(titleOf({ role: 'member' }, 'en') === '' && titleOf({ role: 'manager' }, 'ar') === 'مدير', 'a plain member shows no role; Arabic roles');
check(titleOf({ title: 'مدير إدارة مشاريع', dept: null, role: 'member' }) === 'مدير إدارة مشاريع', 'the title carried in a message payload');

check(msgHtml('<b>hi</b>\nthere') === '&lt;b&gt;hi&lt;/b&gt;<br>there', 'message text is escaped, line breaks kept');
check(msgHtml('see https://shop.unitree.com/x.') === 'see <a href="https://shop.unitree.com/x" target="_blank" rel="noopener noreferrer">https://shop.unitree.com/x</a>.', 'web addresses become links, trailing dot left out');
check(!msgHtml('javascript:alert(1)').includes('<a') && !msgHtml('"><img src=x onerror=alert(1)>').includes('<img'), 'no script links, no injected tags');

const people = [{ id: 'me', full_name: 'Me' }, { id: 'a', full_name: 'Zaid' }, { id: 'b', full_name: 'Amal' }, { id: 'c', full_name: 'Badr', job_title: 'Designer' }, { id: 'd', full_name: 'Dana' }];
const convs = new Map([['d', { msgs: [{}], unread: 2 }], ['b', { msgs: [{}], unread: 0 }]]);
const order = sortPeople(people, { online: new Set(['a', 'c']), convs, meId: 'me' }).map(x => x.p.id);
check(order.join() === 'd,b,c,a', `unread first, then open chats, then online, then by name: ${order}`);
check(sortPeople(people, { meId: 'me', q: 'design' }).map(x => x.p.id).join() === 'c', 'search by title');
check(!sortPeople(people, { meId: 'me' }).some(x => x.p.id === 'me'), 'you are not in your own list');
check(CSTR.en.quick.length === CSTR.ar.quick.length && CSTR.ar.ephemeral.includes('لا يُحفظ'), 'both languages');

if (failed) { console.log(`chat: ${failed} failed`); process.exit(1); }
console.log('chat: ok');
