/* ==========================================================================
   Etimad Insights — loading and event wiring for the screens in etimad.js.
   ========================================================================== */

import * as db from './db.js';
import * as E from './etimaddb.js';
import * as TD from './tenderdb.js';
import * as V from './etimad.js';
import { toCSV } from './tenderlogic.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const safe = (p, fallback) => p.catch(() => fallback);

export const ET_ROUTES = ['etimad', 'etimadlist', 'etimadours', 'etimadset', 'etimadt'];

/* The key check is one function call; it changes only when somebody adds a
   secret, so a minute's cache keeps page changes instant. */
let statusAt = 0;

/* ------------------------------------------------------------------ load */

export async function loadEtimad(route, id, ctx, { fresh = false } = {}) {
  const jobs = [];
  const settle = (k, p, fallback = []) => jobs.push(safe(p, fallback).then(v => { ctx[k] = v; }));
  jobs.push(safe(TD.myTenderRole(), null).then(r => { if (r && db.state.me) db.state.me.tender = r; }));
  if (fresh || !ctx.etStatus || Date.now() - statusAt > 60000) {
    jobs.push(safe(E.status(), null).then(s => { if (s) { ctx.etStatus = s; statusAt = Date.now(); } else ctx.etStatus = ctx.etStatus || {}; }));
  }
  settle('etTenders', E.listTenders());
  settle('etAnalyses', E.listAnalyses());
  settle('tenders', TD.listTenders());
  settle('etOutcomes', E.listOutcomes());
  if (route === 'etimadt' && id) {
    settle('etTender', E.getTender(id), null);
    settle('etTenderAnalyses', E.analysesFor(id));
    settle('etFiles', E.listFiles(id));
    settle('projects', db.listProjects({ limit: 3000 }));
  }
  if (route === 'etimadset') {
    settle('etSettings', E.getSettings(), null);
    settle('etUsage', E.listUsage());
  }
  await Promise.all(jobs);
  if (route === 'etimadt' && ctx.etTender) ctx.etContacts = await safe(E.contactsFor(ctx.etTender), []);
}

export function bodyEtimad(lang, route, id, ctx) {
  const html =
      route === 'etimad' ? V.etimadOverviewView(lang, ctx)
    : route === 'etimadlist' ? V.etimadListView(lang, ctx)
    : route === 'etimadt' ? V.etimadTenderView(lang, ctx)
    : route === 'etimadours' ? V.etimadOursView(lang, ctx)
    : route === 'etimadset' ? V.etimadSettingsView(lang, ctx)
    : null;
  ctx.etFlash = null;               // a message shows on one render only
  return html;
}

function download(name, text, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ------------------------------------------------------------------ wire */

export function wireEtimad(lang, { ctx, rerender, fail }) {
  if (!ET_ROUTES.includes(ctx.route)) return;
  const t = V.ESTR[lang];
  const reload = async () => { await loadEtimad(ctx.route, ctx.routeId, ctx); rerender(); };
  const oops = (err) => fail(V.friendly(lang, err));
  /* A button that calls a paid API: says what it is doing, cannot be pressed
     twice, and comes back if the call fails. */
  const run = (btn, label, fn) => async (e) => {
    e?.preventDefault?.();
    const was = btn?.textContent;
    if (btn) { btn.disabled = true; if (label) btn.textContent = label; }
    try { const msg = await fn(); if (msg) ctx.etFlash = { text: msg }; await reload(); }
    catch (err) { if (btn) { btn.disabled = false; btn.textContent = was; } oops(err); }
  };
  const x = ctx.etTender;

  /* --- sync --- */
  const sync = $('[data-et-sync]');
  if (sync) sync.onclick = run(sync, t.syncing, async () => {
    const r = await E.sync(1);
    ctx.etStatus = null;
    let msg = t.synced.replace('{f}', r.found).replace('{a}', r.added).replace('{c}', r.credits);
    if (r.errors?.length) msg += ` · ${r.errors.slice(0, 2).join(' | ')}`;
    return msg;
  });

  /* --- shortlist / dismiss: a local toggle, saved in the background --- */
  const wireRows = () => {
    $$('[data-et-short]').forEach(b => b.onclick = async () => {
      const row = (ctx.etTenders || []).find(r => r.id === b.dataset.etShort) || (x?.id === b.dataset.etShort ? x : null);
      if (!row) return;
      const v = !row.shortlisted;
      try { await E.patchTender(row.id, { shortlisted: v }); } catch (err) { oops(err); return; }
      for (const r of [row, x, ...(ctx.etTenders || [])]) if (r && r.id === row.id) r.shortlisted = v;
      rerender();
    });
    $$('[data-et-dismiss]').forEach(b => b.onclick = async () => {
      const row = (ctx.etTenders || []).find(r => r.id === b.dataset.etDismiss) || (x?.id === b.dataset.etDismiss ? x : null);
      if (!row) return;
      const v = !row.dismissed;
      try { await E.patchTender(row.id, { dismissed: v, ...(v ? { shortlisted: false } : {}) }); } catch (err) { oops(err); return; }
      for (const r of [row, x, ...(ctx.etTenders || [])]) if (r && r.id === row.id) { r.dismissed = v; if (v) r.shortlisted = false; }
      rerender();
    });
  };
  wireRows();

  /* --- list filters: rows only, so the search box keeps its focus --- */
  $$('[data-et-f]').forEach(el => {
    const upd = () => {
      const k = el.dataset.etF;
      ctx.etFilter = { open: true, ...(ctx.etFilter || {}), [k]: el.type === 'checkbox' ? el.checked : el.value };
      const box = $('[data-et-rows]'); if (box) box.innerHTML = V.listRowsHtml(lang, ctx);
      $$('[data-et-rows] [data-act="go"]').forEach(b => b.onclick = () => { location.hash = b.dataset.route; });
      wireRows();
    };
    el.oninput = upd; el.onchange = upd;
  });
  const csv = $('[data-et-csv]');
  if (csv) csv.onclick = () => download(`etimad-${new Date().toISOString().slice(0, 10)}.csv`, V.etimadCSV(lang, ctx, toCSV));

  /* --- one tender --- */
  const det = $('[data-et-details]');
  if (det && x) det.onclick = run(det, t.t.refreshing, async () => { await E.fetchDetails(x.id); });
  const an = $('[data-et-analyze]');
  if (an && x) an.onclick = run(an, t.an.running, async () => { await E.analyze(x.id); });
  const note = $('[data-et-note]');
  if (note && x) note.onsubmit = run(note.querySelector('button'), '', async () => { await E.patchTender(x.id, { note: note.elements.note.value.trim() || null }); });

  const toT = $('[data-et-totender]');
  if (toT && x) toT.onclick = async () => {
    toT.disabled = true;
    try {
      const r = (ctx.etTenderAnalyses || [])[0]?.result || {};
      const pick = (v) => (v && typeof v === 'object' ? (v[lang] || v.en || v.ar || '') : (v || ''));
      const row = await TD.createTender({
        title: x.name || x.tender_number, client: x.agency || x.agency_en || '—', tender_no: x.tender_number || x.reference_number || null,
        source: 'etimad', category: x.tender_type || null, location: (x.regions || []).join('، ') || null,
        issued_on: x.published_on || null, submission_due: x.last_offer_at ? String(x.last_offer_at).slice(0, 10) : null,
        value_sar: r.price?.target ?? x.est_value_sar ?? null, scope: [x.activity, ...(r.deliverables || []).map(pick)].filter(Boolean).join('\n') || null,
        summary: pick(r.summary) || null, risks: (r.risks || []).map(pick).join('\n') || null,
        recommendation: r.recommendation || null, win_chance: Number.isFinite(r.fit_score) ? r.fit_score : null,
        requirements: (r.requirements || []).map(q => ({ text: pick(q), status: ['met', 'partial', 'gap'].includes(q.status) ? q.status : 'gap' })).filter(q => q.text),
        competitors: (r.competitors || []).map(c => ({ name: c.name, year: null, project: null, price_sar: null, won: false })).filter(c => c.name),
      });
      await E.patchTender(x.id, { tender_id: row.id });
      ctx.etFlash = { text: t.t.created.replace('{ref}', row.ref || '') };
      await reload();
    } catch (err) { toT.disabled = false; oops(err); }
  };

  /* --- RFP files --- */
  const up = $('[data-et-upload]');
  if (up && x) up.onsubmit = (e) => {
    e.preventDefault();
    const files = [...(up.elements.file.files || [])];
    if (files.length) run(up.querySelector('button'), '', async () => { for (const f of files) await E.addFile(x.id, f); })();
  };
  $$('[data-et-file]').forEach(b => b.onclick = async () => {
    const f = (ctx.etFiles || []).find(z => z.id === b.dataset.etFile);
    if (!f) return;
    const w = window.open('', '_blank');
    try { const url = await E.fileUrl(f.path); if (w) w.location = url; else location.href = url; }
    catch (err) { if (w) w.close(); oops(err); }
  });
  $$('[data-et-file-del]').forEach(b => b.onclick = async () => {
    const f = (ctx.etFiles || []).find(z => z.id === b.dataset.etFileDel);
    if (f && confirm(`${t.files.del} — ${f.file_name}?`)) await run(b, '', () => E.deleteFile(f))();
  });

  /* --- contacts --- */
  const cf = $('[data-et-contacts]');
  if (cf && x) cf.onsubmit = (e) => {
    e.preventDefault();
    const name = cf.elements.name.value.trim(), domain = cf.elements.domain.value.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase();
    if (!name && !domain) { oops(new Error(t.ct.needAgency)); return; }
    run(cf.querySelector('button'), t.ct.finding, async () => {
      const r = await E.findContacts(x.id, { name, domain });
      return t.ct.found.replace('{n}', r.found);
    })();
  };
  $$('[data-et-reveal]').forEach(b => b.onclick = run(b, t.ct.revealing, async () => { await E.reveal(b.dataset.etReveal); }));

  /* --- our bids --- */
  $$('[data-out-save]').forEach(b => b.onclick = run(b, '', async () => {
    const tr = b.closest('[data-out-row]');
    const g = (n) => tr.querySelector(`[name="${n}"]`)?.value?.trim() ?? '';
    const n = (k) => { const v = g(k); return v === '' || !Number.isFinite(Number(v)) ? null : Number(v); };
    await E.saveOutcome({
      tender_id: tr.dataset.outRow, bid_status: g('bid_status') || 'preparing', our_price_sar: n('our_price_sar'),
      winner: g('winner') || null, winning_price_sar: n('winning_price_sar'), bidders: n('bidders'), lost_reason: g('lost_reason') || null,
    });
    return t.ours.saved;
  }));

  /* --- settings --- */
  const sf = $('[data-et-settings]');
  if (sf) sf.onsubmit = run(sf.querySelector('button'), '', async () => {
    const keywords = [...new Set(sf.elements.keywords.value.split(/\n+/).map(s => s.trim()).filter(Boolean))].slice(0, 60);
    await E.saveSettings({ keywords, company_profile: sf.elements.company_profile.value.trim() || null });
    return t.set.saved;
  });
  const disc = $('[data-et-discover]');
  if (disc) disc.onclick = run(disc, t.syncing, async () => {
    const r = await E.discover();
    ctx.etStatus = null; statusAt = 0;
    return `${(r.tools || []).length} · ${(r.tools || []).map(z => z.capability).join(', ')}`;
  });
}
