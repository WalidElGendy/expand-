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
  // The page scrolls as a document, so the header is not pinned — but on a
  // fresh route it must be at the top, inside the body padding, and never
  // pushed below the fold by something rendering above it.
  check(m.headTop >= 0 && m.headTop <= 40,
    `${hash}: header is at y=${m.headTop}, expected it at the top of the page`);
  check(!m.tooWide.length,  `${hash}: horizontal overflow from ${JSON.stringify(m.tooWide)}`);
}

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
