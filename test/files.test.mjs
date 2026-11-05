/* Project files: who may delete which. Mirrors can_delete_project_file(). */
import { canDeleteProjectFile as can } from '../web/dash.js';

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

if (failed) { console.log(`files: ${failed} failed`); process.exit(1); }
console.log('files: all checks passed');
