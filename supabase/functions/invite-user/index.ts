/* ==========================================================================
   invite-user — actually invite somebody.

   The admin screen used to write a row into `invitations` and stop. That row
   is an AUTHORISATION: it says what role this email may claim when it signs
   up. It is not an invitation, because nobody was ever told. The person sat
   waiting for an email that no code had been written to send.

   It has to run here rather than in the browser. Sending an invite is an
   admin-API call and needs the service_role key, which must never reach a
   bundle — scripts/build.mjs refuses to ship one. Supabase injects that key
   into this runtime as an environment variable, so the secret stays in the
   project and nobody has to handle it.

   Two things happen, in this order and deliberately not atomically:
     1. the invitation row is written, so the authorisation survives even if
        the mail fails and the person can still be let in later;
     2. the email is sent, and whether it went is REPORTED BACK rather than
        assumed. The built-in sender allows two an hour, so "it failed" is a
        normal Tuesday until custom SMTP is configured.
   ========================================================================== */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Every value of the app_role enum. Leaving one out here does not error, it
// silently downgrades the person — 'lead' was being filed as 'member'.
const ROLES = ['member', 'lead', 'manager', 'admin'];
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status, headers: { ...CORS, 'content-type': 'application/json' },
    });

  try {
    const url     = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const svcKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader) return json({ error: 'not signed in' }, 401);

    /* Who is asking. Verified against the caller's own token — never trusted
       from the request body, which anyone could write. */
    const caller = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: { user }, error: whoErr } = await caller.auth.getUser();
    if (whoErr || !user) return json({ error: 'not signed in' }, 401);

    const admin = createClient(url, svcKey, { auth: { persistSession: false } });

    const { data: me } = await admin.from('profiles')
      .select('id, role').eq('user_id', user.id).maybeSingle();
    if (!me) return json({ error: 'your account has no profile' }, 403);
    if (me.role !== 'admin') return json({ error: 'only an admin can invite people' }, 403);

    const body = await req.json().catch(() => ({}));
    const email = String(body.email ?? '').trim().toLowerCase();
    if (!EMAIL.test(email)) return json({ error: `"${email}" is not an email address` }, 400);

    // Role and department come from the admin's request but are re-validated
    // here; the enum would reject nonsense anyway, and a clear message beats a
    // constraint violation.
    const role = ROLES.includes(body.role) ? body.role : 'member';
    const department_id = body.department_id || null;
    const full_name = (body.full_name || '').trim() || null;
    const redirectTo = typeof body.redirectTo === 'string' && body.redirectTo.startsWith('http')
      ? body.redirectTo : 'https://expand.meshnet.co/#/reset';

    /* 1. the authorisation, first, because it is the part that must not be
          lost to a mail server having a bad day. */
    const { error: rowErr } = await admin.from('invitations').upsert(
      { email, full_name, department_id, role, invited_by: me.id },
      { onConflict: 'email' },
    );
    if (rowErr) return json({ error: rowErr.message }, 400);

    /* 2. the email. */
    let emailed = false, kind = 'invite', reason: string | null = null;

    const { error: invErr } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo, data: { full_name, department_id, role },
    });

    if (!invErr) {
      emailed = true;
    } else if (/already.*registered|already exists|email_exists|user_already/i.test(invErr.message)) {
      /* They have an account already, so an invite is the wrong letter — send
         the one that lets them back in instead of reporting a failure. */
      kind = 'reset';
      const pub = createClient(url, anonKey, { auth: { persistSession: false } });
      const { error: resetErr } = await pub.auth.resetPasswordForEmail(email, { redirectTo });
      if (resetErr) reason = resetErr.message; else emailed = true;
    } else {
      reason = invErr.message;
    }

    return json({ invited: true, emailed, kind, email, reason });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
