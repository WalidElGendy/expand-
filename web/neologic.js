/* ==========================================================================
   Neo AI — the parts with no screen: the twelve agents, what each one reads,
   picking agents for a request when the AI cannot be asked (local mode),
   the report format, and a small, safe markdown renderer.

   The server function (supabase/functions/neo) keeps its own copy of the
   agent list and reads; test/neo.test.mjs checks the two agree.
   ========================================================================== */

export const AGENTS = [
  { key: 'tenders', mark: ['TD', 'من'], hue: 265, en: 'Tenders analyst', ar: 'محلل المناقصات',
    jobEn: 'Finds tenders that fit, reads terms, flags risks and deadlines.', jobAr: 'يجد المناقصات المناسبة ويقرأ الشروط وينبه للمخاطر والمواعيد.',
    words: ['tender', 'etimad', 'bid', 'rfp', 'مناقص', 'اعتماد', 'منافسة', 'عطاء'],
    reads: [['etimad_tenders', 'name, agency, scopes, published_on, last_offer_at, est_value_sar, shortlisted, dismissed', 30], ['tenders', 'ref, title, client, status, value_sar, submission_due, recommendation', 30]] },
  { key: 'sales', mark: ['SL', 'مب'], hue: 330, en: 'Sales and leads', ar: 'المبيعات والعملاء',
    jobEn: 'Scores leads, drafts follow-ups, keeps the pipeline moving.', jobAr: 'يقيّم العملاء المحتملين ويكتب المتابعات ويحرك المسار.',
    words: ['lead', 'sale', 'client', 'customer', 'pipeline', 'follow', 'deal', 'عميل', 'عملاء', 'مبيعات', 'متابعة', 'صفقة'],
    reads: [['leads', 'name, company, title, status, source, next_follow_up_on, value_sar, notes', 40], ['lead_intel', 'name_en, agency, rank, score, insight_en', 15]] },
  { key: 'projects', mark: ['PM', 'مش'], hue: 200, en: 'Project manager', ar: 'مدير المشاريع',
    jobEn: 'Tracks stages, owners and dates; warns before anything slips.', jobAr: 'يتابع المراحل والمسؤولين والمواعيد وينبه قبل أي تأخير.',
    words: ['project', 'stage', 'deadline', 'late', 'delay', 'due', 'مشروع', 'مشاريع', 'مرحلة', 'تأخ', 'موعد'],
    reads: [['projects', 'name, client, status, due_on, created_at, contract_value_sar', 40], ['project_stages', 'project_id, status, effort_days, planned_start, planned_end, completed_at', 60]] },
  { key: 'pricing', mark: ['PR', 'تس'], hue: 40, en: 'Pricing', ar: 'التسعير',
    jobEn: 'Builds pricing from past projects and checks margins.', jobAr: 'يبني التسعير من المشاريع السابقة ويراجع الهوامش.',
    words: ['price', 'pricing', 'quote', 'margin', 'cost', 'boq', 'سعر', 'تسعير', 'عرض سعر', 'هامش', 'تكلفة'],
    reads: [['projects', 'name, client, status, contract_value_sar', 30], ['pricing_items', 'name, description, qty, unit, cost_sar, unit_price_sar', 80]] },
  { key: 'procurement', mark: ['PO', 'شر'], hue: 160, en: 'Procurement', ar: 'المشتريات',
    jobEn: 'Turns needs into purchase requests and compares supplier quotes.', jobAr: 'يحوّل الاحتياجات إلى طلبات شراء ويقارن عروض الموردين.',
    words: ['procure', 'purchase', 'supplier', 'vendor', 'buy', 'order', 'شراء', 'مشتريات', 'مورد', 'موردين'],
    reads: [['procurement_items', 'name, description, status, qty, unit, needed_by, suppliers', 50]] },
  { key: 'production', mark: ['PD', 'إن'], hue: 20, en: 'Production', ar: 'الإنتاج',
    jobEn: 'Follows factory work and what is waiting on materials.', jobAr: 'يتابع أعمال المصنع وما ينتظر المواد.',
    words: ['factory', 'production', 'manufactur', 'material', 'delivery', 'site', 'مصنع', 'إنتاج', 'تصنيع', 'مواد', 'تسليم'],
    reads: [['production_info', 'project_id, schedule, site_delivery_on, updated_at', 40], ['procurement_items', 'name, status, needed_by, qty, unit', 40]] },
  { key: 'hr', mark: ['HR', 'مو'], hue: 300, en: 'HR', ar: 'الموارد البشرية',
    jobEn: 'Leave, attendance and HR letters, ready for signature.', jobAr: 'الإجازات والحضور وخطابات الموارد البشرية جاهزة للتوقيع.',
    words: ['leave', 'vacation', 'attendance', 'hr', 'employee', 'staff', 'إجاز', 'حضور', 'موظف', 'موارد بشرية'],
    reads: [['hr_requests', 'type, status, start_date, end_date, days, created_at', 40], ['hr_leaves', 'kind, start_date, end_date, days', 40]] },
  { key: 'finance', mark: ['FN', 'مل'], hue: 140, en: 'Finance', ar: 'المالية',
    jobEn: 'Payroll checks, advances, spend and what is owed.', jobAr: 'مراجعة الرواتب والسلف والمصروفات والمستحقات.',
    words: ['payroll', 'salary', 'advance', 'finance', 'invoice', 'revenue', 'cash', 'رواتب', 'راتب', 'سلف', 'مالي', 'فاتور', 'إيراد'],
    reads: [['hr_payroll_runs', 'period, status, approved_at, paid_at', 12], ['hr_advances', 'amount, instalments, remaining, start_period, status', 30], ['projects', 'name, client, contract_value_sar, status', 30]] },
  { key: 'documents', mark: ['DC', 'خط'], hue: 220, en: 'Documents and letters', ar: 'المستندات والخطابات',
    jobEn: 'Drafts letters, contracts and certificates in Arabic and English.', jobAr: 'يصيغ الخطابات والعقود والشهادات بالعربية والإنجليزية.',
    words: ['letter', 'draft', 'contract', 'certificate', 'write', 'خطاب', 'صياغ', 'عقد', 'شهادة', 'اكتب'],
    reads: [['hr_letters', 'kind, subject, status, letter_date', 20]] },
  { key: 'research', mark: ['RS', 'بح'], hue: 180, en: 'Research', ar: 'الأبحاث',
    jobEn: 'Researches markets, companies and competitors.', jobAr: 'يبحث في الأسواق والشركات والمنافسين.',
    words: ['research', 'market', 'competitor', 'agency', 'analy', 'بحث', 'سوق', 'منافس', 'تحليل'],
    reads: [['etimad_tenders', 'name, agency, scopes, awards, est_value_sar', 30], ['lead_intel', 'name_en, agency, insight_en', 20]] },
  { key: 'reports', mark: ['RP', 'تق'], hue: 250, en: 'Reports', ar: 'التقارير',
    jobEn: 'Writes weekly and monthly reports from live data.', jobAr: 'يكتب تقارير أسبوعية وشهرية من البيانات الحية.',
    words: ['report', 'weekly', 'monthly', 'summary', 'kpi', 'status', 'تقرير', 'أسبوع', 'شهري', 'ملخص'],
    reads: [['projects', 'name, client, status, due_on, contract_value_sar', 50], ['tasks', 'name, completed, due_on, section_name', 60], ['leads', 'name, company, status, next_follow_up_on, value_sar', 30]] },
  { key: 'assistant', mark: ['EA', 'مس'], hue: 285, en: 'Executive assistant', ar: 'المساعد التنفيذي',
    jobEn: 'Your day, your follow-ups, and what needs you now.', jobAr: 'يومك ومتابعاتك وما يحتاجك الآن.',
    words: ['today', 'my day', 'task', 'todo', 'remind', 'urgent', 'اليوم', 'مهام', 'مهمة', 'ذكر', 'عاجل'],
    reads: [['tasks', 'name, completed, due_on, section_name, notes', 50], ['notifications', 'kind, data, route, created_at, read_at', 20]] },
];
export const KEYS = AGENTS.map(a => a.key);
export const agent = (k) => AGENTS.find(a => a.key === k) || null;
export const MAX_AGENTS = 3;

/** Without the AI to route, pick by words in the request (English or
    Arabic). Most hits first, at most three; nothing matched → assistant. */
export function routeLocal(prompt) {
  const p = String(prompt || '').toLowerCase();
  /* Latin words match at a word start ('hr' must not fire on "three");
     Arabic words anywhere, since prefixes like ال and و attach to them. */
  const hit = (w) => /^[a-z ]+$/.test(w) ? new RegExp('(^|[^a-z])' + w).test(p) : p.includes(w);
  const scored = AGENTS.map((a, i) => ({ k: a.key, i, n: a.words.reduce((s, w) => s + (hit(w) ? 1 : 0), 0) }))
    .filter(x => x.n > 0).sort((a, b) => b.n - a.n || a.i - b.i);
  return scored.length ? scored.slice(0, MAX_AGENTS).map(x => x.k) : ['assistant'];
}

/** Only known agents, no repeats, at most three. */
export const cleanAgents = (list) => [...new Set((Array.isArray(list) ? list : []).filter(k => KEYS.includes(k)))].slice(0, MAX_AGENTS);

/** The tables a set of agents reads, each (table, columns) once. */
export function readsFor(keys) {
  const seen = new Map();
  for (const k of cleanAgents(keys)) for (const r of agent(k).reads) seen.set(r[0] + '|' + r[1], r);
  return [...seen.values()];
}

/** The instruction both runners give the model, so local and network
    reports look the same. */
export function systemPrompt(keys, lang, who, today) {
  const team = cleanAgents(keys).map(k => `- ${k}: ${agent(k).en} — ${agent(k).jobEn}`).join('\n');
  return `You are Neo, the AI that leads twelve specialist agents inside Expand, the company's workspace. You are answering for ${who || 'a team member'}.
Write in ${lang === 'ar' ? 'Arabic (clear Modern Standard)' : 'English'}. Use ONLY the workspace data given; if something needed is not there, say what is missing. Never invent numbers, names or dates. Today is ${today}.
The agents on this request:\n${team}
Answer ONLY with JSON: {"title": "<short title>", "sections": [{"agent": "<agent key>", "summary": "<what this agent found, markdown>"}], "next_steps": ["<concrete action>"]}`;
}

/** Whatever a model sent back, as {title, sections, next_steps} — never throws.
    A model that ignored the JSON instruction still gets its text shown, under
    the first agent, rather than an empty report. */
export function parseReport(text, keys) {
  const raw = String(text ?? '');
  let o = null;
  const a = raw.indexOf('{'), b = raw.lastIndexOf('}');
  if (a >= 0 && b > a) { try { o = JSON.parse(raw.slice(a, b + 1)); } catch { o = null; } }
  const ks = cleanAgents(keys);
  if (!o || typeof o !== 'object') {
    return { title: '', sections: raw.trim() ? [{ agent: ks[0] || 'assistant', summary: raw.trim().slice(0, 8000) }] : [], next_steps: [] };
  }
  const sections = (Array.isArray(o.sections) ? o.sections : [])
    .filter(s => s && KEYS.includes(s.agent) && s.summary)
    .map(s => ({ agent: s.agent, summary: String(s.summary).slice(0, 8000) }));
  const next_steps = (Array.isArray(o.next_steps) ? o.next_steps : []).map(s => String(s).slice(0, 300)).filter(Boolean).slice(0, 5);
  return { title: String(o.title || '').slice(0, 120), sections, next_steps };
}

/** A saved row's result column, back into a report. */
export function readStored(row) {
  if (!row || row.status !== 'done') return { sections: [], next_steps: [] };
  try { const o = JSON.parse(row.result || '{}'); return { sections: o.sections || [], next_steps: o.next_steps || [] }; }
  catch { return { sections: [], next_steps: [] }; }
}

const escH = (x) => String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Markdown the agents write — headings, bullets, numbers, **bold**, *italic*,
    `code` — turned into HTML. Everything is escaped first, so a model (or a
    row in the data it quoted) cannot put markup or script on the page. */
export function md(src) {
  const inline = (s) => escH(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>');
  const out = []; let list = null;
  const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const line of String(src ?? '').split(/\r?\n/)) {
    const t = line.trim();
    let m;
    if (!t) { close(); continue; }
    if ((m = t.match(/^#{1,4}\s+(.*)$/))) { close(); out.push(`<h4>${inline(m[1])}</h4>`); continue; }
    if ((m = t.match(/^[-*•]\s+(.*)$/))) { if (list !== 'ul') { close(); out.push('<ul>'); list = 'ul'; } out.push(`<li>${inline(m[1])}</li>`); continue; }
    if ((m = t.match(/^\d+[.)]\s+(.*)$/))) { if (list !== 'ol') { close(); out.push('<ol>'); list = 'ol'; } out.push(`<li>${inline(m[1])}</li>`); continue; }
    close(); out.push(`<p>${inline(t)}</p>`);
  }
  close();
  return out.join('');
}

/** Report → plain text, for "Copy". */
export function reportText(title, rep, lang) {
  const name = (k) => (agent(k) || {})[lang === 'ar' ? 'ar' : 'en'] || k;
  const parts = [title || ''];
  for (const s of rep.sections || []) parts.push(`\n## ${name(s.agent)}\n${s.summary}`);
  if ((rep.next_steps || []).length) parts.push(`\n## ${lang === 'ar' ? 'الخطوات التالية' : 'Next steps'}\n` + rep.next_steps.map((s, i) => `${i + 1}. ${s}`).join('\n'));
  return parts.join('\n').trim();
}

/* The eight MCP servers on the roadmap, and what each one is today — said
   plainly: only workspace data is wired in; the rest an admin connects. */
export const MCP = [
  { key: 'supabase', repo: 'supabase-community/supabase-mcp', state: 'builtin',
    en: ['Workspace data', 'Projects, leads, tenders, HR — read with your own permissions.'],
    ar: ['بيانات مساحة العمل', 'المشاريع والعملاء والمناقصات والموارد البشرية — بصلاحياتك أنت.'] },
  { key: 'servers', repo: 'modelcontextprotocol/servers', state: 'local',
    en: ['Files, fetch and memory', 'Reference servers that run on your own computer.'],
    ar: ['الملفات والجلب والذاكرة', 'خوادم مرجعية تعمل على جهازك.'] },
  { key: 'github', repo: 'github/github-mcp-server', state: 'connect',
    en: ['GitHub', 'Issues, pull requests and code for technical teams.'],
    ar: ['GitHub', 'المهام وطلبات الدمج والشيفرة للفرق التقنية.'] },
  { key: 'figma', repo: 'GLips/Figma-Context-MCP', state: 'connect',
    en: ['Figma', 'Design files as context for stands and layouts.'],
    ar: ['Figma', 'ملفات التصميم كسياق للأجنحة والمخططات.'] },
  { key: 'stripe', repo: 'stripe/agent-toolkit', state: 'connect',
    en: ['Stripe', 'Invoices and payments, with approval before anything moves.'],
    ar: ['Stripe', 'الفواتير والمدفوعات، بموافقة قبل أي حركة.'] },
  { key: 'fastmcp', repo: 'jlowin/fastmcp', state: 'build',
    en: ['Your own tools', 'The framework for building your company\'s own connectors.'],
    ar: ['أدواتك الخاصة', 'إطار لبناء موصلات خاصة بشركتك.'] },
  { key: 'mcpuse', repo: 'mcp-use/mcp-use', state: 'build',
    en: ['Agent ↔ server bridge', 'Lets each agent use any MCP server you connect.'],
    ar: ['جسر الوكيل والخادم', 'يتيح لكل وكيل استخدام أي خادم MCP تربطه.'] },
  { key: 'awesome', repo: 'punkpeye/awesome-mcp-servers', state: 'directory',
    en: ['Directory', 'Hundreds more servers to choose from.'],
    ar: ['الدليل', 'مئات الخوادم الأخرى للاختيار منها.'] },
];
