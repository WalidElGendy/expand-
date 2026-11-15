/* Project files: who may delete which. Mirrors can_delete_project_file(). */
import { canDeleteProjectFile as can, filterDocs, foldText, docsRows } from '../web/dash.js';

let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log('  - ' + msg); } };
const me = (o) => ({ id: 'me', is_active: true, role: 'member', department_id: null, ...o });
const f = (purpose, by = 'someone') => ({ id: 'f', purpose, uploader: { id: by } });

check(can(f('rfp', 'me'), me()), 'the uploader deletes their own file');
check(can(f('pricing'), me({ role: 'admin' })), 'admins delete anything');
check(can(f('document'), me({ department_id: 'pm' })), 'planners delete documents');
check(!can(f('document'), me({ department_id: 'pricing' })), 'the pricing team cannot delete documents');
check(can(f('pricing'), me({ department_id: 'pricing' })), 'the pricing team deletes pricing sheets');
check(!can(f('pricing'), me({ department_id: '3d' })), 'a designer cannot delete pricing sheets');
check(can(f('production'), me({ department_id: 'production' })), 'production deletes production files');
check(!can(f('reference'), me({ department_id: 'content' })), 'others cannot delete someone else\'s reference');
check(!can(f('rfp', 'me'), me({ is_active: false })), 'inactive people cannot delete');
check(!can(f('design'), me({ department_id: 'pm' })), 'designs keep their own rule');


/* Documents tab: search words, period, tab, newest first. */
{
  const now = new Date('2026-11-15T12:00:00Z');
  const docs = [
    { id: 'a', filename: 'RFP-KAFDH_Strategy_Launch_V12_Final.pdf', purpose: 'rfp', created_at: '2026-11-14T09:00:00Z', uploader: { full_name: 'Salman Bawazir' }, project: { id: 'p1', name: 'إطلاق الاستراتيجية الجديدة' } },
    { id: 'b', filename: 'نطاق العمل لتنظيم ورشة.docx', purpose: 'rfp', created_at: '2026-10-01T09:00:00Z', uploader: { full_name: 'Faisal' }, project: { id: 'p2', name: 'ورشة قيادات تطوير' } },
    { id: 'c', filename: 'Prices.xlsx', title: 'Q3 price list', purpose: 'document', created_at: '2025-12-20T09:00:00Z', uploader: { full_name: 'Noura' } },
  ];
  const ids = (o) => filterDocs(docs, { now, ...o }).map(x => x.id).join('');
  check(ids({}) === 'abc', 'no filter: everything, newest first');
  check(ids({ q: 'salman' }) === 'a', 'search by uploader, any case');
  check(ids({ q: 'اطلاق' }) === 'a', 'Arabic search ignores hamza: اطلاق finds إطلاق');
  check(ids({ q: 'kafdh final' }) === 'a', 'every word must match, in any order');
  check(ids({ q: 'kafdh noura' }) === '', 'a word that matches nothing hides the row');
  check(ids({ q: 'price list' }) === 'c', 'search reaches the title');
  check(ids({ q: 'Oct 2026' }) === 'b', 'search by date as written in English');
  check(ids({ q: '2025-12' }) === 'c', 'search by ISO date');
  check(ids({ q: 'كراسة' }) === 'ab', 'search by the kind, in Arabic');
  check(ids({ period: '7' }) === 'a', 'last 7 days');
  check(ids({ period: '90' }) === 'ab', 'last 90 days');
  check(ids({ period: 'year' }) === 'ab', 'this year starts on 1 January');
  check(ids({ f: 'document' }) === 'c' && ids({ f: 'project' }) === 'ab', 'library / on projects tabs');
  check(foldText('  مؤسسةُ  الملك ') === 'مؤسسه الملك', 'folding drops tashkeel, ة→ه, collapses spaces');
  const r = docsRows('en', { files: docs, docq: 'zzz' });
  check(r.shown === '0 of 3' && r.body.includes('No documents match'), 'no match says so, with the count');
  const full = docsRows('en', { files: docs });
  check(full.body.includes('14 Nov 2026') && full.shown === '3', 'rows show the upload date');
}

if (failed) { console.log(`files: ${failed} failed`); process.exit(1); }
console.log('files: all checks passed');
