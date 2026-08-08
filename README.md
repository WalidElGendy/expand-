# Expand CRM

Capacity-aware delivery scheduling for Expand's proposal pipeline.

**[`public/index.html`](public/index.html)** — open it in a browser, no install.
English and Arabic, RTL throughout.

Five screens, all hash-routed inside that one file:

| route | what |
|---|---|
| `#/` | landing — the question the tool answers, and today's real load as proof |
| `#/who` | role picker across the seven departments |
| `#/me/:id` | a person's profile: committed load on top, what they're holding up below |
| `#/pipeline` | sales pipeline, priced in design days, plus the lead-list gap |
| `#/estimate` | the delivery estimator |

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
| `data/snapshot.js` | the Asana snapshot everything is seeded from |
| `docs/README.md` | how the engine works and what to check before trusting it |
| `docs/ASANA-FINDINGS.md` | what the live Asana data actually says |

```bash
npm install
npm test        # 22 engine tests
npm run build   # regenerate public/index.html

npm i -D playwright && npx playwright install chromium
npm run test:ui # 8 routes, both languages, desktop and mobile
```

The browser test is deliberately not part of `npm test` and playwright is not
a devDependency: Vercel runs `npm install` on every deploy and a browser
download does not belong in that path.

## Deploying expand.meshnet.co

1. Vercel → Add New → Project → import `WalidElGendy/expand-`
2. Leave Root Directory at the repo root. `vercel.json` supplies the rest —
   build `npm run build`, output `public`.
3. Settings → Domains → add `expand.meshnet.co`
4. The GoDaddy record already exists: `CNAME` · `expand` ·
   `cname.vercel-dns.com`. If Vercel's domain screen prints a project-specific
   target instead (`*.vercel-dns-016.com` — `ef` and `mo` already use that
   form), replace the value with what it prints.

Until a project claims the hostname, Vercel issues no certificate and the
domain fails at the TLS handshake rather than returning a 404 — which is what
it was doing before this repo existed.

`public/index.html` is committed deliberately, so the site still deploys if the
build step is ever skipped or fails. `npm run build` regenerates it byte for
byte and is what Vercel runs.

## The data is real, and it is a snapshot

`data/snapshot.js` was read from the live Asana workspace on 8 August 2026.
The names are the people actually assigned the work; the counts are actually
open tasks; the deals are actually on the Sales pipeline board. The capture
date is printed on screen, because a demo that shows stale data while implying
it is live is worse than one that says when it was taken.

There is no backend and no auth yet, so the role picker is a picker, not a
login. Replace `data/snapshot.js` with a fetch the day auth exists — its shape
is deliberately the shape an API would return.

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

Built: the scheduling engine, the landing page, the role picker, five role
profiles, and the sales pipeline. Not yet built: schema and auth, RFP intake,
WBS generation on tender win, the Arabic voice console, and the
knowledge-graph layer.

Read `docs/ASANA-FINDINGS.md` before the next phase — the live data shows a
fourth stage (Financial) that was missing from the original brief and is often
the longest of the four.
