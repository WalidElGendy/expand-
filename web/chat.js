/* ==========================================================================
   Quick chat — short messages between colleagues, gone when the chat ends.

   Nothing is saved anywhere: a message is a Realtime broadcast that the
   chat-send function stamps with the sender (from their sign-in) and drops
   into the recipient's private inbox channel. It lives in the two open
   browser tabs only. Ending a conversation clears it; closing or reloading
   the app clears everything.

   What makes it more than a text box:
     · each person shows with their title (job title, team, role) and
       whether they have the app open right now — a message only reaches
       someone who does, so the app says so instead of sending into the void;
     · a new message drops in at the top of the screen with Reply, wherever
       the reader is, and the tab title counts what is unread;
     · "Seen" and "typing…", quick replies, and a button that attaches the
       screen you are on (a project, a lead, a tender…) as a link;
     · anyone in "Online now" in the sidebar opens a chat with one click.

   Lives outside #root, like the notification cards, so the app redrawing a
   screen never wipes a half-written message.
   ========================================================================== */

import * as db from './db.js';
import { esc, deptName, avaHtml, DSTR } from './dash.js';

export const CSTR = {
  en: {
    title: 'Quick chat', open: 'Quick chat', minimise: 'Minimise', search: 'Search people…',
    online: 'Online', offline: 'Offline', you: 'you', none: 'Nobody matches.',
    back: 'All people', end: 'End chat', endHint: 'End this chat — the messages disappear for you',
    placeholder: 'Write a quick message…', placeholderOff: '{name} is offline',
    send: 'Send', share: 'Attach the screen you are on', unshare: 'Remove',
    offNote: '{name} does not have the app open, so a message would not reach them. Quick chat only reaches people who are online.',
    ephemeral: 'Nothing is saved: messages disappear when you end the chat or close the app.',
    seen: 'Seen', sending: 'Sending…', failed: 'Not sent — tap to retry', typing: 'typing…',
    from: 'Message from {name}', reply: 'Reply', dismiss: 'Dismiss', empty: 'Say hello — or pick a quick reply.',
    quick: ['On my way', 'Give me 5 minutes', 'Can you call me?', 'Done ✓', 'Busy now — later?', 'Please check this'],
  },
  ar: {
    title: 'محادثة سريعة', open: 'محادثة سريعة', minimise: 'تصغير', search: 'ابحث عن زميل…',
    online: 'متصل', offline: 'غير متصل', you: 'أنت', none: 'لا يوجد تطابق.',
    back: 'كل الزملاء', end: 'إنهاء المحادثة', endHint: 'إنهاء هذه المحادثة — تختفي الرسائل لديك',
    placeholder: 'اكتب رسالة سريعة…', placeholderOff: '{name} غير متصل',
    send: 'إرسال', share: 'إرفاق الصفحة التي أنت عليها', unshare: 'إزالة',
    offNote: '{name} لا يفتح التطبيق الآن، فلن تصله الرسالة. المحادثة السريعة تصل فقط لمن هو متصل.',
    ephemeral: 'لا يُحفظ شيء: تختفي الرسائل عند إنهاء المحادثة أو إغلاق التطبيق.',
    seen: 'تمت المشاهدة', sending: 'جارٍ الإرسال…', failed: 'لم تُرسل — اضغط لإعادة المحاولة', typing: 'يكتب…',
    from: 'رسالة من {name}', reply: 'رد', dismiss: 'إخفاء', empty: 'ابدأ بالتحية — أو اختر رداً سريعاً.',
    quick: ['في الطريق', 'أعطني ٥ دقائق', 'ممكن تتصل بي؟', 'تم ✓', 'مشغول الآن — لاحقاً؟', 'أرجو الاطلاع على هذا'],
  },
};
const fill = (s, o) => Object.entries(o).reduce((a, [k, v]) => a.replaceAll(`{${k}}`, v), String(s));

/** What to call someone under their name: job title, team, and role when
    it is more than "member". Pure, for the tests. */
export function titleOf(p, lang = 'en') {
  if (!p) return '';
  const roles = (DSTR[lang] || DSTR.en).roles || {};
  return [p.job_title || p.title || null, p.department_id || p.dept ? deptName(p.department_id || p.dept, lang) : null,
    p.role && p.role !== 'member' ? (roles[p.role] || p.role) : null].filter(Boolean).join(' · ');
}

/** Message text as HTML: escaped, line breaks kept, web addresses as links. */
export function msgHtml(text) {
  return esc(String(text || ''))
    .replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\n/g, '<br>');
}

/* --------------------------------------------------------------- state */

let me = null, lang = 'en', chan = null, people = [], peopleAt = 0;
let open = false, active = null, q = '', ref = null, watchBound = false, docBound = false;
const convs = new Map();         // person id → { msgs: [], unread: 0, typingUntil: 0, draft: '' }
const pops = [];                 // incoming-message cards: { id, from }
let lastTyping = 0, baseTitle = '';

const T = () => CSTR[lang] || CSTR.en;
const conv = (id) => { if (!convs.has(id)) convs.set(id, { msgs: [], unread: 0, typingUntil: 0, draft: '' }); return convs.get(id); };
const isOnline = (id) => !!db.state.online?.has?.(id);
const person = (id) => people.find(p => p.id === id) || null;
const nameOf = (id) => person(id)?.full_name || db.state.onlineWho?.find(p => p.id === id)?.name || '—';
const unreadTotal = () => [...convs.values()].reduce((a, c) => a + c.unread, 0);
const hhmm = (iso) => { try { return new Date(iso).toLocaleTimeString(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => (Math.random() * 16 | 0).toString(16)));

const ICON = {
  chat: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.8A8 8 0 1 1 21 12z"/><path d="M8.5 11h.01M12 11h.01M15.5 11h.01"/></svg>',
  send: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/></svg>',
  link: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>',
};

/* ------------------------------------------------------------ painting */

function root() {
  let el = document.getElementById('chat');
  if (!el) {
    el = document.createElement('div');
    el.id = 'chat'; el.className = 'chat';
    document.body.appendChild(el);
    el.addEventListener('click', onClick);
    el.addEventListener('keydown', onKey);
    el.addEventListener('input', onInput);
  }
  el.dir = lang === 'ar' ? 'rtl' : 'ltr';
  return el;
}

function popsBox() {
  let el = document.getElementById('chatpop');
  if (!el) {
    el = document.createElement('div');
    el.id = 'chatpop'; el.className = 'notif chatpop';
    el.setAttribute('role', 'region'); el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
    el.addEventListener('click', onClick);
  }
  el.dir = lang === 'ar' ? 'rtl' : 'ltr';
  return el;
}

/** The list of people: open conversations with unread first, then whoever
    is online, then everyone else, by name. Pure, for the tests. */
export function sortPeople(list, { online = new Set(), convs: cv = new Map(), meId = null, q: query = '' } = {}) {
  const n = String(query || '').trim().toLowerCase();
  return list.filter(p => p.id !== meId)
    .filter(p => !n || [p.full_name, p.job_title, p.department_id].some(v => String(v || '').toLowerCase().includes(n)))
    .map(p => ({ p, c: cv.get(p.id), on: online.has(p.id) }))
    .sort((a, b) => (b.c?.unread || 0) - (a.c?.unread || 0)
      || (b.c?.msgs?.length ? 1 : 0) - (a.c?.msgs?.length ? 1 : 0)
      || (b.on ? 1 : 0) - (a.on ? 1 : 0)
      || String(a.p.full_name).localeCompare(String(b.p.full_name)));
}

function listView() {
  const t = T();
  const rows = sortPeople(people, { online: db.state.online || new Set(), convs, meId: me, q });
  return `<div class="chat__head">
      <strong>${esc(t.title)}</strong>
      <button type="button" class="x" data-chat-min aria-label="${esc(t.minimise)}" title="${esc(t.minimise)}">–</button>
    </div>
    <div class="chat__search"><input type="search" data-chat-q value="${esc(q)}" placeholder="${esc(t.search)}" aria-label="${esc(t.search)}" /></div>
    <ul class="chat__people" role="list">
      ${rows.map(({ p, c, on }) => {
        const last = c?.msgs?.at(-1);
        return `<li><button type="button" class="chat__person" data-chat-open="${esc(p.id)}">
          <span class="chat__ava">${avaHtml(p.full_name, p.avatar_path, { cls: 'ava--sm', colour: db.dept?.(p.department_id)?.colour || 'var(--ink4)' })}<i class="chat__dot${on ? ' is-on' : ''}" title="${esc(on ? t.online : t.offline)}"></i></span>
          <span class="chat__who"><b dir="auto">${esc(p.full_name)}</b>
            <span class="chat__title" dir="auto">${esc(last ? `${last.mine ? `${t.you}: ` : ''}${last.text || last.ref?.label || ''}` : titleOf(p, lang) || '—')}</span></span>
          ${c?.unread ? `<span class="chat__badge">${c.unread}</span>` : ''}
        </button></li>`;
      }).join('') || `<li class="muted small chat__none">${esc(t.none)}</li>`}
    </ul>
    <p class="chat__foot">${esc(t.ephemeral)}</p>`;
}

function msgsHtml(id) {
  const t = T(), c = conv(id);
  if (!c.msgs.length) return `<p class="chat__empty">${esc(t.empty)}</p>`;
  const lastMine = [...c.msgs].reverse().find(m => m.mine);
  return c.msgs.map(m => `<div class="chat__msg${m.mine ? ' is-mine' : ''}${m.status === 'failed' ? ' is-failed' : ''}">
      <div class="chat__bubble" dir="auto">${m.text ? msgHtml(m.text) : ''}${m.ref ? `<button type="button" class="chat__ref" data-chat-go="${esc(m.ref.route)}">${ICON.link}<span>${esc(m.ref.label || m.ref.route)}</span></button>` : ''}</div>
      <span class="chat__meta">${esc(hhmm(m.at))}${m.mine && m.status === 'sending' ? ` · ${esc(t.sending)}` : ''}${m.mine && m.status === 'failed' ? ` · <button type="button" class="link small" data-chat-retry="${esc(m.id)}">${esc(t.failed)}</button>` : ''}${m === lastMine && m.seen ? ` · ${esc(t.seen)}` : ''}</span>
    </div>`).join('') + (c.typingUntil > Date.now() ? `<div class="chat__typing">${esc(t.typing)}</div>` : '');
}

function convView(id) {
  const t = T(), p = person(id) || { id, full_name: nameOf(id) }, on = isOnline(id), c = conv(id);
  const name = p.full_name || '—';
  return `<div class="chat__head chat__head--conv">
      <button type="button" class="x chat__back" data-chat-back aria-label="${esc(t.back)}" title="${esc(t.back)}">${lang === 'ar' ? '→' : '←'}</button>
      <span class="chat__ava">${avaHtml(name, p.avatar_path, { cls: 'ava--sm', colour: db.dept?.(p.department_id)?.colour || 'var(--ink4)' })}<i class="chat__dot${on ? ' is-on' : ''}"></i></span>
      <span class="chat__who"><b dir="auto">${esc(name)}</b><span class="chat__title" dir="auto">${esc([titleOf(p, lang), on ? t.online : t.offline].filter(Boolean).join(' · '))}</span></span>
      <button type="button" class="btn btn--sm chat__end" data-chat-end="${esc(id)}" title="${esc(t.endHint)}">${esc(t.end)}</button>
      <button type="button" class="x" data-chat-min aria-label="${esc(t.minimise)}" title="${esc(t.minimise)}">–</button>
    </div>
    <div class="chat__msgs" data-chat-msgs>${msgsHtml(id)}</div>
    ${on ? `<div class="chat__quick">${t.quick.map(x => `<button type="button" class="chip chip--btn" data-chat-quick="${esc(x)}">${esc(x)}</button>`).join('')}</div>`
      : `<p class="chat__off">${esc(fill(t.offNote, { name }))}</p>`}
    ${ref ? `<div class="chat__att"><span>${ICON.link} ${esc(ref.label)}</span><button type="button" class="x" data-chat-unref aria-label="${esc(t.unshare)}">✕</button></div>` : ''}
    <form class="chat__compose" data-chat-form>
      <button type="button" class="chat__icon" data-chat-share title="${esc(t.share)}" aria-label="${esc(t.share)}"${on ? '' : ' disabled'}>${ICON.link}</button>
      <textarea rows="1" data-chat-text dir="auto" maxlength="1000" placeholder="${esc(on ? t.placeholder : fill(t.placeholderOff, { name }))}"${on ? '' : ' disabled'}>${esc(c.draft)}</textarea>
      <button type="submit" class="chat__icon chat__send" aria-label="${esc(t.send)}" title="${esc(t.send)}"${on ? '' : ' disabled'}>${ICON.send}</button>
    </form>
    <p class="chat__foot">${esc(t.ephemeral)}</p>`;
}

function paint() {
  if (!me) return;
  const el = root(), t = T(), n = unreadTotal();
  const hadFocus = el.contains(document.activeElement) ? document.activeElement.matches('[data-chat-text]') ? 'text' : document.activeElement.matches('[data-chat-q]') ? 'q' : null : null;
  el.innerHTML = `${open ? `<section class="chat__panel" role="dialog" aria-label="${esc(t.title)}">${active ? convView(active) : listView()}</section>` : ''}
    <button type="button" class="chat__fab${open ? ' is-open' : ''}" data-chat-toggle aria-label="${esc(t.open)}" title="${esc(t.open)}">${ICON.chat}${n ? `<span class="chat__badge">${n}</span>` : ''}</button>`;
  if (open && active) scrollDown();
  if (hadFocus === 'text') focusText(); else if (hadFocus === 'q') { const i = el.querySelector('[data-chat-q]'); i?.focus(); i?.setSelectionRange(i.value.length, i.value.length); }
  paintPops();
  // The tab title carries the unread count, so a message is noticed from another tab.
  baseTitle = document.title.replace(/^\(\d+\)\s*/, '');
  document.title = n ? `(${n}) ${baseTitle}` : baseTitle;
}

/** Only the messages (a new one, "seen", "typing…"), leaving what is being typed alone. */
function paintMsgs() {
  const box = document.querySelector('#chat [data-chat-msgs]');
  if (!box || !active) return paint();
  box.innerHTML = msgsHtml(active);
  scrollDown();
}
const scrollDown = () => { const b = document.querySelector('#chat [data-chat-msgs]'); if (b) b.scrollTop = b.scrollHeight; };
const focusText = () => { const ta = document.querySelector('#chat [data-chat-text]'); if (ta && !ta.disabled) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); } };

function paintPops() {
  const el = popsBox(), t = T();
  el.innerHTML = pops.slice(-3).map(pp => {
    const m = conv(pp.from).msgs.find(x => x.id === pp.id);
    const p = person(pp.from) || pp.p || {};
    return `<div class="notif__card chatpop__card is-new" data-chatpop="${esc(pp.id)}">
      <span class="chat__ava">${avaHtml(p.full_name || pp.name, p.avatar_path || pp.avatar, { cls: 'ava--sm' })}</span>
      <div class="notif__txt">
        <span class="notif__h">${esc(fill(t.from, { name: p.full_name || pp.name || '' }))}${titleOf(p.id ? p : pp.p, lang) ? ` · ${esc(titleOf(p.id ? p : pp.p, lang))}` : ''}</span>
        <b class="notif__w" dir="auto">${esc(m?.text || m?.ref?.label || '')}</b>
      </div>
      <button type="button" class="btn btn--primary btn--sm" data-chat-reply="${esc(pp.from)}">${esc(t.reply)}</button>
      <button type="button" class="x" data-chatpop-close="${esc(pp.id)}" aria-label="${esc(t.dismiss)}">✕</button>
    </div>`;
  }).join('');
  el.querySelectorAll('.is-new').forEach(x => setTimeout(() => x.classList.remove('is-new'), 400));
}

/* ------------------------------------------------------------- actions */

function openWith(id) {
  if (!me || !id || id === me) return;
  open = true; active = id; ref = null;
  const c = conv(id); c.unread = 0;
  for (let i = pops.length - 1; i >= 0; i--) if (pops[i].from === id) pops.splice(i, 1);
  loadPeople();
  paint(); focusText(); markSeen();
}

async function call(body) {
  const { data, error } = await db.sb.functions.invoke('chat-send', { body });
  if (error) throw error;
  return data;
}

async function send(text, attach = null) {
  if (!active) return;
  const id = uuid(), to = active, c = conv(to);
  const m = { id, mine: true, text: String(text || '').trim().slice(0, 1000), ref: attach, at: new Date().toISOString(), status: 'sending' };
  if (!m.text && !m.ref) return;
  c.msgs.push(m); c.draft = ''; ref = null;
  paint(); focusText();
  try { const r = await call({ to, kind: 'msg', id, text: m.text, ref: m.ref }); m.status = 'sent'; m.at = r?.at || m.at; }
  catch { m.status = 'failed'; }
  if (active === to) paintMsgs();
}

/** Tell the other side what has been read, once per message. */
function markSeen() {
  if (!active || !open || document.visibilityState !== 'visible') return;
  const c = conv(active);
  const ids = c.msgs.filter(m => !m.mine && !m.acked).map(m => { m.acked = true; return m.id; });
  if (ids.length && isOnline(active)) call({ to: active, kind: 'seen', ids }).catch(() => {});
}

function onClick(e) {
  const el = (s) => e.target.closest(s);
  let b;
  if ((b = el('[data-chat-toggle]'))) { open = !open; if (open) { loadPeople(); if (active) conv(active).unread = 0; } paint(); if (open && active) { focusText(); markSeen(); } return; }
  if (el('[data-chat-min]')) { open = false; paint(); return; }
  if ((b = el('[data-chat-open]'))) { openWith(b.dataset.chatOpen); return; }
  if (el('[data-chat-back]')) { active = null; ref = null; paint(); document.querySelector('#chat [data-chat-q]')?.focus(); return; }
  if ((b = el('[data-chat-end]'))) { convs.delete(b.dataset.chatEnd); active = null; ref = null; paint(); return; }
  if ((b = el('[data-chat-quick]'))) { send(b.dataset.chatQuick, ref); return; }
  if (el('[data-chat-share]')) { ref = currentScreen(); paint(); focusText(); return; }
  if (el('[data-chat-unref]')) { ref = null; paint(); focusText(); return; }
  if ((b = el('[data-chat-go]'))) { location.hash = b.dataset.chatGo; return; }
  if ((b = el('[data-chat-retry]'))) {
    const c = conv(active), m = c.msgs.find(x => x.id === b.dataset.chatRetry);
    if (m) { c.msgs = c.msgs.filter(x => x !== m); send(m.text, m.ref); }
    return;
  }
  if ((b = el('[data-chat-reply]'))) { openWith(b.dataset.chatReply); return; }
  if ((b = el('[data-chatpop-close]'))) {
    const i = pops.findIndex(x => x.id === b.dataset.chatpopClose);
    if (i >= 0) pops.splice(i, 1);
    paintPops(); return;
  }
  if (e.type === 'click' && el('[data-chat-form]') && e.target.closest('button[type=submit]')) return;
}

function onKey(e) {
  if (e.key === 'Escape' && open) { open = false; paint(); document.querySelector('#chat [data-chat-toggle]')?.focus(); return; }
  if (e.target.matches?.('[data-chat-text]') && e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    send(e.target.value, ref);
  }
}

function onInput(e) {
  if (e.target.matches?.('[data-chat-q]')) { q = e.target.value; paint(); return; }
  if (e.target.matches?.('[data-chat-text]') && active) {
    conv(active).draft = e.target.value;
    // Grow with the text, up to five lines.
    e.target.style.height = 'auto'; e.target.style.height = `${Math.min(e.target.scrollHeight, 110)}px`;
    if (Date.now() - lastTyping > 3000 && e.target.value.trim() && isOnline(active)) {
      lastTyping = Date.now();
      call({ to: active, kind: 'typing' }).catch(() => {});
    }
  }
}

/** The screen you are on, as a link to attach: a project, a lead… */
function currentScreen() {
  const route = (location.hash || '#/').slice(0, 200);
  const h1 = document.querySelector('#root h1')?.textContent?.trim() || '';
  const h2 = document.querySelector('#root .card h2')?.textContent?.trim() || '';
  const specific = /^#\/(p|l|t|tenders\/t|etimad\/t|hr\/e)\//.test(route) || route.split('/').length > 3;
  return { route, label: (specific && h2 ? `${h2}${h1 && h1 !== h2 ? ` — ${h1}` : ''}` : h1 || h2 || route).slice(0, 160) };
}

/* A short, soft chime for a new message; silent where the browser says no. */
let actx = null;
function chime() {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(880, actx.currentTime); o.frequency.setValueAtTime(1320, actx.currentTime + 0.09);
    g.gain.setValueAtTime(0.0001, actx.currentTime); g.gain.exponentialRampToValueAtTime(0.08, actx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + 0.28);
    o.connect(g).connect(actx.destination); o.start(); o.stop(actx.currentTime + 0.3);
  } catch { /* no sound */ }
}

/* ------------------------------------------------------------ receiving */

function receive(p) {
  if (!p || !p.from || p.from === me) return;
  if (!person(p.from)) people.push({ id: p.from, full_name: p.name, department_id: p.dept, role: p.role, job_title: p.title, avatar_path: p.avatar });
  const c = conv(p.from);
  if (p.kind === 'typing') {
    c.typingUntil = Date.now() + 4500;
    if (open && active === p.from) { paintMsgs(); setTimeout(() => { if (active === p.from) paintMsgs(); }, 4600); }
    return;
  }
  if (p.kind === 'seen') {
    const ids = new Set(p.ids || []);
    c.msgs.forEach(m => { if (m.mine && ids.has(m.id)) m.seen = true; });
    if (open && active === p.from) paintMsgs();
    return;
  }
  if (c.msgs.some(m => m.id === p.id)) return;
  c.typingUntil = 0;
  c.msgs.push({ id: p.id, mine: false, text: p.text, ref: p.ref, at: p.at });
  const watching = open && active === p.from && document.visibilityState === 'visible';
  if (watching) { paintMsgs(); markSeen(); return; }
  c.unread++;
  pops.push({ id: p.id, from: p.from, name: p.name, avatar: p.avatar, p: { full_name: p.name, department_id: p.dept, role: p.role, job_title: p.title } });
  chime();
  paint();
}

async function loadPeople() {
  if (Date.now() - peopleAt < 5 * 60e3 && people.length) return;
  peopleAt = Date.now();
  try {
    const { data } = await db.sb.rpc('chat_directory');
    if (Array.isArray(data)) { people = data; if (open) paint(); }
  } catch { /* the list falls back to who is online */ }
}

/* ------------------------------------------------------------- lifecycle */

function stop() {
  if (chan) { try { db.sb.removeChannel(chan); } catch { /* gone */ } }
  chan = null; me = null; people = []; peopleAt = 0; convs.clear(); pops.length = 0; open = false; active = null; ref = null;
  const el = document.getElementById('chat'); if (el) el.innerHTML = '';
  const pp = document.getElementById('chatpop'); if (pp) pp.innerHTML = '';
  if (baseTitle) document.title = baseTitle;
}

/** Called on every render: starts for the signed-in person, stops on sign
    out, repaints in the current language. */
export function ensure(currentLang) {
  const langChanged = lang !== (currentLang || 'en');
  lang = currentLang || 'en';
  const id = db.state?.me?.id || null;
  if (!db.sb || !id || db.state.me.is_active === false) { if (me) stop(); return; }
  if (me === id) { if (langChanged) paint(); else document.querySelector('#chat') || paint(); return; }
  if (me) stop();
  me = id;
  if (!watchBound) {
    watchBound = true;
    // Someone coming online or going away changes who can be written to.
    db.onOnlineChange(() => { if (!me) return; if (open && !active) paint(); else if (open && active) { const ta = document.activeElement; paint(); if (ta?.matches?.('[data-chat-text]')) focusText(); } });
  }
  if (!docBound) {
    docBound = true;
    // "Online now" in the sidebar: a click on a colleague opens a chat.
    document.addEventListener('click', (e) => { const b = e.target.closest('[data-chat-with]'); if (b) { e.preventDefault(); openWith(b.dataset.chatWith); } });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') markSeen(); });
  }
  chan = db.sb.channel(`inbox:${id}`, { config: { private: true } })
    .on('broadcast', { event: 'chat' }, ({ payload }) => receive(payload));
  Promise.resolve(db.sb.realtime.setAuth?.()).catch(() => {}).finally(() => chan?.subscribe());
  paint();
}
