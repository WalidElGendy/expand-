/* ==========================================================================
   Assignment pop-ups.

   When somebody is given a task, a lead action, a place on a project's team
   stage or a pricing line, a card drops in at the top of their screen: what
   it is, which project or lead, by when, from whom, and an Open button that
   goes straight to it. Live (Supabase Realtime) when the app is open, with a
   one-minute check as a fallback; anything that arrived while they were away
   is waiting at the top the next time they open the app. A card stays until
   it is opened or dismissed, and either marks it read.

   The rows are written by database triggers (migrations/notifications.sql);
   this file only shows them. Its own container sits outside #root, so the
   app re-rendering a screen never wipes a card someone has not read yet.
   ========================================================================== */

import * as db from './db.js';
import { esc, fmt, deptName } from './dash.js';

export const NSTR = {
  en: {
    task: 'New task for you', lead_task: 'New lead action for you', stage: 'You were added to a project team',
    pricing: 'Pricing line for you to fill',
    due: 'due {d}', from: 'from {who}', team: '{dept} team',
    open: 'Open', dismiss: 'Dismiss', more: '+{n} more', dismissAll: 'Dismiss all', region: 'Notifications',
  },
  ar: {
    task: 'مهمة جديدة لك', lead_task: 'إجراء جديد لك على عميل محتمل', stage: 'أُضفت إلى فريق مشروع',
    pricing: 'بند تسعير مطلوب منك',
    due: 'الموعد {d}', from: 'من {who}', team: 'فريق {dept}',
    open: 'فتح', dismiss: 'إخفاء', more: '+{n} أخرى', dismissAll: 'إخفاء الكل', region: 'الإشعارات',
  },
};

/** One notification's words: a heading, the thing itself, and a line of
    context (where, by when, from whom). Pure, for the tests. */
export function notifText(n, lang = 'en') {
  const t = NSTR[lang] || NSTR.en, d = n?.data || {};
  const heading = t[n?.kind] || t.task;
  let what = '';
  if (n?.kind === 'stage') what = t.team.replace('{dept}', deptName(d.dept, lang) || d.dept || '');
  else if (n?.kind === 'pricing') what = d.item || '';
  else what = d.task || '';
  const ctx = [
    n?.kind === 'lead_task' ? d.lead : d.project,
    d.due ? t.due.replace('{d}', fmt(String(d.due).slice(0, 10), lang)) : null,
    d.by ? t.from.replace('{who}', d.by) : null,
  ].filter(Boolean).join(' · ');
  return { heading, what, ctx };
}

/* ------------------------------------------------------------- the state */

const MAX_SHOWN = 3;
const WINDOW_DAYS = 14;          // older unread ones are not worth a pop-up
let me = null, lang = 'en', chan = null, timer = null;
let items = [];                  // unread, newest first
let visBound = false;

const box = () => {
  let el = document.getElementById('notif');
  if (!el) {
    el = document.createElement('div');
    el.id = 'notif'; el.className = 'notif';
    el.setAttribute('role', 'region'); el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
    el.addEventListener('click', onClick);
  }
  el.setAttribute('aria-label', (NSTR[lang] || NSTR.en).region);
  return el;
};

function paint() {
  const el = box(), t = NSTR[lang] || NSTR.en;
  el.dir = lang === 'ar' ? 'rtl' : 'ltr';
  const shown = items.slice(0, MAX_SHOWN), rest = items.length - shown.length;
  el.innerHTML = shown.map(n => {
    const x = notifText(n, lang);
    return `<div class="notif__card${n._new ? ' is-new' : ''}" data-notif="${esc(n.id)}">
      <span class="notif__dot" aria-hidden="true"></span>
      <div class="notif__txt">
        <span class="notif__h">${esc(x.heading)}</span>
        ${x.what ? `<b class="notif__w">${esc(x.what)}</b>` : ''}
        ${x.ctx ? `<span class="notif__c">${esc(x.ctx)}</span>` : ''}
      </div>
      ${n.route ? `<button class="btn btn--primary btn--sm" data-notif-open="${esc(n.id)}">${esc(t.open)}</button>` : ''}
      <button class="x" data-notif-close="${esc(n.id)}" title="${esc(t.dismiss)}" aria-label="${esc(t.dismiss)}">✕</button>
    </div>`;
  }).join('') + (rest > 0 || items.length > 1 ? `<div class="notif__more">
      ${rest > 0 ? `<span>${esc(t.more.replace('{n}', rest))}</span>` : ''}
      <button class="link" data-notif-all>${esc(t.dismissAll)}</button></div>` : '');
  items.forEach(n => { n._new = false; });
}

async function markRead(ids) {
  if (!ids.length) return;
  items = items.filter(n => !ids.includes(n.id));
  paint();
  try {
    await db.sb.from('notifications').update({ read_at: new Date().toISOString() }).in('id', ids);
  } catch { /* shown as read here; the next check shows it again if the write failed */ }
}

function onClick(e) {
  const open = e.target.closest('[data-notif-open]');
  const close = e.target.closest('[data-notif-close]');
  if (e.target.closest('[data-notif-all]')) { markRead(items.map(n => n.id)); return; }
  if (close) { markRead([close.dataset.notifClose]); return; }
  if (open) {
    const n = items.find(x => x.id === open.dataset.notifOpen);
    markRead([open.dataset.notifOpen]);
    if (n?.route) {
      if (location.hash === n.route) window.dispatchEvent(new HashChangeEvent('hashchange'));
      else location.hash = n.route;
    }
  }
}

function merge(list, { fresh = false } = {}) {
  const known = new Set(items.map(n => n.id));
  const add = (list || []).filter(n => n && !n.read_at && !known.has(n.id)).map(n => ({ ...n, _new: fresh }));
  if (!add.length) return;
  items = [...add, ...items].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  paint();
}

async function load() {
  if (!me) return;
  const since = new Date(Date.now() - WINDOW_DAYS * 86400e3).toISOString();
  const { data, error } = await db.sb.from('notifications').select('*')
    .is('read_at', null).gte('created_at', since).order('created_at', { ascending: false }).limit(30);
  if (error || !data) return;
  // Read elsewhere (another tab, the phone): take it down here too.
  const live = new Set(data.map(n => n.id));
  const before = items.length;
  items = items.filter(n => live.has(n.id));
  merge(data, { fresh: true });
  if (items.length !== before) paint();
}

function stop() {
  if (chan) { try { db.sb.removeChannel(chan); } catch { /* gone */ } }
  chan = null; me = null; items = [];
  clearInterval(timer); timer = null;
  const el = document.getElementById('notif'); if (el) el.innerHTML = '';
}

/** Called on every render: starts for the signed-in person, stops on sign
    out, and repaints in the current language. Cheap when nothing changed. */
export function ensure(currentLang) {
  lang = currentLang || 'en';
  const id = db.state?.me?.id || null;
  if (!db.sb || !id || db.state.me.is_active === false) { if (me) stop(); return; }
  if (me === id) { if (document.getElementById('notif')) paint(); return; }
  if (me) stop();
  me = id;
  box();
  load();
  chan = db.sb.channel(`notif-${id}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${id}` },
      (p) => merge([p.new], { fresh: true }))
    .subscribe();
  timer = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 60e3);
  if (!visBound) {
    visBound = true;
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && me) load(); });
  }
}
