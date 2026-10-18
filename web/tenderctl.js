/* ==========================================================================
   Tenders — loading and event wiring for the screens in tenders.js.
   ========================================================================== */

import * as db from './db.js';
import * as D from './tenderdb.js';
import * as V from './tenders.js';
import * as L from './tenderlogic.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const safe = (p, fallback) => p.catch(() => fallback);

export const TN_ROUTES = ['tenders', 'tenderlist', 'tendernew', 'tender', 'tenderedit', 'tenderset'];

/* A half-typed tender survives a tab switch, a reload or a lost session:
   the same per-tab draft the new-project form keeps. */
const draftKey = (id) => `expand.draft.tender.${id || 'new'}`;
function readDraft(id) { try { const s = sessionStorage.getItem(draftKey(id)); return s ? JSON.parse(s) : null; } catch { return null; } }
function writeDraft(id, v) { try { sessionStorage.setItem(draftKey(id), JSON.stringify(v)); } catch { /* storage blocked */ } }
function clearDraft(id) { try { sessionStorage.removeItem(draftKey(id)); } catch { /* ignore */ } }

/* ------------------------------------------------------------------ load */

export async function loadTenders(route, id, ctx) {
  const jobs = [];
  const settle = (key, p, fallback = []) => jobs.push(safe(p, fallback).then(v => { ctx[key] = v; }));
  /* The role can change while someone is signed in (an admin ticks them as
     an analyst), so it is re-read with every tenders screen. */
  jobs.push(safe(D.myTenderRole(), null).then(r => { if (r && db.state.me) db.state.me.tender = r; }));
  settle('people', db.listPeople());
  settle('tnSettings', D.getSettings(), null);
  settle('tenders', D.listTenders());
  if (['tender', 'tendernew', 'tenderedit'].includes(route)) {
    settle('projects', db.listProjects({ limit: 3000 }));
    settle('leads', db.listLeads({ limit: 3000 }));
  }
  ctx.tnDraftRestored = false;
  if (route === 'tender' || route === 'tenderedit') {
    settle('tender', D.getTender(id), null);
    if (route === 'tender') { settle('tnEvents', D.listEvents(id)); settle('tnFiles', D.listFiles(id)); }
  }
  await Promise.all(jobs);
  if (route === 'tendernew') ctx.tender = null;
  if (route === 'tendernew' || route === 'tenderedit') {
    const d = readDraft(route === 'tenderedit' ? id : null);
    if (d) { ctx.tender = { ...(ctx.tender || {}), ...d }; ctx.tnDraftRestored = true; }
  }
}

export function bodyTenders(lang, route, id, ctx) {
  if (route === 'tenders') return V.tendersDashView(lang, ctx);
  if (route === 'tenderlist') return V.tendersListView(lang, ctx);
  if (route === 'tender') return V.tenderView(lang, ctx);
  if (route === 'tendernew' || route === 'tenderedit') return V.tenderFormView(lang, ctx);
  if (route === 'tenderset') return V.tenderSettingsView(lang, ctx);
  return null;
}

/* --------------------------------------------------------------- helpers */

const ERR = {
  en: { not_in_review: 'This tender is no longer awaiting a decision — reload the page.', pm_required: 'Choose the project manager.',
    reason_required: 'Choose a rejection reason.', not_allowed: 'Only the approver can decide on tenders.',
    tender_decided: 'A decided tender cannot be edited.', decision_only_by_approver: 'Only the approver can approve or reject.' },
  ar: { not_in_review: 'المناقصة لم تعد بانتظار القرار — حدّث الصفحة.', pm_required: 'اختر مدير المشروع.',
    reason_required: 'اختر سبب الرفض.', not_allowed: 'القرار في المناقصات لصاحب القرار فقط.',
    tender_decided: 'لا يمكن تعديل مناقصة تم البت فيها.', decision_only_by_approver: 'الاعتماد أو الرفض لصاحب القرار فقط.' },
};
const friendly = (lang, err) => {
  const m = String(err?.message || err);
  const k = Object.keys(ERR.en).find(key => m.includes(key));
  return k ? new Error(ERR[lang][k]) : err;
};

function download(name, text, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Read the tender form into the shape of a tenders row. */
export function collectForm(form) {
  const g = (n) => (form.elements[n]?.value ?? '').trim();
  const numOrNull = (n) => { const v = g(n); return v === '' || !Number.isFinite(Number(v)) ? null : Number(v); };
  const dateOrNull = (n) => g(n) || null;
  const reqs = $$('[data-req-row]', form).map(r => ({ text: $('[name=req_text]', r).value, status: $('[name=req_status]', r).value }));
  const comps = $$('[data-comp-row]', form).map(r => ({
    name: $('[name=c_name]', r).value, year: $('[name=c_year]', r).value, project: $('[name=c_project]', r).value,
    price_sar: $('[name=c_price]', r).value, won: $('[name=c_won]', r).checked }));
  const wc = numOrNull('win_chance');
  return {
    title: g('title'), client: g('client'), tender_no: g('tender_no') || null, source: g('source') || null,
    category: g('category') || null, location: g('location') || null,
    issued_on: dateOrNull('issued_on'), questions_due: dateOrNull('questions_due'), site_visit_on: dateOrNull('site_visit_on'),
    submission_due: dateOrNull('submission_due'),
    value_sar: numOrNull('value_sar'), client_budget_sar: numOrNull('client_budget_sar'), bond_sar: numOrNull('bond_sar'),
    scope: g('scope') || null, client_history: g('client_history') || null, summary: g('summary') || null, risks: g('risks') || null,
    recommendation: g('recommendation') || null, win_chance: wc === null ? null : Math.max(0, Math.min(100, Math.round(wc))),
    requirements: L.cleanRequirements(reqs), competitors: L.cleanCompetitors(comps),
  };
}

/* ------------------------------------------------------------------ wire */

export function wireTenders(lang, { ctx, rerender, fail, reload }) {
  if (!TN_ROUTES.includes(ctx.route)) return;
  const t = V.TSTR[lang];
  const done = async () => { await reload(); rerender(); };
  const oops = (err) => fail(friendly(lang, err));
  const busy = (b, on) => { if (b) b.disabled = on; };
  const run = (btn, fn) => async (e) => {
    e?.preventDefault?.();
    busy(btn, true);
    try { await fn(); await done(); } catch (err) { busy(btn, false); oops(err); }
  };
  const x = ctx.tender;
  if (ctx.route === 'tender' && ctx.tnUploadError) ctx.tnUploadError = null;   // shown once, on this render

  /* --- dashboard & list --- */
  const yr = $('[data-tn-year]');
  if (yr) yr.onchange = () => { ctx.tnYear = yr.value; rerender(); };
  $$('[data-tn-f]').forEach(el => {
    const upd = () => {
      ctx.tnFilter = { ...(ctx.tnFilter || {}), [el.dataset.tnF]: el.value };
      const box = $('[data-tn-rows]'); if (box) box.innerHTML = V.listRowsHtml(lang, ctx);
      $$('[data-tn-rows] [data-act="go"]').forEach(b => b.onclick = () => { location.hash = b.dataset.route; });
    };
    el.oninput = upd; el.onchange = upd;
  });
  const csv = $('[data-tn-csv]');
  if (csv) csv.onclick = () => download(`tenders-${new Date().toISOString().slice(0, 10)}.csv`, V.tendersCSV(lang, ctx));

  /* --- detail: analyst moves --- */
  const send = $('[data-tn-send]');
  if (send && x) send.onclick = async () => { if (confirm(t.dec.confirmSend)) await run(send, () => D.updateTender(x.id, { status: 'review' }))(); };
  const pull = $('[data-tn-pull]');
  if (pull && x) pull.onclick = run(pull, () => D.updateTender(x.id, { status: 'draft' }));
  const del = $('[data-tn-del]');
  if (del && x) del.onclick = async () => {
    if (!confirm(t.dec.confirmDel)) return;
    busy(del, true);
    try { await D.deleteTender(x.id); location.hash = '#/tenders/list'; } catch (err) { busy(del, false); oops(err); }
  };

  /* --- detail: the decision --- */
  const decForm = $('[data-tn-decide]');
  $$('[data-tn-do]').forEach(b => b.onclick = async () => {
    const action = b.dataset.tnDo;
    const f = decForm || document.createElement('form');
    const pm = f.elements?.pm?.value || null, reason = f.elements?.reason?.value || null, note = (f.elements?.note?.value || '').trim() || null;
    if (action === 'approve' && !pm) { oops(new Error(t.dec.needPm)); f.elements?.pm?.focus(); return; }
    if (action === 'reject') {
      if (!reason) { oops(new Error(t.dec.needReason)); f.elements?.reason?.focus(); return; }
      if (!confirm(t.dec.confirmReject)) return;
    }
    await run(b, () => D.decide(x.id, action, { pm, reason, note }))();
  });
  const reassign = $('[data-tn-reassign]');
  if (reassign && x) reassign.onsubmit = (e) => {
    e.preventDefault();
    const pm = reassign.elements.pm.value;
    if (!pm) { oops(new Error(t.dec.needPm)); return; }
    run(reassign.querySelector('button'), () => D.decide(x.id, 'reassign', { pm }))();
  };

  /* --- detail: documents & notes --- */
  const up = $('[data-tn-upload]');
  if (up && x) up.onsubmit = (e) => {
    e.preventDefault();
    const files = [...(up.elements.file.files || [])];
    if (!files.length) return;
    run(up.querySelector('button'), async () => { for (const f of files) await D.addFile(x.id, f, up.elements.kind.value); })();
  };
  $$('[data-tn-file]').forEach(b => b.onclick = async () => {
    const f = (ctx.tnFiles || []).find(z => z.id === b.dataset.tnFile);
    if (!f) return;
    const w = window.open('', '_blank');
    try { const url = await D.fileUrl(f.path); if (w) w.location = url; else location.href = url; }
    catch (err) { if (w) w.close(); oops(err); }
  });
  $$('[data-tn-file-del]').forEach(b => b.onclick = async () => {
    const f = (ctx.tnFiles || []).find(z => z.id === b.dataset.tnFileDel);
    if (f && confirm(`${t.del} — ${f.file_name}?`)) await run(b, () => D.deleteFile(f))();
  });
  const note = $('[data-tn-note]');
  if (note && x) note.onsubmit = (e) => {
    e.preventDefault();
    const body = note.elements.body.value.trim();
    if (body) run(note.querySelector('button'), () => D.addNote(x.id, body))();
  };

  /* --- the form --- */
  const form = $('#tndForm');
  if (form) {
    const id = form.dataset.tnId || null;
    const msg = $('[data-tn-draftmsg]');
    if (ctx.tnDraftRestored && msg) msg.textContent = t.draftRestored;
    const known = $('[data-tn-known]');
    const showKnown = () => {
      if (!known) return;
      const bg = L.clientBackground({ id, client: form.elements.client.value, competitors: [] },
        { tenders: ctx.tenders || [], projects: ctx.projects || [], leads: ctx.leads || [] });
      known.textContent = bg && !bg.isNew ? t.bg.known.replace('{t}', bg.tStats.total).replace('{p}', bg.pStats.total) : '';
    };
    showKnown();
    form.elements.client.addEventListener('input', showKnown);
    form.addEventListener('input', () => { writeDraft(id, collectForm(form)); if (msg) msg.textContent = t.unsaved; });
    form.addEventListener('click', (e) => {
      const del = e.target.closest('[data-row-del]');
      if (del) { del.closest('tr').remove(); writeDraft(id, collectForm(form)); }
    });
    const addReq = $('[data-add-req]'), addComp = $('[data-add-comp]');
    if (addReq) addReq.onclick = () => {
      const body = $('[data-req-row]', form)?.parentElement || addReq.closest('.card').querySelector('tbody');
      body.insertAdjacentHTML('beforeend', V.blankReqRow(lang));
      body.lastElementChild.querySelector('input')?.focus();
    };
    if (addComp) addComp.onclick = () => {
      const body = $('[data-comp-row]', form)?.parentElement || addComp.closest('.card').querySelector('tbody');
      body.insertAdjacentHTML('beforeend', V.blankCompRow(lang));
      body.lastElementChild.querySelector('input')?.focus();
    };
    form.onsubmit = async (e) => {
      e.preventDefault();
      const row = collectForm(form);
      const btn = form.querySelector('button[type=submit]');
      /* The files go up after the row exists: the storage path is the
         tender's id, which is how the bucket decides who may read them. */
      const uploads = [...($('#tnRfp')?.files || [])].map(f => [f, 'rfp'])
        .concat([...($('#tnOther')?.files || [])].map(f => [f, 'other']));
      busy(btn, true);
      const label = btn.textContent;
      if (uploads.length) btn.textContent = t.up.uploading.replace('{n}', uploads.length);
      let saved;
      try {
        saved = id ? await D.updateTender(id, row) : await D.createTender(row);
      } catch (err) { busy(btn, false); btn.textContent = label; oops(err); return; }
      clearDraft(id);
      const failed = [];
      for (const [f, kind] of uploads) {
        try { await D.addFile(saved.id, f, kind); } catch { failed.push(f.name); }
      }
      /* Said on the tender page, which is where they can be added again. */
      ctx.tnUploadError = failed.length ? t.up.failed.replace('{n}', failed.length).replace('{names}', failed.join(', ')) : null;
      location.hash = `#/t/${saved.id}`;
    };
  }

  /* --- settings --- */
  const set = $('[data-tn-settings]');
  if (set) set.onsubmit = (e) => {
    e.preventDefault();
    const approvers = $$('[data-tn-ap]', set).filter(c => c.checked).map(c => c.dataset.tnAp);
    const analysts = $$('[data-tn-an]', set).filter(c => c.checked).map(c => c.dataset.tnAn);
    run(set.querySelector('button'), async () => { await D.saveSettings({ approvers, analysts }); ctx.tnSavedMsg = t.set.saved; })();
  };
}
