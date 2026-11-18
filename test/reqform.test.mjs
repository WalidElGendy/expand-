/* The request form on paper: what it prints, in both languages, and that
   nothing typed into a request can break out of the page. */
import { requestFormHtml, requestRef } from '../web/hr.js';

let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log('  - ' + msg); } };

const r = { id: '9f3a2c41-1111-4111-8111-111111111111', type: 'annual_leave', status: 'approved', start_date: '2026-12-06', end_date: '2026-12-17', days: 10,
  details: '<img src=x onerror=alert(1)> trip', created_at: '2026-11-18T08:00:00Z', manager_id: 'm', manager_decided_at: '2026-11-18T10:00:00Z',
  hr_decided_by: 'h', hr_decided_at: '2026-11-18T12:00:00Z', employee_id: 'e' };
const c = { person: { full_name: 'Mohammed Bin Shahbal' }, emp: { position: 'Tenders specialist', joining_date: '2025-08-26' },
  managerName: 'Walid ElGendy', hrName: 'Sara', deptLabel: 'Tenders', balance: 18.5, back: '2026-12-20', s: { company_en: 'Expand Expo' } };

const en = requestFormHtml('en', r, c);
check(requestRef(r) === 'REQ-9F3A2C41' && en.includes('REQ-9F3A2C41'), 'a short reference number on the form');
check(en.includes('Leave request form') && en.includes('نموذج طلب إجازة'), 'title in both languages');
check(en.includes('☒ Annual leave') && en.includes('☐ Sick leave'), 'the leave type ticked among the others');
check(en.includes('18.5') && en.includes('8.5'), 'annual balance before and after');
check(en.includes('20 Dec 2026'), 'back-to-work date');
check(!en.includes('<img src=x') && en.includes('&lt;img'), 'details are escaped');
check((en.match(/class="sig"/g) || []).length === 4, 'four signature boxes: employee, manager, HR, general manager');
check(en.includes('Approved') && en.includes('موافق'), 'decisions already taken are printed');
check(en.includes('<title>REQ-9F3A2C41 — Mohammed Bin Shahbal</title>'), 'the saved PDF is named after the reference and the person');
check(en.includes('window.print()'), 'opens the print dialog (print or save as PDF)');
const ar = requestFormHtml('ar', r, c);
check(ar.includes('dir="rtl"') && ar.includes('lang="ar"'), 'Arabic page is right-to-left');
const adv = requestFormHtml('en', { ...r, type: 'advance', amount: 3000, instalments: 3, status: 'pending_manager', manager_decided_at: null, hr_decided_at: null }, c);
check(adv.includes('Salary advance request') && adv.includes('1,000.00') && !adv.includes('Back to work'), 'advance: amount and monthly deduction, no leave rows');
check(!adv.includes('Approved /'), 'nothing decided yet: no decision printed');
const early = requestFormHtml('en', { ...r, type: 'early_leave', leave_time: '14:30:00' }, c);
check(early.includes('Early leave permission') && early.includes('14:30'), 'early leave: date and time');

if (failed) { console.log(`reqform: ${failed} failed`); process.exit(1); }
console.log('reqform: ok');
