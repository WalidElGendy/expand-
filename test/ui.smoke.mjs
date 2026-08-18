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

/* Every one of these used to be a PUBLIC screen. `#/who` listed the roster
   with departments and task counts, `#/me/<asana id>` was a person's profile,
   `#/pipeline` was the deal list, and `#/` printed a department summary — all
   of it drawn from a file compiled into this bundle, all of it readable by
   anyone who had the URL and no password at all.

   The file is gone and so are the routes. What is asserted now is the
   replacement rule, in the user's own words: a stranger sees a sign-in page
   and nothing else. So EVERY route in this list, including the ones that no
   longer exist, must resolve to `signin` while there is no session. */
const ROUTES = [
  ['#/',                        'signin'],
  ['#/who',                     'signin'],   // was the roster
  ['#/me/1200000000000000',     'signin'],   // was a named person's profile
  ['#/pipeline',                'signin'],   // was the deal list
  ['#/estimate',                'signin'],
  ['#/highlights',              'signin'],
  ['#/projects',                'signin'],
  ['#/leads',                   'signin'],
  ['#/signin',                  'signin'],
  ['#/home',                    'signin'],
  ['#/admin',                   'signin'],
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
  /* Signed out there is nothing to navigate to. A rail of links that all
     bounce back to this same form is furniture that implies a product the
     visitor cannot have. */
  check(m.nav === 0,        `${hash}: signed out, expected an empty nav, saw ${m.nav} buttons`);
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

/* ===================================================================== leak
   THE ASSERTION THIS WHOLE CHANGE EXISTS FOR.

   The landing card was not merely showing data to signed-out visitors — the
   data was IN THE FILE. `data/snapshot.js` shipped twelve people's names,
   their work email addresses, their open task counts and the Asana workspace
   id, and esbuild inlined all of it into public/index.html. Hiding the card
   would have left every byte of that a Ctrl-U away.

   So this test reads the built artefact, not the screen. A future commit that
   re-adds a roster constant "just for a chart" fails here, before it is
   deployed, and it fails whether or not anything renders it.

   ONE RULE THIS TEST HAD TO LEARN ABOUT ITSELF: it used to hold a hardcoded
   list of the twelve names, so the guard against publishing the roster
   published the roster — in a public repository, in the file whose job was to
   stop exactly that. Nothing here names a colleague any more.

   Patterns instead of a list, which is also strictly stronger: it catches the
   name nobody thought to add. Where a pattern cannot work — a person's name
   has no shape — the needles come from LEAK_NEEDLES in the environment, so a
   maintainer can run the strict version locally without committing the list.

   esbuild escapes non-ASCII, so Arabic in the bundle appears as \uXXXX; every
   pattern below is ASCII and survives that.                               */
const bundle = html;

/* Asana ids are 16-digit numbers. Nothing this product legitimately ships has
   one: no version, no timestamp and no colour is 16 digits long.

   All-identical runs are excluded, and that is a narrowing rather than a
   loophole: the vendored Supabase client carries OpenTelemetry's all-zero
   trace-id sentinel, which is a mask standing in for the absence of an id. A
   real gid is never sixteen of the same digit. */
const asanaIds = [...new Set(bundle.match(/\b\d{16}\b/g) || [])]
  .filter(n => !/^(\d)\1{15}$/.test(n));
check(!asanaIds.length,
  `the shipped bundle contains Asana-style ids ${JSON.stringify(asanaIds.slice(0, 4))} — those identify the workspace and the people in it`);

/* Whatever the maintainer wants checked by name, supplied at run time and
   never written down here. Absent, the patterns above and below still run. */
for (const needle of (process.env.LEAK_NEEDLES || '').split(',').map(s => s.trim()).filter(Boolean)) {
  check(!bundle.includes(needle),
    `the shipped bundle contains a LEAK_NEEDLES entry — anybody with the URL can read it without signing in`);
}

/* Addresses, by shape rather than by list, so a name I have not thought of is
   caught too. Two allowances, both narrow:

   - a PLACEHOLDER local part. The sign-in and invite forms print
     "you@expandexpo.com" and "name@expandexpo.com", which name nobody. The
     domain is the company's and is on its own letterhead; the person is the
     private part, and there is no person here.
   - a PLACEHOLDER domain. The vendored Supabase client carries JSDoc
     examples ("example@email.com"), which are documentation, not roster. */
const PLACEHOLDER_USER = /^(you|name|email|user|someone|no-reply|noreply|support|admin)$/i;
const PLACEHOLDER_HOST = /^(email\.com|example\.(com|org|net)|test\.[a-z]+|localhost|sentry\.io|w3\.org|schema\.org|domain\.com)$/i;
const addrs = [...new Set(bundle.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || [])]
  .filter(a => {
    const [user, host] = a.split('@');
    return !PLACEHOLDER_USER.test(user) && !PLACEHOLDER_HOST.test(host) && !host.endsWith('.invalid');
  });
check(!addrs.length,
  `the shipped bundle contains real email addresses: ${JSON.stringify(addrs.slice(0, 5))}`);

/* Belt and braces on the domains that are actually ours: on expandexpo.com and
   meshnet.co a local part is a colleague, so the allowlist above is the only
   thing standing between a new placeholder and a real inbox — this says so
   explicitly rather than relying on a regex written for the general case. */
const ours = [...new Set(bundle.match(/[A-Za-z0-9._%+-]+@(expandexpo\.com|meshnet\.co)/g) || [])]
  .filter(a => !PLACEHOLDER_USER.test(a.split('@')[0]));
check(!ours.length, `the shipped bundle names colleagues: ${JSON.stringify(ours)}`);

/* And the modules themselves must be gone, not merely unreferenced — an
   unimported file is one `import` away from being public again. */
import { existsSync } from 'node:fs';
check(!existsSync(root + 'data/snapshot.js'), 'data/snapshot.js is still in the repository');
check(!existsSync(root + 'web/views.js'),     'web/views.js is still in the repository');

/* ---------------------------- language + RTL ------------------------------ */
await page.goto(URL_ + '#/signin', { waitUntil: 'networkidle' });
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
check(/[\u0600-\u06ff]/.test(rtl.text), 'Arabic view rendered no Arabic text');

/* -------------------------------- mobile ---------------------------------- */
await page.setViewportSize({ width: 390, height: 780 });
await page.goto(URL_ + '#/signin', { waitUntil: 'networkidle' });
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
  { id: '3d', name_en: '3D design', name_ar: 'ثلاثي', is_stage: true, days_s: 2, days_m: 3, days_l: 5, colour: '#915bf5' },
  { id: '2d', name_en: '2D technical', name_ar: 'فني', is_stage: true, days_s: 1, days_m: 2, days_l: 3, colour: '#d95926' },
  { id: 'content', name_en: 'Content creation', name_ar: 'المحتوى', is_stage: true, days_s: 1, days_m: 2, days_l: 3, colour: '#199e70' },
  /* Priced by nobody, on purpose: pricing is frequently what everyone is
     waiting for, and a guessed figure there is the most misleading number the
     screen could carry. It must not claim capacity or appear in the picker. */
  { id: 'pricing', name_en: 'Pricing', name_ar: 'التسعير', is_stage: true, days_s: null, days_m: null, days_l: null, colour: '#c98500' },
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

/* ================================================ the effort table and parallelism

   The complaint this replaced: "projects take 18 and 19 days, why?" Three
   separate answers, and only one of them was a bug in the arithmetic.       */

/* 1. THE STAGES RUN TOGETHER. Every stage starts on the day of submission and
      delivery is the longest one, never the sum. With an idle roster a medium
      project is 3 working days because 3D is 3 — not 3+2+2. */
{
  const roster = [{ id: 'a', full_name: 'A', department_id: '3d' },
                  { id: 'b', full_name: 'B', department_id: '2d' },
                  { id: 'c', full_name: 'C', department_id: 'content' }];
  const { sched, depth } = D.buildScheduler(roster, []);
  const all = ['3d', '2d', 'content'];
  const days = {};
  for (const size of ['S', 'M', 'L']) {
    const e = D.estimateFor(sched, { name: 'x', size, start: '2026-08-17', deadline: null, stages: all }, depth);
    days[size] = e.naive.leadWorkingDays;
    const per = Object.fromEntries(e.naive.stages.map(x => [x.stage, x.effortDays]));
    check(per['3d'] === { S: 2, M: 3, L: 5 }[size], `${size}: 3D should be ${{ S: 2, M: 3, L: 5 }[size]} days, got ${per['3d']}`);
    check(per['2d'] === { S: 1, M: 2, L: 3 }[size], `${size}: 2D should be ${{ S: 1, M: 2, L: 3 }[size]} days, got ${per['2d']}`);
    check(per['content'] === { S: 1, M: 2, L: 3 }[size], `${size}: content should be ${{ S: 1, M: 2, L: 3 }[size]} days, got ${per['content']}`);
  }
  check(days.S === 2 && days.M === 3 && days.L === 5,
    `an idle roster should deliver in the longest stage — 2/3/5 working days — got ${JSON.stringify(days)}`);
}

/* 2. CONTENT AND 2D COST THE SAME DAYS AND SPEND THEM AT ONCE. Two days of
      content and two days of 2D on a medium project is two days elapsed, not
      four. This is the specific thing that was misread as sequential. */
{
  const roster = [{ id: 'b', full_name: 'B', department_id: '2d' },
                  { id: 'c', full_name: 'C', department_id: 'content' }];
  const { sched, depth } = D.buildScheduler(roster, []);
  const e = D.estimateFor(sched, { name: 'x', size: 'M', start: '2026-08-17', deadline: null, stages: ['2d', 'content'] }, depth);
  check(e.naive.leadWorkingDays === 2,
    `2D and content are 2 days each, run together — expected 2 elapsed working days, got ${e.naive.leadWorkingDays}`);
  check(e.naive.totalEffortDays === 4,
    `the work is still 4 person-days; only the elapsed time overlaps (got ${e.naive.totalEffortDays})`);
}

/* 3. AN UNPRICED STAGE CLAIMS NOTHING. pricing has no day figures, so it is
      absent from the table, invisible to the size picker, and cannot silently
      contribute a guessed number to anybody's delivery date. */
{
  const table = D.stageTable(dbmod.state.departments);
  check(!table.pricing, 'pricing has no stated effort and must not be priced');
  check(Object.keys(table).sort().join() === '2d,3d,content',
    `the priced stages should be exactly 2d/3d/content, got ${Object.keys(table)}`);
}

/* 4. THE SIZE PICKER PRINTS DAYS, NOT MULTIPLIERS. It used to say "×2.6",
      which a project manager cannot check against anything. */
for (const lang of ['en', 'ar']) {
  const html = D.sizeOptionsHtml(lang, 'M');
  check(!html.includes('×') && !html.includes('x2.6'), `${lang}: the size picker still shows a multiplier`);
  check(!/value="XL"/.test(html), `${lang}: XL was retired and must not be offered`);
  check((html.match(/<option/g) || []).length === 3, `${lang}: expected exactly three sizes`);
  check(html.includes('1') && html.includes('5'), `${lang}: the picker does not show the day range`);
}

/* 5. THE QUEUE IS EXPLAINED, NOT JUST APPLIED. A date that is mostly waiting
      has to say whose backlog is causing it, or it is unarguable and useless. */
{
  const roster = [{ id: 'a', full_name: 'A', department_id: '3d' }];
  const busy = [];
  for (let i = 0; i < 20; i++) busy.push({ project_id: 'p' + i, department_id: '3d', planned_start: null, status: 'pending' });
  const projects = busy.map(b => ({ id: b.project_id, size: 'M' }));
  const { sched, depth } = D.buildScheduler(roster, busy, projects);
  check(depth['3d'].stages === 20 && depth['3d'].people === 1 && depth['3d'].workingDays === 60,
    `20 medium 3D stages on one person is 60 working days deep, got ${JSON.stringify(depth['3d'])}`);
  const e = D.estimateFor(sched, { name: 'x', size: 'M', start: '2026-08-17', deadline: null, stages: ['3d'] }, depth);
  check(e.real.delivery > e.naive.delivery, 'a loaded team must push the date out past the work-only date');
  const box = D.estimateBox('en', e);
  check(box.includes('60') && /working days deep/.test(box),
    'the estimate box does not say whose backlog is causing the wait');
}

/* 6. THE WORKLOAD CALENDAR. "When can I submit the next one" is a different
      question from "when does this one land", and the answer has to come off
      the same ledger as the estimate or the two will disagree by next week. */
{
  /* Six months of month windows, walked from a date late in a month so the
     partial-first-month rule is actually exercised. */
  const w0 = D.capacityMonth('2026-08-28', 0);
  const w5 = D.capacityMonth('2026-08-28', 5);
  check(w0.key === '2026-08' && w0.first === '2026-08-01' && w0.last === '2026-08-31',
    `August is 1–31, got ${JSON.stringify(w0)}`);
  check(w5.key === '2027-01' && w5.last === '2027-01-31',
    `five months past August is January of the next year, got ${JSON.stringify(w5)}`);
  check(D.capacityMonthLabel('2027-01', 'en').includes('27'),
    'a month label that crosses the year must carry the year, or Jan and Dec are ambiguous');

  const stages = D.stageTable(dbmod.state.departments);

  /* An idle team: nothing booked, so every month is free and the first free
     month is this one. The trap here is counting days already gone. */
  {
    const { sched } = D.buildScheduler(
      [{ id: 'a', full_name: 'A', department_id: '3d' }], [], []);
    const load = D.monthlyLoad(sched, 6, '2026-08-28');
    check(load.length === 6, `expected six months, got ${load.length}`);
    check(load[0].partial && load[0].from === '2026-08-28',
      'the current month must start today, not on the 1st — days already gone are not free slots');
    check(load[0].teams['3d'].capacity < load[1].teams['3d'].capacity,
      'the stub of this month cannot hold as many days as a whole month');
    check(load[1].teams['3d'].free === load[1].teams['3d'].capacity,
      'an idle team must show every day of the month free');
    /* September 2026 contains National Day. If the calendar is being applied
       the month is short by exactly that one day. */
    const sep = load.find(m => m.key === '2026-09');
    check(sep && sep.teams['3d'].capacity === 21,
      `September has a national day in it — expected 21 working days, got ${sep?.teams['3d'].capacity}`);
    /* Two working days are left in August (the 30th and 31st — the 28th is a
       Friday and the weekend here is Friday–Saturday), and a Medium 3D stage
       needs three. So the honest answer is September, not "start now". A
       partial month must never claim a slot it cannot actually hold. */
    check(load[0].teams['3d'].capacity === 2,
      `only the 30th and 31st are left of August, got ${load[0].teams['3d'].capacity}`);
    const free = D.firstFreeMonth(load, { '3d': stages['3d'] }, 'M');
    check(free.all === '2026-09',
      `two days left in August cannot hold a three-day stage, got ${free.all}`);
    /* And with the other two teams in scope, the answer is not "we are busy"
       — it is "nobody is on them", which is a different problem with a
       different fix. Collapsing the two is how an empty team stays empty. */
    const allThree = D.firstFreeMonth(load, stages, 'M');
    check(allThree.staffless.includes('2d') && allThree.staffless.includes('content'),
      `teams with nobody on them must be named, got ${JSON.stringify(allThree.staffless)}`);
    check(allThree.all === null, 'a team nobody is on cannot report a free month');
  }

  /* A team buried under a year of work: no month has room, and the screen has
     to say so rather than pointing at an arbitrary month. */
  {
    const roster = [{ id: 'a', full_name: 'A', department_id: '3d' }];
    const busy = [], projects = [];
    for (let i = 0; i < 60; i++) {
      busy.push({ project_id: 'q' + i, department_id: '3d', planned_start: null, status: 'pending' });
      projects.push({ id: 'q' + i, size: 'L' });
    }
    const { sched } = D.buildScheduler(roster, busy, projects);
    /* No fixed start date here, and the assertion is about the first WHOLE
       month rather than this one. buildScheduler books committed work from
       the real today(), so pinning the window to a hard-coded date makes the
       test pass until the clock rolls past it and then fail at 9am for a
       reason that has nothing to do with the code. The stub of the current
       month is also a poor subject: it can hold one leftover day and read as
       "not quite full" while the team is buried for half a year. */
    const load = D.monthlyLoad(sched, 6);
    const whole = load.find(m => !m.partial);
    check(whole && whole.teams['3d'].free === 0 && whole.teams['3d'].pct >= 100,
      `300 person-days on one person leaves a whole month full, got ${JSON.stringify(whole?.teams['3d'])}`);
    const free = D.firstFreeMonth(load, { '3d': stages['3d'] }, 'M');
    check(free.all === null, `nothing fits in six months, so there is no answer month; got ${free.all}`);
    const html = D.workloadCalendar('en', load, { '3d': stages['3d'] }, 'M');
    check(html.includes(D.DSTR.en.wcTitle), 'the calendar lost its own title');
    check(/wc__c--full/.test(html), 'a month with nothing left is not marked as full');
    check(html.includes('No month in the next 6'),
      'the calendar does not say that no month has room — it must not stay silent');
    check(!html.includes('undefined') && !html.includes('NaN'),
      'the workload calendar rendered "undefined" or "NaN"');
  }

  /* The middle state is the one worth having: room, but not a whole stage of
     it. Someone who sees "3 free" and submits a Large is the reason it exists. */
  {
    const roster = [{ id: 'a', full_name: 'A', department_id: '3d' }];
    const load = [{
      key: '2026-09', from: '2026-09-01', to: '2026-09-30', partial: false,
      teams: { '3d': { capacity: 21, committed: 18, free: 3, pct: 86, headcount: 1 } },
    }];
    const html = D.workloadCalendar('en', load, { '3d': stages['3d'] }, 'L');
    check(/wc__c--tight/.test(html),
      'three free days against a five-day stage is tight, not free — it must not read as room');
    check(html.includes('>3<'), 'the cell does not print the free-day count');
    /* Colour must not be the only carrier: the number and a text alternative
       have to be in the markup for print, forced colours and screen readers. */
    check(/class="sr"/.test(html), 'the cell has no text alternative behind the colour');
  }

  /* Both languages render, and Arabic is not quietly falling back to English. */
  for (const lang of ['en', 'ar']) {
    const { sched } = D.buildScheduler([{ id: 'a', full_name: 'A', department_id: '2d' }], [], []);
    const load = D.monthlyLoad(sched, 6, '2026-08-17');
    const html = D.workloadCalendar(lang, load, stages, 'M');
    check(html.includes(D.DSTR[lang].wcTitle), `${lang}: the calendar title is missing`);
    check(!html.includes('undefined') && !html.includes('NaN'), `${lang}: the calendar rendered a hole`);
    if (lang === 'ar') check(!html.includes('Workload calendar'), 'the Arabic calendar fell back to English');
  }

  /* A team with nobody in it must say so. Content had zero active people for
     most of this year, and a blank cell there reads as "wide open". */
  {
    const { sched } = D.buildScheduler([{ id: 'a', full_name: 'A', department_id: '3d' }], [], []);
    const load = D.monthlyLoad(sched, 3, '2026-08-17');
    const html = D.workloadCalendar('en', load, stages, 'M');
    check(html.includes(D.DSTR.en.wcNoPeople),
      'a team with no people must say so — an empty cell there reads as free capacity');
    check(/Nobody is on/.test(html) && /2D technical/.test(html) && /Content creation/.test(html),
      'the answer line must name the teams nobody is on, not just report "no room"');
    /* One empty team makes the headline read "never". The months that ARE
       free are the thing you plan around, so they have to survive it. */
    check(html.includes(D.DSTR.en.wcPerTeam.split('{')[0].trim()),
      'the per-team line is missing — one empty team must not hide the free months');
    check(/3D design — /.test(html), 'the per-team line does not give 3D a month');
    /* The row itself has to survive too. Enumerating people instead of teams
       silently drops the empty team, and an absent row reads as "fine". */
    check((html.match(/class="wc__team"/g) || []).length === 3,
      'a team with nobody on it dropped out of the calendar entirely');
  }
}

/* ------------------- filters, and the Etemad status flow -------------------
   filterProjects is the single rule the table body, the "showing n of t"
   count and these tests all read. When the count and the rows are computed
   separately the header starts claiming a number the body does not show. */
{
  const F = (pf, rows = fixtures) => D.filterProjects(rows, pf);
  /* Fixture owners, not colleagues. This file is in a public repository, and
     a chart fixture is no reason to publish who works here. */
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

/* ----------------------- the two volume charts ----------------------------
   The trap these guard: `due_on` is set on 95 of 369 projects and `created_at`
   is the import date on all of them. A "projects per month" chart built on
   either would look complete and describe something else entirely. Both charts
   count by `start_on`, which every project has, and share one month window so
   a spike on the left can be traced to a row on the right. */
{
  const mk = (mo, owner, n) => Array.from({ length: n }, (_, i) => ({
    id: `${mo}-${owner}-${i}`, name: 'P', status: 'in_design', start_on: `${mo}-05`,
    due_on: null, owner_id: owner, owner: owner ? { id: owner, full_name: owner } : null,
    project_stages: [], created_at: '2026-08-01T00:00:00Z',
  }));
  /* Fixture owners, not colleagues. This file is in a public repository, and
     a chart fixture is no reason to publish who works here. */
  const fixtures = [
    ...mk('2026-01', 'Owner One', 9), ...mk('2026-01', 'Owner Two', 2), ...mk('2026-01', null, 1),
    ...mk('2026-02', 'Owner One', 1), ...mk('2026-02', 'Owner Two', 4),
    ...mk('2026-03', 'Owner One', 13), ...mk('2026-03', 'Owner Three', 1),
  ];
  const months = D.monthWindow(fixtures);
  check(months.join() === '2026-01,2026-02,2026-03', `the month window is wrong: ${months}`);

  // A month with no work must stay in the axis as a gap, not be closed up.
  const gapped = [...mk('2026-01', 'A', 1), ...mk('2026-04', 'A', 1)];
  check(D.monthWindow(gapped).join() === '2026-01,2026-02,2026-03,2026-04',
    'an idle month was closed up instead of drawn as a gap');
  check(D.monthWindow([{ start_on: null }]).length === 0, 'a project without a start date broke the window');

  const bar = D.monthlyProjectsChart('en', fixtures, months);
  const heat = D.managerMonthChart('en', fixtures, months);

  /* Read the value labels the way the browser paints them — by the class on the
     <text>, not by a substring of the markup. An earlier version of this check
     looked for `axis--val">9<` and passed vacuously, because `text-anchor` sits
     between the class and the `>`. A guard that cannot fail guards nothing. */
  const labels = (html) => [...html.matchAll(/class="axis axis--val"[^>]*>(\d+)</g)].map(m => +m[1]);

  /* EVERY bar carries its count, and the counts must sum to the number of
     projects handed in — not to the number that happen to fall inside the
     window. That is the whole point of the change: the header said "355 of
     369" and the missing 14 were invisible. */
  check(labels(bar).join() === '12,5,14', `the bars are not all labelled: ${labels(bar)}`);
  check(labels(bar).reduce((a, b) => a + b, 0) === fixtures.length,
    `the bars total ${labels(bar).reduce((a, b) => a + b, 0)} against ${fixtures.length} projects`);
  check(bar.includes('31 projects'), 'the header does not state the full project count');

  /* A run of projects two years before the window must NOT vanish and must NOT
     stretch the axis across the empty years. They fold into one grey bucket at
     the head, and the total still reconciles. */
  const withOld = [...mk('2023-08', 'A', 4), ...fixtures];
  const oldMonths = D.monthWindow(withOld, 3);
  const oldBar = D.monthlyProjectsChart('en', withOld, oldMonths);
  check(labels(oldBar).join() === '4,12,5,14', `the earlier bucket is wrong: ${labels(oldBar)}`);
  check(labels(oldBar).reduce((a, b) => a + b, 0) === withOld.length,
    'projects outside the window were dropped instead of bucketed');
  check(oldBar.includes('35 projects'), 'the header ignores the bucketed projects');
  check(oldBar.includes('var(--ink3)') && oldBar.includes(D.DSTR.en.earlierBar),
    'the bucket is painted and labelled as if it were a month');
  check(!bar.includes('var(--ink3)'), 'an empty bucket was drawn when nothing falls outside the window');

  /* A tie must label both bars — the real data ties at 55 in Nov 25 and Jan 26
     — and with every bar labelled the y axis would print the same numbers a
     second time, so it is gone. */
  const tied = [...mk('2026-01', 'A', 6), ...mk('2026-02', 'A', 3), ...mk('2026-03', 'A', 6)];
  const tiedBar = D.monthlyProjectsChart('en', tied, D.monthWindow(tied));
  check(labels(tiedBar).join() === '6,3,6', `a tie was not labelled on both bars: ${labels(tiedBar)}`);
  check(!/text-anchor="end"/.test(bar), 'the y axis is still drawn alongside the value labels');

  /* The heatmap must account for exactly the same projects as the bar chart.
     If these two ever disagree the screen is telling two different stories. */
  const sumTot = (html) => [...html.matchAll(/<td class="heat__tot">(\d+)<\/td>/g)]
    .reduce((a, m) => a + +m[1], 0);
  check(sumTot(heat) === fixtures.length,
    `the heatmap totals ${sumTot(heat)} against ${fixtures.length} projects`);

  /* And they must still agree once projects fall outside the window — the case
     that broke it. Both cards bucket the same rows the same way, so the number
     in the left header and the sum of the right column are one number. */
  const oldHeat = D.managerMonthChart('en', withOld, oldMonths);
  check(sumTot(oldHeat) === withOld.length,
    `the heatmap totals ${sumTot(oldHeat)} against ${withOld.length} projects once some fall outside the window`);
  check(sumTot(oldHeat) === labels(oldBar).reduce((a, b) => a + b, 0),
    'the two cards reconcile to different totals');
  check(oldHeat.includes('background:var(--ink3)'),
    'the heatmap bucket is on the sequential ramp, comparing years against months');
  check(!heat.includes('var(--ink3)'), 'an empty bucket column was drawn in the heatmap');

  check(heat.includes('Owner One') && heat.includes('Owner Two'), 'managers are missing from the heatmap');
  check(heat.indexOf('Owner One') < heat.indexOf('Owner Two'), 'the heatmap is not sorted by volume');
  check(heat.includes(D.DSTR.en.unassignedOwner), 'projects with no owner vanished from the heatmap');

  /* Counts are skewed — 13 in one cell against a floor of 1 — so equal slices
     of the range would drop nearly every cell into one band and the grid would
     read as a flat colour. Quantile cuts must produce more than one step. */
  const usedFills = [...new Set([...heat.matchAll(/background:(#[0-9a-f]{6})/g)].map(m => m[1]))];
  check(usedFills.length >= 3, `the heatmap collapsed to ${usedFills.length} shade(s) — the scale does no work`);
  check(!/background:#[0-9a-f]{6}"[^>]*>0</.test(heat), 'an empty cell was painted as if it had work in it');

  /* An SVG does not mirror under dir=rtl but the table beside it does, so the
     bars are reversed by hand. Without this the two charts run in opposite
     directions in Arabic and the shared axis stops lining up. */
  const barAr = D.monthlyProjectsChart('ar', fixtures, months);
  const order = (html) => [...html.matchAll(/text-anchor="middle">([^<]+)<\/text>/g)]
    .map(m => m[1]).filter(s => !/^\d+$/.test(s));
  const en = order(bar), ar = order(barAr);
  check(en.length === 3 && ar.length === 3, `month labels missing: en ${en} ar ${ar}`);
  check(ar.join() === [...ar].join() && en[0] !== ar[0],
    `the Arabic bar chart did not mirror: en ${en} vs ar ${ar}`);

  for (const lang of ['en', 'ar']) {
    const html = D.pmView(lang, { projects: fixtures, people: [], leads: [], stages: [] });
    check(html.includes('chartrow'), `${lang}: the two charts are not laid out together`);
    check(html.includes(D.DSTR[lang].projectsByMonth) && html.includes(D.DSTR[lang].byManager),
      `${lang}: one of the two charts is missing`);
  }
}

/* ------------------------------- the Leads screen -------------------------
   The bug this whole block exists for: leads.company was NULL on all 420
   rows and the table printed `l.company || l.source`, so every Sales Lead
   claimed to work at a company called "Sales Leads". A fallback that reaches
   for a different field entirely is worse than an empty cell. */
{
  const lead = (i, o) => ({
    id: 'l' + i, name: 'Lead ' + i, status: 'contacted', source: 'Sales Leads',
    owner_id: null, next_follow_up_on: null, created_at: `2026-0${i}-01T00:00:00Z`, ...o,
  });

  check(D.leadCompany({ company: 'Aramco', website: 'https://x.com', source: 'Sales Leads' }) === 'Aramco',
    'a recorded company name is not preferred over the website');
  check(D.leadCompany({ website: 'https://www.aramco.com/en' }) === 'aramco.com',
    'the website host is not used when no company name was recorded');
  check(D.leadCompany({ source: 'Sales Leads' }) === '',
    'the Asana list name leaked back into the company column');
  check(D.leadCompany({ website: 'not a url' }) === 'not a url',
    'a malformed website threw instead of degrading');

  /* Fixture owners, not colleagues. This file is in a public repository, and
     a chart fixture is no reason to publish who works here. */
  const fixtures = [
    lead(1, { owner_id: 'o1', status: 'contacted',   next_follow_up_on: '2020-01-01' }),
    lead(2, { owner_id: 'o1', status: 'address_not_found', company: 'Accenture' }),
    lead(3, { status: 'no_answer', source: 'World Defense Show Prospects', company: 'Falcom' }),
    lead(4, { owner_id: 'o2', status: 'contacted', next_follow_up_on: '2099-01-01' }),
  ];
  const F = (lf) => D.filterLeads(fixtures, lf);
  check(F({}).length === 4, 'the default lead view drops rows');
  check(F({ owner: 'o1' }).length === 2, 'the lead owner filter does not match on owner_id');
  check(F({ owner: '~none' }).length === 1, 'the no-owner lead option finds nothing');
  check(F({ status: 'no_answer' }).length === 1, 'the lead status filter is wrong');
  check(F({ source: 'World Defense Show Prospects' }).length === 1, 'the source filter is wrong');
  check(F({ follow: 'overdue' }).map(l => l.id).join() === 'l1', 'the overdue follow-up window is wrong');
  check(F({ follow: 'none' }).length === 2, 'the "no follow-up date" window is wrong');
  const byFollow = F({ sort: 'follow' }).map(l => l.id);
  check(byFollow[0] === 'l1' && byFollow.slice(-2).every(id => ['l2', 'l3'].includes(id)),
    `undated leads did not sort last: ${byFollow}`);

  for (const lang of ['en', 'ar']) {
    const html = D.leadsView(lang, { leads: fixtures, people: [] });
    check(html.includes('data-lf="owner"') && html.includes('data-lf="follow"'),
      `${lang}: the leads filter bar is missing controls`);
    check(html.includes('data-route="#/l/l1"'), `${lang}: lead names are not clickable`);
    check(!html.includes('>Sales Leads<') || html.includes('data-lf="source"'),
      `${lang}: the Asana list name is being printed as a company`);
    check(html.includes(D.DSTR[lang].st.address_not_found),
      `${lang}: the richer lead statuses are not shown`);
  }
  check(D.leadsView('en', { leads: fixtures, people: [], lf: { ...D.LF_DEFAULT, status: 'won' } })
    .includes(D.DSTR.en.noLeadMatch), 'an empty lead result does not say so');

  /* The lead page, and the question it exists to answer. */
  const withProposal = D.leadView('en', {
    lead: lead(9, { company: 'Aramco', title: 'Marketing Manager', email: 'a@aramco.com',
                    phone: '966 50 322 0796', website: 'https://aramco.com' }),
    leadProposals: [{ id: 'p1', name: 'SADAIA stand', status: 'submitted', due_on: '2026-11-02' }],
    leadEvents: [], projectHits: [],
  });
  check(withProposal.includes('Marketing Manager') && withProposal.includes('a@aramco.com'),
    'the lead page does not show title or email');
  check(withProposal.includes('SADAIA stand') && withProposal.includes(D.DSTR.en.st.submitted),
    'a linked proposal does not show its live status');
  check(withProposal.includes('data-route="#/p/p1"'), 'the proposal does not link to the project');
  check(withProposal.includes('id="linkForm"'), 'there is no way to link a proposal');

  const noProposal = D.leadView('en', { lead: lead(8), leadProposals: [], leadEvents: [], projectHits: [] });
  check(noProposal.includes(D.DSTR.en.noProposals),
    'a lead with no proposal stays silent instead of saying so');
  check(D.leadView('en', { lead: null }).includes(D.DSTR.en.leadNotFound),
    'a missing lead renders a blank page');

  // A project that came from a lead must say so, and link back.
  const fromLead = D.projectView('en', {
    project: { ...proj(11, null, 'submitted'), project_stages: [],
               lead: { id: 'l9', name: 'Amal Prasad', company: 'Aramco' } },
  });
  check(fromLead.includes(D.DSTR.en.fromLead) && fromLead.includes('data-route="#/l/l9"'),
    'the project page does not show which lead it came from');
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

  /* --------------------------- the code step ----------------------------
     What this replaced, and why it cannot come back: a sign-in email used to
     carry a one-time URL. Minting a new one silently killed the last, so
     somebody who clicked "send me another", waited, then opened the mail that
     had already arrived was opening the link their own click had destroyed —
     and the page told them it had expired, so they clicked again and rearmed
     the trap. One person lost four days to that loop. Anything that fetches a
     URL — mail scanners, link previewers — spent the token the same way.

     A code cannot be spent by being fetched, and it is typed into the page
     the person is already on, so there is no stale tab to return through. */
  const code = D.signInView(lang, 'code', '', null, 'someone@expandexpo.com');
  check(code.includes('id="aCode"'), `${lang}: the code step has no code field`);
  check(!code.includes('id="aPass"'), `${lang}: the code step asks for a password too`);
  check(!code.includes('id="aEmail"'),
    `${lang}: the code step asks for the address again instead of carrying it`);
  check(code.includes('someone@expandexpo.com'),
    `${lang}: the code step does not say which address the code went to`);
  /* one-time-code is what lets iOS and Android offer the code from the
     notification; inputmode numeric is what gets the digit keypad. Without
     them the code is retyped by hand from another app, which is where digits
     get transposed. */
  check(/autocomplete="one-time-code"/.test(code), `${lang}: the code field forgoes OS autofill`);
  check(/inputmode="numeric"/.test(code), `${lang}: the code field will not raise a numeric keypad`);
  /* Resend without leaving the step. Bouncing back to the email field to ask
     again is a smaller version of the bug this replaced. */
  check(code.includes('data-resend'), `${lang}: there is no way to ask for another code`);

  /* The wrong-code message must NOT be Supabase's own "Token has expired or is
     invalid". Those words are what four days of being locked out looked like,
     and repeating them here would tell the one person who most needs to see a
     change that nothing changed. */
  const bad = D.signInView(lang, 'code', '!' + t.codeBad, null, 'x@y.com');
  check(bad.includes(t.codeBad), `${lang}: the wrong-code message is missing`);
  check(!/expired/i.test(t.codeBad) && !/انتهت/.test(t.codeBad),
    `${lang}: the wrong-code message still says "expired"`);

  // The address is only carried where it was collected — never prefilled on a
  // fresh sign-in screen, which would leak the last person to use the device.
  check(!D.signInView(lang, 'in').includes('someone@expandexpo.com'),
    `${lang}: an address leaked onto the sign-in screen`);
}

/* No auth URL may survive anywhere in the product's own copy. The link was
   the vulnerability, so a string still telling somebody to click one is a
   promise the system no longer keeps. */
for (const lang of ['en', 'ar']) {
  const t = D.DSTR[lang];
  for (const k of ['linkOnTheWay', 'linkExpiredWhy', 'firstTimePrompt', 'forgotPrompt',
                   'sendLink', 'linkSent', 'resetHint', 'codePrompt', 'codeBad']) {
    check(!/\blink\b/i.test(t[k]) && !/رابط/.test(t[k]),
      `${lang}: DSTR.${k} still tells people to open a link`);
  }
}

/* ------------------------- attachments on a new project -------------------
   Both pickers take many files now, and the queue is listed under the target
   so it can be edited before anything is uploaded. The bug that made this
   necessary: submit read `$('#pRfp').files[0]` — a single index — so anyone
   who attached a brief plus its BOQ got the brief, silently, with no error
   and nothing on screen to suggest the second file had been dropped. */
{
  check(D.fileSize(0) === '0 B', 'an empty file has no size');
  check(D.fileSize(999) === '999 B', 'bytes are not shown as bytes');
  check(D.fileSize(2048) === '2.0 KB', 'kilobytes are wrong');
  check(D.fileSize(1024 * 1024 * 3.5) === '3.5 MB', 'megabytes are wrong');
  /* Not rounded to a flat "1 MB" for everything between 0.5 and 1.5: the size
     is here so a 200KB logo can be told from a 40MB render before committing
     to the wait. */
  check(D.fileSize(1024 * 1024 * 40) === '40 MB', 'a large render loses its precision');
  check(D.fileSize(NaN) === '' && D.fileSize(-1) === '', 'a nonsense size prints something');

  for (const lang of ['en', 'ar']) {
    const t = D.DSTR[lang];
    const form = D.newProjectView(lang, { people: [], stages: [] });

    /* Both fields, not just the reference one. `multiple` is what the native
       control checks; without it the OS picker refuses a second selection. */
    for (const id of ['pRfp', 'pRefs']) {
      const tag = form.match(new RegExp(`<input id="${id}"[^>]*>`))?.[0] || '';
      check(/\bmultiple\b/.test(tag), `${lang}: #${id} still takes one file only`);
      check(form.includes(`data-pend-for="${id}"`), `${lang}: #${id} has nowhere to list what is queued`);
    }

    /* The list must be a SIBLING of the label. Nested inside it, a click on a
       remove button bubbles to the label and reopens the file dialog, so
       removing a file would immediately demand another one. */
    const field = form.slice(form.indexOf('<input id="pRfp"'));
    check(field.indexOf('</label>') < field.indexOf('data-pend-for="pRfp"'),
      `${lang}: the queue sits inside the label that opens the picker`);

    const files = [
      { name: 'brief.pdf', size: 2048 },
      { name: 'boq.xlsx', size: 1024 * 1024 * 2 },
    ];
    const list = D.pendingFiles(lang, 'pRfp', files);
    check(list.includes('brief.pdf') && list.includes('boq.xlsx'),
      `${lang}: a queued file is not listed`);
    check((list.match(/data-drop-rm="pRfp"/g) || []).length === 2,
      `${lang}: not every queued file can be removed`);
    check(/data-i="0"/.test(list) && /data-i="1"/.test(list),
      `${lang}: the remove buttons do not say which file they remove`);
    check(list.includes(t.filesQueued.replace('{n}', 2)),
      `${lang}: the queue does not say how many files are in it`);
    // The running total, so nobody starts a 400MB upload without warning.
    check(list.includes('2.0 MB'), `${lang}: the queue does not total the upload`);
    check(D.pendingFiles(lang, 'pRfp', []) === '',
      `${lang}: an empty queue still draws a heading`);
  }

  /* The mechanism, in the browser that actually has to run it. A FileList is
     read-only, so add and remove are implemented by rebuilding one through a
     DataTransfer and assigning it back — if that assignment is ever refused,
     every guard above still passes and the feature is dead. So it is exercised
     for real rather than asserted about. */
  await page.goto(URL_, { waitUntil: 'networkidle' });
  const q = await page.evaluate(() => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.multiple = true;
    const put = (names) => {
      const dt = new DataTransfer();
      names.forEach(n => dt.items.add(new File(['x'], n, { type: 'text/plain' })));
      inp.files = dt.files;
      return [...inp.files].map(f => f.name);
    };
    const first = put(['brief.pdf', 'boq.xlsx']);
    const kept = [...inp.files].filter((_, i) => i !== 0);
    const dt = new DataTransfer(); kept.forEach(f => dt.items.add(f)); inp.files = dt.files;
    return { first, afterRemove: [...inp.files].map(f => f.name) };
  });
  check(q.first.join() === 'brief.pdf,boq.xlsx', `a queue could not be built: ${q.first}`);
  check(q.afterRemove.join() === 'boq.xlsx',
    `removing a file did not change what the input would upload: ${q.afterRemove}`);
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

/* ====================================================== business highlights

   The screen that replaced the leaked landing card. Every card on it is a
   pure function over live rows, so the arithmetic is asserted here rather
   than eyeballed — and the fixture is built so that a naive implementation
   fails: one wildly late project (to catch a mean masquerading as a typical
   delay), one project delivered EARLY (which is on time, not "0 days late"),
   projects with a deadline and no delivery date (unknown, not on time), and
   a team held entirely by one person.                                     */

const hp = (id, o) => ({
  id, name: 'HL ' + id, is_crm_list: false, status: o.status || 'delivered',
  // `o.owner ?? 'u9'` would be wrong: null is exactly the value under test.
  due_on: o.due || null, delivered_on: o.del || null,
  owner_id: 'owner' in o ? o.owner : 'u9',
  created_at: '2026-01-01T00:00:00Z',
  project_stages: o.stages || [],
});
const st = (dept, who, name, status = 'pending') =>
  ({ id: `${dept}-${who}-${Math.random()}`, department_id: dept, status,
     assignee_id: who, assignee: who ? { id: who, full_name: name, department_id: dept } : null });

const hlProjects = [
  hp(1, { due: '2026-01-10', del: '2026-01-10' }),                  // exactly on time
  hp(2, { due: '2026-01-10', del: '2026-01-03' }),                  // early -> on time
  hp(3, { due: '2026-01-10', del: '2026-01-14' }),                  // 4 days  -> band 0
  hp(4, { due: '2026-01-10', del: '2026-02-01' }),                  // 22 days -> band 1
  hp(5, { due: '2026-01-10', del: '2026-03-10' }),                  // 59 days -> band 2
  hp(6, { due: '2026-01-10', del: '2027-12-19' }),                  // 708     -> band 3
  hp(7, { due: '2026-01-10', del: null, status: 'in_design' }),     // unknown, and open+late
  hp(8, { due: null, del: null, status: 'in_design', owner: null }),// no deadline, no owner
  hp(9, { due: '2026-01-10', del: null, status: 'submitted', owner: null,
          stages: [st('3d', 'a', 'Solo Person'), st('3d', 'a', 'Solo Person'),
                   st('3d', 'a', 'Solo Person'), st('3d', null, ''),
                   st('2d', 'b', 'Bee'), st('2d', 'c', 'Cee'),
                   st('2d', 'd', 'Dee'), st('2d', 'b', 'Bee', 'done')] }),
];
const hlLeads = [
  { id: 'L1', status: 'new',       owner_id: null, next_follow_up_on: '2020-01-01' },
  { id: 'L2', status: 'contacted', owner_id: 'u1', next_follow_up_on: '2020-01-01' },
  { id: 'L3', status: 'won',       owner_id: null, next_follow_up_on: '2020-01-01' },
  { id: 'L4', status: 'new',       owner_id: 'u1', next_follow_up_on: '2099-01-01' },
  { id: 'L5', status: 'new',       owner_id: 'u1', next_follow_up_on: null },
];

const DR = D.deliveryRecord(hlProjects);
check(DR.judged === 6,  `delivery record judged ${DR.judged} projects, expected the 6 with both dates`);
check(DR.onTime === 2,  `${DR.onTime} on time — a project delivered BEFORE its deadline is on time, not late`);
check(DR.late === 4,    `expected 4 late, got ${DR.late}`);
/* The one that matters: 4, 22, 59 and 708 average to 198 days. Nobody has
   ever waited 198 days. The median of those four is 41. */
check(DR.medianLate === 41, `typical delay is ${DR.medianLate}; the median of 4/22/59/708 is 41 and the mean (198) is a fiction`);
check(JSON.stringify(DR.bands) === '[1,1,1,1]', `late bands are ${JSON.stringify(DR.bands)}, expected one project in each`);
check(DR.rate === 33, `on-time rate is ${DR.rate}%, expected 2 of 6 = 33%`);
check(DR.unjudged === 3, `${DR.unjudged} unjudged, expected the 3 with no delivery date`);
check(DR.stillLate === 2, `${DR.stillLate} open and overdue, expected the 2 open projects past 2026-01-10`);
check(DR.worst && DR.worst.by > 100, 'the worst open overdue project is not reported');

const WL = D.workloadByPerson(hlProjects);
check(WL.total === 7, `${WL.total} open stages counted; the done one must not be in there`);
check(WL.unassigned === 1, `${WL.unassigned} unassigned, expected 1`);
check(WL.rows[0]?.name === 'Solo Person' && WL.rows[0]?.n === 3,
  `the busiest person is ${JSON.stringify(WL.rows[0])}, expected Solo Person with 3`);
check(WL.people === 4, `${WL.people} people hold work, expected 4`);
check(WL.rows.reduce((a, r) => a + r.n, 0) + WL.unassigned === WL.total,
  'the workload rows plus unassigned do not add up to the stage total — somebody is being counted twice or not at all');

const KR = D.keyPersonRisk(hlProjects);
const threeD = KR.find(r => r.dept === '3d'), twoD = KR.find(r => r.dept === '2d');
check(threeD && threeD.share === 1 && threeD.sole,
  `3d is held entirely by one person and is not flagged: ${JSON.stringify(threeD)}`);
check(threeD.total === 4 && threeD.assigned === 3 && threeD.unassigned === 1,
  `3d counts are wrong: ${JSON.stringify({ t: threeD.total, a: threeD.assigned, u: threeD.unassigned })}`);
/* Three people, one each — the denominator is assigned work, so this must
   come out at a third and NOT be flagged. */
check(twoD && Math.round(twoD.share * 100) === 33 && !twoD.risk,
  `2d has three holders with one stage each and should read as spread: ${JSON.stringify(twoD)}`);

const PP = D.pipelinePressure(hlProjects, hlLeads);
check(PP.leadsNoOwner === 2, `${PP.leadsNoOwner} unowned leads, expected 2`);
check(PP.followOverdue === 2, `${PP.followOverdue} overdue follow-ups, expected 2 — the won lead is closed and the 2099 one is not due`);
check(PP.atEtemad === 1, `${PP.atEtemad} at Etemad, expected the 1 submitted project`);
check(PP.projNoOwner === 2, `${PP.projNoOwner} open projects with no owner, expected 2`);

for (const lang of ['en', 'ar']) {
  const h = D.highlightsView(lang, { projects: hlProjects, leads: hlLeads });
  const t = D.DSTR[lang];
  for (const key of ['hlDelivery', 'hlLoad', 'hlRisk', 'hlPipeline']) {
    check(h.includes(t[key]), `${lang}: the "${key}" card is missing from Business highlights`);
  }
  check(h.includes('Solo Person'), `${lang}: the workload chart does not name the busiest person`);
  check((h.match(/class="hb[ "]/g) || []).length >= 5, `${lang}: too few workload bars drawn`);
  check(h.includes(t.unassignedOwner), `${lang}: unassigned work is not shown as its own row`);
  check(h.includes('tag--bad'), `${lang}: a team held entirely by one person is not flagged`);
  // The bug this class of screen invites: a number with no denominator.
  check(h.includes(t.hlDeliveryNote), `${lang}: the delivery card does not say what it could not judge`);
  check(!/>in_design</.test(h) && !/>submitted</.test(h), `${lang}: a raw status enum reached the screen`);
  check(!h.includes('undefined') && !h.includes('NaN'),
    `${lang}: Business highlights rendered "undefined" or "NaN"`);
}
/* Empty is a sentence, not a broken page. */
check(D.highlightsView('en', { projects: [], leads: [] }).includes(D.DSTR.en.hlEmpty),
  'Business highlights with no data renders something other than a plain explanation');

/* And it is gated. A hidden sidebar item is a decoration; the check that
   matters is the one a typed URL hits. */
const savedMe = dbmod.state.me;
dbmod.state.me = { id: 'u2', full_name: 'Designer', role: 'member', department_id: '3d', is_active: true };
check(!D.canPlan(), 'canPlan() lets a plain designer through');
dbmod.state.me = savedMe;

/* --------------------------------- report --------------------------------- */
await browser.close();
server.close();

if (errors.length) fail.push('console/page errors: ' + errors.slice(0, 5).join(' | '));

console.log('routes checked: ' + ROUTES.map(([h]) => h).join(' '));

if (fail.length) {
  console.log('\nFAIL');
  for (const f of fail) console.log('  - ' + f);
  process.exit(1);
}
console.log(`\nPASS — ${ROUTES.length} routes, both languages, desktop and mobile`);
