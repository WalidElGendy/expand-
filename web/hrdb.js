/* ==========================================================================
   HR data layer. Every read returns only what row-level security lets the
   signed-in person see, so the same call serves HR (everyone), a supervisor
   (their reports) and an employee (themselves). Writes that carry a rule —
   clocking in, deciding a request, paying a run — go through database
   functions so the rule cannot be skipped from a browser console.
   ========================================================================== */

import { sb, state, HR_BUCKET, uploadHrDoc, hrDocUrl } from './db.js';

const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
const me = () => state.me?.id;
const rpc = async (fn, args) => { const { data, error } = await sb.rpc(fn, args); if (error) throw new Error(error.message); return data; };

export { uploadHrDoc, hrDocUrl, HR_BUCKET };

/* --------------------------------------------------------------- settings */
export const getSettings = async () => ok(await sb.from('hr_settings').select('*').eq('id', 1).maybeSingle());
export const saveSettings = async (patch) => ok(await sb.from('hr_settings')
  .update({ ...patch, updated_by: me(), updated_at: new Date().toISOString() }).eq('id', 1).select().single());
export const listHolidays = async () => ok(await sb.from('hr_holidays').select('*').order('day'));
export const addHoliday = async (day, name) => ok(await sb.from('hr_holidays').upsert({ day, name }).select());
export const deleteHoliday = async (day) => ok(await sb.from('hr_holidays').delete().eq('day', day).select());

/* ------------------------------------------------------------- employees */
export const listEmployees = async () => ok(await sb.from('hr_employees').select('*'));
export const getEmployee = async (id) => ok(await sb.from('hr_employees').select('*').eq('profile_id', id).maybeSingle());
export const saveEmployee = async (id, patch) => ok(await sb.from('hr_employees')
  .upsert({ profile_id: id, ...patch, updated_by: me(), updated_at: new Date().toISOString() }, { onConflict: 'profile_id' })
  .select().single());
export const listPrivate = async () => ok(await sb.from('hr_employee_private')
  .select('profile_id, id_expiry, passport_expiry'));
export const getPrivate = async (id) => ok(await sb.from('hr_employee_private').select('*').eq('profile_id', id).maybeSingle());
export const savePrivate = async (id, patch) => ok(await sb.from('hr_employee_private')
  .upsert({ profile_id: id, ...patch, updated_by: me(), updated_at: new Date().toISOString() }, { onConflict: 'profile_id' })
  .select().single());

/* ------------------------------------------------------------- documents */
export const listDocuments = async (employee_id = null) => {
  let q = sb.from('hr_documents').select('*').order('created_at', { ascending: false }).limit(2000);
  if (employee_id) q = q.eq('employee_id', employee_id);
  return ok(await q);
};
export async function addDocument(employee_id, file, meta = {}) {
  const up = await uploadHrDoc(file, `employees/${employee_id}`);
  return ok(await sb.from('hr_documents').insert({
    employee_id, path: up.path, file_name: up.name, size_bytes: file.size || null,
    kind: meta.kind || 'other', title: meta.title || null, expires_on: meta.expires_on || null,
    uploaded_by: me(),
  }).select().single());
}
export const deleteDocument = async (id) => ok(await sb.from('hr_documents').delete().eq('id', id).select());

/* ------------------------------------------------------------ attendance */
export const clock = (lat = null, lng = null, accuracy = null) =>
  rpc('hr_clock', { p_lat: lat, p_lng: lng, p_accuracy: accuracy });
export const listAttendance = async ({ from, to, employee_id = null } = {}) => {
  let q = sb.from('hr_attendance').select('*').order('day', { ascending: false }).limit(10000);
  if (from) q = q.gte('day', from);
  if (to) q = q.lte('day', to);
  if (employee_id) q = q.eq('employee_id', employee_id);
  return ok(await q);
};
export const saveAttendance = async (row) => ok(await sb.from('hr_attendance')
  .upsert({ ...row, edited_by: me() }, { onConflict: 'employee_id,day' }).select().single());

/* ----------------------------------------------------------------- leave */
export const listLeavesSince = async (since, employee_id = null) => {
  let q = sb.from('hr_leaves').select('*').gte('end_date', since).order('start_date', { ascending: false }).limit(5000);
  if (employee_id) q = q.eq('employee_id', employee_id);
  return ok(await q);
};
export const addLeave = async (row) => ok(await sb.from('hr_leaves').insert({ ...row, created_by: me() }).select().single());
export const deleteLeave = async (id) => ok(await sb.from('hr_leaves').delete().eq('id', id).select());

/* -------------------------------------------------------------- requests */
export const listRequests = async ({ employee_id = null, open = false, limit = 500 } = {}) => {
  let q = sb.from('hr_requests').select('*').order('created_at', { ascending: false }).limit(limit);
  if (employee_id) q = q.eq('employee_id', employee_id);
  if (open) q = q.in('status', ['pending_manager', 'pending_hr', 'approved']);
  return ok(await q);
};
export const getRequest = async (id) => ok(await sb.from('hr_requests').select('*').eq('id', id).maybeSingle());
export async function createRequest(row, file = null) {
  const emp = row.employee_id || me();
  let att = {};
  if (file) { const up = await uploadHrDoc(file, `requests/${emp}`); att = { attachment_path: up.path, attachment_name: up.name }; }
  return ok(await sb.from('hr_requests').insert({ ...row, employee_id: emp, ...att }).select().single());
}
export const decideRequest = (id, approve, note = null) => rpc('hr_request_decide', { p_id: id, p_approve: approve, p_note: note });
export const cancelRequest = (id) => rpc('hr_request_cancel', { p_id: id });
export async function completeRequest(req, file = null, note = null) {
  let path = null, name = null;
  if (file) { const up = await uploadHrDoc(file, `requests/${req.employee_id}`); path = up.path; name = up.name; }
  return rpc('hr_request_complete', { p_id: req.id, p_path: path, p_name: name, p_note: note });
}

/* --------------------------------------------------------------- payroll */
export const listSalaries = async (employee_id = null) => {
  let q = sb.from('hr_salaries').select('*').order('effective_from', { ascending: false }).limit(5000);
  if (employee_id) q = q.eq('employee_id', employee_id);
  return ok(await q);
};
export const addSalary = async (row) => ok(await sb.from('hr_salaries').insert({ ...row, created_by: me() }).select().single());
export const deleteSalary = async (id) => ok(await sb.from('hr_salaries').delete().eq('id', id).select());
export const listAdvances = async (employee_id = null) => {
  let q = sb.from('hr_advances').select('*').order('created_at', { ascending: false });
  if (employee_id) q = q.eq('employee_id', employee_id);
  return ok(await q);
};
export const addAdvance = async (row) => ok(await sb.from('hr_advances').insert({ ...row, created_by: me() }).select().single());
export const updateAdvance = async (id, patch) => ok(await sb.from('hr_advances').update(patch).eq('id', id).select().single());
export const listRuns = async () => ok(await sb.from('hr_payroll_runs').select('*').order('period', { ascending: false }));
export const getRun = async (period) => ok(await sb.from('hr_payroll_runs').select('*').eq('period', period).maybeSingle());
export const createRun = async (period) => ok(await sb.from('hr_payroll_runs')
  .insert({ period, created_by: me() }).select().single());
export const deleteRun = async (id) => ok(await sb.from('hr_payroll_runs').delete().eq('id', id).select());
export const setRunStatus = (id, status) => rpc('hr_payroll_set_status', { p_run: id, p_status: status });
export const listPayslips = async ({ run_id = null, employee_id = null } = {}) => {
  let q = sb.from('hr_payslips').select('*').order('period', { ascending: false }).limit(5000);
  if (run_id) q = q.eq('run_id', run_id);
  if (employee_id) q = q.eq('employee_id', employee_id);
  return ok(await q);
};
/** Replace a draft run's payslips with a freshly computed set. */
export async function replacePayslips(run_id, rows) {
  ok(await sb.from('hr_payslips').delete().eq('run_id', run_id).select('id'));
  if (!rows.length) return [];
  return ok(await sb.from('hr_payslips').insert(rows.map(r => ({ ...r, run_id }))).select());
}
export const updatePayslip = async (id, patch) => ok(await sb.from('hr_payslips').update(patch).eq('id', id).select().single());

/* ----------------------------------------------------------- performance */
export const listGoals = async (employee_id = null) => {
  let q = sb.from('hr_goals').select('*').order('created_at', { ascending: false }).limit(5000);
  if (employee_id) q = q.eq('employee_id', employee_id);
  return ok(await q);
};
export const addGoal = async (row) => ok(await sb.from('hr_goals').insert({ ...row, created_by: me() }).select().single());
export const updateGoal = async (id, patch) => ok(await sb.from('hr_goals')
  .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).select().single());
export const deleteGoal = async (id) => ok(await sb.from('hr_goals').delete().eq('id', id).select());
export const upsertReview = async (row) => ok(await sb.from('reviews')
  .upsert({ ...row, author_id: me(), updated_at: new Date().toISOString() }, { onConflict: 'subject_id,period' }).select().single());

/* --------------------------------------------------------------- letters */
export const listLetters = async () => ok(await sb.from('hr_letters')
  .select('id, direction, number, letter_date, kind, lang, to_department, recipient, subject, status, employee_id, approved_at, sent_at, created_at')
  .order('letter_date', { ascending: false }).order('created_at', { ascending: false }).limit(2000));
export const getLetter = async (id) => ok(await sb.from('hr_letters').select('*').eq('id', id).maybeSingle());
export const createLetter = async (row) => ok(await sb.from('hr_letters').insert(row).select().single());
export const updateLetter = async (id, patch) => ok(await sb.from('hr_letters').update(patch).eq('id', id).select().single());
export const deleteLetter = async (id) => ok(await sb.from('hr_letters').delete().eq('id', id).select());
export async function addLetterAttachment(letter, file) {
  const up = await uploadHrDoc(file, `letters/${letter.number || letter.id}`);
  const list = [...(letter.attachments || []), { path: up.path, name: up.name }];
  return updateLetter(letter.id, { attachments: list });
}
/** Signature/stamp images as data URLs, for printing an approved letter. */
export async function imageData(path) {
  if (!path) return null;
  const { data, error } = await sb.storage.from(HR_BUCKET).download(path);
  if (error || !data) return null;
  return new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => res(null); r.readAsDataURL(data); });
}
