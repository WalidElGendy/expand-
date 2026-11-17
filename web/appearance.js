/* ==========================================================================
   Appearance — Workspace › Appearance (#/appearance).

   Everyone picks their own look: a ready-made colour or any colour at all,
   how much of it tints the backgrounds, light or dark, text size and
   corners. Every change shows at once, on the whole app and on the small
   preview beside the controls, and is saved to the person's profile a
   moment later — so it follows them to any computer and nobody else's
   screen changes.
   ========================================================================== */

import * as db from './db.js';
import * as TH from './theme.js';
import { esc } from './dash.js';

export const ASTR = {
  en: {
    nav: 'Appearance', sub: 'your colours — only you see them',
    colour: 'Colour', colourHint: 'Pick a theme, or any colour you like.',
    custom: 'My own colour', customHint: 'Any colour — the app keeps text readable on it.',
    bg: 'Backgrounds', bgHint: 'How much of your colour goes into the backgrounds.',
    plain: 'Plain', soft: 'Soft tint', rich: 'Rich tint',
    mode: 'Mode', system: 'Follow device', light: 'Light', dark: 'Dark',
    size: 'Text size', small: 'Compact', normal: 'Normal', large: 'Large',
    corners: 'Corners', sharp: 'Sharp', round: 'Round',
    preview: 'Preview', pvProject: 'Riyadh Expo stand', pvSub: 'Design · due 12 Dec',
    pvBtn: 'Save', pvChip: 'In progress', pvMsg: 'On my way!', pvNav: ['Home', 'Projects', 'My tasks'],
    reset: 'Back to default', saved: 'Saved — it follows you to any computer.',
    saving: 'Saving…', local: 'Saved on this computer.', failed: 'Could not save to your profile — kept on this computer.',
    hex: 'Colour code', surprise: 'Surprise me',
  },
  ar: {
    nav: 'المظهر', sub: 'ألوانك — تظهر لك وحدك',
    colour: 'اللون', colourHint: 'اختر سمة جاهزة، أو أي لون تحبه.',
    custom: 'لوني الخاص', customHint: 'أي لون — ويبقى النص واضحًا عليه.',
    bg: 'الخلفيات', bgHint: 'مقدار لونك في الخلفيات.',
    plain: 'بدون', soft: 'لمسة خفيفة', rich: 'لمسة غنية',
    mode: 'الوضع', system: 'حسب الجهاز', light: 'فاتح', dark: 'داكن',
    size: 'حجم النص', small: 'مضغوط', normal: 'عادي', large: 'كبير',
    corners: 'الزوايا', sharp: 'حادة', round: 'دائرية',
    preview: 'معاينة', pvProject: 'جناح معرض الرياض', pvSub: 'التصميم · التسليم ١٢ ديسمبر',
    pvBtn: 'حفظ', pvChip: 'قيد التنفيذ', pvMsg: 'في الطريق!', pvNav: ['الرئيسية', 'المشاريع', 'مهامي'],
    reset: 'العودة للافتراضي', saved: 'تم الحفظ — يتبعك على أي جهاز.',
    saving: 'جارٍ الحفظ…', local: 'تم الحفظ على هذا الجهاز.', failed: 'تعذّر الحفظ في ملفك — حُفظ على هذا الجهاز.',
    hex: 'رمز اللون', surprise: 'فاجئني',
  },
};

const isDefault = (l) => ['accent', 'tint', 'mode', 'size', 'corners'].every(k => l[k] === TH.DEFAULT_LOOK[k]);

/* ------------------------------------------------------------- the view */

function seg(name, value, opts) {
  return `<div class="segbar look__seg" role="radiogroup">${opts.map(([v, label]) =>
    `<button type="button" class="seg${String(value) === String(v) ? ' is-on' : ''}" role="radio" aria-checked="${String(value) === String(v)}"
      data-look="${name}" data-v="${esc(v)}">${esc(label)}</button>`).join('')}</div>`;
}

function swatch(p, look, lang, mode) {
  const v = TH.varsFor({ accent: p.accent, tint: p.tint }, mode);
  const brand = v['--brand'] || p.accent;
  const on = look.preset === p.id;
  return `<button type="button" class="lookcard${on ? ' is-on' : ''}" data-look="preset" data-v="${esc(p.id)}" aria-pressed="${on}"
      style="--lc-bg:${esc(v['--s-1'] || (mode === 'light' ? '#ffffff' : '#101014'))};--lc-line:${esc(v['--line2'] || (mode === 'light' ? '#d4d0e0' : '#30303f'))};--lc-brand:${esc(brand)};--lc-mid:${esc(v['--midnight'] || '#5230bf')}">
    <span class="lookcard__mock" aria-hidden="true"><i></i><b></b><b></b></span>
    <span class="lookcard__n">${esc(p[lang] || p.en)}</span>
    ${on ? '<span class="lookcard__tick" aria-hidden="true">✓</span>' : ''}
  </button>`;
}

function preview(t) {
  return `<div class="lookpv" aria-hidden="true">
    <div class="lookpv__side">
      <span class="lookpv__logo">expand</span>
      ${t.pvNav.map((n, i) => `<span class="lookpv__nav${i === 1 ? ' is-on' : ''}">${esc(n)}</span>`).join('')}
    </div>
    <div class="lookpv__main">
      <div class="lookpv__card">
        <div class="lookpv__head"><span class="ava ava--sm" style="--c:var(--brand)">R</span>
          <span><b>${esc(t.pvProject)}</b><small>${esc(t.pvSub)}</small></span></div>
        <div class="lookpv__bar"><span style="width:64%"></span></div>
        <div class="lookpv__row"><span class="chip lookpv__chip">${esc(t.pvChip)}</span>
          <span class="btn btn--primary btn--sm">${esc(t.pvBtn)}</span></div>
      </div>
      <div class="lookpv__msg"><span>${esc(t.pvMsg)}</span></div>
    </div>
  </div>`;
}

export function appearanceView(lang) {
  const t = ASTR[lang], look = TH.getLook(), mode = TH.currentMode();
  const custom = look.preset === 'custom';
  return `<div class="look">
  <div class="look__opts">
    <section class="card">
      <div class="card__head"><h2>${esc(t.colour)}</h2><span class="muted small">${esc(t.colourHint)}</span></div>
      <div class="lookgrid">${TH.PRESETS.map(p => swatch(p, look, lang, mode)).join('')}</div>
      <div class="lookcustom${custom ? ' is-on' : ''}">
        <label class="lookcustom__pick" title="${esc(t.custom)}">
          <input type="color" id="lookColour" value="${esc(look.accent)}" aria-label="${esc(t.custom)}">
        </label>
        <span class="lookcustom__t"><b>${esc(t.custom)}</b><span class="muted small">${esc(t.customHint)}</span></span>
        <input class="lookcustom__hex" id="lookHex" value="${esc(look.accent)}" maxlength="7" spellcheck="false" dir="ltr" aria-label="${esc(t.hex)}">
        <button type="button" class="btn btn--ghost btn--sm" data-look="surprise">${esc(t.surprise)}</button>
      </div>
    </section>

    <section class="card">
      <div class="card__head"><h2>${esc(t.bg)}</h2><span class="muted small">${esc(t.bgHint)}</span></div>
      <div class="lookrow">${seg('tint', look.tint, [[0, t.plain], [1, t.soft], [2, t.rich]])}</div>
    </section>

    <section class="card">
      <div class="card__head"><h2>${esc(t.mode)}</h2></div>
      <div class="lookrow">${seg('mode', look.mode, [['system', t.system], ['light', t.light], ['dark', t.dark]])}</div>
    </section>

    <section class="card">
      <div class="card__head"><h2>${esc(t.size)}</h2></div>
      <div class="lookrow">${seg('size', look.size, [['s', t.small], ['m', t.normal], ['l', t.large]])}</div>
      <div class="card__head lookhead2"><h2>${esc(t.corners)}</h2></div>
      <div class="lookrow">${seg('corners', look.corners, [['sharp', t.sharp], ['normal', t.normal], ['round', t.round]])}</div>
    </section>
  </div>

  <aside class="look__side">
    <section class="card">
      <div class="card__head"><h2>${esc(t.preview)}</h2></div>
      ${preview(t)}
    </section>
    <div class="look__foot">
      <span class="muted small" id="lookSaved" role="status" aria-live="polite"></span>
      <button type="button" class="btn btn--ghost btn--sm" data-look="reset"${isDefault(look) ? ' disabled' : ''}>${esc(t.reset)}</button>
    </div>
  </aside>
</div>`;
}

/* --------------------------------------------------------------- saving */

let timer = null, lastSaved = null;
/** Save the current look to the profile in a moment (a colour being dragged
    fires dozens of changes; only the last one is sent). */
export function saveSoon(lang, delay = 700) {
  clearTimeout(timer);
  const say = (k) => { const el = document.getElementById('lookSaved'); if (el) el.textContent = k ? ASTR[lang][k] : ''; };
  if (!db.state.me) { say('local'); return; }
  say('saving');
  timer = setTimeout(async () => {
    const look = TH.getLook(), body = isDefault(look) ? null : look, key = JSON.stringify(body);
    if (key === lastSaved) { say('saved'); return; }
    try { await db.setMyTheme(body); lastSaved = key; say('saved'); }
    catch (e) { console.error(e); say('failed'); }
  }, delay);
}

/* ------------------------------------------------------------------ wire */

export function wireAppearance(lang, rerender) {
  const root = document.querySelector('.look');
  if (!root) return;
  const change = (patch, { redraw = true } = {}) => {
    TH.apply({ ...TH.getLook(), ...patch });
    saveSoon(lang);
    if (redraw) rerender();
  };
  root.querySelectorAll('[data-look]').forEach(b => b.onclick = () => {
    const k = b.dataset.look, v = b.dataset.v;
    if (k === 'preset') { const p = TH.PRESETS.find(x => x.id === v); if (p) change({ preset: p.id, accent: p.accent, tint: p.tint }); }
    else if (k === 'tint') change({ tint: Number(v) });
    else if (k === 'mode' || k === 'size' || k === 'corners') change({ [k]: v });
    else if (k === 'surprise') {
      const h = Math.floor(Math.random() * 360), s = 62 + Math.random() * 20, l = 52 + Math.random() * 10;
      change({ preset: 'custom', accent: hsl(h, s, l), tint: TH.getLook().tint || 1 });
    }
    else if (k === 'reset') change({ ...TH.DEFAULT_LOOK });
  });
  // The colour picker: live while dragging, the page redrawn when it closes.
  const pick = root.querySelector('#lookColour'), hex = root.querySelector('#lookHex');
  if (pick) {
    pick.oninput = () => { change({ preset: 'custom', accent: pick.value }, { redraw: false }); if (hex) hex.value = pick.value; };
    pick.onchange = () => change({ preset: 'custom', accent: pick.value });
  }
  if (hex) {
    hex.oninput = () => {
      let v = hex.value.trim(); if (v && v[0] !== '#') v = '#' + v;
      const ok = TH.hexOk(v);
      hex.classList.toggle('is-bad', !!hex.value.trim() && !ok);
      if (ok) { change({ preset: 'custom', accent: v.toLowerCase() }, { redraw: false }); if (pick) pick.value = v.toLowerCase(); }
    };
    hex.onchange = () => { if (TH.hexOk(TH.getLook().accent)) rerender(); };
    hex.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); hex.blur(); } };
  }
}

function hsl(h, s, l) {
  s /= 100; l /= 100;
  const f = (n) => { const k = (n + h / 30) % 12, a = s * Math.min(l, 1 - l); return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
  return '#' + [f(0), f(8), f(4)].map(x => x.toString(16).padStart(2, '0')).join('');
}
