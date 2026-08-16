# What your Asana data actually says

Read from the live Asana workspace on 26 July. 100+ projects scanned, six
completed proposals analysed task-by-task.

Written without names. The finding below is about how the work is *shaped* —
that some stages run through one person — and that holds whoever those people
are. This repository is public, so the roster lives in the database behind a
login, not in a markdown file. Business highlights shows the same thing with
current names to whoever is signed in and allowed to plan.

---

## 1. There is a fourth stage, and it is the biggest one

The brief was 3D (5 days), 2D (2 days), content (3 days). Every completed
proposal in Asana runs a **Financial** section too — pricing, price review and
approval, financial offer — and it is routinely the longest stage of the four.

| stage | stated | median actual | min | max |
|---|---|---|---|---|
| 3D Design | 5 | **11.5** | 3 | 37 |
| 2D Design | 2 | **5.5** | 3 | 30 |
| **Financial** | *not in brief* | **13** | 3 | 32 |
| Content | 3 | 25 *(n=1)* | — | — |
| Production | *not in brief* | 4 | 4 | 4 |

*(working days, Sun–Thu, excluding KSA holidays)*

An estimator that models 3D/2D/content and ignores Financial will be wrong on
every proposal, because pricing is frequently what everyone is waiting for.
Production (issue work order → receive FBX → begin installation) is a fifth
stage that appears once a tender is won.

## 2. Do not read 2.3× as "the estimates are wrong"

3D runs 2.3× its stated duration and 2D runs 2.8×. The tempting conclusion is
that the base numbers should be raised. **That would be a mistake, and it would
double-count.**

What I measured is *elapsed* time: task created → task completed. Elapsed
time is effort **plus queue**. The scheduler already models queue separately —
so if the 11.5-day figure were fed in as effort, the engine would add queue on
top of a number that already contains it.

The honest reading is the opposite, and it validates the design: 3D's stated
5 days of effort plus roughly 6.5 days of waiting produces the 11.5 days
observed. That gap is exactly what the tool exists to make visible.

To separate the two properly, Asana needs a "started" signal — a status change,
or a task moved to In Progress. Right now `created_at` records when work was
*queued*, never when it was *begun*, so effort and queue are not separable from
this data alone.

## 3. 3D and 2D each appear to be one person

Across all six projects analysed:

- **one person** — every 3D Design task
- **one person** — every 2D Design task
- **three people** — Financial
- **one person** — price review and approval on every project

If 3D really is one designer, the demo's central finding applies directly to
you: a single-person stage saturates first and sets the delivery date for every
proposal in the pipeline, regardless of how short its task is. Worth confirming
whether these are the only people, or the only people who get *assigned* in
Asana while others do the work unrecorded — those two situations look identical
in the data and call for opposite responses.

## 4. Data problems that block a backtest

**Project `completed_at` is unusable as a delivery date.** Ma'aden's 25th
Anniversary event was due October 2023 and is marked completed September 2025.
Several projects share the exact same completion timestamp — 2025-09-24,
2025-09-28, 2026-04-21 — which is someone bulk-closing stale projects, not
delivery. Task-level timestamps look genuine; project-level ones do not.

**`start_on` is null on roughly 95% of projects.** The importer falls back to
the first task's `created_at`, which is workable but approximate.

**Six of the "projects" are not projects.** Sales pipeline, Sales Leads (70
tasks), World Defense Show Prospects (251 tasks), Potential Clients, Business
Development, Expand Expo's Projects & Ideas. These are CRM lists. Including
them in a capacity model would invent workload that does not exist.

**Asana's teams are personal, not functional.** They are named after
individuals rather than functions, and the same person appears two or three
times over with the possessive spelled differently, so the duplicates are not
even one team each. The seven departments
you described — International Projects, Local Projects, 3D, 2D, Content, Pricing,
Business Development — do not exist as teams. They exist as **sections inside
each project**, which is the better signal and what the importer now reads.

## 5. Sections are the team router

This was the useful discovery. Every proposal uses the same section template:

```
3D Design / 3D تصاميم   →  3d
2D Design / 2D تصميم    →  2d
المحتوى                  →  content
Financial               →  pricing
Production / التنفيذ     →  production
```

Routing on `memberships.section.name` is far more reliable than guessing from
task names, and it works in both languages. The importer has been changed to
use it.

## 6. Revisions are invisible work

Nearly every project carries tasks like `تعديل العرض الفني`, `تعديل العرض
الفني رقم 3`, `تعديلات على التصاميم`, `التعديل النهائي`. One project shows
three separate rounds of technical-offer revision.

Revision loops are not in the estimate at all — not in your 5/2/3 figures and
not yet in the engine. They are a real and recurring cost, and on the evidence
here they are a meaningful share of why 3D takes 11.5 days instead of 5. Worth
modelling explicitly as an expected number of rounds per stage rather than
hiding inside a padded base figure.

---

## What I would do next

1. **Add Financial and Production to the stage model.** Ask the pricing team for
   their own effort figure the way you gave me 5/2/3.
2. **Confirm the headcount per stage.** If 3D really is one person, that is the
   single most valuable number in the system.
3. **Add a "started" marker in Asana** — even just moving a task to an In
   Progress section. Without it, effort and queue can never be separated, and
   the calibration cannot improve beyond what it does today.
4. **Then backtest.** With Financial included, headcount confirmed and start
   signals recorded, the engine can be scored honestly against these same
   projects.

The engine already refuses to over-fit: with six 3D samples it applies a damped
1.7× rather than the raw 2.3×, and with one content sample it applies nothing
and says so.
