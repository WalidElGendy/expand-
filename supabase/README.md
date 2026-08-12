# The Expand database

Project `ookiupgocavjbxcxquwl` (`expand`), region `ap-south-1` — the closest
Supabase region to Riyadh, about 1,500 km nearer than Frankfurt.

## Applied migrations

| # | what |
|---|---|
| 001 | core schema — departments, profiles, projects, stages, tasks, leads, files |
| 002 | invitations table and the signup trigger |
| 003 | row-level security on every table |
| 004 | private storage buckets: `rfps`, `refs`, `docs` |
| 005 | split "a person" from "a login" so the Asana roster could exist without accounts |
| 006 | let the guard trigger pass for server-side connections, so a first admin can exist |
| 007 | fix ownership checks that compared a profile id to a login id |
| 008 | `profiles.last_seen_at` + `touch_last_seen()` for the People screen |
| 009 | `profiles.welcomed_at`, `profiles.link_sent_at`, `invitations.last_link_at` |
| 010 | `invitations.last_error`, `profiles.last_link_error` — why a link did not go |

Pull them into this repo with `supabase link` + `supabase db pull` when you
want them under version control locally.

## Who is online

"Online now" on the People screen is a Realtime **presence** channel, not a
column. Every signed-in tab joins `app-presence` keyed by profile id; the dot
goes out within seconds of the tab closing, so it cannot claim someone is here
when they are not. Nothing is stored, so there is no stale row to sweep up.

`profiles.last_seen_at` answers the other question — when was this person here
at all — and is written by `touch_last_seen()`, a SECURITY DEFINER function
called on load and every two minutes while the tab is visible. It is a
function rather than a policy on purpose: a policy letting people update their
own profile row would also let them edit their own `role`, which is the exact
escalation the invitations table exists to prevent.

## Two decisions worth knowing

**A person is not a login.** `profiles` is the roster; `profiles.user_id` is
their Supabase account and it is nullable. The 46 people imported from Asana
are real rows with real assigned work and no way to sign in until an admin
invites them. Conflating the two would have meant either inventing credentials
nobody asked for, or throwing away every assignee on import.

**Invitations, not signup metadata.** Role and department come from the
`invitations` table, which only an admin can write, never from what the client
sends at signup. Anything the client can put in metadata, a client can lie
about — that route lets a stranger sign up as an admin. No invitation means
the account is created inactive with the lowest role, so an unexpected signup
produces a useless account rather than an administrator.

## Email

Every account in this product starts with an email: somebody is invited or
asks for a link, they click it, and they choose their own password. Nobody
ever types a password on someone else's behalf — not an admin, not us. That
makes the mail sender a load-bearing part of the login system rather than a
nicety, which is why it is worth the two pages below.

**Authentication → URL Configuration** must point at production. It shipped
pointing at `http://localhost:3000`, which is why the first confirmation links
came back `otp_expired` against a page that did not exist:

- Site URL: `https://expand.meshnet.co`
- Redirect URLs: `https://expand.meshnet.co/**`, `https://expand-liart.vercel.app/**`

### Mail does not go through Supabase's SMTP setting

Supabase mints the links; the edge functions deliver them through **Resend's
HTTP API**. Two reasons, and neither is taste.

Supabase's mailer has exactly three templates — confirm, invite, recover — and
no way to add a fourth, so "your account is ready" could never have been one
of them.

And an SMTP misconfiguration here is invisible. When the stored password was
not a valid Resend key, the server answered `535 Authentication credentials
invalid`, Supabase surfaced "Error sending invite email", and Resend's log
stayed **empty** — the connection never got far enough to be a request, so
there was nothing to look at on either side. Over the API, every attempt,
including every failure, is a row in <https://resend.com/logs> with a reason.

The one secret this needs is `RESEND_API_KEY`, under **Edge Functions →
Secrets**. Optional overrides: `MAIL_FROM` (default
`Expand <no-reply@meshnet.co>`, must be on a domain verified in Resend) and
`APP_URL`. The key does not belong in this repository and is never returned to
a caller or written to a log.

`meshnet.co` is already verified in Resend, so no DNS records are needed.

The SMTP settings page can be left configured or left empty; nothing in this
product depends on it any more. Password sign-in itself sends no mail at all.

### The four functions

All of them share `functions/_shared/http.ts` (CORS, service_role client, and
`whoIsAsking`, which verifies the caller's own token instead of believing a
role posted in the request body) and `functions/_shared/mail.ts` (the Resend
call and every template, in English and Arabic in one message).

| function | JWT | who may call it | what it does |
|---|---|---|---|
| `invite-user` | yes | admin | writes the `invitations` row, then mails an invite — or a recovery link if they already have an account |
| `request-access` | **no** | anyone | "First time here?" and "Forgot your password?" |
| `admin-reset` | yes | admin | the "Send link" button on a People row |
| `account-ready` | yes | the person themselves | "your account is ready", once |

Deploy with `supabase functions deploy <name>`.

**`invite-user`** writes the authorisation row *first*, deliberately not
atomically, so it survives a mail server having a bad day and the person can
still be let in later. Then it mails, and returns whether the mail actually
went. The screen reports all three outcomes separately: invited,
already-had-an-account-so-sent-a-reset, and added-but-not-emailed.

**`request-access`** runs without a JWT, because the person asking has no
account yet. It sends a link to an address with an invitation row (they arrive
active, with the role that row names) or an address already on the roster
(they arrive inactive and appear under "Waiting for approval"). Everyone else
gets nothing. **The reply is identical in all three cases** — telling an
anonymous caller "no such person" turns the box into a way to test whether an
address works here. A two-minute cooldown per address, held in
`profiles.link_sent_at` and `invitations.last_link_at`, stops it being used to
flood an inbox.

Because it cannot tell the caller anything, it writes the outcome next to the
address instead: `invitations.last_error` and `profiles.last_link_error`, null
when the last attempt worked. Without that a failed send left no trace an admin
could reach. The cooldown starts only on success, so a failure no longer blocks
the retry that would have worked.

This replaced a browser-side `signUp()` that took an email *and* a password.
A password typed before the address is proven means whoever types first owns
the address — and in this product an address decides a person's role.

**`admin-reset`** exists because the honest answer to "reset this person's
password" is that nobody can. A password an admin can set is a password an
admin knows, and then "who did this" stops having an answer. The button causes
a link to be sent; the person still chooses.

**`account-ready`** is called by the app after a password is saved, which is
the first moment "your account is ready" is a true sentence — sending it at
invitation time would be a lie for everyone who never clicks.
`profiles.welcomed_at` is stamped *before* the send, so a retry cannot produce
a second welcome. A duplicate is worse than a missing one: the recipient reads
it as something having just happened to their account.

### Who has arrived

The People screen distinguishes "has a login" from "has ever opened the app",
because minting a link creates the auth user immediately — so an admin who has
just invited five people would otherwise see all five as active. A row with a
`user_id` and no `last_seen_at` is *invited, not in yet*.

## Testing

`rls-test.sql` — run it in the SQL editor after any change to policies or
roles. It ends in a deliberate exception so everything it creates is rolled
back. It currently reports 13 checks.
