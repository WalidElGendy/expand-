/* ==========================================================================
   request-access — "First time here?" on the sign-in screen.

   It takes an email address and nothing else. The screen used to take an
   email AND a password and call supabase.auth.signUp() from the browser,
   which had two problems. The small one: it depended on Supabase's SMTP
   setting to send a confirmation, so a `535` from the mail server came back
   to a new joiner as a blank failure. The large one: a password typed before
   the address is proven means whoever types first owns the address, and the
   invitations table exists precisely so that an address, not a person's say
   so, decides what role they get.

   So: prove the mailbox first, choose the password second. Two doors became
   one — this mints the same kind of link an admin invitation does.

   Who may get a link:
     · an address with an invitation row — an admin has authorised it, and
       they arrive active with the role that row names;
     · an address already on the roster (the people imported from Asana) —
       they arrive INACTIVE and show up under "Waiting for approval", which
       is the existing sign-up-then-get-approved path, unchanged;
     · nobody else. A stranger gets the same friendly reply and no email.

   The reply is deliberately identical in all three cases. Saying "no such
   person" would turn this box into a way to test whether an address works
   here, which is the first thing anyone probing a company tries.

   Runs with verify_jwt off, because the person asking has no account yet.
   ========================================================================== */

import { CORS, json, EMAIL, APP, adminClient, actionLink } from '../_shared/http.ts';
import { send, inviteMail, resetMail } from '../_shared/mail.ts';

// One link every two minutes per address. Enough that a mistyped click does
// not fire twice, low enough that this cannot be used to bomb an inbox — and
// it stops a second link cancelling the first while somebody is reading it.
const COOLDOWN_MS = 120_000;
const fresh = (iso: string | null) =>
  !!iso && Date.now() - new Date(iso).getTime() < COOLDOWN_MS;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  // Whatever happens below, this is what the browser is told.
  const same = () => json({ ok: true });

  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body.email ?? '').trim().toLowerCase();
    if (!EMAIL.test(email)) return json({ error: 'that is not an email address' }, 400);

    const redirectTo = typeof body.redirectTo === 'string' && body.redirectTo.startsWith('http')
      ? body.redirectTo : `${APP}/#/reset`;

    const admin = adminClient();

    const { data: inv } = await admin.from('invitations')
      .select('email, full_name, department_id, role, last_link_at')
      .ilike('email', email).maybeSingle();

    const { data: person } = await admin.from('profiles')
      .select('id, full_name, department_id, role, link_sent_at')
      .ilike('email', email).maybeSingle();

    /* Whatever happened is written next to the address rather than returned.
       The caller gets the same sentence either way — see above — so without
       this an admin has no way to find out that a link never went. */
    const record = async (error: string | null) => {
      const at = error ? null : new Date().toISOString();
      if (inv) await admin.from('invitations')
        .update({ last_error: error, ...(at ? { last_link_at: at } : {}) }).ilike('email', email);
      if (person) await admin.from('profiles')
        .update({ last_link_error: error, ...(at ? { link_sent_at: at } : {}) }).eq('id', person.id);
    };

    if (!inv && !person) return same();
    if (fresh(inv?.last_link_at ?? null) || fresh(person?.link_sent_at ?? null)) return same();

    const full_name = inv?.full_name || person?.full_name || null;
    const department_id = inv?.department_id ?? person?.department_id ?? null;
    const role = inv?.role || 'member';

    let kind = 'invite';
    let { link, error } = await actionLink(admin, 'invite', email, redirectTo,
      { full_name, department_id, role });

    if (error && /already.*registered|already exists|email_exists|user_already/i.test(error)) {
      // They already made an account — the useful letter is the one that lets
      // them back in, not "you already exist", which they cannot act on.
      kind = 'recovery';
      ({ link, error } = await actionLink(admin, 'recovery', email, redirectTo));
    }
    if (!link) {
      await record(error ?? 'Supabase returned no link');
      return same();
    }

    const letter = kind === 'recovery'
      ? resetMail(full_name, link, false)
      : inviteMail(full_name, link, '', role);
    const sent = await send(email, letter.subject, letter.html, letter.text);

    /* The cooldown starts only when a link actually went. Stamping it on a
       failure meant a failed attempt blocked the retry that would have
       worked, for two minutes, with nobody told why. */
    await record(sent.ok ? null : (sent.reason ?? 'the mail server gave no reason'));

    return same();
  } catch (e) {
    console.error('request-access:', e);
    return same();
  }
});
