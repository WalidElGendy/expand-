/* ==========================================================================
   mail.ts — every email this product sends, in one place.

   It goes out through Resend's HTTP API rather than Supabase's SMTP setting.
   That is not a preference. Supabase's built-in mailer has three templates
   (confirm, invite, recover) and no way to add a fourth, so "your account is
   ready" could never have been one of them. And an SMTP misconfiguration is
   invisible: the server answers `535 Authentication credentials invalid`,
   Supabase reports "Error sending invite email", and Resend's log stays
   empty because the connection never got far enough to be a request. Sending
   over the API means every attempt — including the failures — is a row in
   https://resend.com/logs with a reason attached.

   One secret, `RESEND_API_KEY`, set under Edge Functions → Secrets. It is
   never returned to a caller and never logged.
   ========================================================================== */

const ENDPOINT = 'https://api.resend.com/emails';

// Must be on a domain verified in Resend, or the API rejects the send.
const FROM = Deno.env.get('MAIL_FROM') ?? 'Expand <no-reply@meshnet.co>';
const APP  = Deno.env.get('APP_URL')   ?? 'https://expand.meshnet.co';

export type Sent = { ok: boolean; id?: string; reason?: string };

export async function send(
  to: string, subject: string, html: string, text: string,
): Promise<Sent> {
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) {
    return { ok: false, reason: 'RESEND_API_KEY is not set on this project' };
  }
  try {
    const r = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [to], subject, html, text }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) {
      /* Resend's own words beat a status code. "The meshnet.co domain is not
         verified" is actionable; "422" is not. */
      return { ok: false, reason: body?.message || body?.error?.message || `Resend returned ${r.status}` };
    }
    return { ok: true, id: body?.id };
  } catch (e) {
    return { ok: false, reason: String((e as Error)?.message ?? e) };
  }
}

/* ------------------------------------------------------------- templates */

const esc = (s: string) => String(s ?? '').replace(
  /[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/* Tables and inline styles, because Outlook is still Word underneath and
   drops flexbox, grid and most of <style>. Dark text on white: half of these
   arrive on phones in daylight. */
const layout = (title: string, body: string, cta?: { href: string; label: string }) => `
<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f7;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:32px 12px;">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:14px;border:1px solid #e6e6ee;overflow:hidden;">
    <tr><td style="background:#10041f;padding:18px 26px;">
      <span style="font:700 17px/1.2 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#ffffff;letter-spacing:.2px;">Expand</span>
    </td></tr>
    <tr><td style="padding:28px 26px 8px;">
      <h1 style="margin:0 0 14px;font:700 20px/1.3 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#15121c;">${esc(title)}</h1>
      ${body}
    </td></tr>
    ${cta ? `<tr><td style="padding:6px 26px 28px;">
      <a href="${esc(cta.href)}" style="display:inline-block;background:#915bf5;color:#ffffff;text-decoration:none;font:600 15px/1 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:13px 22px;border-radius:9px;">${esc(cta.label)}</a>
      <p style="margin:16px 0 0;font:400 12px/1.6 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#6b6b7b;word-break:break-all;">${esc(cta.href)}</p>
    </td></tr>` : ''}
    <tr><td style="padding:16px 26px 24px;border-top:1px solid #eeeef4;">
      <p style="margin:0;font:400 12px/1.6 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#8a8a99;">Expand — expand.meshnet.co</p>
    </td></tr>
  </table>
</td></tr></table></body></html>`;

const p  = (s: string) => `<p style="margin:0 0 12px;font:400 15px/1.65 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#3b3b47;">${s}</p>`;
const ar = (s: string) => `<p dir="rtl" style="margin:0 0 12px;font:400 15px/1.75 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#6b6b7b;">${s}</p>`;

const hi = (name?: string | null) => name ? `Hi ${esc(name.split(' ')[0])},` : 'Hi,';

/* Two facts that caused every "the link is broken" report, so they are said
   out loud in every letter rather than assumed.

   A DAY. MAILER_OTP_EXP was 3600 seconds while these emails promised 24
   hours, which is how a working system gets reported as broken. The setting
   is now 86400 — a day — and the wording matches it. It is not "never":
   a link that never dies is a standing key to the app sitting in an inbox,
   and forwarded mail outlives the person it was sent to.

   AND EACH LINK CANCELS THE LAST. Supabase keeps one token per person, so
   asking again — from the invite form, from "First time here?", from the
   People screen — silently kills the earlier email. Three links arrived four
   minutes apart once, and clicking the oldest gave "expired or already used",
   which reads as a bug rather than as arithmetic. */
const ONCE_EN = 'The link works once and lasts a day. Asking for another one cancels it, so always open the newest email — an older link will say it has expired.';
const ONCE_AR = 'الرابط يعمل مرة واحدة وصالح ليوم كامل. طلب رابط جديد يُلغي السابق، لذا افتح دائماً أحدث رسالة — الرابط الأقدم سيقول إنه منتهي.';
const ONCE_TXT = 'The link works once and lasts a day. Asking for another one cancels it, so always open the newest email.';

/* Both languages in one message rather than guessing. The roster is Arabic
   and English speaking and an invitation is the one email that must not be
   unreadable — there is no "resend in my language" button on a sign-in page. */

export const inviteMail = (name: string | null, link: string, dept: string, role: string) => ({
  subject: 'Your Expand account — create your password',
  html: layout('You have been added to Expand', [
    p(hi(name)),
    p(`You have been added to <b>Expand</b> as <b>${esc(role)}</b>${dept ? ` in ${esc(dept)}` : ''}. Choose a password and you are in.`),
    p(`${ONCE_EN} Nobody, including us, can see the password you pick.`),
    p('<b>Finish in one sitting.</b> The link signs you in and asks for a password — until you save one there is no password to sign in with later.'),
    ar(`تمت إضافتك إلى Expand. اضغط الزر لاختيار كلمة المرور الخاصة بك. ${ONCE_AR} أكمل الخطوة في نفس الجلسة: الرابط يسجّل دخولك ويطلب كلمة المرور، وقبل حفظها لا توجد كلمة مرور تدخل بها لاحقاً.`),
  ].join(''), { href: link, label: 'Create your password' }),
  text: `${name ? `Hi ${name.split(' ')[0]},` : 'Hi,'}\n\nYou have been added to Expand as ${role}${dept ? ` in ${dept}` : ''}.\nCreate your password: ${link}\n\n${ONCE_TXT}\nFinish in one sitting: until you save a password there is none to sign in with later.\n\nExpand — ${APP}`,
});

export const resetMail = (name: string | null, link: string, byAdmin: boolean) => ({
  subject: byAdmin ? 'Set a new Expand password' : 'Your Expand password reset link',
  html: layout('Choose a new password', [
    p(hi(name)),
    byAdmin
      ? p('An administrator asked us to send you a fresh link for <b>Expand</b>. Use it to set a new password.')
      : p('Somebody asked for a password reset on your <b>Expand</b> account.'),
    p(`${ONCE_EN} If this was not expected you can ignore it — your current password keeps working until a new one is set.`),
    ar(`اضغط الزر لاختيار كلمة مرور جديدة. ${ONCE_AR} إن لم تطلب ذلك يمكنك تجاهل الرسالة.`),
  ].join(''), { href: link, label: 'Set a new password' }),
  text: `${name ? `Hi ${name.split(' ')[0]},` : 'Hi,'}\n\nSet a new Expand password: ${link}\n\n${ONCE_TXT}\n\nExpand — ${APP}`,
});

export const welcomeMail = (name: string | null, dept: string, role: string) => ({
  subject: 'Your Expand account is ready',
  html: layout('Your account is ready', [
    p(hi(name)),
    p(`Your password is set and your <b>Expand</b> account is active${role ? ` as <b>${esc(role)}</b>` : ''}${dept ? ` in ${esc(dept)}` : ''}.`),
    p('Sign in any time with your email and the password you just chose.'),
    ar('تم إنشاء حسابك بنجاح وأصبح جاهزاً للاستخدام. يمكنك الدخول في أي وقت ببريدك وكلمة المرور التي اخترتها.'),
  ].join(''), { href: APP, label: 'Open Expand' }),
  text: `${name ? `Hi ${name.split(' ')[0]},` : 'Hi,'}\n\nYour Expand account is ready${role ? ` (${role})` : ''}. Sign in at ${APP}\n\nExpand`,
});
