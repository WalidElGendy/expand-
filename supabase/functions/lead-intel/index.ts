/* ==========================================================================
   lead-intel — Leads → "Recommended by tender insights".

   Turns what the tender team knows (Etimad tenders in our scopes, the AI
   analyses, our own bids and the archived analyses) into a ranked list of
   organisations sales should approach, explains each one, and pulls the right
   people from Lusha into Leads.

     status   keys configured, Lusha credits left
     refresh  re-rank every organisation (no paid calls); returns the ids
              that still need an explanation
     enrich   Claude: English name, website domain, why now and what to
              pitch, for up to 12 organisations
     pull     Lusha: search the organisation for marketing/communications,
              events/exhibitions and procurement people, reveal the best
              `max` (credits) and add them to Leads

   Keys (ANTHROPIC_API_KEY, LUSHA_API_KEY) are the same function secrets the
   etimad function uses. Callers: anyone who works leads (admins, managers,
   Business Development) and the Tenders team.
   ========================================================================== */

import { CORS, json, adminClient, whoIsAsking } from '../_shared/http.ts';
import { rankOrgs, pickContacts, ALL_TITLES } from './rank.js';

const MODEL = Deno.env.get('ANTHROPIC_MODEL') || 'claude-sonnet-5-5';
const key = (n: string) => (Deno.env.get(n) || '').trim();
type Admin = ReturnType<typeof adminClient>;
type Row = Record<string, any>;

const mayUse = (me: { role: string; department_id: string | null }) =>
  ['admin', 'manager'].includes(me.role) || ['bd', 'tenders'].includes(me.department_id || '');

async function usage(admin: Admin, service: string, action: string, units: number | null, note: string | null, by: string) {
  await admin.from('etimad_usage').insert({ service, action, units, note, created_by: by });
}
const today = () => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);   // Riyadh

/* ---------------------------------------------------------------- refresh */

async function refresh(admin: Admin) {
  const [et, an, ours, outs, arch, leads, had] = await Promise.all([
    admin.from('etimad_tenders').select('id, name, agency, agency_en, agency_domain, scopes, published_on, first_seen_at, last_offer_at, shortlisted, dismissed, est_value_sar').limit(5000),
    admin.from('etimad_analyses').select('etimad_tender_id, result').limit(5000),
    admin.from('tenders').select('id, client, title, status, value_sar, created_at, submission_due').limit(5000),
    admin.from('tender_outcomes').select('tender_id, bid_status').limit(5000),
    admin.from('tasks').select('name, notes, due_on').eq('section_name', 'أرشيف تحليل المنافسات').limit(5000),
    admin.from('leads').select('company').limit(20000),
    admin.from('lead_intel').select('id, org_key, name_en, domain, insight_en').limit(5000),
  ]);
  for (const r of [et, an, ours, outs, arch, leads, had]) if (r.error) throw new Error(r.error.message);
  const archive = (arch.data || []).map((t: Row) => ({ name: t.name, day: t.due_on,
    client: String(t.notes || '').split('\n')[0].replace(/^العميل\s*:\s*/, '') }));
  const ranked = rankOrgs({ etimad: et.data, analyses: an.data, ours: ours.data, outcomes: outs.data, archive, leads: leads.data, today: today() });
  const prev = new Map((had.data || []).map((r: Row) => [r.org_key, r]));
  const rows = ranked.map((o: Row) => {
    const p = prev.get(o.key) as Row | undefined;
    return {
      org_key: o.key, agency: o.agency, rank: o.rank, score: o.score, signals: o.signals, top_tenders: o.top_tenders,
      name_en: p?.name_en || o.name_en || null, domain: p?.domain || o.domain || null, refreshed_at: new Date().toISOString(),
    };
  });
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await admin.from('lead_intel').upsert(rows.slice(i, i + 200), { onConflict: 'org_key' });
    if (error) throw new Error(error.message);
  }
  const keys = new Set(rows.map((r: Row) => r.org_key));
  const gone = (had.data || []).filter((r: Row) => !keys.has(r.org_key)).map((r: Row) => r.id);
  if (gone.length) await admin.from('lead_intel').update({ rank: null }).in('id', gone);
  const { data: need } = await admin.from('lead_intel').select('id').is('insight_en', null).not('rank', 'is', null)
    .order('rank').limit(60);
  return { ranked: rows.length, need_enrich: (need || []).map((r: Row) => r.id) };
}

/* ----------------------------------------------------------------- enrich */

const ENRICH_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['orgs'],
  properties: { orgs: { type: 'array', items: {
    type: 'object', additionalProperties: false,
    required: ['id', 'name_en', 'domain', 'sector', 'insight_en', 'insight_ar', 'angle_en', 'angle_ar'],
    properties: {
      id: { type: 'string' },
      name_en: { type: 'string', description: 'Official English name of the organisation' },
      domain: { type: 'string', description: 'Official website domain such as moh.gov.sa, or empty if not sure' },
      sector: { type: 'string', enum: ['government', 'semi_government', 'military_security', 'education', 'health', 'municipality', 'private', 'nonprofit'] },
      insight_en: { type: 'string' }, insight_ar: { type: 'string' },
      angle_en: { type: 'string' }, angle_ar: { type: 'string' },
    } } } },
};

async function enrich(admin: Admin, by: string, ids: string[]) {
  const k = key('ANTHROPIC_API_KEY');
  if (!k) throw new Error('missing_key:ANTHROPIC_API_KEY');
  if (!ids.length) return { enriched: 0 };
  const { data: orgs, error } = await admin.from('lead_intel').select('*').in('id', ids.slice(0, 12));
  if (error) throw new Error(error.message);
  const brief = (orgs || []).map((o: Row) => ({
    id: o.id, agency: o.agency, known_name_en: o.name_en, known_domain: o.domain,
    signals: { tenders_in_our_scopes: o.signals?.scoped, last_12_months: o.signals?.recent12, open_now: o.signals?.open,
      next_deadline: o.signals?.nextDeadline, shortlisted_by_us: o.signals?.shortlisted, avg_ai_fit_score: o.signals?.fitAvg,
      our_bids: o.signals?.ourBids, won: o.signals?.ourWon, lost: o.signals?.ourLost, archived_analyses: o.signals?.archived,
      scopes: o.signals?.scopes, est_value_sar: o.signals?.est || null },
    tenders: (o.top_tenders || []).map((t: Row) => ({ name: t.name, deadline: t.deadline, open: t.open, ours: !!t.ours })),
  }));
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': k, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL, max_tokens: 12000,
      system: 'You are the head of business development at Expand, a Saudi company that designs and builds exhibition stands and pavilions, runs events and conferences, delivers interior fit-out (including museums and galleries) and produces marketing and branding work. You turn tender intelligence into precise, honest sales guidance.',
      output_config: { format: { type: 'json_schema', schema: ENRICH_SCHEMA } },
      messages: [{ role: 'user', content: `For each Saudi organisation below, using only the evidence given:
- name_en: its official English name (keep known_name_en if given).
- domain: its official website domain (e.g. moh.gov.sa). Keep known_domain if given. Leave empty if you are not confident — a wrong domain wastes paid searches.
- insight: two short sentences on why sales should approach it now, citing the numbers (tenders in our scopes, open now and the next deadline, our bids/wins, fit score). No invented facts.
- angle: one sentence on what Expand should pitch them, from the scopes and tender names.
Write insight and angle in English (_en) and Arabic (_ar). Return one entry per organisation with the same id.

${JSON.stringify(brief)}` }],
    }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`claude: ${out?.error?.message || res.status}`);
  const text = (out.content || []).filter((c: Row) => c.type === 'text').map((c: Row) => c.text).join('');
  let parsed: Row;
  try { parsed = JSON.parse(text); } catch { throw new Error('claude: the reply was not valid JSON — try again'); }
  let n = 0;
  for (const g of parsed.orgs || []) {
    const o = (orgs || []).find((x: Row) => x.id === g.id);
    if (!o) continue;
    const domain = String(g.domain || '').replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '').toLowerCase();
    await admin.from('lead_intel').update({
      name_en: o.name_en || g.name_en || null, domain: o.domain || (domain.includes('.') ? domain : null), sector: g.sector || null,
      insight_en: g.insight_en, insight_ar: g.insight_ar, angle_en: g.angle_en, angle_ar: g.angle_ar,
    }).eq('id', o.id);
    n++;
  }
  await usage(admin, 'claude', 'lead-insights', (out.usage?.input_tokens || 0) + (out.usage?.output_tokens || 0), `${n} organisations`, by);
  return { enriched: n };
}

/* ------------------------------------------------------------------ Lusha */

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

async function balance() {
  const k = key('LUSHA_API_KEY');
  if (!k) return null;
  try {
    const r = await fetch('https://api.lusha.com/v3/account/usage', { headers: { api_key: k } });
    const b = await r.json().catch(() => ({}));
    return r.ok && b?.credits ? { total: b.credits.total ?? null, used: b.credits.used ?? null, remaining: b.credits.remaining ?? null } : null;
  } catch { return null; }
}

const list = (x: unknown) => (Array.isArray(x) ? x : []) as Row[];

async function pull(admin: Admin, by: string, id: string, max: number) {
  const { data: o } = await admin.from('lead_intel').select('*').eq('id', id).maybeSingle();
  if (!o) throw new Error('not_found');
  const companies = o.domain ? { include: { domains: [o.domain] } }
    : o.name_en ? { include: { names: [o.name_en] } } : null;
  if (!companies) throw new Error('needs_agency');
  const search = async (titles: boolean) => lusha('contacts/prospecting', {
    pagination: { page: 0, size: 40 },
    filters: { companies, contacts: { include: titles ? { jobTitles: ALL_TITLES } : {} } },
    options: { includePartialProfiles: true },
  });
  let res = await search(true);
  let charged = Number(res?.billing?.creditsCharged) || 0;
  let found = list(res?.results);
  // A domain with nobody under it: try the English name once.
  if (!found.length && o.domain && o.name_en) {
    res = await lusha('contacts/prospecting', { pagination: { page: 0, size: 40 },
      filters: { companies: { include: { names: [o.name_en] } }, contacts: { include: { jobTitles: ALL_TITLES } } },
      options: { includePartialProfiles: true } });
    charged += Number(res?.billing?.creditsCharged) || 0;
    found = list(res?.results);
  }
  const picks = pickContacts(found, max);
  const added: Row[] = [];
  const skipped: string[] = [];
  for (const c of picks) {
    const lid = String(c.id);
    const { data: dup } = await admin.from('leads').select('id').eq('lusha_id', lid).maybeSingle();
    if (dup) { skipped.push('already a lead'); continue; }
    // Reveal only what Lusha says it has; the data waterfall may fill the
    // rest from its partner sources (and may answer later, as a job).
    const reveal = c._reveal?.length ? c._reveal : ['emails', 'phones'];
    let rv = await lusha('contacts/enrich', { ids: [lid], reveal, waterfallEnabled: true });
    charged += Number(rv?.billing?.creditsCharged) || 0;
    let r: Row = list(rv?.results)[0] || {};
    if (rv?.job?.id) {
      const jobId = rv.job.id;
      await new Promise(ok => setTimeout(ok, Math.min(8, Number(rv.job.retryAfter) || 3) * 1000));
      for (let i = 0; i < 6; i++) {
        const jr = await fetch(`https://api.lusha.com/v3/contacts/jobs/${jobId}`, { headers: { api_key: key('LUSHA_API_KEY') } });
        const jb = await jr.json().catch(() => ({}));
        const status = jb?.status || jb?.job?.status;
        const got = list(jb?.results || jb?.contacts)[0];
        if (got) r = { ...r, ...got, emails: [...list(r.emails), ...list(got.emails)], phones: [...list(r.phones), ...list(got.phones)] };
        if (status !== 'processing') break;
        await new Promise(ok => setTimeout(ok, 3000));
      }
    }
    if (r.error) { skipped.push(String(r.error.message || r.error.code)); continue; }
    const emails = list(r.emails).map(e => e.email).filter(Boolean);
    const phones = list(r.phones).filter(p => !(p.doNotCall ?? false)).map(p => p.number).filter(Boolean);
    const name = r.fullName || [r.firstName, r.lastName].filter(Boolean).join(' ') || [c.firstName, c.lastName].filter(Boolean).join(' ') || c.fullName;
    if (!name) { skipped.push('no name'); continue; }
    if (emails[0]) {
      const { data: same } = await admin.from('leads').select('id').ilike('email', emails[0]).maybeSingle();
      if (same) { skipped.push('email already a lead'); continue; }
    }
    const s = o.signals || {};
    const tenders = list(o.top_tenders).slice(0, 3).map(t => `• ${t.name}${t.deadline ? ` (${t.deadline})` : ''}`).join('\n');
    const notes = [
      o.insight_ar, o.angle_ar ? `زاوية العرض: ${o.angle_ar}` : null,
      o.insight_en, o.angle_en ? `Pitch: ${o.angle_en}` : null,
      `Tender signals — in our scopes: ${s.scoped ?? 0}, open now: ${s.open ?? 0}${s.nextDeadline ? ` (next deadline ${s.nextDeadline})` : ''}, our bids: ${s.ourBids ?? 0}, won: ${s.ourWon ?? 0}.`,
      tenders ? `Recent tenders:\n${tenders}` : null,
      `Role: ${c._role}. Source: Lusha, ${today()}.`,
    ].filter(Boolean).join('\n\n');
    if (!emails.length && !phones.length && !(r.socialLinks?.linkedin || c.socialLinks?.linkedin)) { skipped.push('no contact details'); continue; }
    const lead = {
      name, company: o.agency, title: r.jobTitle?.title || c.jobTitle?.title || null,
      email: emails[0] || null, phone: phones[0] || null, website: o.domain || r.company?.domain || null,
      linkedin: r.socialLinks?.linkedin || c.socialLinks?.linkedin || null,
      status: 'new', source: 'Lusha — tender insights', notes, intel_id: o.id, lusha_id: lid, created_by: by, owner_id: null,
    };
    const { data: ins, error } = await admin.from('leads').insert(lead).select('id, name, title, email, phone').single();
    if (error) { skipped.push(error.message); continue; }
    added.push(ins);
  }
  const note = !found.length ? 'no_people' : !picks.length ? 'no_roles' : !added.length ? (skipped[0] || 'none_added') : null;
  await admin.from('lead_intel').update({
    lusha_checked_at: new Date().toISOString(), contacts_found: found.length,
    leads_added: (Number(o.leads_added) || 0) + added.length, lusha_note: note,
  }).eq('id', id);
  await usage(admin, 'lusha', 'lead-pull', charged, `${o.agency} · ${added.length} added of ${found.length} found`, by);
  return { found: found.length, picked: picks.length, added, skipped, note, credits: charged };
}

/* ---------------------------------------------------------------- server */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const admin = adminClient();
    const me = await whoIsAsking(req, admin);
    if (!me) return json({ error: 'not signed in' }, 401);
    if (!mayUse(me)) return json({ error: 'not_allowed' }, 403);
    const body = await req.json().catch(() => ({}));
    switch (String(body.action || '')) {
      case 'status': return json({ keys: { anthropic: !!key('ANTHROPIC_API_KEY'), lusha: !!key('LUSHA_API_KEY') }, lusha: await balance() });
      case 'refresh': return json(await refresh(admin));
      case 'enrich': return json(await enrich(admin, me.id, Array.isArray(body.ids) ? body.ids.map(String) : []));
      case 'pull': return json(await pull(admin, me.id, String(body.id || ''), Math.max(1, Math.min(5, Number(body.max) || 2))));
      default: return json({ error: 'unknown action' }, 400);
    }
  } catch (e) {
    const m = String((e as Error)?.message ?? e);
    return json({ error: m }, m === 'not_found' ? 404 : m.startsWith('missing_key') || m === 'needs_agency' ? 400 : 502);
  }
});

