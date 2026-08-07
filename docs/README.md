# Expand CRM — delivery scheduling engine

First build of the piece that solves the stated problem: *project managers don't
know the design team's workload, so they can't promise a delivery date.*

Open **`public/index.html`** in a browser. Nothing to install.

---

## The thing this gets right

The obvious implementation of "3D needs 5 days, 2D needs 2, content needs 3" is
to add them, or take the largest, and promise that many days out.

**Both are wrong, and they're wrong in the direction that loses tenders.** Those
numbers describe how long the *work* takes. They say nothing about when the work
can *start* — and a team with four proposals already queued does not begin the
fifth today. That gap is the entire problem.

With your teams as configured (2 × 3D, 2 × 2D, 1 × content) and four live
projects, the demo returns:

| | delivery |
|---|---|
| Naive answer — longest stage, empty team | **13 Aug** |
| What the team can actually do | **6 Sept** |

**Sixteen working days apart.** Eighteen of the twenty-one days are queue, not
work. A PM promising 13 Aug is three weeks wrong before anyone touches a file.

## The counter-intuitive result

You told me all three stages run in parallel. That has a consequence worth
sitting with:

> **The bottleneck is the content team, not 3D.**

3D takes 5 days and content takes 3, so 3D looks like the constraint. But 3D has
two people and content has one — so content saturates first and *sets the
delivery date for every proposal*. The team with the shortest task is the team
holding up the company.

The engine surfaces this automatically. Adding a second content person pulls the
date in by 4 working days; adding a third 3D designer changes nothing.

## What the estimate tells you

Every estimate is returned split into **queue time** and **work time**, because
they are different kinds of prediction. Work time is a claim about a known task.
Queue time is a forecast that *other people's projects* will finish when they
said. A date that is 85% queue is labelled **low confidence** and says so in
words — rather than printing one authoritative number that quietly isn't.

It also answers the PM's next question, "can we do better?", by simulating each
lever rather than guessing: add a person, scope down a band, or defer the
blocking stage. Each option is run on a forked copy of the schedule, so the
saving shown is real.

## Learning over time

`calibrate(history)` compares predicted effort against actual per team and
produces a multiplier. A team that consistently runs 50% over gets stretched
estimates going forward. Two deliberate choices:

- **Median, not mean** — one catastrophic project should not reprice a team.
- **Damped, and ignored below 3 samples** — the tool says "not enough data yet"
  instead of over-reacting to two projects.

## Before you trust it with a client

`backtest(projects, factory)` replays closed projects through the engine and
scores predictions against what really happened — mean absolute error, bias
(is it optimistic?), and a plain verdict:

```
MAE ≤ 2 days   usable for client commitments
MAE ≤ 5 days   usable internally, add buffer before promising a client
otherwise      not yet trustworthy — check headcount and size bands first
```

**Give me 15–20 delivered projects** (name, size, start date, actual delivery)
and I'll run this properly. Until then the size multipliers below are guesses,
and guesses dressed as software are worse than guesses.

---

## Assumptions you should check

| Assumption | Current value | Why it matters |
|---|---|---|
| Working week | Sun–Thu, Fri/Sat weekend | Wrong here and every date drifts ~40% |
| Holidays | 2026 KSA, Eid dates approximate | Eid moves by moon sighting — confirm before each year |
| Size bands | S 0.6 · M 1.0 · L 1.8 · XL 2.6 | Pure guesswork until backtested |
| Focus factor | 1.0 | If "5 days" is pure hands-on time excluding meetings, set ~0.8 |
| Base effort | 3D 5 · 2D 2 · content 3 | Your figures, at Medium |

## Files

```
engine/calendar.js    KSA working calendar — weekends, holidays, date maths
engine/scheduler.js   finite-capacity scheduler, what-if, calibration, backtest
engine/asana-import.js  Asana -> scheduler, routing on project sections
web/app.js            the estimator UI (English / Arabic, RTL)
web/index.html        shell + Expand brand tokens
public/index.html     built single file — open this
test/scheduler.test.mjs  17 tests, including the naive-vs-real proof
test/asana.test.mjs      5 tests over the Asana importer
```

```bash
npm test                         # engine tests
npm run build                    # regenerate public/index.html
```

## Brand

From Brand Guidelines 2025 v1 §4.5 and §5.6–5.8:

- Purple Heart `#915bf5`, Midnight Purple `#5230bf`, black, Selago `#e8d9fa`
- Latin: Helvetica Now Display, falling back to Arial per §5.5
- Arabic: **IBM Plex Sans Arabic** — on Google Fonts, so the Arabic interface is
  properly typeset rather than a fallback
- The header's vertical rules echo the Lines System (§7.0)

Team colours are a validated categorical set, brand purple in slot 1:

```
validate_palette.js "#915bf5,#d95926,#199e70,#c98500" --mode dark --surface "#101014"
→ ALL CHECKS PASS
```

Purple alone couldn't carry three teams — a single-hue ramp used as a
categorical scale isn't colourblind-safe. The brand hue leads; two validated
hues support it.

---

## What comes next

This engine is the foundation the rest sits on. In dependency order:

1. **Schema + auth** — teams, members, roles (member → lead → manager), the seven
   departments, projects, RFP uploads.
2. **Intake** — PM uploads RFP, sets size, assigns; estimate is computed here.
3. **Won → project** — WBS and task checklist generated from the proposal.
4. **Dashboards** — per person, per team lead, per manager.
5. **Voice + Arabic management console** — natural-language questions over the
   schedule ("كم مشروع مع أحمد؟"). This is the easy part *once* the data model is
   right, and impossible before.
6. **Knowledge graph** — the Obsidian-style layer linking projects, people,
   clients and decisions, surfacing gaps and repeated failures.

**A note on the Asana migration.** You want to replace it entirely, which is the
right call — two systems means neither is trusted. But the CRM has to be
demonstrably better at the one thing Asana can't do (this estimate) before the
team will move. Ship this, let PMs use it against real projects for a few weeks,
*then* migrate.
