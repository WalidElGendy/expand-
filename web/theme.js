/* ==========================================================================
   Personal themes: each person's colours, tint, mode and text size.

   A "look" is { preset, accent, tint, mode, size }:
     accent  any colour; the app's purple by default
     tint    0 plain · 1 soft · 2 rich — how much of the accent colours the
             backgrounds (Blossom with a rich tint is the pink version)
     mode    'system' | 'light' | 'dark'
     size    's' | 'm' | 'l' — the whole interface, scaled
     corners 'sharp' | 'normal' | 'round'

   It becomes CSS variables on <html>: the brand colour and its shades, the
   surfaces and lines, and the ink on brand-coloured buttons. Whatever colour
   is picked, the result stays readable: the accent is darkened on light
   surfaces and lightened on dark ones until it reaches 3:1 contrast, and the
   text on it is black or white, whichever reads better.

   Saved to the person's profile (follows them to any computer) and cached on
   the device, where the page head applies it before the first paint so the
   app never flashes purple on its way to pink.
   ========================================================================== */

export const DEFAULT_ACCENT = '#915bf5';
export const DEFAULT_LOOK = { preset: 'expand', accent: DEFAULT_ACCENT, tint: 0, mode: 'system', size: 'm', corners: 'normal' };

/* The ready-made themes. Names in both languages; the swatch is the accent. */
export const PRESETS = [
  { id: 'expand',   accent: '#915bf5', tint: 0, en: 'Expand purple', ar: 'بنفسجي إكسباند' },
  { id: 'blossom',  accent: '#e0569b', tint: 2, en: 'Blossom pink',  ar: 'وردي زهري' },
  { id: 'rose',     accent: '#d4848f', tint: 1, en: 'Rose gold',     ar: 'ذهبي وردي' },
  { id: 'lavender', accent: '#a78bfa', tint: 2, en: 'Lavender',      ar: 'لافندر' },
  { id: 'ocean',    accent: '#2f80ed', tint: 1, en: 'Ocean',         ar: 'محيط' },
  { id: 'teal',     accent: '#14b8a6', tint: 1, en: 'Teal',          ar: 'فيروزي' },
  { id: 'forest',   accent: '#2f9e5a', tint: 1, en: 'Forest',        ar: 'غابة' },
  { id: 'sunset',   accent: '#f97316', tint: 1, en: 'Sunset',        ar: 'غروب' },
  { id: 'crimson',  accent: '#dc2626', tint: 1, en: 'Crimson',       ar: 'قرمزي' },
  { id: 'gold',     accent: '#d4a017', tint: 1, en: 'Gold',          ar: 'ذهبي' },
  { id: 'indigo',   accent: '#4f46e5', tint: 1, en: 'Indigo',        ar: 'نيلي' },
  { id: 'graphite', accent: '#8a8f98', tint: 0, en: 'Graphite',      ar: 'جرافيت' },
];

/* The app's own surfaces, per mode (index.html), before any tint. */
const BASE = {
  dark:  { '--bg': '#000000', '--s-1': '#101014', '--s-2': '#17171d', '--s-3': '#1f1f28', '--line': '#232330', '--line2': '#30303f' },
  light: { '--bg': '#f5f4f9', '--s-1': '#ffffff', '--s-2': '#f4f2f9', '--s-3': '#ebe8f3', '--line': '#e6e3ee', '--line2': '#d4d0e0' },
};
/* How much accent goes into each surface: [soft, rich], in %. */
const TINT = {
  dark:  { '--bg': [5, 9], '--s-1': [7, 12], '--s-2': [8, 14], '--s-3': [10, 17], '--line': [14, 22], '--line2': [18, 28] },
  light: { '--bg': [9, 16], '--s-1': [2, 5], '--s-2': [7, 12], '--s-3': [11, 18], '--line': [13, 22], '--line2': [18, 30] },
};
export const ZOOM = { s: 0.92, m: 1, l: 1.1 };
export const RADIUS = { sharp: '4px', normal: '10px', round: '16px' };
/* Every variable a look may set, so going back to the default clears them all. */
export const KEYS = [...Object.keys(BASE.dark), '--brand', '--midnight', '--biloba', '--selago', '--lilac', '--brand-hi', '--on-brand', '--nav-ink', '--r'];

/* ------------------------------------------------------------ colour */

export function hexOk(h) { return /^#[0-9a-f]{6}$/i.test(String(h || '')); }
const toRgb = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const toHex = (rgb) => '#' + rgb.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
/** a mixed with b: pct of b. */
export const mix = (a, b, pct) => { const x = toRgb(a), y = toRgb(b); return toHex(x.map((v, i) => v + (y[i] - v) * pct / 100)); };
const lum = (h) => { const c = toRgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
export const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

/** The accent nudged until it reads at 3:1 on the surface: darker on light
    surfaces, lighter on dark ones. */
export function readable(accent, surface, min = 3) {
  let c = accent;
  const toward = lum(surface) > 0.5 ? '#000000' : '#ffffff';
  for (let i = 0; i < 20 && contrast(c, surface) < min; i++) c = mix(c, toward, 8);
  return c;
}

/** The look, cleaned: anything missing or wrong falls back to the default. */
export function normalise(look) {
  const l = { ...DEFAULT_LOOK, ...(look && typeof look === 'object' ? look : {}) };
  if (!hexOk(l.accent)) l.accent = DEFAULT_ACCENT;
  l.accent = l.accent.toLowerCase();
  l.tint = [0, 1, 2].includes(Number(l.tint)) ? Number(l.tint) : 0;
  if (!['system', 'light', 'dark'].includes(l.mode)) l.mode = 'system';
  if (!ZOOM[l.size]) l.size = 'm';
  if (!RADIUS[l.corners]) l.corners = 'normal';
  if (!PRESETS.some(p => p.id === l.preset)) l.preset = 'custom';
  return l;
}

/** The CSS variables for a look in one mode — only those that differ from
    the stylesheet, so the default look sets nothing at all and the app is
    exactly as the brand guideline has it. Pure. */
export function varsFor(look, mode) {
  const l = normalise(look), m = mode === 'light' ? 'light' : 'dark';
  const out = {};
  if (l.corners !== 'normal') out['--r'] = RADIUS[l.corners];
  if (l.tint) for (const [k, base] of Object.entries(BASE[m])) out[k] = mix(base, l.accent, TINT[m][k][l.tint - 1]);
  // The guideline purple keeps the guideline's own shades.
  if (l.accent === DEFAULT_ACCENT) return out;
  const brand = readable(l.accent, out['--s-1'] || BASE[m]['--s-1']);
  out['--brand'] = brand;
  out['--midnight'] = mix(brand, '#000000', 35);
  out['--biloba'] = mix(brand, '#ffffff', 30);
  out['--selago'] = mix(brand, '#ffffff', 80);
  out['--lilac'] = mix(brand, '#ffffff', 92);
  out['--brand-hi'] = mix(brand, '#ffffff', 18);
  // Text on a brand-coloured button: whichever of near-black or white reads better.
  out['--on-brand'] = contrast(brand, '#10041f') >= contrast(brand, '#ffffff') ? '#10041f' : '#ffffff';
  // The selected sidebar item is a midnight → brand gradient; white on it
  // unless its middle is too light for white.
  if (contrast(mix(out['--midnight'], brand, 50), '#ffffff') < 3) out['--nav-ink'] = '#10041f';
  return out;
}

/* ------------------------------------------------------------- applying */

const LOOK_KEY = 'expand.look', MODE_KEY = 'expand.theme';
const root = () => document.documentElement;
export const currentMode = () => (root().getAttribute('data-theme') === 'light' ? 'light' : 'dark');
let look = DEFAULT_LOOK;
export const getLook = () => look;

/** Put a look on the page: variables for the mode now showing, the size, and
    the mode itself when it is not "follow the device". */
export function apply(next, { save = true } = {}) {
  look = normalise(next);
  if (look.mode !== 'system') {
    root().setAttribute('data-theme', look.mode);
    try { localStorage.setItem(MODE_KEY, look.mode); } catch { /* storage blocked */ }
  } else if (save) {
    try { localStorage.removeItem(MODE_KEY); } catch { /* ignore */ }
    const sys = window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    root().setAttribute('data-theme', sys);
  }
  repaint();
  if (save) {
    try {
      localStorage.setItem(LOOK_KEY, JSON.stringify({ look, zoom: ZOOM[look.size], keys: KEYS, vars: { dark: varsFor(look, 'dark'), light: varsFor(look, 'light') } }));
    } catch { /* storage blocked: applies for this visit */ }
  }
}

/** The mode changed (the sun / moon button): the same look, the other mode. */
export function repaint() {
  const mode = currentMode(), v = varsFor(look, mode);
  for (const k of KEYS) { if (v[k]) root().style.setProperty(k, v[k]); else root().style.removeProperty(k); }
  root().style.zoom = ZOOM[look.size] === 1 ? '' : String(ZOOM[look.size]);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', v['--bg'] || BASE[mode]['--bg']);
}

/** At start: whatever this device last used (the head script has already
    painted it), so later repaints keep it. */
export function boot() {
  try { const c = JSON.parse(localStorage.getItem(LOOK_KEY) || 'null'); if (c?.look) look = normalise(c.look); } catch { /* none */ }
  let mode = null; try { mode = localStorage.getItem(MODE_KEY); } catch { /* none */ }
  if (look.mode !== 'system' && mode !== look.mode) look = { ...look, mode: mode === 'light' || mode === 'dark' ? mode : 'system' };
  repaint();
}

/** The signed-in person's saved look wins over the device's, once per sign-in.
    Somebody with nothing saved keeps what this device shows — unless it was
    somebody else's (a shared computer), when they get the default. */
let syncedFor = null;
const WHO_KEY = 'expand.look.who';
export function syncFromProfile(me) {
  if (!me || syncedFor === me.id) return false;
  syncedFor = me.id;
  let who = null; try { who = localStorage.getItem(WHO_KEY); localStorage.setItem(WHO_KEY, me.id); } catch { /* none */ }
  const saved = me.theme && typeof me.theme === 'object' ? normalise(me.theme)
    : (who && who !== me.id ? DEFAULT_LOOK : null);
  if (!saved || JSON.stringify(normalise(saved)) === JSON.stringify(look)) return false;
  apply(saved);
  return true;
}
