/* ==========================================================================
   invite-user — actually invite somebody.

   The admin screen used to write a row into `invitations` and stop. That row
   is an AUTHORISATION: it says what role this email may claim. It is not an
   invitation, because nobody was ever told.

   It has to run here rather than in the browser. Minting a sign-in link is an
   admin-API call and needs the service_role key, which must never reach a
   bundle — scripts/build.mjs refuses to ship one.

   Supabase mints the link; we deliver it through Resend ourselves rather than
   letting Supabase's SMTP setting do it. See _shared/mail.ts for why.

   Two things happen, in this order and deliberately not atomically:
     1. the invitation row is written, so the authorisation survives even if
        the mail fails and the person can still be let in later;
     2. the email is sent, and whether it went is REPORTED BACK rather than
        assumed. A silent failure here is what made this feature look like it
        worked for as long as it did.
   ========================================================================== */

import { CORS, json, EMAIL, ROLES, APP, adminClient, whoIsAsking, deptName, actionLink }
  from '../_shared/http.ts';
import { send, inviteMail, resetMail } from '../_shared/mail.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const admin = adminClient();
    const me = await whoIsAsking(req, admin);
    if (!me) return json({ error: 'not signed in' }, 401);
    if (me.role !== 'admin') return json({ error: 'only an admin can invite people' }, 403);

    const body = await req.json().catch(() => ({}));
    const email = String(body.email ?? '').trim().toLowerCase();
    if (!EMAIL.test(email)) return json({ error: `"${email}" is not an email address` }, 400);

    // Re-validated here: the enum would reject nonsense anyway, but a clear
    // message beats a constraint violation, and an unknown role must not
    // quietly become 'member'.
    const role = ROLES.includes(body.role) ? body.role : 'member';
    const department_id = body.department_id || null;
    const full_name = (body.full_name || '').trim() || null;
    const redirectTo = typeof body.redirectTo === 'string' && body.redirectTo.startsWith('http')
      ? body.redirectTo : `${APP}/#/reset`;

    /* 1. the authorisation, first, because it is the part that must not be
          lost to a mail server having a bad day. */
    const { error: rowErr } = await admin.from('invitations').upsert(
      { email, full_name, department_id, role, invited_by: me.id },
      { onConflict: 'email' },
    );
    if (rowErr) return json({ error: rowErr.message }, 400);

    /* 2. the link, then the letter. */
    const dept = await deptName(admin, department_id);
    let kind = 'invite';
    let { link, error } = await actionLink(admin, 'invite', email, redirectTo,
      { full_name, department_id, role });

    if (error && /already.*registered|already exists|email_exists|user_already/i.test(error)) {
      /* They have an account, so an invite is the wrong letter — send the one
         that lets them back in instead of reporting a failure. */
      kind = 'reset';
      ({ link, error } = await actionLink(admin, 'recovery', email, redirectTo));
    }
    if (!link) return json({ invited: true, emailed: false, kind, email, reason: error }, 200);

    const letter = kind === 'reset'
      ? resetMail(full_name, link, true)
      : inviteMail(full_name, link, dept, role);
    const sent = await send(email, letter.subject, letter.html, letter.text);
    if (sent.ok) await admin.from('invitations').update({ last_link_at: new Date().toISOString() }).eq('email', email);

    return json({ invited: true, emailed: sent.ok, kind, email, reason: sent.reason ?? null });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
