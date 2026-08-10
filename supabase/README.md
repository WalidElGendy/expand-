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

Pull them into this repo with `supabase link` + `supabase db pull` when you
want them under version control locally.

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

Every account in this product starts with an email: an admin invites someone,
Supabase sends them a link, and they choose their own password. Nobody ever
types a password on someone else's behalf. That makes the mail sender a
load-bearing part of the login system rather than a nicety.

**Authentication → URL Configuration** must point at production. It shipped
pointing at `http://localhost:3000`, which is why the first confirmation links
came back `otp_expired` against a page that did not exist:

- Site URL: `https://expand.meshnet.co`
- Redirect URLs: `https://expand.meshnet.co/**`, `https://expand-liart.vercel.app/**`

**The built-in sender is capped at 2 emails per hour.** It is meant for
kicking the tyres on a new project, not for onboarding a team, and the cap is
per project, not per recipient. Two invitations and the third person waits an
hour with no error anyone can see. Custom SMTP is not optional here.

### Resend

Under **Authentication → Emails → SMTP Settings**, with a verified sending
domain in Resend:

| field | value |
|---|---|
| host | `smtp.resend.com` |
| port | `465` |
| username | `resend` |
| password | the Resend API key |
| sender email | `no-reply@send.meshnet.co` (must be on the verified domain) |
| sender name | Expand |

Then raise the rate limit under **Auth → Rate Limits**; it stays at the
built-in default until it is changed, so a working SMTP server still delivers
two emails an hour.

Verifying the domain means adding the MX and TXT records Resend generates to
`meshnet.co` in GoDaddy. The DKIM value is unique per domain, so it cannot be
written down in advance here. Until a domain is verified, Resend will only
deliver to the address that owns the Resend account — enough to prove the
plumbing works, not enough to invite anyone.

The API key is a secret and does not belong in this repository. It is typed
once into the Supabase dashboard by whoever owns the Resend account.

## Testing

`rls-test.sql` — run it in the SQL editor after any change to policies or
roles. It ends in a deliberate exception so everything it creates is rolled
back. It currently reports 13 checks.
