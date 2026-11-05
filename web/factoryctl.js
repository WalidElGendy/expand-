/* ==========================================================================
   Factory production (factory.js) — loading and event wiring — and the
   Projects → Excel export button on the projects list.
   ========================================================================== */

import * as db from './db.js';
import * as V from './factory.js';
import * as XL from './xlsx.js';
import * as PX from './projxlsx.js';
import { DSTR, deptName, filterProjects } from './dash.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export const FC_ROUTES = ['factory', 'factoryproc'];

const rows = (r) => { if (r.error) throw new Error(r.error.message); return r.data || []; };

/* ------------------------------------------------------------------ load */

export async function loadFactory(route, ctx) {
  ctx.fToday = V.localToday();
  const [projects, items, prod] = await Promise.all([
    db.listProjects({ limit: 3000 }).catch(() => []),
    db.sb.from('procurement_items')
      .select('id, project_id, name, description, status, sort, created_at, updated_at')
      .order('sort', { ascending: true }).order('created_at', { ascending: true }).limit(5000)
      .then(rows).catch(() => []),
    db.sb.from('production_info').select('project_id, schedule, site_delivery_on, updated_at')
      .limit(3000).then(rows).catch(() => []),
  ]);
  ctx.fProjects = projects; ctx.fItems = items; ctx.fProd = prod;
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
export function filterSentence(lang, pf = {}, people = []) {
  const d = DSTR[lang], ar = lang === 'ar', parts = [];
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
        filters: filterSentence(lang, ctx.pf, ctx.people || []),
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
        followText: (f) => t.follow[f.code].replace('{n}', f.n ?? ''),
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
  const add = $('[data-fi-add]');
  if (add) add.onsubmit = async (e) => {
    e.preventDefault();
    const project = $('#fiProject').value, name = $('#fiName').value.trim();
    if (!project || !name) return;
    const btn = add.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const sort = (ctx.fItems || []).filter(i => i.project_id === project).length;
      const row = await db.addProcurementItem(project, { name, sort });
      ctx.fItems = [...(ctx.fItems || []), { updated_at: row.created_at, ...row }];
      ctx.fif = { ...(ctx.fif || {}), project };
      rerender();
    } catch (err) { btn.disabled = false; fail(err); }
  };
}
