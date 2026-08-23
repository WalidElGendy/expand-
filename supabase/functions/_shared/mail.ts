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

/* Two facts that caused every "I cannot get in" report, so they are said out
   loud in every letter rather than assumed.

   A DAY. MAILER_OTP_EXP was 3600 seconds while these emails promised 24
   hours, which is how a working system gets reported as broken. The setting
   is now 86400 — a day — and the wording matches it. It is not "never":
   a credential that never dies is a standing key to the app sitting in an
   inbox, and forwarded mail outlives the person it was sent to.

   AND EACH ONE REPLACES THE LAST. Supabase keeps a single token per person,
   so asking again — from the invite form, from "First time here?", from the
   People screen — voids the earlier email. That arithmetic used to be lethal,
   because the credential was a link: somebody who asked for another, waited,
   then opened the mail already in their inbox was opening the link their own
   click had just killed, and the only thing the page could tell them was
   "expired". With a code the same arithmetic is survivable — the newest
   number is visible in the same inbox, and the person never left the sign-in
   page to go looking for it — but it is still stated here, because "use the
   newest email" is the one instruction that always works. */
const ONCE_EN = 'The code works once and lasts a day. Asking for another one replaces it, so always use the newest email.';
const ONCE_AR = 'الرمز يعمل مرة واحدة وصالح ليوم كامل. طلب رمز جديد يُلغي السابق، لذا استخدم دائماً أحدث رسالة.';
const ONCE_TXT = 'The code works once and lasts a day. Asking for another one replaces it, so always use the newest email.';

/* The code, set large and monospaced because it is copied by eye across two
   apps. The one link in this email (codeCta) is a plain navigation URL to the
   sign-in page — it carries NO auth token, so nothing a scanner or previewer
   fetches can spend it. The credential is the number, and a number cannot be
   spent by being fetched: that is why the code never travels as a URL, only as
   digits typed into the page. This was once a one-time auth link, and that is
   what stranded people — anything fetching it (mail scanners, link previewers)
   burned it before the human touched it, and asking for another silently
   voided the one already in the inbox. */
const codeBlock = (code: string) => `
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 16px;">
<tr><td style="background:#f4f2fb;border:1px solid #ded6f6;border-radius:10px;padding:14px 22px;">
  <span style="font:700 30px/1.2 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#15121c;letter-spacing:.28em;">${esc(code)}</span>
</td></tr></table>`;

/* Every code voids the one before it, and under pressure people reach for the
   older email still open in their inbox. Stamping the moment it was sent — and
   saying outright that earlier codes are dead — lets the reader pick the live
   email without guessing which arrived last. Riyadh time, because that is
   where the roster is; the hour is what disambiguates two codes minutes apart. */
const sentStamp = () => new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Riyadh', day: 'numeric', month: 'short',
  hour: '2-digit', minute: '2-digit', hour12: false,
}).format(new Date());
/* A PLAIN link to the code step — not an auth link. It carries no token, so
   nothing a mail scanner or preview fetches can spend it (that is the whole
   reason the code itself never travels as a URL). It only opens the sign-in
   page with the code step ready, where the person types their email and the
   code. It replaces the old "choose Forgot your password?" instruction, which
   was the wrong door for someone an admin is letting in. */
const codeCta = { href: `${APP}/#/code`, label: 'Open Expand and enter your code' };

const stampHtml = (t: string) =>
  `<p style="margin:2px 0 14px;font:600 13px/1.6 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#7a3fe0;">Sent ${esc(t)}, Riyadh time \u2014 any earlier code has stopped working, so use this one.</p>` +
  `<p dir="rtl" style="margin:-8px 0 14px;font:600 13px/1.7 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#7a3fe0;">\u0623\u064f\u0631\u0633\u0650\u0644 ${esc(t)} \u0628\u062a\u0648\u0642\u064a\u062a \u0627\u0644\u0631\u064a\u0627\u0636 \u2014 \u0623\u064a \u0631\u0645\u0632 \u0645\u0646 \u0631\u0633\u0627\u0644\u0629 \u0623\u0633\u0628\u0642 \u0644\u0645 \u064a\u0639\u062f \u0635\u0627\u0644\u062d\u0627\u064b\u060c \u0627\u0633\u062a\u062e\u062f\u0645 \u0647\u0630\u0627 \u0627\u0644\u0631\u0645\u0632.</p>`;

/* Both languages in one message rather than guessing. The roster is Arabic
   and English speaking and an invitation is the one email that must not be
   unreadable — there is no "resend in my language" button on a sign-in page. */

export const inviteMail = (name: string | null, code: string, dept: string, role: string) => {
  const t = sentStamp();
  return {
  subject: `${code} is your Expand sign-in code`,
  html: layout('You have been added to Expand', [
    p(hi(name)),
    p(`You have been added to <b>Expand</b> as <b>${esc(role)}</b>${dept ? ` in ${esc(dept)}` : ''}. Type this code on the sign-in page to get in and choose a password.`),
    codeBlock(code),
    stampHtml(t),
    p(`The button below opens Expand with the code step ready — enter your email and this code, then choose a password. Or go to <a href="${esc(APP)}" style="color:#7a3fe0;">${esc(APP.replace(/^https?:\/\//, ''))}</a> yourself.`),
    p(`${ONCE_EN} Nobody, including us, can see the password you pick.`),
    ar(`تمت إضافتك إلى Expand. افتح الرابط بالأسفل، ثم أدخل بريدك وهذا الرمز واختر كلمة المرور. ${ONCE_AR}`),
  ].join(''), codeCta),
  text: `${name ? `Hi ${name.split(' ')[0]},` : 'Hi,'}\n\nYou have been added to Expand as ${role}${dept ? ` in ${dept}` : ''}.\n\nYour sign-in code: ${code}\nSent ${t}, Riyadh time — any earlier code no longer works.\n\nOpen ${APP}/#/code and enter your email and this code, then choose a password.\n\n${ONCE_TXT}\n\nExpand — ${APP}`,
  };
};

export const resetMail = (name: string | null, code: string, byAdmin: boolean) => {
  const t = sentStamp();
  return {
  subject: `${code} is your Expand sign-in code`,
  html: layout(byAdmin ? 'Activate your Expand account' : 'Your sign-in code', [
    p(hi(name)),
    byAdmin
      ? p('Your access to <b>Expand</b> is ready to activate. Use the code below to sign in and choose your password — no old password needed.')
      : p('Somebody asked for a way back into your <b>Expand</b> account. Use the code below to sign in.'),
    codeBlock(code),
    stampHtml(t),
    p(`The button below opens Expand with the code step ready — enter your email and this code${byAdmin ? ', then choose your password' : ''}. Or go to <a href="${esc(APP)}" style="color:#7a3fe0;">${esc(APP.replace(/^https?:\/\//, ''))}</a> yourself.`),
    p(`${ONCE_EN}${byAdmin ? '' : ' If this was not expected you can ignore it — your current password keeps working until a new one is set.'}`),
    ar(`افتح الرابط بالأسفل، ثم أدخل بريدك وهذا الرمز${byAdmin ? ' واختر كلمة المرور' : ''}. ${ONCE_AR}${byAdmin ? '' : ' إن لم تطلب ذلك يمكنك تجاهل الرسالة.'}`),
  ].join(''), codeCta),
  text: `${name ? `Hi ${name.split(' ')[0]},` : 'Hi,'}\n\nYour Expand sign-in code: ${code}\nSent ${t}, Riyadh time — any earlier code no longer works.\n\nOpen ${APP}/#/code and enter your email and this code to sign in.\n\n${ONCE_TXT}\n\nExpand — ${APP}`,
  };
};

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
