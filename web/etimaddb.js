/* ==========================================================================
   Etimad Insights data. Reads go straight to the tables (RLS: tender staff);
   anything that calls a paid API goes through the `etimad` edge function,
   which is the only place the keys exist.
   ========================================================================== */

import { sb, state } from './db.js';

export const ETIMAD_BUCKET = 'etimad';
const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
const me = () => state.me?.id;

/** The edge function, with its error sentence surfaced rather than hidden. */
export async function call(action, args = {}) {
  const { data, error } = await sb.functions.invoke('etimad', { body: { action, ...args } });
  if (error) {
    let msg = error.message;
    try { const b = await error.context?.json?.(); if (b?.error) msg = b.error; } catch { /* keep msg */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export const status = () => call('status');
export const sync = (pages = 1) => call('sync', { pages });
export const discover = () => call('discover');
export const fetchDetails = (id) => call('details', { id });
export const analyze = (id) => call('analyze', { id });
export const findContacts = (id, { domain = '', name = '' } = {}) => call('contacts', { id, domain, name });
export const reveal = (contactId) => call('reveal', { id: contactId });

export const getSettings = async () => ok(await sb.from('etimad_settings')
  .select('id, keywords, scopes, company_profile, last_sync_at, last_sync_note, updated_at').eq('id', 1).maybeSingle());
export const saveSettings = async (patch) => ok(await sb.from('etimad_settings')
  .update({ ...patch, updated_by: me(), updated_at: new Date().toISOString() }).eq('id', 1).select('id').single());

const LIST_COLS = 'id, tender_id_string, tender_number, reference_number, name, agency, agency_en, agency_domain, tender_type, status, activity, regions, published_on, last_offer_at, opening_at, expected_award_on, documents_price, est_value_sar, source_url, scopes, keyword_hits, awards, shortlisted, dismissed, note, tender_id, first_seen_at, updated_at';
export const listTenders = async () => ok(await sb.from('etimad_tenders').select(LIST_COLS)
  .order('last_offer_at', { ascending: false, nullsFirst: false }).limit(3000));
export const getTender = async (id) => ok(await sb.from('etimad_tenders').select('*').eq('id', id).maybeSingle());
export const patchTender = async (id, patch) => ok(await sb.from('etimad_tenders').update(patch).eq('id', id).select('id').single());

export const listAnalyses = async () => ok(await sb.from('etimad_analyses')
  .select('id, etimad_tender_id, result, created_at').order('created_at', { ascending: false }).limit(3000));
export const analysesFor = async (id) => ok(await sb.from('etimad_analyses')
  .select('*').eq('etimad_tender_id', id).order('created_at', { ascending: false }).limit(20));

export const contactsFor = async (t) => {
  let q = sb.from('etimad_contacts').select('*').order('revealed_at', { ascending: false, nullsFirst: false }).limit(100);
  q = t.agency ? q.or(`etimad_tender_id.eq.${t.id},agency.eq."${String(t.agency).replace(/"/g, '')}"`) : q.eq('etimad_tender_id', t.id);
  return ok(await q);
};

export const listFiles = async (id) => ok(await sb.from('etimad_files').select('*').eq('etimad_tender_id', id).order('created_at', { ascending: false }));
const slug = (s) => String(s || 'file').normalize('NFKD').replace(/[^\w.\-]+/g, '-').replace(/-+/g, '-').slice(-80);
export async function addFile(id, file) {
  const path = `${id}/${Date.now().toString(36)}-${slug(file.name)}`;
  const up = await sb.storage.from(ETIMAD_BUCKET).upload(path, file, { cacheControl: '60', upsert: false, contentType: file.type || undefined });
  if (up.error) throw new Error(up.error.message);
  return ok(await sb.from('etimad_files').insert({
    etimad_tender_id: id, path, file_name: file.name, size_bytes: file.size || null, mime: file.type || null, uploaded_by: me(),
  }).select().single());
}
export async function deleteFile(f) {
  await sb.storage.from(ETIMAD_BUCKET).remove([f.path]);
  return ok(await sb.from('etimad_files').delete().eq('id', f.id).select('id'));
}
export async function fileUrl(path, seconds = 300) {
  const { data, error } = await sb.storage.from(ETIMAD_BUCKET).createSignedUrl(path, seconds);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

export const listOutcomes = async () => ok(await sb.from('tender_outcomes').select('*'));
export const saveOutcome = async (row) => ok(await sb.from('tender_outcomes').upsert(row, { onConflict: 'tender_id' }).select().single());

export const listUsage = async () => ok(await sb.from('etimad_usage').select('service, action, units, created_at')
  .gte('created_at', new Date(Date.now() - 31 * 86400e3).toISOString()).order('created_at', { ascending: false }).limit(2000));
