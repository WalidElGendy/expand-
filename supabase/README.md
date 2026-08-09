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

## Testing

`rls-test.sql` — run it in the SQL editor after any change to policies or
roles. It ends in a deliberate exception so everything it creates is rolled
back. It currently reports 13 checks.
