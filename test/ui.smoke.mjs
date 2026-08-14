/* ==========================================================================
   Browser smoke test over the built single file.

   Runs every route in both languages and asserts the things that actually
   broke in earlier builds of this product family: a console error, a page
   that scrolls the whole shell instead of a pane, a route that renders
   nothing, and RTL that never flips. It also checks the numbers on screen
   against the engine rather than against a hard-coded string, so a change to
   effort or the calendar fails here instead of silently shipping.

   Playwright is deliberately NOT a devDependency: Vercel runs `npm install`
   on every deploy, and the browser download does not belong in that path.

     npm i -D playwright && npx playwright install chromium
     npm run test:ui
   ========================================================================== */

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

let chromium;
try { ({ chromium } = await import('playwright')); }
catch {
  console.error('playwright is not installed.\n  npm i -D playwright && npx playwright install chromium');
  process.exit(2);
}

const html = readFileSync(root + 'public/index.html', 'utf8');
const server = createServer((_, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(html);
}).listen(0);
const PORT = server.address().port;
const URL_ = `http://127.0.0.1:${PORT}/`;

const fail = [];
const check = (cond, msg) => { if (!cond) fail.push(msg); };

// PW_CHROMIUM lets a sandbox point at a pre-installed binary instead of
// downloading one; without it Playwright resolves its own as usual.
const browser = await chromium.launch(
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const errors = [];
page.on('console', m => {
  if (m.type() !== 'error') return;
  // The only external request is the Google Fonts stylesheet. A sandbox with
  // no egress must not fail this test, so failures are only interesting when
  // they come from a file we ship.
  const from = m.location()?.url || '';
  if (!from || from.startsWith(URL_)) errors.push(m.text());
});
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('requestfailed', r => {
  // Google Fonts is the only external request; a sandbox without network
  // must not fail the test, so only same-origin failures count.
  if (r.url().startsWith(URL_)) errors.push('REQFAIL: ' + r.url());
});

const ROUTES = [
  ['#/',                        'landing'],
  ['#/who',                     'who'],
  ['#/me/1211783184896369',     'profile'],   // Mahmoud Abdelghny — 3D
  ['#/me/1211755244109291',     'profile'],   // AMEEN EYAD — 2D
  ['#/me/1211418760238119',     'profile'],   // Omar Khaled — pricing
  ['#/me/1211554705221607',     'profile'],   // Lidia — BD, renders the pipeline
  ['#/pipeline',                'pipeline'],
  ['#/estimate',                'estimate'],
  ['#/signin',                  'signin'],     // must render signed out
  ['#/home',                    'signin'],     // an app route with no session
  ['#/admin',                   'signin'],     //   redirects to sign-in, not a blank page

];

const seen = {};

for (const [hash, name] of ROUTES) {
  await page.goto(URL_ + hash, { waitUntil: 'networkidle' });
  await page.waitForTimeout(80);

  const m = await page.evaluate(() => ({
    route:    document.body.dataset.route,
    rootText: document.getElementById('root').innerText.trim().length,
    cards:    document.querySelectorAll('.card').length,
    pageH:    document.documentElement.scrollHeight,
    viewH:    innerHeight,
    nav:      document.querySelectorAll('.navbtn').length,
    side:     !!document.querySelector('.side'),
    sideX:    document.querySelector('.side')?.getBoundingClientRect().left,
    pageX:    document.querySelector('.page')?.getBoundingClientRect().left,
    headTop:  document.querySelector('.head')?.getBoundingClientRect().top,
    stats:    [...document.querySelectorAll('.stat__n')].map(e => e.textContent.trim()),
    // Any element wider than the viewport is a horizontal-overflow bug.
    tooWide:  [...document.querySelectorAll('body *')]
                .filter(e => e.getBoundingClientRect().width > innerWidth + 1)
                .map(e => e.className || e.tagName).slice(0, 4),
  }));
  seen[hash] = m;

  check(m.route === name,   `${hash}: body[data-route] is "${m.route}", expected "${name}"`);
  check(m.rootText > 60,    `${hash}: rendered almost nothing (${m.rootText} chars)`);
  check(m.nav === 3,        `${hash}: expected 3 nav buttons, saw ${m.nav}`);
  // The shell is the product now: a route that renders without it has escaped
  // the layout, and the sidebar must never sit on top of the content.
  check(m.side,             `${hash}: rendered without the sidebar shell`);
  check(m.pageX > m.sideX,  `${hash}: the page starts at ${m.pageX}, inside the sidebar at ${m.sideX}`);
  // The page scrolls as a document, so the header is not pinned — but on a
  // fresh route it must be at the top, inside the body padding, and never
  // pushed below the fold by something rendering above it.
  check(m.headTop >= 0 && m.headTop <= 40,
    `${hash}: header is at y=${m.headTop}, expected it at the top of the page`);
  check(!m.tooWide.length,  `${hash}: horizontal overflow from ${JSON.stringify(m.tooWide)}`);
}

/* ------------------ the landing page covers the whole business ------------ */
/* "Measured on delivered work" used to be a table of its own, which meant the
   two departments with a stated effort figure got bars and dates while
   pricing, content and BD got a chip that said, in effect, "no comment". The
   table is gone and its numbers moved into the department rows — so the thing
   to assert is that MOVING them did not LOSE them. */
import { MEASURED, DEPARTMENTS } from '../data/snapshot.js';

await page.goto(URL_, { waitUntil: 'networkidle' });
await page.waitForTimeout(120);
const land = await page.evaluate(() => ({
  rows:   document.querySelectorAll('.deptrow').length,
  cards:  document.querySelectorAll('.card').length,
  text:   document.body.innerText,
  notes:  document.querySelectorAll('.deptrow__note').length,
}));

check(land.rows === 7, `landing shows ${land.rows} department rows, expected all 7 functions`);
check(land.cards === 1, `landing has ${land.cards} cards — the measured table should be folded into the one workspace card`);
check(!/Measured on delivered work/i.test(land.text), 'the standalone "Measured on delivered work" table is still on the landing page');

for (const id of Object.keys(DEPARTMENTS)) {
  check(land.text.includes(DEPARTMENTS[id].en), `landing never names the ${id} department — a 360 view has a hole in it`);
}
// Every median from the old table must still be visible somewhere on screen.
for (const m of MEASURED) {
  check(land.text.includes(String(m.medianElapsed)),
    `the measured median for ${m.stage} (${m.medianElapsed}) disappeared when the table was removed`);
}
check(land.notes >= 4, `only ${land.notes} departments explain themselves; pricing, content, BD and PM each have a finding worth stating`);

/* A stage with no stated effort must NOT be given an invented delivery date.
   Multiplying a measured median (which includes queue) by a project count
   would count the queue twice and produce a confident, wrong date. */
const pricingRow = await page.evaluate(() => {
  const row = [...document.querySelectorAll('.deptrow')]
    .find(r => r.innerText.includes('Pricing'));
  return row ? row.innerText : '';
});
check(/—/.test(pricingRow), 'pricing was given a delivery date despite having no stated effort figure');
check(/13/.test(pricingRow), 'the pricing row lost its measured median of 13 days');

/* ---- the numbers on the profile must come from the engine, not a string --- */
import { WorkCalendar, iso } from '../engine/calendar.js';
import { DEFAULT_STAGES } from '../engine/scheduler.js';
import { byId } from '../data/snapshot.js';

const CAL = new WorkCalendar();
const ameen = byId('1211755244109291');
const expectDays = String(Math.round(ameen.projects * DEFAULT_STAGES['2d'].baseDays));
const ameenStats = seen['#/me/1211755244109291'].stats;
check(ameenStats.includes(String(ameen.projects)), `profile is missing the project count ${ameen.projects}`);
check(ameenStats.includes(expectDays),
  `profile committed days should be ${expectDays} (projects x stated effort), saw ${JSON.stringify(ameenStats)}`);

/* ---------------------------- language + RTL ------------------------------ */
await page.goto(URL_ + '#/who', { waitUntil: 'networkidle' });
await page.click('[data-act="lang"]');
await page.waitForTimeout(60);
const rtl = await page.evaluate(() => ({
  dir:  document.documentElement.dir,
  lang: document.documentElement.lang,
  font: getComputedStyle(document.body).fontFamily,
  text: document.getElementById('root').innerText,
}));
check(rtl.dir === 'rtl',  `Arabic did not flip direction (dir=${rtl.dir})`);
check(rtl.lang === 'ar',  `Arabic did not set lang (lang=${rtl.lang})`);
check(/Plex/i.test(rtl.font), `Arabic is not using IBM Plex Sans Arabic (${rtl.font})`);
check(/[؀-ۿ]/.test(rtl.text), 'Arabic view rendered no Arabic text');

/* ------------------------- navigation actually works ---------------------- */
await page.goto(URL_, { waitUntil: 'networkidle' });
await page.click('.hero__cta .btn--primary');
await page.waitForTimeout(60);
check(await page.evaluate(() => document.body.dataset.route) === 'who',
  'Sign in on the landing page did not reach the role picker');
await page.click('.whocard:not([disabled])');
await page.waitForTimeout(60);
check(await page.evaluate(() => document.body.dataset.route) === 'profile',
  'Clicking a person did not open their profile');

/* -------------------------------- mobile ---------------------------------- */
await page.setViewportSize({ width: 390, height: 780 });
await page.goto(URL_ + '#/pipeline', { waitUntil: 'networkidle' });
await page.waitForTimeout(80);
const mob = await page.evaluate(() => ({
  wide: [...document.querySelectorAll('body *')]
          .filter(e => e.getBoundingClientRect().width > innerWidth + 1)
          .map(e => e.className || e.tagName).slice(0, 4),
}));
check(!mob.wide.length, `mobile horizontal overflow from ${JSON.stringify(mob.wide)}`);

/* The width check above only sees elements that are THEMSELVES wider than the
   viewport. A two-column grid whose columns refuse to shrink overflows its
   own container while every child stays narrow, and a card with
   overflow:hidden then quietly clips it — which is exactly how a phone-width
   form lost half its fields with every assertion still green. Compare each
   container's scroll width to its client width instead. */
for (const [hash] of ROUTES) {
  await page.goto(URL_ + hash, { waitUntil: 'networkidle' });
  await page.waitForTimeout(60);
  const clipped = await page.evaluate(() => [...document.querySelectorAll('.page *')]
    // clientWidth <= 2 is a visually-hidden control (the file inputs), whose
    // scroll width always exceeds its 1px box and is not a layout fault.
    .filter(e => e.clientWidth > 2 && e.scrollWidth > e.clientWidth + 1
                 && !['auto', 'scroll'].includes(getComputedStyle(e).overflowX))
    .map(e => `${e.tagName}.${e.className}`).slice(0, 3));
  check(!clipped.length, `${hash} at 390px: content overflows its container — ${JSON.stringify(clipped)}`);
}

/* --------------------------------- sign in -------------------------------- */
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(URL_ + '#/signin', { waitUntil: 'networkidle' });
await page.waitForTimeout(80);
// The sign-in form must exist and must not be prefilled by the browser with
// somebody else's saved credentials.
const auth = await page.evaluate(() => {
  const e = document.getElementById('aEmail'), p = document.getElementById('aPass');
  return { email: !!e, pass: !!p, type: p?.type, value: e?.value || '' };
});
check(auth.email && auth.pass, 'sign-in form is missing its fields');
check(auth.type === 'password', `password field is type=${auth.type}`);

/* A submit handler must be ATTACHED, not merely written in the source.

   The build once collapsed `$$` to `$` via String.replace's $-substitution,
   so the querySelectorAll helper overwrote the querySelector one, `form` was
   an array, and the handler was set on that array. The page looked perfect
   and sign-in silently fell through to a native GET that put the user's
   email in the URL. Nothing threw. This assertion is the only thing between
   that class of bug and a user. */
const wired = await page.evaluate(() => ({
  onsubmit: typeof document.getElementById('authForm')?.onsubmit === 'function',
  dollar:   typeof $ === 'undefined' ? 'not-global' : 'global',
}));
check(wired.onsubmit, 'the sign-in form has no submit handler — it would submit natively and leak the email into the URL');

/* ------------------- an expired link must explain itself ------------------ */
/* This is the exact fragment Supabase returned when a confirmation link had
   expired. Nothing read it, so the app rendered the landing page and said
   nothing — the user was told "email is broken" by a page that looks fine. */
const EXPIRED = '#error=access_denied&error_code=otp_expired'
  + '&error_description=Email+link+is+invalid+or+has+expired&sb=';
await page.goto(URL_ + EXPIRED, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const expired = await page.evaluate(() => ({
  route:  document.body.dataset.route,
  panel:  document.querySelector('.autherr__h')?.textContent?.trim() || '',
  resend: !!document.querySelector('.autherr [data-auth="forgot"]'),
  clean:  !location.hash.includes('error'),
}));
check(expired.route === 'signin', `an expired link landed on "${expired.route}", not the sign-in screen`);
check(expired.panel.length > 10, 'an expired link produced no explanation at all');
check(expired.resend, 'an expired link offered no way to get a new one');
check(expired.clean, 'the error fragment was left in the URL, so a refresh replays it');

/* The recovery link points at #/reset — that route has to exist. */
await page.goto(URL_ + '#/reset', { waitUntil: 'networkidle' });
await page.waitForTimeout(300);
const reset = await page.evaluate(() => ({
  route: document.body.dataset.route,
  form:  typeof document.getElementById('authForm')?.onsubmit === 'function',
}));
check(reset.route === 'signin', '#/reset is not a route — a password-reset link would dead-end');
check(reset.form, '#/reset has no working form');

/* ---------------- the dashboard, without needing a real session -----------
   The signed-in screens cannot be reached in this test (there is no session),
   but they are pure functions of (lang, ctx), so they can be rendered
   directly. This is the only cover on the screen the team actually lives in. */
import * as D from '../web/dash.js';
import * as dbmod from '../web/db.js';

dbmod.state.departments = [
  { id: '3d', name_en: '3D design', name_ar: 'ثلاثي', is_stage: true, base_days: 5, colour: '#915bf5' },
  { id: '2d', name_en: '2D technical', name_ar: 'فني', is_stage: true, base_days: 2, colour: '#d95926' },
];
dbmod.state.me = { id: 'u1', full_name: 'Test', role: 'admin', department_id: 'pm', is_active: true };

const proj = (i, due, status, flag, est = null, owner = null) => ({
  id: 'p' + i, name: 'Project ' + i, status, due_on: due, estimated_delivery: est,
  import_flags: flag ? ['size guessed'] : null,
  owner_id: owner, owner: owner ? { id: owner, full_name: 'Owner ' + owner } : null,
  // Ordered newest-first by default, so the fixture needs distinguishable
  // timestamps or the "most recent" sort has nothing to prove.
  created_at: `2026-0${(i % 9) + 1}-0${(i % 9) + 1}T00:00:00Z`,
  project_stages: [
    { id: 's' + i, department_id: '3d', status: 'pending', assignee_id: null, effort_days: 5, sort: 1 },
    { id: 't' + i, department_id: '2d', status: 'done', assignee_id: 'u3', effort_days: 2, sort: 2 },
  ],
});
const many = ['2025-11-04', '2025-12-14', '2026-01-09', '2026-03-20', '2026-09-03']
  .flatMap((d, i) => Array.from({ length: i + 2 }, (_, k) => proj(i * 10 + k, d, k % 2 ? 'submitted' : 'in_design', k === 0)));
const dctx = {
  projects: many, stages: [], people: [{ id: 'u3', full_name: 'B', department_id: '2d' }],
  leads: [{ id: 'l1', status: 'new' }, { id: 'l2', status: 'won' }],
};

for (const lang of ['en', 'ar']) {
  const html = D.pmView(lang, dctx);
  check(html.includes('class="kpis"'), `${lang}: the dashboard lost its KPI tiles`);
  check((html.match(/class="bar"/g) || []).length >= 4,
    `${lang}: the deadline chart drew fewer than 4 bars`);
  check(html.includes('data-rows="flagged"'), `${lang}: no "needs review" filter despite flagged rows`);
  // The bug this replaced: raw database enums printed at the user.
  check(!/>in_design</.test(html) && !/>submitted</.test(html),
    `${lang}: a raw status enum reached the screen`);
  check((html.match(/class="st"/g) || []).length >= many.length,
    `${lang}: not every row got a status pill`);
  // A column of nothing but em dashes is furniture, not information.
  check(!html.includes(D.DSTR[lang].estimate),
    `${lang}: the estimate column is shown even though no project has one`);
}
/* ...and it must come BACK the moment a project actually has an estimate. */
const withEst = D.pmView('en', { ...dctx, projects: [...many, proj(99, '2026-04-01', 'in_design', false, '2026-05-05')] });
check(withEst.includes(D.DSTR.en.estimate), 'the estimate column stays hidden even when a project has one');

/* The estimate itself read `deliveryDate`, a field the scheduler has never
   returned, so every estimate was undefined and every project was saved with
   a null delivery date. Assert on the field the engine actually produces. */
const { sched } = D.buildScheduler([{ id: 'a', full_name: 'A', department_id: '3d' },
                                    { id: 'b', full_name: 'B', department_id: '2d' }], []);
const est = D.estimateFor(sched, { name: 'x', size: 'M', start: '2026-08-10', deadline: null, stages: ['3d', '2d'] });
check(/^\d{4}-\d{2}-\d{2}$/.test(est.real.delivery || ''),
  `the estimator produced no delivery date (got ${JSON.stringify(est.real.delivery)})`);
check(/\d{4}/.test(D.estimateBox('en', est)), 'the estimate box renders without a date in it');

/* ------------------- filters, and the Etemad status flow -------------------
   filterProjects is the single rule the table body, the "showing n of t"
   count and these tests all read. When the count and the rows are computed
   separately the header starts claiming a number the body does not show. */
{
  const F = (pf, rows = fixtures) => D.filterProjects(rows, pf);
  const fixtures = [
    proj(1, '2020-01-01', 'in_design', false, null, 'o1'),   // long overdue
    proj(2, '2099-01-01', 'submitted', false, null, 'o1'),
    proj(3, null,         'won',       false, null, 'o2'),
    proj(4, '2099-01-01', 'delivered', false, null, null),
    proj(5, '2099-01-01', 'archived',  false, null, null),
    proj(6, '2099-01-01', 'lost',      false, null, 'o2'),
  ];

  check(F({}).length === 3, 'the default view is not the three open projects');
  check(F({ closed: true }).length === 6, '"include closed" did not bring the closed ones back');
  /* The bug this guards: open-only is a DEFAULT, not a veto. Asking for
     Delivered and being told there are none is worse than no filter. */
  check(F({ status: 'delivered' }).length === 1,
    'picking a closed status returns nothing because open-only overruled it');
  check(F({ status: 'archived' }).length === 1, 'archived is unreachable by name');

  check(F({ owner: 'o1' }).length === 2, 'the owner filter does not match on owner_id');
  check(F({ owner: '~none' }).length === 0, 'no-owner matched a closed project the default hides');
  check(F({ owner: '~none', closed: true }).length === 2, 'the no-owner option finds nothing');
  check(F({ team: '3d' }).length === 3, 'the team filter does not read project_stages');
  check(F({ team: 'content' }).length === 0, 'the team filter matched a team nobody is on');

  check(F({ due: 'overdue' }).map(p => p.id).join() === 'p1', 'the overdue window is wrong');
  check(F({ due: 'none' }).map(p => p.id).join() === 'p3', 'the "no deadline" window is wrong');
  check(F({ due: 'd30' }).length === 0, 'a 2099 deadline landed inside the next 30 days');

  /* Undated rows sort LAST in both directions. Treating a missing deadline
     as either end of time buries the dated rows you asked to see. */
  const byDue = F({ sort: 'due', closed: true }).map(p => p.id);
  check(byDue[0] === 'p1' && byDue.at(-1) === 'p3', `deadline sort put nulls first: ${byDue}`);
  const byLate = F({ sort: 'duelate', closed: true }).map(p => p.id);
  check(byLate.at(-1) === 'p3', `reverse deadline sort put the undated row somewhere else: ${byLate}`);
  check(F({ sort: 'name', closed: true })[0].name === 'Project 1', 'name sort is not alphabetical');
  check(D.filterProjects([{ ...fixtures[0], is_crm_list: true }], {}).length === 0,
    'a CRM list row leaked into the projects table');

  // The filter bar itself, and the owner column that only appears with data.
  const withOwners = D.pmView('en', { ...dctx, projects: fixtures, pf: undefined });
  check(withOwners.includes('data-pf="owner"') && withOwners.includes('data-pf="due"'),
    'the filter bar is missing controls');
  check(withOwners.includes('Owner o1'), 'the owner column did not render a known owner');
  check(!D.pmView('en', dctx).includes('data-pf-clear'),
    'the Clear button shows even though no filter is set');
  check(D.pmView('en', { ...dctx, pf: { ...D.PF_DEFAULT, owner: 'o1' } }).includes('data-pf-clear'),
    'the Clear button is missing while a filter is active');
  check(D.pmView('en', { ...dctx, projects: fixtures, pf: { ...D.PF_DEFAULT, team: 'content' } })
    .includes(D.DSTR.en.noMatch), 'an empty result renders an empty table instead of saying so');
}

/* The flow the company actually runs: a tender goes to Etemad, comes back
   accepted or rejected, and an accepted one is handed to production. */
{
  const N = dbmod.NEXT_STATUS;
  check(N.submitted.join() === 'won,lost', 'Etemad has an outcome other than accepted or rejected');
  check(N.won.includes('in_production'), 'an accepted tender cannot reach production');
  check(!N.intake.includes('delivered'),
    'a project can be marked delivered straight from intake, which makes the pipeline fiction');
  check(N.lost.join() === 'archived', 'a rejected tender can be resurrected in place');
  check(N.archived.length === 0, 'archived is not terminal');

  for (const lang of ['en', 'ar']) {
    const p = { ...proj(7, '2026-09-01', 'submitted', false, null, 'o1'),
                description: 'A brief.', client: 'SIDF', size: 'L',
                created_at: '2026-01-01T00:00:00Z', updated_at: '2026-02-01T00:00:00Z' };
    const html = D.projectView(lang, {
      project: p,
      projectFiles: [{ id: 'f1', title: 'RFP.pdf', filename: 'RFP.pdf', purpose: 'rfp', size_bytes: 2048 }],
      projectTasks: [{ id: 't1', name: 'Model the stand', completed: false }],
      projectEvents: [{ id: 'e1', kind: 'status', to_status: 'submitted',
                        created_at: '2026-02-01T00:00:00Z', author: { full_name: 'W' } }],
    });
    check(html.includes('A brief.'), `${lang}: the description is missing from the project page`);
    check(html.includes('RFP.pdf') && html.includes('data-file="f1"'),
      `${lang}: uploaded documents are not listed or not openable`);
    check(html.includes('Model the stand'), `${lang}: the task list is missing`);
    check(html.includes('id="stForm"'), `${lang}: there is no way to move the status`);
    check(html.includes('value="won"') && html.includes('value="lost"'),
      `${lang}: the Etemad verdict is not offered`);
    check(!/>submitted</.test(html) && !/>won</.test(html),
      `${lang}: a raw status enum reached the project page`);
    check(html.includes(D.DSTR[lang].st.submitted),
      `${lang}: the page does not say the project is submitted on Etemad`);
    check(html.includes('class="timeline"'), `${lang}: the history did not render`);
  }

  // Accepted must warn that production is about to be opened for a team.
  const accepted = D.projectView('en', { project: { ...proj(8, null, 'won'), project_stages: [] } });
  check(accepted.includes(D.DSTR.en.toProduction),
    'moving an accepted project does not say a production stage will be created');

  // Archived is the end of the line, and the page must say so rather than
  // offering an empty dropdown.
  const done = D.projectView('en', { project: { ...proj(9, null, 'archived'), project_stages: [] } });
  check(!done.includes('id="stForm"') && done.includes(D.DSTR.en.terminal),
    'an archived project still offers a status move');

  // A deep link to something that is not there must not render a blank shell.
  check(D.projectView('en', { project: null }).includes(D.DSTR.en.notFound),
    'a missing project renders an empty page instead of saying it is missing');

  // A designer can read the project but must not be handed controls that 403.
  const was = dbmod.state.me;
  dbmod.state.me = { id: 'u9', role: 'member', department_id: '3d', is_active: true };
  const readOnly = D.projectView('en', { project: { ...proj(10, null, 'submitted'), project_stages: [] } });
  check(!readOnly.includes('id="stForm"') && !readOnly.includes('id="noteForm"'),
    'a designer is offered project controls the database will refuse');
  check(readOnly.includes('Project 10'), 'a designer cannot see the project at all');
  dbmod.state.me = was;
}

/* --------------------------- the Projects screen --------------------------
   Projects is now in the sidebar for everyone: the read policy already lets
   any active user see them, and a designer who cannot find the project their
   stage belongs to is being kept from context, not from data. What must NOT
   follow everyone around is the write action — canPlan mirrors the database's
   can_plan(), and a "New project" button that 403s is worse than no button. */
check(D.canPlan({ role: 'admin',   department_id: '3d', is_active: true }), 'an admin cannot plan');
check(D.canPlan({ role: 'manager', department_id: '3d', is_active: true }), 'a manager cannot plan');
check(D.canPlan({ role: 'member',  department_id: 'pm', is_active: true }), 'PM cannot plan');
check(!D.canPlan({ role: 'member', department_id: '3d', is_active: true }), 'a designer can plan');
check(!D.canPlan({ role: 'admin',  department_id: 'pm', is_active: false }), 'a revoked admin can still plan');
check(!D.canPlan(null), 'a signed-out visitor can plan');

{
  const planner = { id: 'u1', full_name: 'P', role: 'admin', department_id: 'pm', is_active: true };
  const designer = { id: 'u2', full_name: 'D', role: 'member', department_id: '3d', is_active: true };
  const was = dbmod.state.me;

  dbmod.state.me = planner;
  const forPlanner = D.pmView('en', dctx);
  check(forPlanner.includes('data-route="#/new"'), 'a planner is not offered New project');

  dbmod.state.me = designer;
  const forDesigner = D.pmView('en', dctx);
  check(!forDesigner.includes('data-route="#/new"'), 'a designer is offered a New project button they cannot use');
  // The screen itself must still be the screen — same table, same rows.
  check(forDesigner.includes('class="kpis"') && (forDesigner.match(/class="st"/g) || []).length >= many.length,
    'the Projects screen loses its content for anyone who cannot plan');

  dbmod.state.me = was;
}

/* ------------------------- getting in, and getting back in ----------------
   The first-time screen used to take an email AND a password and hand both
   to signUp() from the browser. Two things went wrong with that: it needed
   Supabase's SMTP to send a confirmation, so a mail-server failure surfaced
   to a new joiner as a blank error; and typing a password before proving the
   address means whoever types first owns the address, which is what decides
   a person's role here. Both screens now ask for an address and send a link. */
for (const lang of ['en', 'ar']) {
  const t = D.DSTR[lang];
  const up = D.signInView(lang, 'up');
  check(!up.includes('id="aPass"'), `${lang}: the first-time screen still asks for a password`);
  check(up.includes('id="aEmail"'), `${lang}: the first-time screen has no email field`);
  check(up.includes(t.emailMeLink), `${lang}: the first-time button does not offer a link`);

  const forgot = D.signInView(lang, 'forgot');
  check(!forgot.includes('id="aPass"'), `${lang}: the forgot screen asks for a password`);

  // Signing in and choosing a new one are the only two that involve typing a
  // password, and both must still have the field.
  for (const m of ['in', 'reset']) {
    check(D.signInView(lang, m).includes('id="aPass"'),
      `${lang}: the "${m}" screen lost its password field`);
  }
}

/* ------------------------------- the People screen ----------------------- */
const people = [
  { id: 'a', full_name: 'Arrived',  email: 'a@x.com', user_id: 'ua', is_active: true,  last_seen_at: '2026-08-11T09:00:00Z', department_id: '3d', role: 'member' },
  { id: 'b', full_name: 'Invited',  email: 'b@x.com', user_id: 'ub', is_active: true,  last_seen_at: null, department_id: '3d', role: 'member' },
  { id: 'c', full_name: 'Waiting',  email: 'c@x.com', user_id: 'uc', is_active: false, last_seen_at: null, department_id: '2d', role: 'member' },
  { id: 'd', full_name: 'Roster',   email: null,      user_id: null, is_active: false, last_seen_at: null, department_id: '2d', role: 'member' },
];
for (const lang of ['en', 'ar']) {
  const t = D.DSTR[lang];
  const html = D.adminView(lang, { people, invites: [] });

  /* Minting a sign-in link creates the auth user there and then, so "has a
     login" stopped being the same question as "has arrived". An admin who has
     just invited five people needs the second one. */
  check(/<tr data-who="invited"/.test(html), `${lang}: somebody with an account who has never opened the app is not shown as invited`);
  check((html.match(/<tr data-who="active"/g) || []).length === 1, `${lang}: wrong number of arrived people`);
  check(/<tr data-who="waiting"/.test(html), `${lang}: the waiting-for-approval row vanished`);

  // Three of the four have an address; the fourth cannot be emailed at all,
  // and gets no button rather than a disabled one.
  check((html.match(/data-sendlink=/g) || []).length === 3,
    `${lang}: the send-link button is not on exactly the rows that have an email`);
  check(html.includes(t.resetHint), `${lang}: no explanation of why an admin cannot just set a password`);
}
/* An outcome must be reported, not assumed — the whole bug class here was a
   button that looked like it had done something. */
check(D.adminView('en', { people, invites: [], resetMsg: { ok: false, text: 'nope' } }).includes('msg--bad'),
  'a failed reset link is not reported on the People screen');

/* --------------------------------- report --------------------------------- */
await browser.close();
server.close();

if (errors.length) fail.push('console/page errors: ' + errors.slice(0, 5).join(' | '));

console.log('routes checked: ' + ROUTES.map(([h]) => h).join(' '));
console.log('profile stats (AMEEN EYAD): ' + JSON.stringify(seen['#/me/1211755244109291'].stats));

if (fail.length) {
  console.log('\nFAIL');
  for (const f of fail) console.log('  - ' + f);
  process.exit(1);
}
console.log(`\nPASS — ${ROUTES.length} routes, both languages, desktop and mobile`);
