/* ==========================================================================
   The data layer.

   Everything that talks to Supabase lives here, so there is exactly one place
   that knows the table names and exactly one place to change when the schema
   moves. Views import functions from this file; they never build a query.

   On the key in the bundle: the anon key below is PUBLIC by design. It
   identifies the project, it does not grant access — row-level security in
   the database decides what any given signed-in user may read or write, and
   an anon key with no session can read nothing. Shipping it in a static
   bundle is the intended shape. The service-role key, which does bypass RLS,
   must never appear in this repository.
   ========================================================================== */

import { createClient } from '@supabase/supabase-js';

/* Replaced at build time by scripts/build.mjs. Left as recognisable
   placeholders so an unbuilt file fails loudly instead of half-working. */
export const SUPABASE_URL  = '__SUPABASE_URL__';
export const SUPABASE_ANON = '__SUPABASE_ANON_KEY__';

export const configured = !SUPABASE_URL.startsWith('__');

export const sb = configured
  ? createClient(SUPABASE_URL, SUPABASE_ANON, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

/* ------------------------------------------------------------------ session */

export const state = {
  session: null,
  me: null,          // the profiles row for the signed-in user
  departments: [],
};

/** Throws with the server's message rather than a generic one, because
    "row-level security" and "wrong password" need different responses. */
const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };

export async function loadSession() {
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  state.session = data.session || null;
  state.me = state.session ? await loadMe() : null;
  return state.session;
}

async function loadMe() {
  const { data, error } = await sb
    .from('profiles')
    .select('*, departments(*)')
    .eq('user_id', state.session.user.id)
    .maybeSingle();
  // A signed-in user with no profile row means the signup trigger did not
  // run. Surfacing null lets the UI say so instead of rendering an empty
  // dashboard that looks like "you have no work".
  if (error) throw new Error(error.message);
  return data;
}

export const onAuthChange = (fn) => sb?.auth.onAuthStateChange(fn);

export async function signIn(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(error.message);
  state.session = data.session;
  state.me = await loadMe();
  return state.me;
}

/** First-time sign-up. Only works if an admin has already added an
    invitation for this email — otherwise the account is created inactive
    and can see nothing, which is the intended failure. */
export async function signUp(email, password) {
  const { error } = await sb.auth.signUp({
    email: email.trim(), password,
    options: { emailRedirectTo: location.origin },
  });
  if (error) throw new Error(error.message);
}

export async function resetPassword(email) {
  const { error } = await sb.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: location.origin + '#/reset',
  });
  if (error) throw new Error(error.message);
}

export async function updatePassword(password) {
  const { error } = await sb.auth.updateUser({ password });
  if (error) throw new Error(error.message);
}

export async function signOut() {
  await sb.auth.signOut();
  state.session = null; state.me = null;
}

/* --------------------------------------------------------------- reference */

export async function loadDepartments() {
  state.departments = await ok(await sb.from('departments').select('*').order('sort'));
  return state.departments;
}

export const dept = (id) => state.departments.find(d => d.id === id) || null;

/* ---------------------------------------------------------------- people */

export const listPeople = async () => ok(await sb
  .from('profiles')
  .select('id, full_name, email, department_id, role, is_active, asana_gid, user_id')
  .order('full_name'));

export const listInvitations = async () => ok(await sb
  .from('invitations').select('*').order('created_at', { ascending: false }));

export const invite = async ({ email, full_name, department_id, role }) => ok(await sb
  .from('invitations')
  .upsert({ email: email.trim().toLowerCase(), full_name, department_id, role,
            invited_by: state.me?.id }, { onConflict: 'email' })
  .select());

/** Adding someone to the roster without a login — the Asana import shape.
    Useful for a person who is assigned work but has not been invited yet. */
export const addPerson = async ({ email, full_name, department_id, role }) => ok(await sb
  .from('profiles')
  .insert({ email: email?.trim().toLowerCase() || null, full_name, department_id,
            role: role || 'member', is_active: false })
  .select());

export const setPerson = async (id, patch) => ok(await sb
  .from('profiles').update(patch).eq('id', id).select());

/* -------------------------------------------------------------- projects */

const PROJECT_COLS = `
  id, name, client, description, size, status, start_on, due_on, delivered_on,
  estimated_delivery, estimate_meta, is_crm_list, import_flags, asana_url,
  owner:owner_id ( id, full_name ),
  project_stages ( id, department_id, assignee_id, effort_days, planned_start,
                   planned_end, started_at, completed_at, status, sort,
                   assignee:assignee_id ( id, full_name, department_id ) )`;

export const listProjects = async ({ limit = 200, crm = false } = {}) => ok(await sb
  .from('projects').select(PROJECT_COLS)
  .eq('is_crm_list', crm)
  .order('due_on', { ascending: true, nullsFirst: false })
  .limit(limit));

export const getProject = async (id) => ok(await sb
  .from('projects').select(PROJECT_COLS).eq('id', id).single());

export const createProject = async (p) => ok(await sb
  .from('projects')
  .insert({ ...p, created_by: state.me?.id, owner_id: p.owner_id ?? state.me?.id })
  .select().single());

export const updateProject = async (id, patch) => ok(await sb
  .from('projects').update(patch).eq('id', id).select().single());

export const setStages = async (project_id, stages) => ok(await sb
  .from('project_stages')
  .upsert(stages.map((s, i) => ({ project_id, sort: i, ...s })),
          { onConflict: 'project_id,department_id' })
  .select());

export const removeStage = async (id) => ok(await sb
  .from('project_stages').delete().eq('id', id).select());

/** The one write a designer has, and the reason the data will get better:
    Asana never recorded when work STARTED, so effort and queue could never
    be separated. This records it. */
export const setStageStatus = async (id, status) => {
  const patch = { status };
  if (status === 'in_progress') patch.started_at = new Date().toISOString();
  if (status === 'done')        patch.completed_at = new Date().toISOString();
  return ok(await sb.from('project_stages').update(patch).eq('id', id).select().single());
};

/* ----------------------------------------------------------------- tasks */

export const listMyTasks = async () => ok(await sb
  .from('tasks')
  .select('id, name, due_on, completed, section_name, project:project_id ( id, name )')
  .eq('assignee_id', state.me?.id)
  .eq('completed', false)
  .order('due_on', { ascending: true, nullsFirst: false })
  .limit(200));

export const listProjectTasks = async (project_id) => ok(await sb
  .from('tasks')
  .select('id, name, due_on, completed, section_name, assignee:assignee_id ( id, full_name )')
  .eq('project_id', project_id)
  .order('due_on', { ascending: true, nullsFirst: false }));

export const addTask = async (t) => ok(await sb
  .from('tasks').insert({ ...t, created_by: state.me?.id }).select().single());

export const setTaskDone = async (id, completed) => ok(await sb
  .from('tasks')
  .update({ completed, completed_at: completed ? new Date().toISOString() : null })
  .eq('id', id).select().single());

/* ----------------------------------------------------------------- leads */

export const listLeads = async ({ limit = 500 } = {}) => ok(await sb
  .from('leads')
  .select('id, name, company, email, phone, status, source, next_follow_up_on, value_sar, notes, owner:owner_id ( id, full_name )')
  .order('next_follow_up_on', { ascending: true, nullsFirst: false })
  .limit(limit));

export const createLead = async (l) => ok(await sb
  .from('leads')
  .insert({ ...l, created_by: state.me?.id, owner_id: l.owner_id ?? state.me?.id })
  .select().single());

export const updateLead = async (id, patch) => ok(await sb
  .from('leads').update(patch).eq('id', id).select().single());

export const listLeadEvents = async (lead_id) => ok(await sb
  .from('lead_events')
  .select('id, kind, body, occurred_at, created_by')
  .eq('lead_id', lead_id).order('occurred_at', { ascending: false }));

export const addLeadEvent = async (e) => ok(await sb
  .from('lead_events').insert({ ...e, created_by: state.me?.id }).select().single());

/* ----------------------------------------------------------------- files */

const slug = (s) => String(s || 'file')
  .normalize('NFKD')
  .replace(/[^\w.\- ]+/g, '')      // strip anything a storage key should not carry
  .trim().replace(/\s+/g, '-')
  .slice(0, 80) || 'file';

/**
 * Upload, then record. In that order deliberately: a `files` row pointing at
 * an object that failed to upload is a broken link the UI cannot detect,
 * whereas an orphaned object with no row is invisible and harmless.
 */
export async function uploadFile(bucket, file, meta = {}) {
  const stamp = Date.now().toString(36);
  const path = `${meta.project_id || meta.lead_id || 'library'}/${stamp}-${slug(file.name)}`;

  const up = await sb.storage.from(bucket).upload(path, file, {
    cacheControl: '3600', upsert: false, contentType: file.type || undefined,
  });
  if (up.error) throw new Error(up.error.message);

  return ok(await sb.from('files').insert({
    bucket, path,
    filename: file.name,
    mime: file.type || null,
    size_bytes: file.size,
    uploaded_by: state.me?.id,
    ...meta,
  }).select().single());
}

export const listFiles = async (filter = {}) => {
  let q = sb.from('files')
    .select('id, purpose, title, description, bucket, path, filename, mime, size_bytes, created_at, project_id, lead_id, uploader:uploaded_by ( id, full_name )')
    .order('created_at', { ascending: false });
  if (filter.project_id) q = q.eq('project_id', filter.project_id);
  if (filter.purpose)    q = q.eq('purpose', filter.purpose);
  return ok(await q.limit(300));
};

/** Signed, short-lived, and generated on demand — see migration 004 for why
    the buckets are private. */
export async function fileUrl(bucket, path, seconds = 300) {
  const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, seconds);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

export const deleteFile = async (f) => {
  await sb.storage.from(f.bucket).remove([f.path]);
  return ok(await sb.from('files').delete().eq('id', f.id).select());
};

/* -------------------------------------------------------------- workload */

export const personLoad = async () => ok(await sb
  .from('v_person_load').select('*').order('committed_days', { ascending: false }));
