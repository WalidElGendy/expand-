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

/* Snapshot the URL fragment BEFORE createClient() exists.

   The client is created with detectSessionInUrl, which parses the fragment
   for auth parameters and then scrubs it. That is a race against our own
   error reader: sometimes we win and show the user why their link failed,
   sometimes Supabase clears it first and the app renders the landing page
   with no explanation. It looked like a timing flake in the tests; it was a
   real one for users.

   Reading it here — at module scope, above the client — makes the order a
   fact of the file rather than a coincidence of scheduling. */
const INITIAL_HASH = typeof location !== 'undefined' ? location.hash || '' : '';

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
    // Land inside the app, not on the marketing page. A confirmed user is a
    // signed-in user; dropping them on the landing page makes them hunt for
    // the door they just unlocked.
    options: { emailRedirectTo: location.origin + '/#/home' },
  });
  if (error) throw new Error(error.message);
}

export async function resetPassword(email) {
  const { error } = await sb.auth.resetPasswordForEmail(email.trim(), {
    // The slash matters: location.origin has no trailing one, so 'origin#/reset'
    // produces https://host#/reset — which Supabase's allow-list matching and
    // some mail clients treat differently from a normal path.
    redirectTo: location.origin + '/#/reset',
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

/**
 * Supabase reports auth failures by redirecting BACK to the app with the
 * error in the URL fragment:
 *
 *   #error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired
 *
 * Nothing read that, so an expired link rendered the landing page and said
 * nothing at all — the user is told the email "did not work" by a page that
 * looks completely normal. Worse, the fragment collides with hash routing, so
 * the router saw a garbage route.
 *
 * Read it once at boot, then clear it from the URL so a refresh does not
 * resurrect a stale error.
 */
let initialConsumed = false;

export function takeAuthErrorFromUrl() {
  /* Two arrival paths, and both have to work:

       cold load  — the client may already have scrubbed location.hash, so the
                    snapshot taken above createClient() is the only copy left
       hash change — the user was already on the site when the fragment
                    appeared, so location.hash is current and the snapshot is
                    stale

     Prefer the live hash; fall back to the snapshot exactly once. */
  let h = location.hash || '';
  if (!h.includes('error') && !initialConsumed) { h = INITIAL_HASH; initialConsumed = true; }
  if (!h.includes('error')) return null;
  const p = new URLSearchParams(h.replace(/^#\/?/, ''));
  const code = p.get('error_code');
  if (!code && !p.get('error')) return null;

  history.replaceState(null, '', location.pathname + location.search + '#/signin');
  return {
    code,
    kind: p.get('error'),
    // Supabase's own wording, plus-encoded. It is more specific than anything
    // generic we would invent, so it is shown rather than replaced.
    message: (p.get('error_description') || '').replace(/\+/g, ' '),
  };
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

/* Inviting is a SERVER action, not a table write.
   Writing the row is only the authorisation — it says what role this address
   may claim. Actually telling the person needs Supabase's admin API and the
   service_role key, which cannot be in a browser bundle. The `invite-user`
   edge function does both and reports whether the mail actually went, so the
   screen can say "added but not emailed" instead of implying success. */
export const invite = async ({ email, full_name, department_id, role }) => {
  const { data, error } = await sb.functions.invoke('invite-user', {
    body: { email, full_name, department_id, role,
            redirectTo: location.origin + '/#/reset' },
  });
  if (error) {
    // functions.invoke reports a non-2xx as a generic FunctionsHttpError and
    // hides the body. The body is where the useful sentence lives.
    let msg = error.message;
    try { const body = await error.context?.json?.(); if (body?.error) msg = body.error; } catch { /* keep msg */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
};

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
