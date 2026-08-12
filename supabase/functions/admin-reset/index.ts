/* ==========================================================================
   admin-reset — the "Send reset link" button on the People screen.

   An admin cannot set somebody's password, here or anywhere else in this
   product, and that is not an omission. A password an admin can type is a
   password an admin knows, which means "who did this" stops having an answer.
   So the admin does the only useful thing they can do — cause a fresh link to
   be sent — and the person still chooses their own password.

   The same button covers the two situations that look identical on screen:
   somebody who has an account and is locked out gets a recovery link, and
   somebody who was invited but never arrived gets their invitation again.
   ========================================================================== */

import { CORS, json, APP, adminClient, whoIsAsking, deptName, actionLink } from '../_shared/http.ts';
import { send, resetMail, inviteMail } from '../_shared/mail.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const admin = adminClient();
    const me = await whoIsAsking(req, admin);
    if (!me) return json({ error: 'not signed in' }, 401);
    if (me.role !== 'admin') return json({ error: 'only an admin can send reset links' }, 403);

    const body = await req.json().catch(() => ({}));
    const id = String(body.id ?? '');
    if (!id) return json({ error: 'no person given' }, 400);

    const { data: person } = await admin.from('profiles')
      .select('id, email, full_name, department_id, role, user_id').eq('id', id).maybeSingle();
    if (!person) return json({ error: 'no such person' }, 404);
    if (!person.email) return json({ error: 'that person has no email address on file' }, 400);

    const redirectTo = typeof body.redirectTo === 'string' && body.redirectTo.startsWith('http')
      ? body.redirectTo : `${APP}/#/reset`;

    /* An account already exists → recovery. No account → the link that makes
       one. Asking for recovery on a non-existent user fails, and asking for
       an invite on an existing one fails, so the branch is load-bearing. */
    let kind = person.user_id ? 'recovery' : 'invite';
    let { link, error } = await actionLink(
      admin, kind as 'invite' | 'recovery', person.email, redirectTo,
      kind === 'invite' ? { full_name: person.full_name, department_id: person.department_id, role: person.role } : undefined,
    );
    if (error && /already.*registered|already exists|email_exists|user_already/i.test(error)) {
      kind = 'recovery';
      ({ link, error } = await actionLink(admin, 'recovery', person.email, redirectTo));
    }
    if (!link) return json({ emailed: false, email: person.email, reason: error }, 200);

    const dept = await deptName(admin, person.department_id);
    const letter = kind === 'recovery'
      ? resetMail(person.full_name, link, true)
      : inviteMail(person.full_name, link, dept, person.role);
    const sent = await send(person.email, letter.subject, letter.html, letter.text);

    await admin.from('profiles').update({ link_sent_at: new Date().toISOString() }).eq('id', person.id);

    return json({
      emailed: sent.ok, kind, email: person.email,
      name: person.full_name, reason: sent.reason ?? null,
    });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
