# Expand CRM

Capacity-aware delivery scheduling for Expand's proposal pipeline.

Live at **[expand.meshnet.co](https://expand.meshnet.co)**. English and Arabic,
RTL throughout, and the whole front end is one self-contained file.

**Public** — no account needed:

| route | what |
|---|---|
| `#/` | landing — the question the tool answers, and today's real load as proof |
| `#/who` | role picker across the seven departments |
| `#/me/:id` | a person's profile: committed load on top, what they're holding up below |
| `#/pipeline` | sales pipeline, priced in design days, plus the lead-list gap |
| `#/estimate` | the delivery estimator |

**Behind sign-in** — reads and writes the live database:

| route | who | what |
|---|---|---|
| `#/signin` | anyone | sign in, or set a password from an invite |
| `#/home` | everyone | the dashboard your department earns |
| `#/new` | project managers | new project: RFP, reference photos, team assignment, estimated delivery |
| `#/leads` | business development | leads with status, follow-ups, call and note history |
| `#/docs` | content creation | Word, PDF and PowerPoint library |
| `#/admin` | admins | invite people, set department and role, activate or disable |

Designers get a queue instead of a project list, and the one write they have —
starting a stage — records the moment work *began*. Asana never captured that,
which is why effort and queue could never be separated from its data. This can.

Its own repo, its own build, its own Vercel project. Nothing here shares a
pipeline with meshnet — deploying one cannot break the other.

---

## The problem

Project managers can't promise a delivery date because they can't see the design
team's workload. The obvious fix — add up "3D 5 days, 2D 2 days, content 3 days"
— is wrong, because those are *effort*, not *lead time*. A team with four
proposals queued does not start the fifth today.

This models the queue. On a realistic pipeline the two answers differ by more
than three weeks, and the bottleneck turns out to be the team with the
*shortest* task, because it has the fewest people.

## Contents

| path | what |
|---|---|
| `engine/scheduler.js` | finite-capacity scheduler, what-if, calibration, backtest |
| `engine/calendar.js` | KSA working calendar — Sun–Thu, Hijri holidays |
| `engine/asana-import.js` | Asana → scheduler, routing on project sections |
| `web/` | estimator UI, Expand brand tokens |
| `public/` | build output, served at expand.meshnet.co |
| `scripts/build.mjs` | bundles `web/app.js` into `public/index.html` |
| `web/views.js` | landing, role picker, profiles, pipeline |
| `web/db.js` | every query — the only module that knows a table name |
| `web/dash.js` | signed-in views; pure functions of (lang, ctx), no fetching |
| `web/controller.js` | every side effect: loading, routing, event wiring |
| `supabase/` | database notes and the row-level-security test |
| `scripts/import-asana.mjs` | Asana dump → SQL |
| `scripts/local-schema.sql` | local Postgres mirror, for checking that SQL first |
| `data/snapshot.js` | the Asana snapshot everything is seeded from |
| `docs/README.md` | how the engine works and what to check before trusting it |
| `docs/ASANA-FINDINGS.md` | what the live Asana data actually says |

```bash
npm install
npm test        # 22 engine tests
npm run build   # regenerate public/index.html

npm i -D playwright && npx playwright install chromium
npm run test:ui # 11 routes, both languages, desktop and mobile
```

The browser test is deliberately not part of `npm test` and playwright is not
a devDependency: Vercel runs `npm install` on every deploy and a browser
download does not belong in that path.

## Deployment

Live at **https://expand.meshnet.co**, from `main`, on Vercel project
`expand`. Root Directory is the repo root; `vercel.json` supplies the rest.

The build needs two environment variables, already set in Vercel:

```
SUPABASE_URL       https://ookiupgocavjbxcxquwl.supabase.co
SUPABASE_ANON_KEY  the anon public key
```

The anon key is public by design — it names the project, row-level security
decides access, and it appears in every browser's network tab regardless. The
`service_role` key is the one that bypasses RLS. `scripts/build.mjs` decodes
every JWT it finds in the bundle and refuses to ship if any of them has a role
other than `anon`, so a mistake there fails the deploy rather than leaking.

The build also refuses to run at all if the two variables are missing, because
a silently unconfigured build looks identical to a working one right up until
somebody tries to sign in.

`public/index.html` is committed with the key already injected, so the site
still works if the build step is ever skipped. `npm run build` regenerates it.

## The data is real, and it is a snapshot

`data/snapshot.js` was read from the live Asana workspace on 8 August 2026.
The names are the people actually assigned the work; the counts are actually
open tasks; the deals are actually on the Sales pipeline board. The capture
date is printed on screen, because a demo that shows stale data while implying
it is live is worse than one that says when it was taken.

That snapshot now only powers the **signed-out** pages — the landing page,
the role picker and the public pipeline view. Everything behind sign-in reads
the live database instead. The two are deliberately separate: a visitor with
no account still sees a truthful picture of the company, and a signed-in user
sees today's.

Two numbers are **derived, never stored**: overdue counts and next-due dates
are computed from `ASSIGNMENTS` at render time. A stored count and a rendered
table drift apart the first time either changes, and a dashboard that
contradicts its own table is worse than one that shows nothing.

## What the data said that the brief did not

- **2D is one person across 34 projects** — 68 working days committed at the
  stated 2 days each. First free slot in November.
- **Pricing approval is a single gate.** One person holds "price review and
  approval" on 17 separate projects, five of them already overdue.
- **Content has nobody assigned at all.** Either the role is vacant or the work
  happens without a record — identical in the data, opposite responses.
- **The lead list stopped.** All 48 open leads are unassigned; the last batch
  was added in October 2025.
- **A fourth stage exists.** Financial, median 13 working days, routinely the
  longest of the four. It was not in the 5/2/3 brief.

## Status

**Built and live.** Postgres schema with row-level security on every table;
email and password sign-in where people set their own password from an emailed
invite; role-routed dashboards; project intake with RFP and reference-photo
upload, team assignment and a delivery date computed at the moment of
assignment; leads with status and follow-ups; a document library; and user
administration.

Everything from Asana is imported — 46 people, 376 projects, 619 stages,
3,624 tasks, 420 leads — and verified by md5 against a local Postgres that ran
the same SQL, not by trusting the importer's own count.

**Not yet built:** WBS generation when a tender is won, the Arabic voice
console, and the knowledge-graph layer.

**Worth knowing:** the bundle is 837 KB, nearly all Supabase client. It is one
self-contained file with no CDN, which is what makes the site impossible to
break from outside — but if first paint on a slow connection starts to matter,
splitting the client out is the first thing to do.

Read `docs/ASANA-FINDINGS.md` before the next phase — the live data shows a
fourth stage (Financial) that was missing from the original brief and is often
the longest of the four.
