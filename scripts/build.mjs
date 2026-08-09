/* Bundle web/app.js and inline it into public/index.html.
   Output is committed so the site still deploys if the build step is skipped;
   this script regenerates it and is what Vercel runs. */
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = await build({
  entryPoints: [root + 'web/app.js'],
  bundle: true, format: 'esm', target: 'es2022', write: false,
});
let js = out.outputFiles[0].text;

/* Inject the Supabase project the bundle should talk to.

   The anon key is public by design — it names the project, row-level
   security decides access — so baking it into a static file is correct.
   The build FAILS if the placeholders are still present and no values were
   supplied, because a silently unconfigured build looks identical to a
   working one until someone tries to sign in. */
const URL_ = process.env.SUPABASE_URL || '';
const KEY_ = process.env.SUPABASE_ANON_KEY || '';
if (js.includes('__SUPABASE_URL__')) {
  if (!URL_ || !KEY_) {
    throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be set — refusing to ship a build that cannot sign anyone in');
  }
  js = js.split('__SUPABASE_URL__').join(URL_).split('__SUPABASE_ANON_KEY__').join(KEY_);
}
/* Refuse to ship a secret key. Grepping for the words `service_role` or
   `secret` is useless — the Supabase client library contains both in its own
   source. What matters is whether an actual KEY is present, so decode every
   JWT-shaped literal and look at its role claim, and check for the
   `sb_secret_` prefix of the newer format. */
for (const jwt of js.match(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g) || []) {
  let claims = {};
  try { claims = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8')); } catch { continue; }
  if (claims.role && claims.role !== 'anon') {
    throw new Error(`a "${claims.role}" key reached the bundle — only the anon key may ship, because it is the only one row-level security constrains`);
  }
}
if (/\bsb_secret_[A-Za-z0-9_-]{8,}/.test(js)) {
  throw new Error('a secret API key reached the bundle — it bypasses row-level security and must never ship');
}
const shell = readFileSync(root + 'web/index.html', 'utf8');
if (!shell.includes('/*__BUNDLE__*/')) throw new Error('web/index.html lost its /*__BUNDLE__*/ marker');

mkdirSync(root + 'public', { recursive: true });
writeFileSync(root + 'public/index.html', shell.replace('/*__BUNDLE__*/', js));
console.log(`built public/index.html — ${(js.length / 1024).toFixed(1)}kb of js inlined`);
