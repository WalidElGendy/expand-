/* ==========================================================================
   admin-remove — the "Remove" button on the People screen.

   Deleting a person is the one destructive action here, so it is deliberately
   SAFE-GUARDED: if the person is attached to any real work — projects, the
   stages assigned to them, tasks, leads, lead activity, uploaded files — the
   delete is refused and the admin is told to Revoke instead. Nothing they
   touched is ever orphaned or silently reassigned.

   Only when a person is clean does this actually delete them: their profile
   row, their Supabase auth login, and any pending invitation for their email.
   Two kinds of harmless bookkeeping link are cleared first so they cannot
   block the delete for the wrong reason:
     · other rows that record this person as the *inviter* (invited_by), and
     · their own pending invitation.
   Supervisor links and authored-review links are defined ON DELETE SET NULL /
   CASCADE at the database, so they resolve themselves.

   An admin cannot remove themselves — that is how an org locks itself out.
   ========================================================================== */

import { CORS, json, adminClient, whoIsAsking } from '../_shared/http.ts';

/** Count rows in `table` where any of `cols` equals the person id. */
async function refCount(admin: any, table: string, cols: string[], id: string): Promise<number> {
  const filter = cols.map((c) => `${c}.eq.${id}`).join(',');
  let q = admin.from(table).select('id', { count: 'exact', head: true });
  q = cols.length > 1 ? q.or(filter) : q.eq(cols[0], id);
  const { count, error } = await q;
  if (error) throw new Error(`${table}: ${error.message}`);
  return count || 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const admin = adminClient();
    const me = await whoIsAsking(req, admin);
    if (!me) return json({ error: 'not signed in' }, 401);
    if (me.role !== 'admin') return json({ error: 'only an admin can remove people' }, 403);

    const body = await req.json().catch(() => ({}));
    const id = String(body.id ?? '');
    if (!id) return json({ error: 'no person given' }, 400);
    if (id === me.id) return json({ error: 'you cannot remove yourself' }, 400);

    const { data: person } = await admin.from('profiles')
      .select('id, email, full_name, user_id').eq('id', id).maybeSingle();
    if (!person) return json({ error: 'no such person' }, 404);

    /* The safeguard. Every table below has ON DELETE NO ACTION on its link to
       profiles, so a row here is exactly what would make the delete fail — we
       check first so the answer is a sentence, not a constraint violation.
       Grouped the way an admin thinks about it. */
    const [projOwn, stages, projEvents, tasks, leadOwn, leadEvents, files] = await Promise.all([
      refCount(admin, 'projects', ['owner_id', 'created_by'], id),
      refCount(admin, 'project_stages', ['assignee_id'], id),
      refCount(admin, 'project_events', ['created_by'], id),
      refCount(admin, 'tasks', ['assignee_id', 'created_by'], id),
      refCount(admin, 'leads', ['owner_id', 'created_by'], id),
      refCount(admin, 'lead_events', ['created_by'], id),
      refCount(admin, 'files', ['uploaded_by'], id),
    ]);

    const attached = {
      projects: projOwn + stages + projEvents,
      tasks,
      leads: leadOwn + leadEvents,
      files,
    };
    const total = attached.projects + attached.tasks + attached.leads + attached.files;
    if (total > 0) {
      return json({
        removed: false,
        reason: 'attached',
        attached,
        email: person.email,
        name: person.full_name,
      });
    }

    /* Clean. Clear the harmless bookkeeping links that would otherwise block
       the delete, then remove the person everywhere. Auth user goes LAST, so a
       failure at any earlier step never strands a login without a profile. */
    await admin.from('invitations').update({ invited_by: null }).eq('invited_by', id);
    await admin.from('profiles').update({ invited_by: null }).eq('invited_by', id);
    if (person.email) {
      await admin.from('invitations').delete().ilike('email', person.email);
    }

    const { error: delErr } = await admin.from('profiles').delete().eq('id', id);
    if (delErr) {
      // A reference we did not anticipate. Fail closed rather than half-delete.
      return json({ removed: false, reason: 'blocked', detail: delErr.message,
        email: person.email, name: person.full_name }, 200);
    }

    if (person.user_id) {
      try { await admin.auth.admin.deleteUser(person.user_id); }
      catch (e) { /* profile is already gone; report the login could not be cleared */
        return json({ removed: true, authCleared: false, email: person.email,
          name: person.full_name, detail: String((e as Error)?.message ?? e) });
      }
    }

    return json({ removed: true, authCleared: true, email: person.email, name: person.full_name });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
