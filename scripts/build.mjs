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
const js = out.outputFiles[0].text;
const shell = readFileSync(root + 'web/index.html', 'utf8');
if (!shell.includes('/*__BUNDLE__*/')) throw new Error('web/index.html lost its /*__BUNDLE__*/ marker');

mkdirSync(root + 'public', { recursive: true });
writeFileSync(root + 'public/index.html', shell.replace('/*__BUNDLE__*/', js));
console.log(`built public/index.html — ${(js.length / 1024).toFixed(1)}kb of js inlined`);
