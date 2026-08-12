/* ==========================================================================
   account-ready — the "your account is created" letter, sent once.

   Supabase's mailer has three templates (confirm, invite, recover) and no way
   to add a fourth, so this letter could never have been one of its own. It is
   sent from here, after the person has actually chosen a password — which is
   the first moment the sentence "your account is ready" is true. Sending it
   at invitation time would have been a lie for everyone who never clicked.

   `profiles.welcomed_at` makes it once and only once: the screen calls this
   after every password save, including the fifth password reset in a year,
   and only the first one is a new account.

   The caller is the person themselves. No admin rights, no id in the body —
   the address comes from their own verified token, so this cannot be used to
   mail somebody else.
   ========================================================================== */

import { CORS, json, adminClient, whoIsAsking, deptName } from '../_shared/http.ts';
import { send, welcomeMail } from '../_shared/mail.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const admin = adminClient();
    const me = await whoIsAsking(req, admin);
    if (!me) return json({ error: 'not signed in' }, 401);

    const { data: row } = await admin.from('profiles')
      .select('id, email, full_name, department_id, role, welcomed_at')
      .eq('id', me.id).maybeSingle();
    if (!row?.email) return json({ sent: false, reason: 'no email on file' });
    if (row.welcomed_at) return json({ sent: false, reason: 'already welcomed' });

    /* Stamped before the send, not after. A duplicate welcome is a worse bug
       than a missing one — the retry that produces it is invisible to us and
       the recipient reads it as "did something just happen to my account?". */
    await admin.from('profiles').update({ welcomed_at: new Date().toISOString() }).eq('id', row.id);

    const letter = welcomeMail(row.full_name, await deptName(admin, row.department_id), row.role);
    const sent = await send(row.email, letter.subject, letter.html, letter.text);
    return json({ sent: sent.ok, reason: sent.reason ?? null });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
