/* Leads: the search box on the Leads list. */
import { filterLeads, foldSearch } from '../web/dash.js';

let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log('  - ' + msg); } };

const L = [
  { id: 1, name: 'Ghada Alrashdan', title: 'Director of Public Relations', company: 'PNU', email: 'ghada@pnu.edu.sa', phone: '+966 50 123 4567', owner: { full_name: 'Abdulrahman Bakhiet' } },
  { id: 2, name: 'بدر الغامدي', company: 'مستشفى التخصصي', phone: '0551234567' },
  { id: 3, name: 'عبدالله السعدون', company: 'دلة هلث', notes: 'Met at the Global Health exhibition' },
  { id: 4, name: 'May Alaskar', title: 'Director of Marketing and Partnerships', company: 'IMAMU', email: 'malaskar@sm.imamu.edu.sa' },
];
const ids = (q) => filterLeads(L, { q }).map(l => l.id).sort();

check(JSON.stringify(ids('')) === '[1,2,3,4]', 'empty search keeps everything');
check(JSON.stringify(ids('ghada')) === '[1]', 'name, any case');
check(JSON.stringify(ids('director')) === '[1,4]', 'title');
check(JSON.stringify(ids('imamu')) === '[4]', 'company and email');
check(JSON.stringify(ids('director marketing')) === '[4]', 'every word must match');
check(JSON.stringify(ids('bakhiet')) === '[1]', 'owner name');
check(JSON.stringify(ids('global health')) === '[3]', 'notes');
check(JSON.stringify(ids('الغامدى')) === '[2]', 'Arabic: alef maqsura matches ya');
check(JSON.stringify(ids('دله')) === '[3]', 'Arabic: ta marbuta matches ha');
check(JSON.stringify(ids('مستشفي التخصصى')) === '[2]', 'Arabic multi-word');
check(JSON.stringify(ids('1234567')) === '[1,2]', 'phone digits ignore spaces and +');
check(JSON.stringify(ids('٠٥٥١٢٣٤٥٦٧')) === '[2]', 'Arabic-Indic digits');
check(JSON.stringify(ids('nobody')) === '[]', 'no match');
check(foldSearch('  أحمدُ  ') === 'احمد', 'fold: hamza forms, diacritics, spaces');

if (failed) { console.log(`leads: ${failed} failed`); process.exit(1); }
console.log('leads: ok');
