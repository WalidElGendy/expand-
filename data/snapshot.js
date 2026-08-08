/* ==========================================================================
   A snapshot of the live Asana workspace, read on 8 August 2026.

   Everything below is real. The names are the people who are actually
   assigned the work, the counts are actually open tasks, the deals are
   actually in the Sales pipeline board, and the leads are actually sitting
   unassigned. Nothing here is invented to make a screen look full.

   Why a baked snapshot and not a live API call: there is no backend yet, and
   a demo that silently shows stale data while implying it is live is worse
   than one that states its capture date. `capturedAt` is printed in the UI.

   Replace this module with a real fetch the moment auth exists — the shape
   is deliberately the shape an API would return.
   ========================================================================== */

'use strict';

export const capturedAt = '2026-08-08';
export const workspace = 'Expand Expo · Asana 1205332497357182';

/* -------------------------------------------------------------------------
   Departments. The seven you described exist as SECTIONS inside each
   project, not as Asana teams — Asana's teams are personal ("Omar's First
   Team", "Rania's Team"). The sections are the reliable signal, so they are
   what the roster below is keyed on.
   ------------------------------------------------------------------------- */
export const DEPARTMENTS = {
  pm:        { id: 'pm',        en: 'Project management',   ar: 'إدارة المشاريع',   colour: 'var(--s4)' },
  '3d':      { id: '3d',        en: '3D design',            ar: 'التصميم ثلاثي الأبعاد', colour: 'var(--s1)' },
  '2d':      { id: '2d',        en: '2D technical',         ar: 'الرسومات الفنية',  colour: 'var(--s2)' },
  content:   { id: 'content',   en: 'Content creation',     ar: 'إنتاج المحتوى',    colour: 'var(--s3)' },
  pricing:   { id: 'pricing',   en: 'Pricing & financial',  ar: 'التسعير والمالية', colour: 'var(--s4)' },
  bd:        { id: 'bd',        en: 'Business development', ar: 'تطوير الأعمال',    colour: 'var(--brand)' },
  production:{ id: 'production',en: 'Production',           ar: 'التنفيذ',          colour: 'var(--ink3)' },
};

/* -------------------------------------------------------------------------
   The roster.

   `openTasks` and `projects` are counted from open, assigned Asana tasks on
   the capture date. Overdue counts and next-due dates are deliberately NOT
   stored here — they are derived from ASSIGNMENTS at render time, so a stat
   can never contradict the table printed under it. `capacity` is how many people the department has doing
   that stage — and it is the number worth arguing about, because the whole
   model turns on it. Where Asana shows one person doing every task of a
   stage, capacity is 1 and `capacityConfirmed` is false: that is what the
   data says, not something anyone has confirmed.
   ------------------------------------------------------------------------- */
export const PEOPLE = [
  {
    id: '1211783184896369', name: 'Mahmoud Abdelghny', email: 'mahmoud.ashraf@expandexpo.com',
    dept: '3d', role: { en: '3D designer', ar: 'مصمم ثلاثي الأبعاد' },
    openTasks: 17, projects: 8,
    note: { en: 'Every 3D Design task in the workspace is assigned to him.',
            ar: 'كل مهام التصميم ثلاثي الأبعاد في المساحة مسندة إليه.' },
  },
  {
    id: '1211755244109291', name: 'AMEEN EYAD', email: 'ameen@expandexpo.com',
    dept: '2d', role: { en: '2D technical designer', ar: 'مصمم فني' },
    openTasks: 61, projects: 34,
    note: { en: 'Every 2D Design task in the workspace is assigned to him, across 34 projects.',
            ar: 'كل مهام التصميم الفني مسندة إليه، عبر ٣٤ مشروعاً.' },
  },
  {
    id: '1211418760238119', name: 'Omar Khaled', email: 'omer@expandexpo.com',
    dept: 'pricing', role: { en: 'Pricing review & approval', ar: 'مراجعة واعتماد الأسعار' },
    openTasks: 21, projects: 17,
    note: { en: 'Holds "price review and approval" on 17 separate projects. Nothing prices without him.',
            ar: 'يملك "مراجعة الأسعار والاعتماد" في ١٧ مشروعاً. لا يُسعَّر شيء بدونه.' },
  },
  {
    id: '1211453668435803', name: 'Wejdan Alkhubayzi', email: 'wejdan@expandexpo.com',
    dept: 'pricing', role: { en: 'Financial offers', ar: 'العروض المالية' },
    openTasks: 1, projects: 1,
  },
  {
    id: '1212071112749783', name: 'Fahad Sultan Alshaibani', email: 'f.alshaibani@expandexpo.com',
    dept: 'pricing', role: { en: 'Cost structure', ar: 'هيكلة التكاليف' },
    openTasks: 1, projects: 1,
  },
  {
    id: '1211554705221607', name: 'Lidia Vieira Garcia', email: 'lidia@expandexpo.com',
    dept: 'bd', role: { en: 'Lead qualification', ar: 'تأهيل العملاء المحتملين' },
    openTasks: 1, projects: 1,
    note: { en: 'The only person assigned any lead in Sales Leads.',
            ar: 'الشخص الوحيد المسند إليه أي عميل محتمل في قائمة العملاء.' },
  },
  {
    id: '1211453758101341', name: 'Khalid AlJibrin', email: 'khalid@expandexpo.com',
    dept: 'bd', role: { en: 'Business development', ar: 'تطوير الأعمال' },
    openTasks: 1, projects: 1,
  },
  {
    id: '1211465426979965', name: 'Rania', email: 'rania@expandexpo.com',
    dept: 'pm', role: { en: 'Project manager', ar: 'مديرة مشاريع' },
    openTasks: 0, projects: 0,
  },
  {
    id: '1211453774754859', name: 'Taif Alharthi', email: 'taif@expandexpo.com',
    dept: 'pm', role: { en: 'Project manager', ar: 'مديرة مشاريع' },
    openTasks: 0, projects: 0,
  },
  {
    id: '1211453767486638', name: 'Ebrahim Ahmed', email: 'ebrahim@expandexpo.com',
    dept: 'pm', role: { en: 'Project manager', ar: 'مدير مشاريع' },
    openTasks: 0, projects: 0,
  },
  {
    id: '1211453771942010', name: 'Mohammed Alhaymi', email: 'mohammedsaleh@expandexpo.com',
    dept: 'pm', role: { en: 'Project manager', ar: 'مدير مشاريع' },
    openTasks: 0, projects: 0,
  },
  {
    id: 'content-unassigned', name: '—', email: null,
    dept: 'content', role: { en: 'Content creation', ar: 'إنتاج المحتوى' },
    openTasks: 0, projects: 0, vacant: true,
    note: { en: 'No one in Asana is assigned content tasks. Either the role is vacant or the work is unrecorded.',
            ar: 'لا يوجد شخص مسند إليه مهام المحتوى في أسانا. إما أن الدور شاغر أو أن العمل غير مسجّل.' },
  },
];

/* Capacity per stage, as the data shows it — not as anyone has confirmed it. */
export const CAPACITY = {
  '3d':     { people: 1, confirmed: false },
  '2d':     { people: 1, confirmed: false },
  content:  { people: 0, confirmed: false },
  pricing:  { people: 3, confirmed: false, gate: 'Omar Khaled' },
};

/* -------------------------------------------------------------------------
   The Sales pipeline board, verbatim from Asana. Stage names are Asana's own
   section names — no stages were invented to make a nicer funnel.
   ------------------------------------------------------------------------- */
export const PIPELINE_STAGES = [
  { id: 'new',   en: 'New opportunities',      ar: 'فرص جديدة' },
  { id: 'late',  en: 'Late stage opportunities', ar: 'فرص متقدمة' },
  { id: 'won',   en: 'Closed won',             ar: 'صفقات مكسوبة' },
];

export const DEALS = [
  { id: '1211552337996506', name: 'هيئة التخصصات الصحيه', latin: 'Saudi Commission for Health Specialties', stage: 'new',  owner: 'Omar Khaled',       due: '2026-01-09', open: true,  size: 'L'  },
  { id: '1211552337996511', name: 'هيئة الصحه العامه',    latin: 'Public Health Authority',                 stage: 'new',  owner: 'Omar Khaled',       due: '2026-01-09', open: true,  size: 'L'  },
  { id: '1211552337996477', name: 'STC channel',           latin: 'STC channel',                             stage: 'new',  owner: 'Omar Khaled',       due: '2025-12-09', open: true,  size: 'M'  },
  { id: '1211552337996486', name: 'KAFD Annual',           latin: 'KAFD Annual',                             stage: 'new',  owner: 'Omar Khaled',       due: '2026-01-09', open: true,  size: 'L'  },
  { id: '1211552337996470', name: 'حفل تدشين مؤسسة الامير', latin: 'Prince Foundation launch ceremony',      stage: 'new',  owner: 'Khalid AlJibrin',   due: '2025-12-11', open: true,  size: 'M'  },
  { id: '1211649037112480', name: 'City Scape',            latin: 'City Scape',                              stage: 'late', owner: 'Omar Khaled',       due: '2025-11-15', open: false, size: 'XL' },
  { id: '1211552337996534', name: 'الضمان الصحي',          latin: 'Council of Health Insurance',             stage: 'won',  owner: 'ayman',             due: '2025-10-24', open: true,  size: 'L'  },
  { id: '1211552337996529', name: 'فيدكو',                 latin: 'FIDCO',                                   stage: 'won',  owner: 'Omar Khaled',       due: '2025-10-17', open: false, size: 'M'  },
  { id: '1211552337996521', name: 'NCW',                   latin: 'NCW',                                     stage: 'won',  owner: 'Omar Khaled',       due: '2025-10-17', open: false, size: 'M'  },
  { id: '1211552337996515', name: 'NHC Innovation',        latin: 'NHC Innovation',                          stage: 'won',  owner: 'Omar Khaled',       due: '2025-10-17', open: false, size: 'L'  },
  { id: '1211552337996492', name: 'Solar Energy Event',    latin: 'Solar Energy Event (2 booths)',           stage: 'won',  owner: 'Taif Alharthi',     due: '2025-10-16', open: false, size: 'L'  },
  { id: '1211552337996454', name: 'مواكب الخير',           latin: 'Mawakib Al Khair',                        stage: 'won',  owner: 'Ebrahim Ahmed',     due: '2025-11-12', open: false, size: 'S'  },
  { id: '1211552337996324', name: 'نيو ميتركس',            latin: 'New Metrics',                             stage: 'won',  owner: 'Omar Khaled',       due: '2025-10-19', open: false, size: 'M'  },
  { id: '1211552337996341', name: 'منتدي الحرف اليدويه',   latin: 'Handicrafts Forum',                       stage: 'won',  owner: 'Rania',             due: '2025-12-02', open: false, size: 'L'  },
  { id: '1211552337996343', name: 'مركز مكه الطبي',        latin: 'Makkah Medical Center',                   stage: 'won',  owner: 'Mohammed Alhaymi',  due: '2025-11-12', open: false, size: 'M'  },
];

/* -------------------------------------------------------------------------
   Sales Leads. Summary rather than all 70 rows, because the shape is the
   finding: the list was loaded once in October 2025 and then stopped.
   ------------------------------------------------------------------------- */
export const LEADS = {
  total: 70,
  open: 48,
  unassigned: 48,
  assignedTo: 'Lidia Vieira Garcia',
  oldestDue: '2025-10-16',
  newestDue: '2025-11-10',
  batches: [
    { label: 'Leads 15/10/2025', total: 10, open: 1 },
    { label: 'Leads 23/10/2025', total: 14, open: 8 },
    { label: 'Leads 26/10/2025', total: 10, open: 7 },
    { label: 'Leads 27/10/2025', total: 11, open: 11 },
    { label: 'Leads 28/10/2025', total: 11, open: 8 },
    { label: 'Leads 29/10/2025', total: 10, open: 10 },
    { label: 'Leads 30/10/2025', total: 6,  open: 5 },
  ],
  otherLists: [
    { name: 'World Defense Show Prospects', total: 251, open: 150 },
    { name: 'Potential Clients',            total: 14,  open: 0 },
    { name: 'Business Development',         total: 10,  open: 3 },
  ],
};

/* -------------------------------------------------------------------------
   Measured stage durations, from the completed proposals in the workspace.
   These are ELAPSED days (created -> completed), which is effort PLUS queue.
   They are shown as evidence that queue exists, and must never be fed into
   the scheduler as effort — the scheduler adds queue itself, so doing that
   would count it twice. docs/ASANA-FINDINGS.md explains at length.
   ------------------------------------------------------------------------- */
export const MEASURED = [
  { stage: '3d',        stated: 5,    medianElapsed: 11.5, min: 3, max: 37, n: 6 },
  { stage: '2d',        stated: 2,    medianElapsed: 5.5,  min: 3, max: 30, n: 6 },
  { stage: 'pricing',   stated: null, medianElapsed: 13,   min: 3, max: 32, n: 6 },
  { stage: 'content',   stated: 3,    medianElapsed: 25,   min: 25, max: 25, n: 1 },
  { stage: 'production',stated: null, medianElapsed: 4,    min: 4, max: 4,  n: 1 },
];

/* -------------------------------------------------------------------------
   Live in-flight work, one row per (project, stage, person) — which is the
   shape Asana actually stores, and the shape a profile needs. A designer's
   "what you are holding up" is a filter over this, not a separate list that
   could drift away from it.
   ------------------------------------------------------------------------- */
export const ASSIGNMENTS = [
  { project: 'TAWAL | Event Management & Branding Services',   stage: '2d',      who: '1211755244109291', due: '2026-08-10' },
  { project: 'TAWAL | Event Management & Branding Services',   stage: '3d',      who: '1211783184896369', due: '2026-08-10' },
  { project: 'TAWAL | Event Management & Branding Services',   stage: 'pricing', who: '1211418760238119', due: '2026-08-09' },
  { project: 'المؤتمر السنوي لمجمع الملك سلمان 2026',            stage: '3d',      who: '1211783184896369', due: '2026-08-11' },
  { project: 'حفل الاحتفاء بـ300 عام للتأسيس — الهيئة العامة للطرق', stage: '3d',   who: '1211783184896369', due: '2026-08-06' },
  { project: 'مشروع تصميم شركة فيدكو في المعرض الزراعي',         stage: '3d',      who: '1211783184896369', due: '2026-08-16' },
  { project: 'تصميم معرض مؤسسة سكن وجود الإسكان في ستي سكيب',    stage: '2d',      who: '1211755244109291', due: '2026-08-01' },
  // Recorded in Asana as a 3D task but assigned to the 2D designer. Left as
  // found — a routing error the tool should surface, not quietly correct.
  { project: 'تصميم معرض مؤسسة سكن وجود الإسكان في ستي سكيب',    stage: '3d',      who: '1211755244109291', due: '2026-08-02', misrouted: true },
  { project: 'مشاركة موني هاش في موني 2020',                    stage: '2d',      who: '1211755244109291', due: '2026-07-28' },
  { project: 'SAR — Framework agreement 2026',                 stage: '2d',      who: '1211755244109291', due: '2026-07-27' },
  { project: 'SAR — Framework agreement 2026',                 stage: 'pricing', who: '1211418760238119', due: '2026-07-27' },
  { project: 'هيئة حقوق الانسان — اتفاقية خدمات السفر',           stage: '2d',      who: '1211755244109291', due: '2026-07-27' },
  { project: 'هيئة حقوق الانسان — اتفاقية خدمات السفر',           stage: 'pricing', who: '1211418760238119', due: null },
  { project: 'هيئة حقوق الانسان — اتفاقية خدمات السفر',           stage: 'pricing', who: '1212071112749783', due: null },
  { project: 'التعليمية — ورش عمل',                             stage: 'pricing', who: '1211418760238119', due: '2026-07-28' },
  { project: 'Takaful Alrajhi | Money20/20',                   stage: 'pricing', who: '1211418760238119', due: '2026-06-28' },
  { project: 'منتدى الاونكتاد — مواني',                          stage: '2d',      who: '1211755244109291', due: '2026-06-14' },
  { project: 'منتدى الاونكتاد — مواني',                          stage: 'pricing', who: '1211418760238119', due: '2026-06-15' },
  { project: 'المعارض الدائمة — مجمع الملك سلمان للغة العربية',    stage: 'pricing', who: '1211418760238119', due: '2026-06-16' },
  { project: 'المنتدى الدولي للأمن السيبراني — الهيئة الوطنية',    stage: '2d',      who: '1211755244109291', due: '2026-07-07' },
  { project: 'المنتدى الدولي للأمن السيبراني — الهيئة الوطنية',    stage: '3d',      who: '1211783184896369', due: null },
  { project: 'Emakn — Money20/20',                             stage: '2d',      who: '1211755244109291', due: null },
  { project: 'Emakn — Money20/20',                             stage: '3d',      who: '1211783184896369', due: null },
  { project: 'Emakn — Money20/20',                             stage: 'pricing', who: '1211418760238119', due: null },
  { project: 'Safqah Capital — Money20/20',                    stage: '2d',      who: '1211755244109291', due: null },
  { project: 'Safqah Capital — Money20/20',                    stage: '3d',      who: '1211783184896369', due: null },
  { project: 'Safqah Capital — Money20/20',                    stage: 'pricing', who: '1211418760238119', due: null },
  { project: 'مشاركة وزارة الصناعة في شيكاغو',                    stage: '3d',      who: '1211783184896369', due: null },
  { project: 'مشاركة وزارة الصناعة في شيكاغو',                    stage: 'pricing', who: '1211418760238119', due: null },
  { project: 'NETWORK — Money20/20',                           stage: '2d',      who: '1211755244109291', due: null },
  { project: 'NETWORK — Money20/20',                           stage: 'pricing', who: '1211453668435803', due: null },
  { project: 'حفل 30 عاماً — السجل السعودي للسرطان',              stage: '2d',      who: '1211755244109291', due: null },
  { project: 'حفل 30 عاماً — السجل السعودي للسرطان',              stage: 'pricing', who: '1211418760238119', due: null },
  { project: 'Sales Leads — batch of 15/10/2025',              stage: 'bd',      who: '1211554705221607', due: '2025-10-16' },
  { project: 'حفل تدشين مؤسسة الأمير',                           stage: 'bd',      who: '1211453758101341', due: '2025-12-11' },
];

export const assignmentsFor = (personId) => ASSIGNMENTS.filter(a => a.who === personId);

export const byId = (id) => PEOPLE.find(p => p.id === id) || null;
export const inDept = (d) => PEOPLE.filter(p => p.dept === d && !p.vacant);
