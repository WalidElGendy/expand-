/* ==========================================================================
   Projects → Excel. The list exactly as filtered on screen, as a workbook a
   manager can print or send:

     Summary   headline numbers, projects by status and by owner
     Projects  one row per project: client, owner, status, teams, estimated
               delivery, deadline, days left, contract value — filterable,
               header frozen, totals that follow Excel's filter
     Teams     one row per team stage: who, status, planned dates, effort

   Pure: (lang, projects, opts) → sheets for xlsx.js. Arabic sheets read
   right to left.
   ========================================================================== */

import { excelDate, colName } from './xlsx.js';

export const PXSTR = {
  en: {
    file: 'expand-projects', title: 'Projects', summary: 'Summary', projects: 'Projects', teams: 'Teams & stages',
    exported: 'Exported {d} by {who} · {n} projects', filters: 'Filters: {f}', none: 'none (open projects)', withClosed: 'including delivered and archived',
    k: { n: 'Projects', value: 'Contract value (SAR)', late: 'Past their deadline', soon: 'Due in the next 30 days' },
    byStatus: 'By status', byOwner: 'By owner', count: 'Projects', value: 'Contract value (SAR)', late: 'Overdue',
    col: { n: '#', name: 'Project', client: 'Client', owner: 'Owner', status: 'Status', teams: 'Teams', done: 'Teams done',
      est: 'Estimated delivery', due: 'Deadline', left: 'Days left', value: 'Contract value (SAR)', created: 'Created', size: 'Size' },
    tcol: { project: 'Project', team: 'Team', who: 'Assigned to', status: 'Status', start: 'Planned start', end: 'Planned end', effort: 'Effort (days)', done: 'Completed' },
    total: 'Total', unassigned: 'Unassigned', noTeams: '—',
    stage: { pending: 'Pending', in_progress: 'In progress', blocked: 'Blocked', done: 'Done' },
  },
  ar: {
    file: 'expand-projects', title: 'المشاريع', summary: 'الملخص', projects: 'المشاريع', teams: 'الفرق والمراحل',
    exported: 'صُدّر في {d} بواسطة {who} · {n} مشروع', filters: 'التصفية: {f}', none: 'بلا (المشاريع المفتوحة)', withClosed: 'تشمل المسلّمة والمؤرشفة',
    k: { n: 'المشاريع', value: 'قيمة العقود (ر.س)', late: 'تجاوزت موعدها', soon: 'مستحقة خلال 30 يوماً' },
    byStatus: 'حسب الحالة', byOwner: 'حسب المسؤول', count: 'المشاريع', value: 'قيمة العقود (ر.س)', late: 'متأخرة',
    col: { n: '#', name: 'المشروع', client: 'العميل', owner: 'المسؤول', status: 'الحالة', teams: 'الفرق', done: 'الفرق المنجزة',
      est: 'التسليم المتوقع', due: 'الموعد النهائي', left: 'الأيام المتبقية', value: 'قيمة العقد (ر.س)', created: 'تاريخ الإنشاء', size: 'الحجم' },
    tcol: { project: 'المشروع', team: 'الفريق', who: 'المكلّف', status: 'الحالة', start: 'البداية المخططة', end: 'النهاية المخططة', effort: 'الجهد (أيام)', done: 'تاريخ الإنجاز' },
    total: 'الإجمالي', unassigned: 'غير مسند', noTeams: '—',
    stage: { pending: 'قيد الانتظار', in_progress: 'قيد التنفيذ', blocked: 'متوقفة', done: 'منجزة' },
  },
};

/* Which coloured status cell a project or stage status gets. */
export const PROJECT_TONE = { intake: 'stMuted', in_design: 'stInfo', pricing: 'stWarn', submitted: 'stInfo', won: 'stOk',
  in_production: 'stInfo', delivered: 'stOk', lost: 'stBad', archived: 'stMuted' };
export const STAGE_TONE = { pending: 'stMuted', in_progress: 'stInfo', blocked: 'stBad', done: 'stOk' };

const fill = (s, o) => Object.entries(o).reduce((a, [k, v]) => a.replaceAll(`{${k}}`, v), String(s));
const DAY = 86400000;
const daysFrom = (iso, today) => {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  const n = String(today).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m || !n) return null;
  return Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(+n[1], +n[2] - 1, +n[3])) / DAY);
};
const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/**
 * @param projects  the filtered list (what the screen shows)
 * @param o.statusName (status) → label · o.deptName (id) → label · o.today 'YYYY-MM-DD'
 *          o.who exporter's name · o.filters human sentence of the filters in use
 */
export function projectsWorkbook(lang, projects, o = {}) {
  const t = PXSTR[lang] || PXSTR.en;
  const rtl = lang === 'ar';
  const today = o.today || new Date().toISOString().slice(0, 10);
  const statusName = o.statusName || ((s) => s);
  const deptName = o.deptName || ((s) => s);
  const stagesOf = (p) => (p.project_stages || []).slice().sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  const meta = fill(t.exported, { d: today, who: o.who || 'expand', n: projects.length });
  const filterLine = fill(t.filters, { f: o.filters || t.none });

  /* ------------------------------------------------------------ Projects */
  const head = [t.col.n, t.col.name, t.col.client, t.col.owner, t.col.status, t.col.teams, t.col.done, t.col.est, t.col.due, t.col.left, t.col.value, t.col.created];
  const W = head.length;
  const rows = [
    [{ v: t.projects, s: 'banner' }, ...Array(W - 1).fill({ v: '', s: 'banner' })],
    [{ v: meta, s: 'sub' }],
    [{ v: filterLine, s: 'sub' }],
    head.map(h => ({ v: h, s: 'th' })),
  ];
  projects.forEach((p, i) => {
    const z = i % 2 ? 'z' : '';
    const st = stagesOf(p);
    const done = st.filter(s => s.status === 'done').length;
    const left = p.due_on && !['delivered', 'archived', 'lost'].includes(p.status) ? daysFrom(p.due_on, today) : null;
    rows.push([
      { v: i + 1, s: `${z}tdNum` },
      { v: p.name || '', s: `${z}tdStrong` },
      { v: p.client || p.lead?.company || '', s: `${z}td` },
      { v: p.owner?.full_name || t.unassigned, s: `${z}td` },
      { v: statusName(p.status), s: PROJECT_TONE[p.status] || 'stMuted' },
      { v: st.length ? st.map(s => `${deptName(s.department_id)}${s.status === 'done' ? ' ✓' : ''}`).join(rtl ? '، ' : ', ') : t.noTeams, s: `${z}td` },
      { v: st.length ? `${done} / ${st.length}` : '—', s: `${z}tdNum` },
      { v: excelDate(p.estimated_delivery), s: `${z}tdDate` },
      { v: excelDate(p.due_on), s: `${z}tdDate` },
      { v: left, s: left !== null && left < 0 ? `${z}tdBad` : `${z}tdNum` },
      { v: num(p.contract_value_sar), s: `${z}tdMoney` },
      { v: excelDate(p.created_at), s: `${z}tdDate` },
    ]);
  });
  const first = 5, last = 4 + projects.length;
  rows.push([
    { v: t.total, s: 'tot' }, { v: '', s: 'tot' },
    { v: projects.length, f: `SUBTOTAL(103,B${first}:B${Math.max(first, last)})`, s: 'totNum' },
    ...Array(7).fill({ v: '', s: 'tot' }),
    { v: projects.reduce((a, p) => a + (num(p.contract_value_sar) || 0), 0), f: `SUBTOTAL(109,K${first}:K${Math.max(first, last)})`, s: 'totMoney' },
    { v: '', s: 'tot' },
  ]);
  const projectsSheet = {
    name: t.projects, rtl, grid: false, tabColor: 'FF5230BF', freezeRow: 4,
    colWidths: [5, 44, 28, 22, 15, 40, 11, 15, 14, 11, 18, 14],
    heights: { 0: 34, 3: 30 },
    merges: [`A1:L1`, `A2:L2`, `A3:L3`],
    autoFilter: `A4:L${Math.max(4, last)}`,
    rows,
  };

  /* --------------------------------------------------------------- Teams */
  const thead = [t.tcol.project, t.tcol.team, t.tcol.who, t.tcol.status, t.tcol.start, t.tcol.end, t.tcol.effort, t.tcol.done];
  const trows = [
    [{ v: t.teams, s: 'banner' }, ...Array(thead.length - 1).fill({ v: '', s: 'banner' })],
    [{ v: meta, s: 'sub' }],
    thead.map(h => ({ v: h, s: 'th' })),
  ];
  let k = 0;
  for (const p of projects) {
    for (const s of stagesOf(p)) {
      const z = k++ % 2 ? 'z' : '';
      const people = (s.members || []).map(m => m.profile?.full_name).filter(Boolean);
      if (!people.length && s.assignee?.full_name) people.push(s.assignee.full_name);
      trows.push([
        { v: p.name || '', s: `${z}tdStrong` },
        { v: deptName(s.department_id), s: `${z}td` },
        { v: people.join(', ') || t.unassigned, s: `${z}td` },
        { v: t.stage[s.status] || s.status, s: STAGE_TONE[s.status] || 'stMuted' },
        { v: excelDate(s.planned_start), s: `${z}tdDate` },
        { v: excelDate(s.planned_end), s: `${z}tdDate` },
        { v: num(s.effort_days), s: `${z}tdNum` },
        { v: excelDate(s.completed_at), s: `${z}tdDate` },
      ]);
    }
  }
  const teamsSheet = {
    name: t.teams, rtl, grid: false, tabColor: 'FF2E2A47', freezeRow: 3,
    colWidths: [44, 22, 30, 15, 15, 15, 13, 15], heights: { 0: 34, 2: 30 },
    merges: ['A1:H1', 'A2:H2'], autoFilter: `A3:H${Math.max(3, trows.length)}`, rows: trows,
  };

  /* ------------------------------------------------------------- Summary */
  const value = projects.reduce((a, p) => a + (num(p.contract_value_sar) || 0), 0);
  const open = projects.filter(p => !['delivered', 'archived', 'lost'].includes(p.status));
  const late = open.filter(p => p.due_on && daysFrom(p.due_on, today) < 0).length;
  const soon = open.filter(p => { const d = p.due_on ? daysFrom(p.due_on, today) : null; return d !== null && d >= 0 && d <= 30; }).length;
  const byStatus = new Map(), byOwner = new Map();
  for (const p of projects) {
    const s = byStatus.get(p.status) || { n: 0, v: 0 }; s.n++; s.v += num(p.contract_value_sar) || 0; byStatus.set(p.status, s);
    const ow = p.owner?.full_name || t.unassigned;
    const w = byOwner.get(ow) || { n: 0, v: 0, late: 0 }; w.n++; w.v += num(p.contract_value_sar) || 0;
    if (open.includes(p) && p.due_on && daysFrom(p.due_on, today) < 0) w.late++;
    byOwner.set(ow, w);
  }
  const srows = [
    [{ v: t.summary, s: 'banner' }, { v: '', s: 'banner' }, { v: '', s: 'banner' }, { v: '', s: 'banner' }],
    [{ v: meta, s: 'sub' }], [{ v: filterLine, s: 'sub' }], [],
    [{ v: t.k.n, s: 'kpiL' }, { v: t.k.value, s: 'kpiL' }, { v: t.k.late, s: 'kpiL' }, { v: t.k.soon, s: 'kpiL' }],
    [{ v: projects.length, s: 'kpiV' }, { v: value, s: 'kpiMoney' }, { v: late, s: 'kpiV' }, { v: soon, s: 'kpiV' }],
    [],
    [{ v: t.byStatus, s: 'section' }],
    [{ v: t.col.status, s: 'th' }, { v: t.count, s: 'th' }, { v: t.value, s: 'th' }],
  ];
  [...byStatus.entries()].sort((a, b) => b[1].n - a[1].n).forEach(([st, x], i) => {
    const z = i % 2 ? 'z' : '';
    srows.push([{ v: statusName(st), s: PROJECT_TONE[st] || 'stMuted' }, { v: x.n, s: `${z}tdNum` }, { v: x.v, s: `${z}tdMoney` }]);
  });
  srows.push([], [{ v: t.byOwner, s: 'section' }], [{ v: t.col.owner, s: 'th' }, { v: t.count, s: 'th' }, { v: t.value, s: 'th' }, { v: t.late, s: 'th' }]);
  [...byOwner.entries()].sort((a, b) => b[1].n - a[1].n).forEach(([ow, x], i) => {
    const z = i % 2 ? 'z' : '';
    srows.push([{ v: ow, s: `${z}tdStrong` }, { v: x.n, s: `${z}tdNum` }, { v: x.v, s: `${z}tdMoney` }, { v: x.late, s: x.late ? `${z}tdBad` : `${z}tdNum` }]);
  });
  const summarySheet = {
    name: t.summary, rtl, grid: false, tabColor: 'FF915BF5',
    colWidths: [34, 24, 24, 24], heights: { 0: 34, 4: 22, 5: 40 },
    merges: ['A1:D1', 'A2:D2', 'A3:D3'], rows: srows,
  };

  return [summarySheet, projectsSheet, teamsSheet];
}

export const projectsFileName = (today) => `expand-projects-${today}.xlsx`;

/* ==========================================================================
   Factory production → Excel: the two tabs of Insights → Factory production.

     Production    one row per project: phase, PM, production team, delivery
                   to site (and where that date came from), days left, items
                   bought of total, items needing follow-up, schedule notes
     Procurement   one row per item: project, status, follow-up reason,
                   project delivery, last update

   `data` is factoryData() from factorylogic.js.
   ========================================================================== */

export const FXSTR = {
  en: {
    production: 'Production', procurement: 'Procurement', exported: 'Exported {d} by {who} · {n} projects · {i} items',
    col: { n: '#', project: 'Project', client: 'Client', pm: 'Project manager', phase: 'Phase', status: 'Project status', team: 'Production team',
      stage: 'Stage status', delivery: 'Delivery to site', src: 'Date from', left: 'Days left', bought: 'Items bought', follow: 'Need follow-up', schedule: 'Schedule notes',
      item: 'Item', desc: 'Description', istatus: 'Status', why: 'Follow-up', pdel: 'Project delivery', updated: 'Last update' },
    total: 'Total',
  },
  ar: {
    production: 'الإنتاج', procurement: 'المشتريات', exported: 'صُدّر في {d} بواسطة {who} · {n} مشروع · {i} بند',
    col: { n: '#', project: 'المشروع', client: 'العميل', pm: 'مدير المشروع', phase: 'المرحلة', status: 'حالة المشروع', team: 'فريق الإنتاج',
      stage: 'حالة المرحلة', delivery: 'التسليم للموقع', src: 'مصدر الموعد', left: 'الأيام المتبقية', bought: 'البنود المشتراة', follow: 'تحتاج متابعة', schedule: 'ملاحظات الجدول',
      item: 'البند', desc: 'الوصف', istatus: 'الحالة', why: 'المتابعة', pdel: 'تسليم المشروع', updated: 'آخر تحديث' },
    total: 'الإجمالي',
  },
};
export const PHASE_TONE = { upcoming: 'stMuted', procure: 'stWarn', making: 'stInfo', ready: 'stInfo', delivered: 'stOk' };
export const PROC_TONE = { pending: 'stMuted', in_process: 'stInfo', done: 'stOk', not_available: 'stBad', expensive: 'stWarn' };

/**
 * @param o.phaseName (phase) → label · o.statusName (project status) → label
 *        o.procName (item status) → label · o.stageName (stage status) → label
 *        o.srcName (date source) → label · o.followText (follow) → sentence
 */
export function factoryWorkbook(lang, data, o = {}) {
  const t = FXSTR[lang] || FXSTR.en;
  const rtl = lang === 'ar';
  const today = o.today || new Date().toISOString().slice(0, 10);
  const id = (x) => x;
  const phaseName = o.phaseName || id, statusName = o.statusName || id, procName = o.procName || id;
  const stageName = o.stageName || id, srcName = o.srcName || id, followText = o.followText || ((f) => f?.code || '');
  const meta = fill(t.exported, { d: today, who: o.who || 'expand', n: data.rows.length, i: data.items.length });

  const head = [t.col.n, t.col.project, t.col.client, t.col.pm, t.col.phase, t.col.status, t.col.team, t.col.stage, t.col.delivery, t.col.src, t.col.left, t.col.bought, t.col.follow, t.col.schedule];
  const rows = [
    [{ v: t.production, s: 'banner' }, ...Array(head.length - 1).fill({ v: '', s: 'banner' })],
    [{ v: meta, s: 'sub' }],
    head.map(h => ({ v: h, s: 'th' })),
  ];
  data.rows.forEach((r, i) => {
    const z = i % 2 ? 'z' : '';
    const p = r.project;
    const people = (r.stage?.members || []).map(m => m.profile?.full_name).filter(Boolean);
    if (!people.length && r.stage?.assignee?.full_name) people.push(r.stage.assignee.full_name);
    rows.push([
      { v: i + 1, s: `${z}tdNum` },
      { v: p.name || '', s: `${z}tdStrong` },
      { v: p.client || p.lead?.company || '', s: `${z}td` },
      { v: p.owner?.full_name || '', s: `${z}td` },
      { v: phaseName(r.phase), s: PHASE_TONE[r.phase] || 'stMuted' },
      { v: statusName(p.status), s: PROJECT_TONE[p.status] || 'stMuted' },
      { v: people.join(rtl ? '، ' : ', '), s: `${z}td` },
      r.stage ? { v: stageName(r.stage.status), s: STAGE_TONE[r.stage.status] || 'stMuted' } : { v: '—', s: `${z}td` },
      { v: excelDate(r.delivery.on), s: `${z}tdDate` },
      { v: r.delivery.src ? srcName(r.delivery.src) : '', s: `${z}td` },
      { v: r.left, s: r.left !== null && r.left < 0 ? `${z}tdBad` : `${z}tdNum` },
      { v: r.items.length ? `${r.itemsDone} / ${r.items.length}` : '—', s: `${z}tdNum` },
      { v: r.itemsFollow || null, s: r.itemsFollow ? `${z}tdBad` : `${z}tdNum` },
      { v: r.prod?.schedule || '', s: `${z}td` },
    ]);
  });
  const L = colName(head.length - 1);
  const prodSheet = {
    name: t.production, rtl, grid: false, tabColor: 'FF2F6FDF', freezeRow: 3,
    colWidths: [5, 40, 26, 22, 17, 15, 26, 14, 15, 20, 11, 12, 13, 44], heights: { 0: 34, 2: 30 },
    merges: [`A1:${L}1`, `A2:${L}2`], autoFilter: `A3:${L}${Math.max(3, rows.length)}`, rows,
  };

  const ihead = [t.col.n, t.col.item, t.col.desc, t.col.project, t.col.istatus, t.col.why, t.col.pdel, t.col.updated];
  const irows = [
    [{ v: t.procurement, s: 'banner' }, ...Array(ihead.length - 1).fill({ v: '', s: 'banner' })],
    [{ v: meta, s: 'sub' }],
    ihead.map(h => ({ v: h, s: 'th' })),
  ];
  data.items.forEach((it, i) => {
    const z = i % 2 ? 'z' : '';
    irows.push([
      { v: i + 1, s: `${z}tdNum` },
      { v: it.name || '', s: `${z}tdStrong` },
      { v: it.description || '', s: `${z}td` },
      { v: it.project?.name || '', s: `${z}td` },
      { v: procName(it.status), s: PROC_TONE[it.status] || 'stMuted' },
      { v: it.follow ? followText(it.follow) : '', s: it.follow ? `${z}tdBad` : `${z}td` },
      { v: excelDate(it.deliveryOn), s: `${z}tdDate` },
      { v: excelDate(it.updated_at || it.created_at), s: `${z}tdDate` },
    ]);
  });
  const IL = colName(ihead.length - 1);
  const procSheet = {
    name: t.procurement, rtl, grid: false, tabColor: 'FFB77900', freezeRow: 3,
    colWidths: [5, 34, 40, 38, 15, 36, 15, 14], heights: { 0: 34, 2: 30 },
    merges: [`A1:${IL}1`, `A2:${IL}2`], autoFilter: `A3:${IL}${Math.max(3, irows.length)}`, rows: irows,
  };
  return [prodSheet, procSheet];
}

export const factoryFileName = (today) => `expand-factory-${today}.xlsx`;
