# Expand CRM

Capacity-aware delivery scheduling for Expand's proposal pipeline.

**[`public/index.html`](public/index.html)** — open it in a browser, no install.
English and Arabic, RTL throughout.

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
| `docs/README.md` | how the engine works and what to check before trusting it |
| `docs/ASANA-FINDINGS.md` | what the live Asana data actually says |

```bash
npm install
npm test        # 22 tests
npm run build   # regenerate public/index.html
```

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

## Status

The scheduling engine is built and tested. Not yet built: schema and auth,
RFP intake, WBS generation on tender win, per-role dashboards, the Arabic voice
console, and the knowledge-graph layer.

Read `docs/ASANA-FINDINGS.md` before the next phase — the live data shows a
fourth stage (Financial) that was missing from the original brief and is often
the longest of the four.
