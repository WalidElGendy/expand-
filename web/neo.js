/* ==========================================================================
   Neo AI — Work › Neo (#/neo).

   One command bar, twelve agents. A person says what they need; Neo picks
   up to three agents (or the person picks them), each reads its part of the
   workspace WITH THE PERSON'S OWN PERMISSIONS, and the answer comes back as
   a report: a section per agent and the next steps.

   Two places to think:
     · This computer — a model running in Ollama on the person's own PC. The
       browser reads the data and asks the local model; the request and the
       answer never leave the machine (except the saved report, which goes to
       the person's own private history).
     · Network AI — Claude, through the neo function. Same data, same
       permissions, a stronger model; 40 runs a day each.

   History is private: neo_tasks is readable by its owner only.
   ========================================================================== */

import * as db from './db.js';
import { esc } from './dash.js';
import { AGENTS, KEYS, MAX_AGENTS, agent, routeLocal, cleanAgents, readsFor, systemPrompt, parseReport, readStored, md, reportText, MCP } from './neologic.js';

export const NSTR = {
  en: {
    nav: 'Neo AI', sub: 'twelve agents, one command bar',
    hello: (n) => `What should the team do${n ? ', ' + n : ''}?`,
    ph: 'e.g. Which tenders close this week, and are we ready for them?',
    run: 'Send to Neo', running: 'Working…', pick: 'Agents', auto: 'Neo picks',
    pickHint: `Leave empty and Neo picks — or choose up to ${MAX_AGENTS}.`,
    where: 'Runs on', network: 'Network AI', local: 'This computer',
    networkHint: 'Claude, with your permissions. 40 runs a day.',
    localHint: 'A model on your own PC via Ollama. Nothing leaves it.',
    localNone: 'No local AI found on this computer.',
    localHow: 'Install Ollama, then run it with OLLAMA_ORIGINS=https://expand.meshnet.co and pull a model (for example: ollama pull qwen2.5:14b). Your browser may ask to allow access to this computer.',
    localFound: (m) => `Found ${m} on this computer.`, model: 'Model', recheck: 'Check again',
    agents: 'The team', agentsSub: 'Click an agent to put it on the next request.',
    idle: 'Ready', busy: 'Working', runs: (n) => n === 1 ? '1 report' : `${n} reports`,
    board: 'Work', all: 'All', working: 'Working', done: 'Done', failed: 'Failed',
    empty: 'Nothing yet. Ask Neo something above — reports land here.',
    open: 'Open report', again: 'Run again', copy: 'Copy', copied: 'Copied',
    del: 'Delete', close: 'Close', steps: 'Next steps', asked: 'You asked',
    onLocal: 'On this computer', onNet: 'Network AI', when: 'When',
    mcp: 'Connectors (MCP)', mcpSub: 'What Neo can reach. Only workspace data is wired in today; an admin connects the rest.',
    st: { builtin: 'Built in', local: 'On your computer', connect: 'Admin connects', build: 'For developers', directory: 'Directory' },
    errors: {
      sign_in: 'Please sign in again.', not_configured: 'Network AI is not set up yet — ask your admin to add the AI key.',
      daily_limit: 'You have used today\'s 40 network runs. Try again tomorrow, or run it on this computer.',
      ai_unavailable: 'The network AI did not answer. Try again in a minute.', empty: 'Type what you need first.',
      local: 'The local model did not answer. Is Ollama still running?', generic: 'Something went wrong.',
    },
    noSave: 'Report shown but not saved to your history.',
  },
  ar: {
    nav: 'نيو AI', sub: 'اثنا عشر وكيلًا وشريط أوامر واحد',
    hello: (n) => `ماذا تريد من الفريق${n ? ' يا ' + n : ''}؟`,
    ph: 'مثال: ما المناقصات التي تغلق هذا الأسبوع، وهل نحن جاهزون لها؟',
    run: 'أرسل إلى نيو', running: 'جارٍ العمل…', pick: 'الوكلاء', auto: 'نيو يختار',
    pickHint: `اتركها فارغة ليختار نيو — أو اختر حتى ${MAX_AGENTS}.`,
    where: 'يعمل على', network: 'ذكاء الشبكة', local: 'هذا الجهاز',
    networkHint: 'Claude، بصلاحياتك. 40 طلبًا يوميًا.',
    localHint: 'نموذج على جهازك عبر Ollama. لا يخرج شيء منه.',
    localNone: 'لم يُعثر على ذكاء محلي على هذا الجهاز.',
    localHow: 'ثبّت Ollama ثم شغّله مع OLLAMA_ORIGINS=https://expand.meshnet.co وحمّل نموذجًا (مثلًا: ollama pull qwen2.5:14b). قد يطلب المتصفح إذنًا للوصول إلى هذا الجهاز.',
    localFound: (m) => `وُجد ${m} على هذا الجهاز.`, model: 'النموذج', recheck: 'تحقق مجددًا',
    agents: 'الفريق', agentsSub: 'اضغط على وكيل لإضافته إلى الطلب التالي.',
    idle: 'جاهز', busy: 'يعمل', runs: (n) => `${n} تقرير`,
    board: 'العمل', all: 'الكل', working: 'قيد العمل', done: 'منجز', failed: 'تعذّر',
    empty: 'لا شيء بعد. اطلب من نيو شيئًا في الأعلى — وستظهر التقارير هنا.',
    open: 'افتح التقرير', again: 'أعد التشغيل', copy: 'نسخ', copied: 'نُسخ',
    del: 'حذف', close: 'إغلاق', steps: 'الخطوات التالية', asked: 'طلبك',
    onLocal: 'على هذا الجهاز', onNet: 'ذكاء الشبكة', when: 'الوقت',
    mcp: 'الموصلات (MCP)', mcpSub: 'ما يستطيع نيو الوصول إليه. بيانات مساحة العمل فقط مربوطة اليوم، ويربط المسؤول الباقي.',
    st: { builtin: 'مدمج', local: 'على جهازك', connect: 'يربطه المسؤول', build: 'للمطورين', directory: 'دليل' },
    errors: {
      sign_in: 'يرجى تسجيل الدخول مجددًا.', not_configured: 'ذكاء الشبكة غير مفعّل بعد — اطلب من المسؤول إضافة مفتاح الذكاء.',
      daily_limit: 'استخدمت طلبات الشبكة الأربعين لليوم. حاول غدًا أو شغّله على هذا الجهاز.',
      ai_unavailable: 'لم يرد ذكاء الشبكة. حاول بعد دقيقة.', empty: 'اكتب ما تحتاجه أولًا.',
      local: 'لم يرد النموذج المحلي. هل ما زال Ollama يعمل؟', generic: 'حدث خطأ ما.',
    },
    noSave: 'عُرض التقرير ولم يُحفظ في سجلك.',
  },
};

const OLLAMA = 'http://localhost:11434';
const PREF = 'expand.neo';

/* ------------------------------------------------------------------ state */

const st = {
  owner: null, loaded: false, tasks: [], running: [],          // running: {id, agents, title, prompt, model, created_at}
  pick: [], draft: '', filter: 'all', err: '', note: '',
  where: 'network', local: { checked: false, models: [], model: '' },
};
try { const p = JSON.parse(localStorage.getItem(PREF) || '{}'); if (p.where === 'local') st.where = 'local'; if (p.model) st.local.model = String(p.model); } catch { /* private window */ }
const savePref = () => { try { localStorage.setItem(PREF, JSON.stringify({ where: st.where, model: st.local.model })); } catch { /* fine */ } };

const nameOf = (k, lang) => (agent(k) || {})[lang] || k;
const jobOf = (k, lang) => (agent(k) || {})[lang === 'ar' ? 'jobAr' : 'jobEn'] || '';
const initials = (k, lang) => ((agent(k) || {}).mark || [k.slice(0, 2).toUpperCase(), k.slice(0, 2)])[lang === 'ar' ? 1 : 0];
const busyAgents = () => new Set(st.running.flatMap(r => r.agents));
const when = (iso, lang) => { try { return new Date(iso).toLocaleString(lang === 'ar' ? 'ar-SA' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };

/* ------------------------------------------------------------- the view */

function orbit(lang) {
  const busy = busyAgents();
  return `<div class="neo-orbit${st.running.length ? ' is-busy' : ''}" aria-hidden="true">
    <div class="neo-orbit__ring"></div><div class="neo-orbit__ring neo-orbit__ring--2"></div>
    ${AGENTS.map((a, i) => `<span class="neo-orbit__node${busy.has(a.key) ? ' is-busy' : ''}${st.pick.includes(a.key) ? ' is-picked' : ''}" style="--i:${i};--h:${a.hue}">${esc(initials(a.key, lang))}</span>`).join('')}
    <div class="neo-orbit__core"><b>Neo</b><small>${st.running.length ? esc(NSTR[lang].running) : '12'}</small></div>
  </div>`;
}

function localBox(t) {
  if (st.where !== 'local') return `<p class="neo-cmd__hint">${esc(t.networkHint)}</p>`;
  const L = st.local;
  if (!L.checked) return `<p class="neo-cmd__hint">${esc(t.localHint)}</p>`;
  if (!L.models.length) return `<div class="neo-cmd__local is-none"><p><b>${esc(t.localNone)}</b> ${esc(t.localHow)}</p>
      <button type="button" class="btn btn--ghost btn--sm" data-neo="recheck">${esc(t.recheck)}</button></div>`;
  return `<div class="neo-cmd__local"><span class="neo-dot is-ok"></span><span>${esc(t.localFound(L.model))}</span>
    <label class="neo-cmd__model">${esc(t.model)} <select data-neo="model">${L.models.map(m => `<option${m === L.model ? ' selected' : ''}>${esc(m)}</option>`).join('')}</select></label></div>`;
}

function cmdBar(lang) {
  const t = NSTR[lang];
  const me = db.state.me || {};
  const first = String(me.full_name || '').split(/\s+/)[0];
  return `<div class="neo-cmd">
    <h2 class="neo-cmd__hello">${esc(t.hello(first))}</h2>
    <form class="neo-cmd__box" data-neo="form">
      <textarea id="neo-prompt" rows="3" maxlength="4000" placeholder="${esc(t.ph)}" aria-label="${esc(t.nav)}">${esc(st.draft)}</textarea>
      <div class="neo-cmd__row">
        <div class="neo-cmd__picks" aria-label="${esc(t.pick)}">
          ${st.pick.length ? st.pick.map(k => `<button type="button" class="neo-chip is-on" style="--h:${agent(k).hue}" data-neo-unpick="${esc(k)}">${esc(nameOf(k, lang))} <span aria-hidden="true">✕</span></button>`).join('')
            : `<span class="neo-chip neo-chip--auto">✦ ${esc(t.auto)}</span>`}
        </div>
        <div class="segbar neo-cmd__where" role="radiogroup" aria-label="${esc(t.where)}">
          <button type="button" class="seg${st.where === 'network' ? ' is-on' : ''}" role="radio" aria-checked="${st.where === 'network'}" data-neo-where="network">${esc(t.network)}</button>
          <button type="button" class="seg${st.where === 'local' ? ' is-on' : ''}" role="radio" aria-checked="${st.where === 'local'}" data-neo-where="local">${esc(t.local)}</button>
        </div>
        <button type="submit" class="btn btn--primary neo-cmd__go">${esc(t.run)} <span aria-hidden="true">${lang === 'ar' ? '←' : '→'}</span></button>
      </div>
      ${localBox(t)}
      ${st.err ? `<p class="note bad" role="alert">${esc(st.err)}</p>` : ''}
      ${st.note ? `<p class="note">${esc(st.note)}</p>` : ''}
    </form>
  </div>`;
}

function agentsCard(lang) {
  const t = NSTR[lang];
  const busy = busyAgents();
  const counts = {};
  for (const r of st.tasks) if (r.status === 'done') for (const k of r.agents || []) counts[k] = (counts[k] || 0) + 1;
  return `<section class="card neo-agents" id="neo-agents">
    <div class="card__head"><h2>${esc(t.agents)}</h2><span class="muted">${esc(t.agentsSub)}</span></div>
    <div class="neo-agents__grid">
      ${AGENTS.map(a => {
        const on = st.pick.includes(a.key), b = busy.has(a.key);
        return `<button type="button" class="neo-agent${on ? ' is-picked' : ''}${b ? ' is-busy' : ''}" style="--h:${a.hue}" data-neo-pick="${esc(a.key)}" aria-pressed="${on}">
          <span class="neo-agent__ava">${esc(initials(a.key, lang))}</span>
          <span class="neo-agent__txt"><b>${esc(nameOf(a.key, lang))}</b><small>${esc(jobOf(a.key, lang))}</small></span>
          <span class="neo-agent__st"><span class="neo-dot${b ? ' is-busy' : ' is-ok'}"></span>${esc(b ? t.busy : t.idle)}${counts[a.key] ? ` · ${esc(t.runs(counts[a.key]))}` : ''}</span>
        </button>`;
      }).join('')}
    </div>
  </section>`;
}

function taskCard(r, lang, live) {
  const t = NSTR[lang];
  const status = live ? 'working' : r.status;
  const rep = live ? { sections: [] } : readStored(r);
  const lead = rep.sections[0]?.summary || (status === 'failed' ? t.errors.generic : '');
  const flat = lead.replace(/\n\s*([-*•]|\d+[.)])\s+/g, ' · ').replace(/^\s*([-*•]|\d+[.)]|#+)\s+/gm, '').replace(/[*`]/g, '').replace(/\s+/g, ' ').trim();
  const snippet = flat.length > 180 ? flat.slice(0, 180).trimEnd() + '…' : flat;
  return `<article class="neo-task is-${esc(status)}">
    <header class="neo-task__head">
      <span class="neo-task__st"><span class="neo-dot${status === 'working' ? ' is-busy' : status === 'done' ? ' is-ok' : ' is-bad'}"></span>${esc(t[status] || status)}</span>
      <span class="neo-task__where">${esc(String(r.model || '').startsWith('local:') ? t.onLocal : t.onNet)}</span>
      <time class="muted">${esc(when(r.created_at, lang))}</time>
    </header>
    <h3 class="neo-task__title">${esc(r.title || r.prompt)}</h3>
    <div class="neo-task__agents">${(r.agents || []).map(k => `<span class="neo-mini" style="--h:${(agent(k) || { hue: 265 }).hue}" title="${esc(nameOf(k, lang))}">${esc(initials(k, lang))}</span>`).join('')}
      <span class="muted">${esc((r.agents || []).map(k => nameOf(k, lang)).join(' · '))}</span></div>
    ${status === 'working' ? '<div class="neo-task__bar"><i></i></div>' : snippet ? `<p class="neo-task__snip">${esc(snippet)}</p>` : ''}
    ${live ? '' : `<footer class="neo-task__foot">
      ${status === 'done' ? `<button type="button" class="btn btn--sm" data-neo-open="${esc(r.id)}">${esc(t.open)}</button>` : ''}
      <button type="button" class="btn btn--ghost btn--sm" data-neo-again="${esc(r.id)}">${esc(t.again)}</button>
      <button type="button" class="x" data-neo-del="${esc(r.id)}" title="${esc(t.del)}" aria-label="${esc(t.del)}">✕</button>
    </footer>`}
  </article>`;
}

function boardCard(lang) {
  const t = NSTR[lang];
  const f = st.filter;
  const rows = st.tasks.filter(r => f === 'all' || r.status === f);
  const live = f === 'all' || f === 'working' ? st.running : [];
  const n = (s) => s === 'working' ? st.running.length : s === 'all' ? st.tasks.length + st.running.length : st.tasks.filter(r => r.status === s).length;
  return `<section class="card neo-board" id="neo-board">
    <div class="card__head"><h2>${esc(t.board)}</h2>
      <div class="segbar" role="tablist">${['all', 'working', 'done', 'failed'].map(s =>
        `<button type="button" class="seg${f === s ? ' is-on' : ''}" role="tab" aria-selected="${f === s}" data-neo-filter="${s}">${esc(t[s])} <span class="neo-count">${n(s)}</span></button>`).join('')}</div>
    </div>
    <div class="neo-board__list">
      ${live.map(r => taskCard(r, lang, true)).join('')}
      ${rows.map(r => taskCard(r, lang, false)).join('')}
      ${!live.length && !rows.length ? `<p class="neo-empty">${esc(st.loaded ? t.empty : '…')}</p>` : ''}
    </div>
  </section>`;
}

function mcpCard(lang) {
  const t = NSTR[lang];
  return `<section class="card neo-mcp">
    <div class="card__head"><h2>${esc(t.mcp)}</h2><span class="muted">${esc(t.mcpSub)}</span></div>
    <div class="neo-mcp__grid">${MCP.map(m => `<a class="neo-mcp__item is-${esc(m.state)}" href="https://github.com/${esc(m.repo)}" target="_blank" rel="noopener noreferrer">
        <span class="neo-mcp__st">${esc(t.st[m.state])}</span>
        <b>${esc(m[lang][0])}</b><small>${esc(m[lang][1])}</small>
        <code>${esc(m.repo)}</code></a>`).join('')}</div>
  </section>`;
}

export function neoView(lang) {
  // A different person signed in on this tab: forget the last one's history.
  const who = db.state.me?.id || null;
  if (st.owner !== who) { resetNeo(); st.owner = who; }
  if (!st.loaded) load(lang);
  return `<div class="neo">
    <section class="neo-hero">${orbit(lang)}${cmdBar(lang)}</section>
    <div class="neo-grid">${boardCard(lang)}${agentsCard(lang)}</div>
    ${mcpCard(lang)}
    <dialog class="neo-dlg" id="neo-dlg"></dialog>
  </div>`;
}

/* ---------------------------------------------------------- the report */

function reportHtml(r, lang) {
  const t = NSTR[lang];
  const rep = readStored(r);
  return `<div class="neo-rep">
    <header class="neo-rep__head">
      <div><span class="muted">${esc(String(r.model || '').startsWith('local:') ? `${t.onLocal} · ${String(r.model).slice(6)}` : t.onNet)} · ${esc(when(r.created_at, lang))}</span>
        <h2>${esc(r.title || r.prompt)}</h2></div>
      <button type="button" class="x" data-neo-close aria-label="${esc(t.close)}">✕</button>
    </header>
    <p class="neo-rep__ask"><b>${esc(t.asked)}:</b> ${esc(r.prompt)}</p>
    ${rep.sections.map(s => `<section class="neo-rep__sec" style="--h:${(agent(s.agent) || { hue: 265 }).hue}">
      <h3><span class="neo-mini">${esc(initials(s.agent, lang))}</span>${esc(nameOf(s.agent, lang))}</h3>
      <div class="neo-md">${md(s.summary)}</div></section>`).join('')}
    ${rep.next_steps.length ? `<section class="neo-rep__steps"><h3>${esc(t.steps)}</h3><ol>${rep.next_steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol></section>` : ''}
    <footer class="neo-rep__foot">
      <button type="button" class="btn btn--sm" data-neo-copy="${esc(r.id)}">${esc(t.copy)}</button>
      <button type="button" class="btn btn--ghost btn--sm" data-neo-again="${esc(r.id)}">${esc(t.again)}</button>
      <button type="button" class="btn btn--ghost btn--sm" data-neo-close>${esc(t.close)}</button>
    </footer>
  </div>`;
}

function openReport(id, lang) {
  const r = st.tasks.find(x => x.id === id);
  const dlg = document.getElementById('neo-dlg');
  if (!r || !dlg) return;
  dlg.innerHTML = reportHtml(r, lang);
  dlg.dir = lang === 'ar' ? 'rtl' : 'ltr';
  try { dlg.showModal(); } catch { dlg.setAttribute('open', ''); }
}

/* --------------------------------------------------------------- data */

async function load(lang) {
  st.loaded = true;
  if (!db.sb || !db.state.me) return;
  const { data, error } = await db.sb.from('neo_tasks')
    .select('id, agents, title, prompt, status, result, model, created_at, finished_at')
    .order('created_at', { ascending: false }).limit(60);
  if (!error) st.tasks = data || [];
  refresh(lang);
}

async function checkLocal(lang) {
  try {
    const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 2500);
    const r = await fetch(OLLAMA + '/api/tags', { signal: ctl.signal }); clearTimeout(tm);
    const j = await r.json();
    st.local.models = (j.models || []).map(m => m.name).filter(Boolean);
  } catch { st.local.models = []; }
  st.local.checked = true;
  if (!st.local.models.includes(st.local.model)) st.local.model = st.local.models[0] || '';
  savePref();
  refresh(lang, true);
}

/* The workspace, as the person — the same rule the network function follows. */
async function readSlices(keys) {
  const out = {};
  await Promise.all(readsFor(keys).map(async ([table, cols, limit]) => {
    const { data, error } = await db.sb.from(table).select(cols).limit(limit);
    out[table] = error ? `not available to you (${String(error.message).slice(0, 80)})` : data;
  }));
  return out;
}

async function runLocal(prompt, keys, lang) {
  const agents = keys.length ? keys : routeLocal(prompt);
  const slices = await readSlices(agents);
  const me = db.state.me || {};
  const sys = systemPrompt(agents, lang, me.full_name, new Date().toISOString().slice(0, 10));
  const data = JSON.stringify(slices); const user = `Request: ${prompt}\n\nWorkspace data (JSON, trimmed):\n${data.length > 24000 ? data.slice(0, 24000) + '…' : data}`;
  const r = await fetch(OLLAMA + '/api/chat', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: st.local.model, stream: false, format: 'json', options: { temperature: 0.2 },
      messages: [{ role: 'system', content: sys }, { role: 'user', content: user }] }),
  });
  if (!r.ok) throw new Error('local');
  const j = await r.json();
  const rep = parseReport(j?.message?.content, agents);
  return { agents, title: rep.title || prompt.slice(0, 80), sections: rep.sections, next_steps: rep.next_steps, model: 'local:' + st.local.model };
}

async function runNetwork(prompt, keys, lang) {
  const { data, error } = await db.sb.functions.invoke('neo', { body: { prompt, agents: keys, lang } });
  if (error) {
    let code = 'generic';
    try { const b = await error.context?.json?.(); if (b?.error) code = b.error; } catch { /* keep */ }
    throw new Error(code);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

async function run(prompt, keys, lang) {
  const t = NSTR[lang];
  st.err = ''; st.note = '';
  prompt = String(prompt || '').trim().slice(0, 4000);
  if (!prompt) { st.err = t.errors.empty; return refresh(lang, true); }
  if (st.where === 'local' && !st.local.model) { await checkLocal(lang); if (!st.local.model) return; }
  const local = st.where === 'local';
  const guess = keys.length ? keys : local ? routeLocal(prompt) : [];
  const live = { id: 'live-' + Date.now(), agents: guess, title: prompt.slice(0, 120), prompt, model: local ? 'local:' + st.local.model : 'claude', created_at: new Date().toISOString() };
  st.running.unshift(live); st.draft = ''; st.pick = [];
  const box = document.getElementById('neo-prompt'); if (box) box.value = '';
  refresh(lang, true);
  try {
    const res = local ? await runLocal(prompt, keys, lang) : await runNetwork(prompt, keys, lang);
    let row = { id: res.id, agents: res.agents, title: res.title, prompt, status: 'done', model: res.model,
      result: JSON.stringify({ sections: res.sections, next_steps: res.next_steps }), created_at: res.created_at || live.created_at };
    if (local) {
      // The network function saves its own; a local run is saved from here.
      const { data, error } = await db.sb.from('neo_tasks').insert({ owner: db.state.me.id, agents: row.agents, title: row.title,
        prompt, status: 'done', result: row.result, model: row.model, finished_at: new Date().toISOString() }).select('id, created_at').single();
      if (error) { st.note = t.noSave; row.id = live.id; } else row = { ...row, ...data };
    }
    if (!row.id) row.id = live.id;
    st.tasks.unshift(row);
    st.running = st.running.filter(x => x !== live);
    refresh(lang, true);
    openReport(row.id, lang);
  } catch (e) {
    const code = local ? 'local' : String(e && e.message || 'generic');
    st.err = t.errors[code] || t.errors.generic;
    st.running = st.running.filter(x => x !== live);
    st.draft = prompt;
    refresh(lang, true);
  }
}

/* -------------------------------------------------------------- wiring */

let wired = { lang: 'en' };

/** Re-draw the parts that change without touching what the person is typing. */
function refresh(lang, cmdToo) {
  const root = document.querySelector('.neo');
  if (!root) return;
  const typing = document.getElementById('neo-prompt');
  if (typing) st.draft = typing.value;
  const swap = (sel, html) => { const el = root.querySelector(sel); if (el) el.outerHTML = html; };
  swap('#neo-board', boardCard(lang));
  swap('#neo-agents', agentsCard(lang));
  swap('.neo-orbit', orbit(lang));
  if (cmdToo) swap('.neo-cmd', cmdBar(lang));
}

export function wireNeo(lang) {
  wired.lang = lang;
  const root = document.querySelector('.neo');
  if (!root || root.dataset.wired) return;
  root.dataset.wired = '1';
  if (st.where === 'local' && !st.local.checked) checkLocal(lang);

  root.addEventListener('input', (e) => { if (e.target.id === 'neo-prompt') st.draft = e.target.value; });
  root.addEventListener('keydown', (e) => {
    if (e.target.id === 'neo-prompt' && e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); run(e.target.value, st.pick, lang); }
  });
  root.addEventListener('change', (e) => {
    if (e.target.matches('[data-neo="model"]')) { st.local.model = e.target.value; savePref(); refresh(lang, true); }
  });
  root.addEventListener('submit', (e) => {
    if (!e.target.matches('[data-neo="form"]')) return;
    e.preventDefault();
    run(document.getElementById('neo-prompt')?.value, st.pick, lang);
  });
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('button, [data-neo-close]');
    if (!b) { if (e.target.id === 'neo-dlg') e.target.close(); return; }
    const d = b.dataset;
    if (d.neoPick) {
      const k = d.neoPick;
      if (st.pick.includes(k)) st.pick = st.pick.filter(x => x !== k);
      else if (st.pick.length < MAX_AGENTS) st.pick = [...st.pick, k];
      else st.pick = [...st.pick.slice(1), k];
      refresh(lang, true);
    } else if (d.neoUnpick) { st.pick = st.pick.filter(x => x !== d.neoUnpick); refresh(lang, true); }
    else if (d.neoWhere) {
      st.where = d.neoWhere === 'local' ? 'local' : 'network'; st.err = ''; savePref();
      refresh(lang, true);
      if (st.where === 'local') checkLocal(lang);
    } else if (d.neo === 'recheck') checkLocal(lang);
    else if (d.neoFilter) { st.filter = d.neoFilter; refresh(lang); }
    else if (d.neoOpen) openReport(d.neoOpen, lang);
    else if ('neoClose' in d) document.getElementById('neo-dlg')?.close();
    else if (d.neoAgain) {
      const r = st.tasks.find(x => x.id === d.neoAgain);
      document.getElementById('neo-dlg')?.close();
      if (r) run(r.prompt, cleanAgents(r.agents), lang);
    } else if (d.neoCopy) {
      const r = st.tasks.find(x => x.id === d.neoCopy);
      if (!r) return;
      try { await navigator.clipboard.writeText(reportText(r.title, readStored(r), lang)); b.textContent = NSTR[lang].copied; } catch { /* no clipboard */ }
    } else if (d.neoDel) {
      const id = d.neoDel;
      st.tasks = st.tasks.filter(x => x.id !== id);
      refresh(lang);
      if (!id.startsWith('live-')) await db.sb.from('neo_tasks').delete().eq('id', id);
    }
  });
}

/** Signing out must not leave one person's history in memory for the next. */
export function resetNeo() { st.loaded = false; st.tasks = []; st.running = []; st.pick = []; st.draft = ''; st.err = ''; st.note = ''; }
export { KEYS as NEO_AGENTS };
