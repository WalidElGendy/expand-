/* ==========================================================================
   etimad — the server half of Etimad Insights.

   The three API keys (Firecrawl, Anthropic, Lusha) live here as function
   secrets and nowhere else: not in the repo, not in the bundle, not in a
   table. The browser asks for an action; this function checks the caller is
   tender staff, calls the paid API, and writes the rows.

     status    which keys are configured, and the last sync
     discover  read the Etimad tool catalogue from Firecrawl (free)
     sync      search Etimad for every keyword in settings, upsert tenders
     details   fetch one tender's full details (and award results, if shown)
     analyze   Claude reads the tender, our history and any uploaded RFP
     contacts  Lusha: people at the issuing agency (previews, no credits
               beyond the search)
     reveal    Lusha: email and phone for one person (uses credits)
   ========================================================================== */

import { CORS, json, adminClient, whoIsAsking } from '../_shared/http.ts';
import { normTender, findTenders, awardsFrom, toolsFrom, searchCall, classify } from './map.js';

const FIRECRAWL = 'https://api.firecrawl.dev/v2/scrape';
const PROVIDER = 'tenders-etimad-sa';
const MODEL = Deno.env.get('ANTHROPIC_MODEL') || 'claude-sonnet-5-5';
const key = (n: string) => (Deno.env.get(n) || '').trim();

type Admin = ReturnType<typeof adminClient>;

/* The Tenders department and admins — the same rule as etimad_access() in
   the database. */
async function isTenderStaff(_admin: Admin, me: { id: string; role: string; department_id: string | null }) {
  return me.role === 'admin' || me.department_id === 'tenders';
}

async function usage(admin: Admin, service: string, action: string, units: number | null, note: string | null, by: string) {
  await admin.from('etimad_usage').insert({ service, action, units, note, created_by: by });
}

/* ------------------------------------------------------------- Firecrawl */

type Call = { provider?: string; capability: string; options?: Record<string, unknown> };
async function alexandria(calls: Call[], timeout = 110000) {
  const k = key('FIRECRAWL_API_KEY');
  if (!k) throw new Error('missing_key:FIRECRAWL_API_KEY');
  const res = await fetch(FIRECRAWL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', 'x-request-id': crypto.randomUUID() },
    body: JSON.stringify({ alexandria: calls.map(c => ({ provider: c.provider || PROVIDER, capability: c.capability, options: c.options || {} })), timeout }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body?.success) {
    const err = body?.error || body?.message || `HTTP ${res.status}`;
    const action = body?.requiresAction?.url || body?.data?.requiresAction?.url;
    throw new Error(`firecrawl: ${typeof err === 'string' ? err : JSON.stringify(err)}${action ? ` — accept the provider terms at ${action}` : ''}`);
  }
  return { items: (body.data?.alexandria || []) as { data?: unknown; error?: { message?: string; code?: string; requiresAction?: { url?: string } } }[], credits: Number(body.data?.creditsCost) || 0 };
}

async function discover(admin: Admin, by: string) {
  const r = await alexandria([{ provider: 'firecrawl', capability: 'find-tools',
    options: { providers: [PROVIDER], level: 'tools', expand: ['options', 'response'], limit: 20 } }]);
  const item = r.items[0];
  if (item?.error) throw new Error(`firecrawl: ${item.error.message || item.error.code}`);
  const tools = toolsFrom(item?.data);
  await admin.from('etimad_settings').update({ tools: { tools, raw: item?.data, at: new Date().toISOString() } }).eq('id', 1);
  await usage(admin, 'firecrawl', 'discover', r.credits, null, by);
  return tools;
}

async function getTools(admin: Admin, by: string) {
  const { data } = await admin.from('etimad_settings').select('tools').eq('id', 1).maybeSingle();
  const t = (data?.tools as { tools?: unknown[] } | null)?.tools;
  if (Array.isArray(t) && t.length) return t as ReturnType<typeof toolsFrom>;
  try { return await discover(admin, by); } catch { return []; }
}

async function upsertTenders(admin: Admin, rows: Record<string, unknown>[]) {
  if (!rows.length) return { added: 0, updated: 0 };
  const ids = rows.map(r => r.tender_id_string as string);
  const { data: had } = await admin.from('etimad_tenders').select('tender_id_string').in('tender_id_string', ids);
  const known = new Set((had || []).map(x => x.tender_id_string));
  /* Never overwrite a field we already have with an empty one: a search row
     carries less than the details page did. So new rows are inserted, and
     known rows are patched with only the fields this search actually has. */
  const clean = rows.map(r => Object.fromEntries(Object.entries(r).filter(([, v]) => v !== null && v !== undefined && !(Array.isArray(v) && !v.length))));
  const fresh = clean.filter(r => !known.has(r.tender_id_string as string));
  for (let i = 0; i < fresh.length; i += 200) {
    const { error } = await admin.from('etimad_tenders').insert(fresh.slice(i, i + 200), { defaultToNull: false });
    if (error) throw new Error(error.message);
  }
  for (const r of clean.filter(r => known.has(r.tender_id_string as string))) {
    const { tender_id_string, ...patch } = r;
    await admin.from('etimad_tenders').update(patch).eq('tender_id_string', tender_id_string as string);
  }
  return { added: fresh.length, updated: clean.length - fresh.length };
}

async function sync(admin: Admin, by: string, body: Record<string, unknown>) {
  const { data: s } = await admin.from('etimad_settings').select('keywords').eq('id', 1).maybeSingle();
  const words: string[] = (Array.isArray(body.keywords) && body.keywords.length ? body.keywords : s?.keywords || []) as string[];
  const pages = Math.max(1, Math.min(3, Number(body.pages) || 1));
  const tools = await getTools(admin, by);
  const calls: (Call & { kw: string })[] = [];
  for (const kw of words) for (let p = 1; p <= pages; p++) calls.push({ ...searchCall(tools, kw, p), kw });
  const byId = new Map<string, Record<string, unknown>>();
  const errors: string[] = [];
  let credits = 0;
  for (let i = 0; i < calls.length; i += 10) {
    const chunk = calls.slice(i, i + 10);
    let r;
    try { r = await alexandria(chunk); } catch (e) { errors.push(String((e as Error).message)); continue; }
    credits += r.credits;
    r.items.forEach((it, j) => {
      if (it?.error) { errors.push(`${chunk[j].kw}: ${it.error.message || it.error.code}${it.error.requiresAction?.url ? ` (${it.error.requiresAction.url})` : ''}`); return; }
      for (const raw of findTenders(it?.data)) {
        const row = normTender(raw as Record<string, unknown>);
        if (!row) continue;
        const prev = byId.get(row.tender_id_string);
        const hits = new Set([...(prev?.keyword_hits as string[] || []), ...row.keyword_hits, chunk[j].kw]);
        byId.set(row.tender_id_string, { ...(prev || {}), ...row, summary: raw, keyword_hits: [...hits] });
      }
    });
  }
  const rows = [...byId.values()].map(r => {
    // A keyword match alone (no scope word in the title) still counts toward
    // the scope its keyword belongs to.
    const sc = new Set([...(r.scopes as string[]), ...classify((r.keyword_hits as string[]).join(' ')).scopes]);
    return { ...r, scopes: [...sc] };
  });
  const res = await upsertTenders(admin, rows);
  const note = `${rows.length} tenders from ${words.length} keywords${errors.length ? ` · ${errors.length} errors: ${errors.slice(0, 3).join(' | ')}` : ''}`;
  await admin.from('etimad_settings').update({ last_sync_at: new Date().toISOString(), last_sync_note: note }).eq('id', 1);
  await usage(admin, 'firecrawl', 'sync', credits, note, by);
  return { found: rows.length, ...res, credits, errors };
}

async function details(admin: Admin, by: string, id: string) {
  const { data: t } = await admin.from('etimad_tenders').select('*').eq('id', id).maybeSingle();
  if (!t) throw new Error('not_found');
  const tools = await getTools(admin, by);
  const cap = (tools.find(x => /get_tender/i.test(x.capability as string))?.capability as string) || 'public-procurement-tenders/get_tender';
  const r = await alexandria([{ capability: cap, options: { tender_id_string: t.tender_id_string } }]);
  const it = r.items[0];
  if (it?.error) throw new Error(`firecrawl: ${it.error.message || it.error.code}`);
  const d = it?.data as Record<string, unknown>;
  const row = normTender({ ...(d || {}), tender_id_string: t.tender_id_string }) || {};
  const awards = awardsFrom(d);
  const patch: Record<string, unknown> = { details: d, details_at: new Date().toISOString() };
  for (const [k, v] of Object.entries(row)) if (v !== null && v !== undefined && !(Array.isArray(v) && !v.length)) patch[k] = v;
  patch.scopes = [...new Set([...(t.scopes || []), ...((row as { scopes?: string[] }).scopes || [])])];
  if (awards.length) patch.awards = awards;
  delete patch.keyword_hits;
  await admin.from('etimad_tenders').update(patch).eq('id', id);
  await usage(admin, 'firecrawl', 'details', r.credits, t.tender_number || t.name, by);
  return { ...t, ...patch };
}

/* ---------------------------------------------------------------- Claude */

const BI = { type: 'object', properties: { en: { type: 'string' }, ar: { type: 'string' } }, required: ['en', 'ar'] };
const BIS = { type: 'array', items: BI };
const ANALYSIS_TOOL = {
  name: 'record_analysis',
  description: 'Record the bid/no-bid analysis of this Etimad tender for Expand.',
  input_schema: {
    type: 'object',
    properties: {
      fit_score: { type: 'integer', description: '0 to 100: how well the tender fits Expand and how likely we are to win it.' },
      recommendation: { type: 'string', enum: ['apply', 'consider', 'skip'] },
      confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
      agency_en: { type: 'string', description: 'The issuing agency\'s official English name.' },
      agency_domain: { type: 'string', description: 'The agency\'s official website domain, e.g. moc.gov.sa. Empty if unsure.' },
      summary: BI,
      deliverables: BIS,
      requirements: { type: 'array', items: { type: 'object', properties: { en: { type: 'string' }, ar: { type: 'string' },
        status: { type: 'string', enum: ['met', 'partial', 'gap', 'unknown'] } }, required: ['en', 'ar', 'status'] } },
      reasons_for: BIS,
      reasons_against: BIS,
      risks: { type: 'array', items: { type: 'object', properties: { en: { type: 'string' }, ar: { type: 'string' },
        level: { type: 'string', enum: ['low', 'medium', 'high'] } }, required: ['en', 'ar', 'level'] } },
      price: { type: 'object', properties: {
        est_tender_value: { type: ['number', 'null'], description: 'Estimated total contract value in SAR.' },
        low: { type: ['number', 'null'] }, target: { type: ['number', 'null'] }, high: { type: ['number', 'null'] },
        basis: BI }, required: ['low', 'target', 'high', 'basis'] },
      competitors: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' },
        likelihood: { type: 'string', enum: ['high', 'medium', 'low'] }, note: BI }, required: ['name', 'likelihood', 'note'] } },
      timeline: { type: 'object', properties: { feasible: { type: 'boolean' }, note: BI }, required: ['feasible', 'note'] },
      next_steps: BIS,
      questions_for_agency: BIS,
      rfp_read: { type: 'boolean', description: 'True only if RFP documents were attached and read.' },
    },
    required: ['fit_score', 'recommendation', 'confidence', 'agency_en', 'agency_domain', 'summary', 'deliverables', 'requirements',
      'reasons_for', 'reasons_against', 'risks', 'price', 'competitors', 'timeline', 'next_steps', 'questions_for_agency', 'rfp_read'],
  },
};

/* Structured outputs want every object closed (additionalProperties: false)
   and every property listed as required, so the schema above is sealed here
   rather than repeating that on every nested object. */
function sealed(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(sealed);
  if (!schema || typeof schema !== 'object') return schema;
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema as Record<string, unknown>)) o[k] = k === 'properties'
    ? Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([pk, pv]) => [pk, sealed(pv)])) : sealed(v);
  if (o.type === 'object' && o.properties) {
    o.additionalProperties = false;
    o.required = Object.keys(o.properties as Record<string, unknown>);
  }
  return o;
}
const ANALYSIS_SCHEMA = sealed(ANALYSIS_TOOL.input_schema);

const DEFAULT_PROFILE = `Expand is a Saudi company that designs and builds exhibition stands and pavilions, runs events and conferences, delivers interior fit-out (including museums and galleries) and produces marketing and branding work (signage, activations, media). In-house teams: 3D design, 2D technical drawings, content, pricing and production.`;

function b64(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

const slim = (o: unknown, max = 6000) => { const s = JSON.stringify(o ?? null); return s.length > max ? s.slice(0, max) + '…' : s; };

async function analyze(admin: Admin, by: string, id: string) {
  const k = key('ANTHROPIC_API_KEY');
  if (!k) throw new Error('missing_key:ANTHROPIC_API_KEY');
  let { data: t } = await admin.from('etimad_tenders').select('*').eq('id', id).maybeSingle();
  if (!t) throw new Error('not_found');
  if (!t.details && key('FIRECRAWL_API_KEY')) { try { t = await details(admin, by, id); } catch { /* analyse what we have */ } }

  const [{ data: s }, { data: ours }, { data: outs }, { data: similar }, { data: projects }, { data: files }] = await Promise.all([
    admin.from('etimad_settings').select('company_profile').eq('id', 1).maybeSingle(),
    admin.from('tenders').select('id, ref, title, client, category, value_sar, client_budget_sar, status, recommendation, competitors, reject_reason, submission_due, created_at').order('created_at', { ascending: false }).limit(80),
    admin.from('tender_outcomes').select('*'),
    admin.from('etimad_tenders').select('name, agency, scopes, documents_price, est_value_sar, awards, last_offer_at').neq('id', id)
      .overlaps('scopes', t.scopes?.length ? t.scopes : ['stands', 'events', 'fitout', 'marketing']).order('last_offer_at', { ascending: false }).limit(60),
    admin.from('projects').select('name, client, contract_value_sar, status, due_on').not('contract_value_sar', 'is', null).order('created_at', { ascending: false }).limit(80),
    admin.from('etimad_files').select('*').eq('etimad_tender_id', id).order('created_at', { ascending: false }).limit(6),
  ]);
  const outcome = new Map((outs || []).map(o => [o.tender_id, o]));
  const history = (ours || []).map(x => ({ ...x, outcome: outcome.get(x.id) || null }));

  const content: unknown[] = [];
  const read: string[] = [];
  let bytes = 0;
  for (const f of files || []) {
    if (!/pdf|image\/(png|jpe?g|webp|gif)|text\/plain/i.test(f.mime || f.file_name)) continue;
    if ((f.size_bytes || 0) + bytes > 25 * 1024 * 1024) continue;
    const { data: blob } = await admin.storage.from('etimad').download(f.path);
    if (!blob) continue;
    const buf = await blob.arrayBuffer();
    bytes += buf.byteLength;
    const mime = f.mime || (/\.pdf$/i.test(f.file_name) ? 'application/pdf' : 'application/octet-stream');
    if (/pdf/i.test(mime)) content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64(buf) }, title: f.file_name });
    else if (/^image\//.test(mime)) content.push({ type: 'image', source: { type: 'base64', media_type: mime, data: b64(buf) } });
    else content.push({ type: 'document', source: { type: 'text', media_type: 'text/plain', data: new TextDecoder().decode(buf) }, title: f.file_name });
    read.push(f.file_name);
  }

  const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
  content.push({ type: 'text', text: `Today in Riyadh: ${today}.

OUR COMPANY
${s?.company_profile || DEFAULT_PROFILE}

THE TENDER (from Etimad, Saudi Arabia's government procurement portal)
${slim({ name: t.name, agency: t.agency, number: t.tender_number, reference: t.reference_number, type: t.tender_type, status: t.status,
  activity: t.activity, regions: t.regions, last_offer_at: t.last_offer_at, opening_at: t.opening_at, expected_award_on: t.expected_award_on,
  documents_price_sar: t.documents_price, contract_duration: t.contract_duration, awards: t.awards, details: t.details || t.summary }, 14000)}

OUR TENDER HISTORY (our own analysed tenders; competitors[] holds rival prices we recorded, won=true marks the winner; outcome is how our bid ended)
${slim(history, 14000)}

SIMILAR ETIMAD TENDERS WE HAVE SEEN (awards hold published winners and prices where Etimad showed them)
${slim(similar, 8000)}

OUR PROJECTS WITH A CONTRACT VALUE
${slim(projects, 5000)}

${read.length ? `RFP DOCUMENTS ATTACHED ABOVE: ${read.join(', ')}` : 'NO RFP DOCUMENT WAS ATTACHED — say so, and base requirements on the Etimad details only.'}

Analyse this tender for Expand and reply with the analysis as JSON in the required format. Be concrete and honest:
- fit_score and recommendation weigh scope fit, our capacity signals, timeline, agency history, competition and price.
- Price: suggest a bid range in SAR (low / target / high) grounded in the history above (winning prices, our prices, contract values of similar work). Etimad's document fee (documents_price) scales with the agency's estimated value; use it as a signal. If history is thin, say so in basis and widen the range.
- Competitors: name companies that appear in our history or awards for similar work; do not invent names. Leave it empty if there is no evidence.
- Every text field in both English (en) and Arabic (ar).` });

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': k, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      /* Sonnet 5.5 refuses a forced tool_choice, so the analysis comes back
         through structured outputs: the reply text is JSON matching the
         schema. It thinks first by default, hence the larger budget. */
      model: MODEL, max_tokens: 16000,
      system: 'You are a senior bid manager for Saudi government tenders in exhibitions, events, fit-out and marketing. You write precise, evidence-based bid/no-bid analyses.',
      output_config: { format: { type: 'json_schema', schema: ANALYSIS_SCHEMA } },
      messages: [{ role: 'user', content }],
    }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`claude: ${out?.error?.message || res.status}`);
  const text = (out.content || []).filter((c: { type: string }) => c.type === 'text').map((c: { text: string }) => c.text).join('');
  if (out.stop_reason === 'max_tokens') throw new Error('claude: the analysis was cut off (too long) — try again');
  if (out.stop_reason === 'refusal') throw new Error('claude: the model declined to analyse this tender');
  let result: Record<string, any>;
  try { result = JSON.parse(text); } catch { throw new Error('claude: the analysis was not valid JSON — try again'); }
  result.fit_score = Math.max(0, Math.min(100, Math.round(Number(result.fit_score) || 0)));
  const row = {
    etimad_tender_id: id, result, model: out.model || MODEL, files: read,
    input_tokens: out.usage?.input_tokens ?? null, output_tokens: out.usage?.output_tokens ?? null, created_by: by,
  };
  const { data: saved, error } = await admin.from('etimad_analyses').insert(row).select().single();
  if (error) throw new Error(error.message);
  const patch: Record<string, unknown> = {};
  if (!t.agency_en && result.agency_en) patch.agency_en = result.agency_en;
  if (!t.agency_domain && result.agency_domain) patch.agency_domain = String(result.agency_domain).replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase();
  if (result.price?.est_tender_value) patch.est_value_sar = result.price.est_tender_value;
  if (Object.keys(patch).length) await admin.from('etimad_tenders').update(patch).eq('id', id);
  await usage(admin, 'claude', 'analyze', (out.usage?.input_tokens || 0) + (out.usage?.output_tokens || 0), t.tender_number || t.name, by);
  return saved;
}

/* ----------------------------------------------------------------- Lusha */

async function lusha(path: string, body: unknown) {
  const k = key('LUSHA_API_KEY');
  if (!k) throw new Error('missing_key:LUSHA_API_KEY');
  const res = await fetch(`https://api.lusha.com/v3/${path}`, {
    method: 'POST', headers: { api_key: k, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`lusha: ${out?.message || out?.error?.message || out?.error || res.status}`);
  return out;
}

const TITLES = ['procurement', 'purchasing', 'tender', 'contracts', 'events', 'marketing', 'communication', 'exhibition', 'media', 'projects'];

async function contacts(admin: Admin, by: string, id: string, body: Record<string, unknown>) {
  const { data: t } = await admin.from('etimad_tenders').select('*').eq('id', id).maybeSingle();
  if (!t) throw new Error('not_found');
  const domain = String(body.domain || t.agency_domain || '').trim().toLowerCase();
  const name = String(body.name || t.agency_en || '').trim();
  if (!domain && !name) throw new Error('needs_agency');
  if (body.domain || body.name) await admin.from('etimad_tenders').update({ agency_domain: domain || t.agency_domain, agency_en: name || t.agency_en }).eq('id', id);
  const companies = { include: domain ? { domains: [domain] } : { names: [name] } };
  const run = (withTitles: boolean) => lusha('contacts/prospecting', {
    pagination: { page: 0, size: 25 },
    filters: { companies, contacts: { include: withTitles ? { jobTitles: TITLES } : {} } },
    options: { includePartialProfiles: true },
  });
  let out = await run(true);
  let charged = Number(out?.billing?.creditsCharged) || 0;
  if (!(out?.results || []).length) { out = await run(false); charged += Number(out?.billing?.creditsCharged) || 0; }
  const rows = (out?.results || []).filter((r: { id?: string }) => r?.id).map((r: Record<string, any>) => ({
    etimad_tender_id: id, agency: t.agency, lusha_id: String(r.id),
    full_name: [r.firstName, r.lastName].filter(Boolean).join(' ') || r.fullName || null,
    job_title: r.jobTitle?.title || null, company: r.company?.name || null, company_domain: r.company?.domain || null,
    country: r.location?.country || null, linkedin: r.socialLinks?.linkedin || null, can_reveal: r.canReveal || null, created_by: by,
  }));
  if (rows.length) {
    const { error } = await admin.from('etimad_contacts').upsert(rows, { onConflict: 'lusha_id', ignoreDuplicates: false });
    if (error) throw new Error(error.message);
  }
  await usage(admin, 'lusha', 'contacts', charged, `${t.agency || ''} · ${rows.length} found`, by);
  return { found: rows.length, total: out?.pagination?.total ?? rows.length };
}

async function reveal(admin: Admin, by: string, contactId: string) {
  const { data: c } = await admin.from('etimad_contacts').select('*').eq('id', contactId).maybeSingle();
  if (!c) throw new Error('not_found');
  const out = await lusha('contacts/enrich', { ids: [c.lusha_id], reveal: ['emails', 'phones'], waterfallEnabled: false });
  const r = (out?.results || [])[0] || {};
  if (r.error) throw new Error(`lusha: ${r.error.message || r.error.code}`);
  const patch = {
    full_name: r.fullName || c.full_name, job_title: r.jobTitle?.title || c.job_title, company: r.company?.name || c.company,
    linkedin: r.socialLinks?.linkedin || c.linkedin,
    emails: (r.emails || []).map((e: Record<string, unknown>) => ({ email: e.email, type: e.type ?? e.emailType ?? null })).filter((e: { email?: unknown }) => e.email),
    phones: (r.phones || []).map((p: Record<string, unknown>) => ({ number: p.number, type: p.type ?? p.phoneType ?? null, dnc: p.doNotCall ?? false })).filter((p: { number?: unknown }) => p.number),
    revealed_at: new Date().toISOString(),
  };
  await admin.from('etimad_contacts').update(patch).eq('id', contactId);
  await usage(admin, 'lusha', 'reveal', Number(out?.billing?.creditsCharged) || 0, c.full_name, by);
  return { ...c, ...patch };
}

/* -------------------------------------------------------------- balances */

/* What is left on each paid account, straight from the provider. Anthropic
   has no balance endpoint for an ordinary API key, so Claude's spend is
   worked out on the page from the tokens each analysis recorded. */
async function balances() {
  const out: Record<string, unknown> = {};
  const jobs: Promise<void>[] = [];
  const fk = key('FIRECRAWL_API_KEY'), lk = key('LUSHA_API_KEY');
  if (fk) jobs.push((async () => {
    try {
      const r = await fetch('https://api.firecrawl.dev/v2/team/credit-usage', { headers: { Authorization: `Bearer ${fk}` } });
      const b = await r.json().catch(() => ({}));
      out.firecrawl = r.ok && b?.data ? { remaining: b.data.remainingCredits ?? null, plan: b.data.planCredits ?? null, periodEnd: b.data.billingPeriodEnd ?? null }
        : { error: b?.error || `HTTP ${r.status}` };
    } catch (e) { out.firecrawl = { error: String((e as Error).message) }; }
  })());
  if (lk) jobs.push((async () => {
    try {
      const r = await fetch('https://api.lusha.com/v3/account/usage', { headers: { api_key: lk } });
      const b = await r.json().catch(() => ({}));
      out.lusha = r.ok && b?.credits ? { total: b.credits.total ?? null, used: b.credits.used ?? null, remaining: b.credits.remaining ?? null,
        periodEnd: b.plan?.endDate ?? null, plan: b.plan?.category ?? null, pricing: b.pricing ?? null }
        : { error: b?.message || `HTTP ${r.status}` };
    } catch (e) { out.lusha = { error: String((e as Error).message) }; }
  })());
  await Promise.all(jobs);
  return out;
}

/* ---------------------------------------------------------------- server */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const admin = adminClient();
    const me = await whoIsAsking(req, admin);
    if (!me) return json({ error: 'not signed in' }, 401);
    if (!(await isTenderStaff(admin, me))) return json({ error: 'not_allowed' }, 403);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');
    const id = String(body.id || '');
    switch (action) {
      case 'status': {
        const { data } = await admin.from('etimad_settings').select('last_sync_at, last_sync_note, tools').eq('id', 1).maybeSingle();
        return json({
          keys: { firecrawl: !!key('FIRECRAWL_API_KEY'), anthropic: !!key('ANTHROPIC_API_KEY'), lusha: !!key('LUSHA_API_KEY') },
          model: MODEL, last_sync_at: data?.last_sync_at || null, last_sync_note: data?.last_sync_note || null,
          tools: ((data?.tools as { tools?: unknown[] } | null)?.tools || []).length,
        });
      }
      case 'balances': return json(await balances());
      case 'discover': return json({ tools: await discover(admin, me.id) });
      case 'sync': return json(await sync(admin, me.id, body));
      case 'details': return json({ tender: await details(admin, me.id, id) });
      case 'analyze': return json({ analysis: await analyze(admin, me.id, id) });
      case 'contacts': return json(await contacts(admin, me.id, id, body));
      case 'reveal': return json({ contact: await reveal(admin, me.id, id) });
      default: return json({ error: 'unknown action' }, 400);
    }
  } catch (e) {
    const m = String((e as Error)?.message ?? e);
    return json({ error: m }, m === 'not_found' ? 404 : m.startsWith('missing_key') || m === 'needs_agency' ? 400 : 502);
  }
});
