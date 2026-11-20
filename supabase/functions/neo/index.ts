/* ==========================================================================
   neo — Neo AI through the network (Claude).

   POST { prompt, agents?: string[], lang?: 'en'|'ar' }
     1. Who is asking (their own token) — Neo only ever sees what they can.
     2. Which agents: the ones the person picked, or Neo routes (a short
        Claude call) to at most three of the twelve.
     3. Each agent's slice of the workspace, read WITH THE CALLER'S TOKEN, so
        row-level security decides: an employee's Neo cannot read payroll.
     4. One Claude call writes the report, a section per agent, and the next
        steps. Saved in neo_tasks (private to the person) and returned.

   Local runs (Ollama on the person's PC) never come here: the browser reads
   the same slices and asks the local model itself.
   Secret: ANTHROPIC_API_KEY (shared with etimad). 40 network runs a day each.
   ========================================================================== */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import { CORS, json, adminClient, whoIsAsking } from '../_shared/http.ts';

const MODEL = Deno.env.get('ANTHROPIC_MODEL') || 'claude-sonnet-5-5';
const DAILY = 40;

/* The twelve, and the workspace tables each one reads. */
const AGENTS: Record<string, { name: string; job: string; reads: [string, string, number][] }> = {
  tenders:     { name: 'Tenders analyst', job: 'Finds tenders that fit, reads terms, flags risks and deadlines.',
    reads: [['etimad_tenders', 'name, agency, scopes, published_on, last_offer_at, est_value_sar, shortlisted, dismissed', 30], ['tenders', 'ref, title, client, status, value_sar, submission_due, recommendation', 30]] },
  sales:       { name: 'Sales and leads', job: 'Scores leads, drafts follow-ups, keeps the pipeline moving.',
    reads: [['leads', 'name, company, title, status, source, next_follow_up_on, value_sar, notes', 40], ['lead_intel', 'name_en, agency, rank, score, insight_en', 15]] },
  projects:    { name: 'Project manager', job: 'Tracks stages, owners and dates; warns before anything slips.',
    reads: [['projects', 'name, client, status, due_on, created_at, contract_value_sar', 40], ['project_stages', 'project_id, status, effort_days, planned_start, planned_end, completed_at', 60]] },
  pricing:     { name: 'Pricing', job: 'Builds pricing from past projects and checks margins.',
    reads: [['projects', 'name, client, status, contract_value_sar', 30], ['pricing_items', 'name, description, qty, unit, cost_sar, unit_price_sar', 80]] },
  procurement: { name: 'Procurement', job: 'Turns needs into purchase requests and compares supplier quotes.',
    reads: [['procurement_items', 'name, description, status, qty, unit, needed_by, suppliers', 50]] },
  production:  { name: 'Production', job: 'Follows factory work and what is waiting on materials.',
    reads: [['production_info', 'project_id, schedule, site_delivery_on, updated_at', 40], ['procurement_items', 'name, status, needed_by, qty, unit', 40]] },
  hr:          { name: 'HR', job: 'Leave, attendance and HR letters, ready for signature.',
    reads: [['hr_requests', 'type, status, start_date, end_date, days, created_at', 40], ['hr_leaves', 'kind, start_date, end_date, days', 40]] },
  finance:     { name: 'Finance', job: 'Payroll checks, advances, spend and what is owed.',
    reads: [['hr_payroll_runs', 'period, status, approved_at, paid_at', 12], ['hr_advances', 'amount, instalments, remaining, start_period, status', 30], ['projects', 'name, client, contract_value_sar, status', 30]] },
  documents:   { name: 'Documents and letters', job: 'Drafts letters, contracts and certificates in Arabic and English.',
    reads: [['hr_letters', 'kind, subject, status, letter_date', 20]] },
  research:    { name: 'Research', job: 'Researches markets, companies and competitors.',
    reads: [['etimad_tenders', 'name, agency, scopes, awards, est_value_sar', 30], ['lead_intel', 'name_en, agency, insight_en', 20]] },
  reports:     { name: 'Reports', job: 'Writes weekly and monthly reports from live data.',
    reads: [['projects', 'name, client, status, due_on, contract_value_sar', 50], ['tasks', 'name, completed, due_on, section_name', 60], ['leads', 'name, company, status, next_follow_up_on, value_sar', 30]] },
  assistant:   { name: 'Executive assistant', job: 'Your day, your follow-ups, and what needs you now.',
    reads: [['tasks', 'name, completed, due_on, section_name, notes', 50], ['notifications', 'kind, data, route, created_at, read_at', 20]] },
};
const KEYS = Object.keys(AGENTS);

const clip = (v: unknown, n: number) => String(v ?? '').slice(0, n);
const slim = (o: unknown, max: number) => { const s = JSON.stringify(o ?? null); return s.length > max ? s.slice(0, max) + '…' : s; };

async function claude(key: string, system: string, user: string, maxTokens: number) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
  });
  const out = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(out?.error?.message || `claude ${r.status}`);
  return (out.content || []).filter((c: { type: string }) => c.type === 'text').map((c: { text: string }) => c.text).join('');
}
const parse = (t: string) => { const a = t.indexOf('{'), b = t.lastIndexOf('}'); try { return a >= 0 ? JSON.parse(t.slice(a, b + 1)) : null; } catch { return null; } };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const admin = adminClient();
  const me = await whoIsAsking(req, admin);
  if (!me) return json({ error: 'sign_in' }, 401);
  const key = (Deno.env.get('ANTHROPIC_API_KEY') || '').trim();
  if (!key) return json({ error: 'not_configured' }, 503);

  const body = await req.json().catch(() => ({}));
  const prompt = clip(body.prompt, 4000).trim();
  if (!prompt) return json({ error: 'empty' }, 400);
  const lang = body.lang === 'ar' ? 'ar' : 'en';

  const since = new Date(Date.now() - 864e5).toISOString();
  const { count } = await admin.from('neo_tasks').select('id', { count: 'exact', head: true })
    .eq('owner', me.id).like('model', 'claude%').gte('created_at', since);
  if ((count || 0) >= DAILY) return json({ error: 'daily_limit', limit: DAILY }, 429);

  // 2. Route.
  let agents: string[] = (Array.isArray(body.agents) ? body.agents : []).filter((a: string) => KEYS.includes(a)).slice(0, 3);
  if (!agents.length) {
    const menu = KEYS.map((k) => `${k}: ${AGENTS[k].name} — ${AGENTS[k].job}`).join('\n');
    const pick = parse(await claude(key, 'You route requests inside a company workspace. Answer only with JSON.',
      `Agents:\n${menu}\n\nRequest: ${prompt}\n\nPick the 1 to 3 agents best placed to answer, most important first. JSON: {"agents": ["key", ...], "title": "<4-8 word title in ${lang === 'ar' ? 'Arabic' : 'English'}>"}`, 200));
    agents = (pick?.agents || []).filter((a: string) => KEYS.includes(a)).slice(0, 3);
    if (!agents.length) agents = ['assistant'];
    body.title = pick?.title;
  }

  // 3. What each agent can see — as the caller, so RLS applies.
  const asCaller = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }, auth: { persistSession: false } });
  const slices: Record<string, unknown> = {};
  const reads = [...new Map(agents.flatMap((a) => AGENTS[a].reads).map((r) => [r[0] + r[1], r])).values()];
  await Promise.all(reads.map(async ([table, cols, limit]) => {
    const { data, error } = await asCaller.from(table).select(cols).limit(limit);
    slices[table] = error ? `not available to you (${error.message.slice(0, 80)})` : data;
  }));

  // 4. The report.
  const team = agents.map((a) => `- ${AGENTS[a].name}: ${AGENTS[a].job}`).join('\n');
  const system = `You are Neo, the AI that leads twelve specialist agents inside Expand, the company's workspace. You are answering for ${me.full_name || 'a team member'}.
Write in ${lang === 'ar' ? 'Arabic (clear Modern Standard)' : 'English'}. Use ONLY the workspace data given; if something needed is not there, say what is missing. Never invent numbers, names or dates. Today is ${new Date().toISOString().slice(0, 10)}.
The agents on this request:\n${team}
Answer ONLY with JSON: {"title": "<short title>", "sections": [{"agent": "<agent key>", "summary": "<what this agent found, markdown: short paragraphs, bullets, **bold**>"}], "next_steps": ["<concrete action>", ...at most 5]}`;
  const user = `Request: ${prompt}\n\nWorkspace data (JSON, trimmed):\n${slim(slices, 60000)}`;
  let result: any;
  try {
    result = parse(await claude(key, system, user, 2500));
  } catch (e) {
    await admin.from('neo_tasks').insert({ owner: me.id, agents, title: clip(body.title || prompt, 120), prompt, status: 'failed', result: String(e).slice(0, 500), model: 'claude', finished_at: new Date().toISOString() });
    return json({ error: 'ai_unavailable' }, 502);
  }
  const sections = (Array.isArray(result?.sections) ? result.sections : []).filter((s: any) => s && KEYS.includes(s.agent))
    .map((s: any) => ({ agent: s.agent, summary: clip(s.summary, 8000) }));
  const steps = (Array.isArray(result?.next_steps) ? result.next_steps : []).map((s: unknown) => clip(s, 300)).slice(0, 5);
  const title = clip(result?.title || body.title || prompt, 120);
  const report = JSON.stringify({ sections, next_steps: steps });
  const { data: row } = await admin.from('neo_tasks').insert({
    owner: me.id, agents, title, prompt, status: 'done', result: report, model: 'claude', finished_at: new Date().toISOString(),
  }).select('id, created_at').single();
  return json({ id: row?.id, created_at: row?.created_at, agents, title, sections, next_steps: steps, model: 'claude' });
});
