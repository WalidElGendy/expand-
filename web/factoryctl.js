/* ==========================================================================
   Factory production (factory.js) — loading and event wiring — and the
   Projects → Excel export button on the projects list.
   ========================================================================== */

import * as db from './db.js';
import * as V from './factory.js';
import * as XL from './xlsx.js';
import * as PX from './projxlsx.js';
import { DSTR, deptName, filterProjects, clientKey } from './dash.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export const FC_ROUTES = ['factory', 'factoryproc'];

const rows = (r) => { if (r.error) throw new Error(r.error.message); return r.data || []; };

/* ------------------------------------------------------------------ load */

export async function loadFactory(route, ctx) {
  ctx.fToday = V.localToday();
  const [projects, items, prod, photos, people] = await Promise.all([
    db.listProjects({ limit: 3000 }).catch(() => []),
    db.sb.from('procurement_items')
      .select('id, project_id, name, description, status, sort, created_at, updated_at, created_by, qty, unit, needed_by, suppliers')
      .order('sort', { ascending: true }).order('created_at', { ascending: true }).limit(5000)
      .then(rows).catch(() => []),
    db.sb.from('production_info').select('project_id, schedule, site_delivery_on, updated_at')
      .limit(3000).then(rows).catch(() => []),
    route === 'factoryproc' ? loadPhotos().catch(() => []) : Promise.resolve(ctx.fPhotos || []),
    ctx.people?.length ? Promise.resolve(ctx.people) : db.listPeople().catch(() => []),
  ]);
  ctx.fProjects = projects; ctx.fItems = items; ctx.fProd = prod; ctx.fPhotos = photos; ctx.people = people;
}

/* Reference photos of every request, with short-lived links signed in one
   call per bucket so the list can show thumbnails. */
async function loadPhotos() {
  const files = await db.sb.from('files')
    .select('id, bucket, path, filename, mime, procurement_item_id, project_id, created_at, uploaded_by')
    .not('procurement_item_id', 'is', null).order('created_at', { ascending: true }).limit(3000).then(rows);
  const byBucket = new Map();
  files.forEach(f => { if (!byBucket.has(f.bucket)) byBucket.set(f.bucket, []); byBucket.get(f.bucket).push(f); });
  for (const [bucket, list] of byBucket) {
    for (let i = 0; i < list.length; i += 200) {
      const part = list.slice(i, i + 200);
      const { data } = await db.sb.storage.from(bucket).createSignedUrls(part.map(f => f.path), 3600);
      (data || []).forEach((x, j) => { if (x?.signedUrl) part[j].url = x.signedUrl; });
    }
  }
  return files;
}

export function bodyFactory(lang, route, ctx) {
  return route === 'factoryproc' ? V.factoryProcurementView(lang, ctx) : V.factoryProductionView(lang, ctx);
}

function download(name, bytes, type = XLSX_TYPE) {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* A sentence of the filters in use on the projects list, for the sheet. */
const DUE = { en: { overdue: 'overdue', d30: 'due in 30 days', d90: 'due in 90 days', none: 'no deadline' },
  ar: { overdue: 'متأخرة', d30: 'مستحقة خلال 30 يوماً', d90: 'مستحقة خلال 90 يوماً', none: 'بلا موعد نهائي' } };
export function filterSentence(lang, pf = {}, people = [], projects = []) {
  const d = DSTR[lang], ar = lang === 'ar', parts = [];
  if (pf.client) parts.push(`${ar ? 'العميل' : 'Customer'}: ${pf.client === '~none' ? (ar ? 'بلا عميل' : 'no customer')
    : (String(projects.find(p => clientKey(p.client) === pf.client)?.client || pf.client).trim())}`);
  if (pf.status) parts.push(`${ar ? 'الحالة' : 'Status'}: ${d.st[pf.status] || pf.status}`);
  if (pf.owner) parts.push(`${ar ? 'المسؤول' : 'Owner'}: ${pf.owner === '~none' ? (ar ? 'بلا مسؤول' : 'no owner')
    : (people.find(p => p.id === pf.owner)?.full_name || '')}`);
  if (pf.team) parts.push(`${ar ? 'الفريق' : 'Team'}: ${deptName(pf.team, lang)}`);
  if (pf.due) parts.push(`${ar ? 'الموعد' : 'Deadline'}: ${DUE[lang][pf.due] || pf.due}`);
  if (pf.closed) parts.push(PX.PXSTR[lang].withClosed);
  return parts.join(' · ');
}

/* ------------------------------------------------------------------ wire */

export function wireFactory(lang, { ctx, rerender, fail }) {
  /* Projects list: Export Excel — the list as filtered, every matching row
     (the screen stops drawing at 120; the file does not). */
  $$('[data-proj-xlsx]').forEach(b => b.onclick = () => {
    const label = b.textContent;
    b.disabled = true; b.textContent = V.FSTR[lang].exporting;
    try {
      const today = V.localToday();
      const list = filterProjects(ctx.projects || [], ctx.pf);
      const sheets = PX.projectsWorkbook(lang, list, {
        today, who: db.state.me?.full_name || '',
        statusName: (s) => DSTR[lang].st[s] || s,
        deptName: (id) => deptName(id, lang),
        filters: filterSentence(lang, ctx.pf, ctx.people || [], ctx.projects || []),
      });
      download(PX.projectsFileName(today), XL.buildWorkbook(sheets, { title: PX.PXSTR[lang].title, author: db.state.me?.full_name || 'expand' }));
    } catch (e) { fail(e); }
    b.disabled = false; b.textContent = label;
  });

  if (!FC_ROUTES.includes(ctx.route)) return;
  const t = V.FSTR[lang];

  /* Export the Factory page: both tabs, every row, whatever the filters. */
  const fx = $('[data-fx-xlsx]');
  if (fx) fx.onclick = () => {
    try {
      const D = V.factoryState(ctx);
      const today = ctx.fToday || V.localToday();
      const stageSt = PX.PXSTR[lang].stage;
      const sheets = PX.factoryWorkbook(lang, D, {
        today, who: db.state.me?.full_name || '',
        phaseName: (k) => t.phase[k] || k,
        statusName: (s) => DSTR[lang].st[s] || s,
        procName: (s) => DSTR[lang].procSt[s] || s,
        stageName: (s) => stageSt[s] || s,
        srcName: (s) => t.src[s] || s,
        followText: (f) => V.followSentence(lang, f),
      });
      download(PX.factoryFileName(today), XL.buildWorkbook(sheets, { title: t.title, author: db.state.me?.full_name || 'expand' }));
    } catch (e) { fail(e); }
  };

  /* --- Production tab --- */
  $$('[data-fp-phase]').forEach(b => b.onclick = () => {
    const k = b.dataset.fpPhase;
    ctx.fpf = { ...(ctx.fpf || {}), phase: ctx.fpf?.phase === k ? '' : k };
    rerender();
  });
  const fq = $('[data-fp-q]');
  if (fq) fq.oninput = () => {
    ctx.fpf = { ...(ctx.fpf || {}), q: fq.value };
    const pos = fq.selectionStart;
    rerender();
    const again = $('[data-fp-q]');
    if (again) { again.focus(); try { again.setSelectionRange(pos, pos); } catch { /* ignore */ } }
  };
  $$('[data-fp-project]').forEach(b => b.onclick = () => {
    ctx.fif = { show: 'follow', project: b.dataset.fpProject, q: '' };
    location.hash = '#/factory/procurement';
  });
  /* Site delivery date: saves on change, then redraws so the days-left and
     follow-up figures follow the new date. */
  $$('[data-fd-date]').forEach(inp => inp.onchange = async () => {
    const id = inp.dataset.fdDate;
    inp.disabled = true;
    try {
      const row = await db.saveProductionInfo(id, { site_delivery_on: inp.value || null });
      const list = (ctx.fProd || []).filter(r => r.project_id !== id);
      list.push({ project_id: id, schedule: row?.schedule ?? null, site_delivery_on: row?.site_delivery_on ?? (inp.value || null), updated_at: row?.updated_at });
      ctx.fProd = list;
      rerender();
    } catch (e) { inp.disabled = false; fail(e); }
  });

  /* --- Procurement tab --- */
  $$('[data-fi-show]').forEach(b => b.onclick = () => {
    ctx.fif = { ...(ctx.fif || {}), show: b.dataset.fiShow }; rerender();
  });
  const fp = $('[data-fi-project]');
  if (fp) fp.onchange = () => { ctx.fif = { ...(ctx.fif || {}), project: fp.value }; rerender(); };
  const iq = $('[data-fi-q]');
  if (iq) iq.oninput = () => {
    ctx.fif = { ...(ctx.fif || {}), q: iq.value };
    const pos = iq.selectionStart;
    rerender();
    const again = $('[data-fi-q]');
    if (again) { again.focus(); try { again.setSelectionRange(pos, pos); } catch { /* ignore */ } }
  };
  $$('[data-fp-status]').forEach(sel => sel.onchange = async () => {
    const id = sel.dataset.fpStatus;
    sel.disabled = true;
    try {
      const row = await db.updateProcurementItem(id, { status: sel.value });
      ctx.fItems = (ctx.fItems || []).map(i => i.id === id ? { ...i, ...row } : i);
      rerender();
    } catch (e) { sel.disabled = false; fail(e); }
  });
  /* --- a purchase request: open, edit, photos, suppliers --- */
  const saveItem = async (id, patch) => {
    const row = await db.updateProcurementItem(id, patch);
    ctx.fItems = (ctx.fItems || []).map(i => i.id === id ? { ...i, ...row } : i);
  };
  $$('[data-fi-open]').forEach(b => b.onclick = () => {
    ctx.fOpen = ctx.fOpen === b.dataset.fiOpen ? null : b.dataset.fiOpen; rerender();
  });
  $$('[data-fe]').forEach(inp => inp.onchange = async () => {
    const id = inp.dataset.feId, field = inp.dataset.fe;
    let value = inp.value.trim();
    if (field === 'qty') {
      value = Number(value);
      if (!(value > 0)) { fail(new Error(t.req.badQty)); return; }
    } else if (field === 'name') { if (!value) return; }
    else value = value || null;
    try { await saveItem(id, { [field]: value }); if (field !== 'description') rerender(); }
    catch (e) { fail(e); }
  });
  // Suppliers: the table is read back whole and saved as the request's list.
  const readSuppliers = (table) => [...table.querySelectorAll('[data-fs-row]')].map(tr => {
    const g = (k) => tr.querySelector(`[data-fs="${k}"]`)?.value.trim() || '';
    const price = g('price');
    return { name: g('name'), contact: g('contact'), price: price === '' ? null : Number(price), note: g('note') };
  });
  $$('[data-fs-item]').forEach(table => {
    const id = table.dataset.fsItem;
    table.querySelectorAll('[data-fs]').forEach(inp => inp.onchange = async () => {
      const list = readSuppliers(table).filter(x => x.name || x.contact || x.price !== null || x.note);
      if (list.some(x => x.price !== null && !(Number.isFinite(x.price) && x.price >= 0))) { fail(new Error(t.req.badPrice)); return; }
      // Only a price changes what is drawn (totals, "Lowest"); other fields
      // save quietly so tabbing on to the next box keeps its place.
      try { await saveItem(id, { suppliers: list }); if (inp.dataset.fs === 'price') rerender(); } catch (e) { fail(e); }
    });
    table.querySelectorAll('[data-fs-del]').forEach(b => b.onclick = async () => {
      if (!confirm(t.req.delSup)) return;
      const list = readSuppliers(table).filter((_, i) => i !== Number(b.dataset.fsDel));
      try { await saveItem(id, { suppliers: list }); rerender(); } catch (e) { fail(e); }
    });
  });
  $$('[data-fs-add]').forEach(b => b.onclick = async () => {
    const id = b.dataset.fsAdd;
    const it = (ctx.fItems || []).find(i => i.id === id);
    const list = [...(Array.isArray(it?.suppliers) ? it.suppliers : []), { name: '', contact: '', price: null, note: '' }];
    // An empty line is kept in the page only; it is saved once something is typed in it.
    ctx.fItems = (ctx.fItems || []).map(i => i.id === id ? { ...i, suppliers: list } : i);
    rerender();
    const rowsNow = $$(`[data-fs-item="${id}"] [data-fs-row]`);
    rowsNow[rowsNow.length - 1]?.querySelector('[data-fs="name"]')?.focus();
  });
  // Photos: open, add, remove.
  $$('[data-fphoto-open]').forEach(b => b.onclick = async () => {
    const f = (ctx.fPhotos || []).find(x => x.id === b.dataset.fphotoOpen);
    if (!f) return;
    try { window.open(f.url || await db.fileUrl(f.bucket, f.path), '_blank', 'noopener'); } catch (e) { fail(e); }
  });
  const uploadPhotos = async (itemId, projectId, files) => {
    for (const file of files) {
      await db.uploadFile('refs', file, { purpose: 'procurement', project_id: projectId, procurement_item_id: itemId });
    }
    ctx.fPhotos = await loadPhotos();
  };
  $$('[data-fphoto-add]').forEach(inp => inp.onchange = async () => {
    const files = [...(inp.files || [])];
    const it = (ctx.fItems || []).find(i => i.id === inp.dataset.fphotoAdd);
    if (!files.length || !it) return;
    inp.disabled = true;
    try { await uploadPhotos(it.id, it.project_id, files); rerender(); }
    catch (e) { inp.disabled = false; fail(e); }
  });
  $$('[data-fphoto-del]').forEach(b => b.onclick = async () => {
    const f = (ctx.fPhotos || []).find(x => x.id === b.dataset.fphotoDel);
    if (!f || !confirm(t.req.delPhoto)) return;
    b.disabled = true;
    try { await db.deleteFile(f); ctx.fPhotos = (ctx.fPhotos || []).filter(x => x.id !== f.id); rerender(); }
    catch (e) { b.disabled = false; fail(e); }
  });

  /* --- a new purchase request --- */
  const supAdd = $('[data-fi-supadd]');
  if (supAdd) supAdd.onclick = () => {
    const box = $('[data-fi-sups]');
    if (!box || box.children.length >= 10) return;
    box.insertAdjacentHTML('beforeend', V.supplierInputs(lang));
    box.lastElementChild?.querySelector('input')?.focus();
  };
  const add = $('[data-fi-add]');
  if (add) add.onsubmit = async (e) => {
    e.preventDefault();
    const project = $('#fiProject').value, name = $('#fiName').value.trim();
    const qty = Number($('#fiQty')?.value || 1);
    if (!project || !name) return;
    if (!(qty > 0)) { fail(new Error(t.req.badQty)); return; }
    const suppliers = $$('[data-fi-sup]', add).map(row => {
      const g = (k) => row.querySelector(`[data-fis="${k}"]`)?.value.trim() || '';
      return { name: g('name'), contact: g('contact'), price: g('price') === '' ? null : Number(g('price')), note: '' };
    }).filter(x => x.name || x.contact);
    if (suppliers.some(x => x.price !== null && !(Number.isFinite(x.price) && x.price >= 0))) { fail(new Error(t.req.badPrice)); return; }
    const photos = [...($('#fiPhotos')?.files || [])];
    const btn = add.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = t.req.sending;
    try {
      const sort = (ctx.fItems || []).filter(i => i.project_id === project).length;
      const row = await db.addProcurementItem(project, {
        name, sort, qty, unit: $('#fiUnit')?.value.trim() || null, needed_by: $('#fiNeed')?.value || null,
        description: $('#fiSpec')?.value.trim() || null, suppliers,
      });
      ctx.fItems = [...(ctx.fItems || []), { updated_at: row.created_at, ...row }];
      if (photos.length) await uploadPhotos(row.id, project, photos);
      ctx.fif = { ...(ctx.fif || {}), project };
      ctx.fOpen = row.id;
      rerender();
    } catch (err) { btn.disabled = false; btn.textContent = t.req.send; fail(err); }
  };
}
