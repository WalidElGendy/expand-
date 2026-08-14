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
  online: new Set(), // profile ids with the app open RIGHT NOW — see joinPresence
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

/* ---------------------------------------------------------------- presence
   "Online now" is a claim that has to be true at the moment it is read, so it
   comes from a Realtime presence channel rather than a timestamp. Everyone
   signed in joins the channel; the server tells every member who else is on
   it, and drops them within seconds of the tab closing. Nothing is stored, so
   there is no stale row to clean up and no way for the dot to lie.

   `last_seen_at` answers the other question — when was this person last here
   at all — and is written by a heartbeat below. Presence without it leaves
   every offline row blank, which is most rows most of the time. */

let presenceChan = null;
const onlineWatchers = new Set();
export const onOnlineChange = (fn) => { onlineWatchers.add(fn); return () => onlineWatchers.delete(fn); };

export function joinPresence() {
  if (!sb || !state.me || presenceChan) return;
  // Keyed by PROFILE id, not auth id: the roster is keyed on profiles, so the
  // admin screen can look a row up without a second mapping.
  presenceChan = sb.channel('app-presence', { config: { presence: { key: state.me.id } } });

  presenceChan
    .on('presence', { event: 'sync' }, () => {
      state.online = new Set(Object.keys(presenceChan.presenceState()));
      onlineWatchers.forEach(fn => { try { fn(state.online); } catch { /* a bad watcher must not kill presence */ } });
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await presenceChan.track({ name: state.me.full_name || state.me.email, at: new Date().toISOString() });
      }
    });

  touchLastSeen();
  // Only while the tab is visible: a laptop shut with the tab open should
  // stop claiming the person is here.
  setInterval(() => { if (document.visibilityState === 'visible') touchLastSeen(); }, 120000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') touchLastSeen();
  });
}

export function leavePresence() {
  if (!presenceChan) return;
  try { sb.removeChannel(presenceChan); } catch { /* already gone */ }
  presenceChan = null;
  state.online = new Set();
}

/* Fire and forget. A failed heartbeat is not worth an error on screen — the
   worst case is one stale "last seen", and the presence dot is unaffected. */
const touchLastSeen = () => { sb?.rpc('touch_last_seen').then(() => {}, () => {}); };

export async function signIn(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(error.message);
  state.session = data.session;
  state.me = await loadMe();
  return state.me;
}

/** Every edge-function call in this file, because they all fail the same way.
    functions.invoke reports a non-2xx as a generic FunctionsHttpError and
    hides the body — and the body is where the useful sentence lives. */
async function callFn(name, body) {
  const { data, error } = await sb.functions.invoke(name, {
    body: { ...body, redirectTo: location.origin + '/#/reset' },
  });
  if (error) {
    let msg = error.message;
    try { const b = await error.context?.json?.(); if (b?.error) msg = b.error; } catch { /* keep msg */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

/** "First time here?" and "Forgot your password?" are the same request with
    two different sentences on the button, so they are one function.

    Neither one takes a password. A password typed before the address is
    proven means whoever types first owns the address — and this product
    decides someone's role from their address, via the invitations table. The
    server replies identically whether or not it recognised the address, so
    this box cannot be used to find out who works here. */
export const requestAccess = async (email) =>
  callFn('request-access', { email: String(email || '').trim().toLowerCase() });

export async function updatePassword(password) {
  const { error } = await sb.auth.updateUser({ password });
  if (error) throw new Error(error.message);
}

/** "Your account is ready", sent once, after the password actually exists.
    Fire and forget: the person is already signed in and standing in front of
    the app, so a failed courtesy email must not become an error on screen. */
export const announceAccount = () => callFn('account-ready', {}).catch(() => {});

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
  .select('id, full_name, email, department_id, role, is_active, asana_gid, user_id, last_seen_at')
  .order('full_name'));

export const listInvitations = async () => ok(await sb
  .from('invitations').select('*').order('created_at', { ascending: false }));

/* Inviting is a SERVER action, not a table write.
   Writing the row is only the authorisation — it says what role this address
   may claim. Actually telling the person needs Supabase's admin API and the
   service_role key, which cannot be in a browser bundle. The `invite-user`
   edge function does both and reports whether the mail actually went, so the
   screen can say "added but not emailed" instead of implying success. */
export const invite = async ({ email, full_name, department_id, role }) =>
  callFn('invite-user', { email, full_name, department_id, role });

/** Send somebody a fresh link from the People screen. An admin cannot set a
    password — not here and not anywhere — so this is the whole of what the
    button does: cause a link to be sent. The person still chooses. */
export const sendResetLink = async (id) => callFn('admin-reset', { id });

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
  created_at, updated_at, owner_id,
  owner:owner_id ( id, full_name, department_id ),
  project_stages ( id, department_id, assignee_id, effort_days, planned_start,
                   planned_end, started_at, completed_at, status, sort,
                   assignee:assignee_id ( id, full_name, department_id ) )`;

/* 200 was under the real count (369), so the Projects header read "200 total"
   and the filters below it silently searched a truncated set — the worst
   kind of wrong, because a filter that finds nothing looks like an answer.
   Ordered newest-first now that "most recent" is a sort the screen offers;
   the table re-sorts client-side, but the cut-off, if one is ever hit again,
   should at least keep the projects people are actually working on. */
export const listProjects = async ({ limit = 1000, crm = false } = {}) => ok(await sb
  .from('projects').select(PROJECT_COLS)
  .eq('is_crm_list', crm)
  .order('created_at', { ascending: false })
  .limit(limit));

export const getProject = async (id) => ok(await sb
  .from('projects').select(PROJECT_COLS).eq('id', id).single());

export const createProject = async (p) => ok(await sb
  .from('projects')
  .insert({ ...p, created_by: state.me?.id, owner_id: p.owner_id ?? state.me?.id })
  .select().single());

export const updateProject = async (id, patch) => ok(await sb
  .from('projects').update(patch).eq('id', id).select().single());

/* ---------------------------------------------------------- project history

   The status column holds one value, so every move overwrites the last and
   "when did this go to Etemad, and who sent it?" becomes unanswerable the
   moment it is answered. project_events keeps the trail; the table has no
   update or delete policy, because history you can edit is not history. */

export const listProjectEvents = async (project_id) => ok(await sb
  .from('project_events')
  .select('id, kind, from_status, to_status, body, created_at, author:created_by ( id, full_name )')
  .eq('project_id', project_id)
  .order('created_at', { ascending: false })
  .limit(200));

export const addProjectNote = async (project_id, body) => ok(await sb
  .from('project_events')
  .insert({ project_id, kind: 'note', body, created_by: state.me?.id })
  .select().single());

/** The order the company works in. `won`/`lost` are the Etemad verdict and
    keep their column values; only their labels say Accepted and Rejected. */
export const STATUS_FLOW = ['intake', 'in_design', 'pricing', 'submitted',
                            'won', 'lost', 'in_production', 'delivered', 'archived'];

/** What may follow what. A free-for-all dropdown lets someone mark a project
    delivered that was never submitted, and then the pipeline numbers are
    fiction. `lost` is terminal on purpose — a rejected tender that gets
    re-submitted is a NEW submission, and flattening the two would hide that
    the first attempt failed. */
export const NEXT_STATUS = {
  intake:        ['in_design', 'archived'],
  in_design:     ['pricing', 'submitted', 'archived'],
  pricing:       ['submitted', 'in_design', 'archived'],
  submitted:     ['won', 'lost'],
  won:           ['in_production', 'delivered', 'archived'],
  in_production: ['delivered', 'archived'],
  lost:          ['archived'],
  delivered:     ['archived'],
  archived:      [],
};

/**
 * Move a project, record who moved it, and — on the way into production —
 * make sure the production team actually has a stage to stand in.
 *
 * The event is written AFTER the update rather than before: if the update is
 * refused by RLS, no history is invented for something that did not happen.
 * The reverse order would leave a log entry claiming a move the database
 * rejected, which is worse than no log at all.
 */
export async function setProjectStatus(id, to, { from = null, note = '' } = {}) {
  const patch = { status: to };
  // Delivered has a date column of its own; leaving it null while the status
  // says delivered is how a "delivered on" report ends up empty.
  if (to === 'delivered') patch.delivered_on = new Date().toISOString().slice(0, 10);
  const project = await updateProject(id, patch);

  if (to === 'in_production') await ensureProductionStage(id);

  await sb.from('project_events').insert({
    project_id: id, kind: 'status', from_status: from, to_status: to,
    body: note || null, created_by: state.me?.id,
  });
  return project;
}

/** Accepted means the production team owns it now. Saying so in the status
    while no production stage exists leaves them with nothing on their queue,
    so the handover is a row, not just a word. Idempotent: the unique
    (project_id, department_id) constraint makes a second call a no-op. */
export async function ensureProductionStage(project_id) {
  const existing = ok(await sb.from('project_stages')
    .select('id').eq('project_id', project_id).eq('department_id', 'production'));
  if (existing.length) return existing[0];
  const sorts = ok(await sb.from('project_stages')
    .select('sort').eq('project_id', project_id).order('sort', { ascending: false }).limit(1));
  return ok(await sb.from('project_stages').insert({
    project_id, department_id: 'production', status: 'pending',
    sort: (sorts[0]?.sort ?? 0) + 1,
  }).select().single());
}

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
