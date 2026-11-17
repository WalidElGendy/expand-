/* Personal themes: every colour stays readable, the default changes nothing,
   and a bad saved look cannot break the page. */
import { PRESETS, DEFAULT_LOOK, normalise, varsFor, contrast, readable, mix, hexOk, KEYS } from '../web/theme.js';
import { ASTR } from '../web/appearance.js';

let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log('  - ' + msg); } };

check(Object.keys(varsFor(DEFAULT_LOOK, 'dark')).length === 0 && Object.keys(varsFor(DEFAULT_LOOK, 'light')).length === 0,
  'the default look sets no variables: the app is exactly the brand guideline');
check(JSON.stringify(normalise(null)) === JSON.stringify(DEFAULT_LOOK), 'nothing saved is the default');
const junk = normalise({ accent: 'red; background:url(x)', tint: 9, mode: 'neon', size: 'xxl', corners: 7, preset: 'nope' });
check(junk.accent === DEFAULT_LOOK.accent && junk.tint === 0 && junk.mode === 'system' && junk.size === 'm' && junk.corners === 'normal' && junk.preset === 'custom',
  'a bad saved look falls back field by field, never reaching the CSS');
check(PRESETS.some(p => p.id === 'blossom' && p.tint === 2), 'there is a pink theme, with tinted backgrounds');
check(new Set(PRESETS.map(p => p.id)).size === PRESETS.length && PRESETS.every(p => hexOk(p.accent) && p.en && p.ar), 'presets: unique, valid, named in both languages');

/* Every preset and a spread of custom colours, both modes. */
const customs = ['#ffff00', '#00ffff', '#ffffff', '#000000', '#ff00ff', '#7f7f7f', '#f5e6c8', '#1a1a40'];
const looks = [...PRESETS.map(p => ({ accent: p.accent, tint: p.tint })), ...customs.flatMap(c => [0, 1, 2].map(t => ({ accent: c, tint: t })))];
for (const l of looks) for (const mode of ['dark', 'light']) {
  const v = varsFor(l, mode);
  const s1 = v['--s-1'] || (mode === 'light' ? '#ffffff' : '#101014');
  const brand = v['--brand'] || '#915bf5';
  const on = v['--on-brand'] || '#10041f';
  check(contrast(brand, s1) >= 2.95, `${l.accent}/${l.tint} ${mode}: brand ${brand} reads on its panel ${s1} (${contrast(brand, s1).toFixed(2)})`);
  check(contrast(on, brand) >= 4.5 || (contrast(on, brand) >= 3 && contrast('#ffffff', brand) < 4.5 && contrast('#10041f', brand) < 4.5),
    `${l.accent} ${mode}: button text ${on} on ${brand} (${contrast(on, brand).toFixed(2)})`);
  const ink = mode === 'light' ? '#15131c' : '#ffffff';
  check(contrast(ink, v['--bg'] || s1) >= 7 && contrast(ink, s1) >= 7, `${l.accent}/${l.tint} ${mode}: body text keeps 7:1 on tinted surfaces`);
  check(Object.keys(v).every(k => KEYS.includes(k)), 'only known variables are set (so reset can clear them)');
  check(Object.values(v).every(x => /^#[0-9a-f]{6}$|^\d+px$/.test(x)), 'values are plain hex or px (the head script accepts nothing else)');
}
check(readable('#ffff00', '#ffffff') !== '#ffff00' && contrast(readable('#ffff00', '#ffffff'), '#ffffff') >= 3, 'yellow on white is darkened until it reads');
check(mix('#000000', '#ffffff', 50) === '#808080', 'mix');
check(varsFor({ corners: 'round' }, 'dark')['--r'] === '16px', 'corners');
check(Object.keys(ASTR.en).every(k => k in ASTR.ar), 'every Appearance string has an Arabic version');

if (failed) { console.log(`theme: ${failed} failed`); process.exit(1); }
console.log('theme: ok');
