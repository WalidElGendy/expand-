/* ==========================================================================
   Tenders data. Row-level security decides what each person gets back:
   approvers and analysts see every tender, an assigned project manager only
   theirs. Decisions go through tender_decide() so nobody can approve from a
   browser console.
   ========================================================================== */

import { sb, state } from './db.js';

export const TENDER_BUCKET = 'tenders';
const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
const me = () => state.me?.id;
const rpc = async (fn, args) => { const { data, error } = await sb.rpc(fn, args); if (error) throw new Error(error.message); return data; };

export const myTenderRole = () => rpc('tender_role', {});
export const getSettings = async () => ok(await sb.from('tender_settings').select('*').eq('id', 1).maybeSingle());
export const saveSettings = async (patch) => ok(await sb.from('tender_settings')
  .update({ ...patch, updated_by: me(), updated_at: new Date().toISOString() }).eq('id', 1).select().single());

export const listTenders = async () => ok(await sb.from('tenders').select('*')
  .order('created_at', { ascending: false }).limit(5000));
export const getTender = async (id) => ok(await sb.from('tenders').select('*').eq('id', id).maybeSingle());
export const createTender = async (row) => ok(await sb.from('tenders').insert(row).select().single());
export const updateTender = async (id, patch) => ok(await sb.from('tenders').update(patch).eq('id', id).select().single());
export const deleteTender = async (id) => ok(await sb.from('tenders').delete().eq('id', id).select('id'));
export const decide = (id, action, { reason = null, note = null, pm = null } = {}) =>
  rpc('tender_decide', { p_id: id, p_action: action, p_reason: reason, p_note: note, p_pm: pm });

export const listEvents = async (tender_id) => ok(await sb.from('tender_events')
  .select('*').eq('tender_id', tender_id).order('created_at', { ascending: false }).limit(200));
export const addNote = async (tender_id, body) => ok(await sb.from('tender_events')
  .insert({ tender_id, kind: 'note', body, created_by: me() }).select().single());

export const listFiles = async (tender_id) => ok(await sb.from('tender_files')
  .select('*').eq('tender_id', tender_id).order('created_at', { ascending: false }));
const slug = (s) => String(s || 'file').normalize('NFKD').replace(/[^\w.\-]+/g, '-').replace(/-+/g, '-').slice(-80);
export async function addFile(tender_id, file, kind = 'other') {
  const path = `${tender_id}/${Date.now().toString(36)}-${slug(file.name)}`;
  const up = await sb.storage.from(TENDER_BUCKET).upload(path, file, { cacheControl: '60', upsert: false, contentType: file.type || undefined });
  if (up.error) throw new Error(up.error.message);
  return ok(await sb.from('tender_files').insert({
    tender_id, kind, path, file_name: file.name, size_bytes: file.size || null, uploaded_by: me(),
  }).select().single());
}
export async function deleteFile(f) {
  await sb.storage.from(TENDER_BUCKET).remove([f.path]);
  return ok(await sb.from('tender_files').delete().eq('id', f.id).select('id'));
}
export async function fileUrl(path, seconds = 300) {
  const { data, error } = await sb.storage.from(TENDER_BUCKET).createSignedUrl(path, seconds);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}
