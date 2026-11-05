/* ==========================================================================
   etimad-awards — the data behind Etimad Insights → Competitors.

     awards   read the public award results of closed tenders we track:
              every bidder, their financial offer, whether their technical
              offer passed, who was awarded and at what value. A batch at a
              time; each tender is read once (awards_at).
     history  search Etimad for past, awarded tenders with our search words,
              so there are more rounds to learn from.

   Etimad is read directly when it answers; otherwise through Firecrawl (the
   same FIRECRAWL_API_KEY secret as the etimad function). Tender staff only.
   ========================================================================== */

import { CORS, json, adminClient, whoIsAsking } from '../_shared/http.ts';
import { parseAwards, awardsUrl, looksLikePanel } from '../etimad/awards.js';
import { normTender, findTenders, searchCall, classify } from '../etimad/map.js';

const FIRECRAWL = 'https://api.firecrawl.dev/v2/scrape';
const PROVIDER = 'tenders-etimad-sa';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const key = (n: string) => (Deno.env.get(n) || '').trim();
type Admin = ReturnType<typeof adminClient>;
type Row = Record<string, any>;

const usage = (admin: Admin, action: string, units: number, note: string, by: string) =>
  admin.from('etimad_usage').insert({ service: 'firecrawl', action, units, note, created_by: by });

/* ------------------------------------------------------------- awards */

/* Etimad turns the function's servers away today; one refusal per batch is
   enough to stop asking and go through Firecrawl for the rest. */
let tryDirect = true;
async function awardsHtml(idStr: string) {
  const url = awardsUrl(idStr);
  if (tryDirect) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, 'X-Requested-With': 'XMLHttpRequest', 'Accept-Language': 'ar,en;q=0.8' },
        signal: AbortSignal.timeout(8000) });
      const h = await r.text();
      if (r.ok && looksLikePanel(h)) return { html: h, via: 'direct', credits: 0 };
      tryDirect = false;
    } catch { tryDirect = false; }
  }
  const k = key('FIRECRAWL_API_KEY');
  if (!k) throw new Error('missing_key:FIRECRAWL_API_KEY');
  const res = await fetch(FIRECRAWL, {
    method: 'POST', headers: { Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, formats: ['rawHtml'], onlyMainContent: false, timeout: 45000, headers: { 'X-Requested-With': 'XMLHttpRequest' } }),
    signal: AbortSignal.timeout(60000),
  });
  const b = await res.json().catch(() => ({}));
  if (!res.ok || !b?.success) throw new Error(`firecrawl: ${typeof b?.error === 'string' ? b.error : `HTTP ${res.status}`}`);
  const h = String(b.data?.rawHtml || b.data?.html || '');
  if (!looksLikePanel(h)) throw new Error('etimad: no award panel in the page');
  return { html: h, via: 'firecrawl', credits: Number(b.data?.metadata?.creditsUsed) || 1 };
}

/* Which tenders to read: closed at least three weeks ago (Etimad rarely
   awards sooner), never read, or read while the award was still pending and
   due another look (three weeks later, for up to a year after closing). */
const DAY = 86400e3;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString().slice(0, 10);
const pending = (q: any) => q.eq('dismissed', false).lt('last_offer_at', ago(21))
  .or(`awards_at.is.null,and(awards.is.null,awards_at.lt.${ago(21)},last_offer_at.gt.${ago(400)})`);
const todo = (admin: Admin) => pending(admin.from('etimad_tenders').select('id', { count: 'exact', head: true }));

async function awards(admin: Admin, by: string, body: Row) {
  const limit = Math.max(1, Math.min(30, Number(body.limit) || 12));
  let q = admin.from('etimad_tenders').select('id, tender_id_string, name, tender_number');
  if (Array.isArray(body.ids) && body.ids.length) q = q.in('id', body.ids.map(String).slice(0, limit));
  else q = pending(q).order('last_offer_at', { ascending: false }).limit(limit);
  const { data: list, error } = await q;
  if (error) throw new Error(error.message);
  tryDirect = true;
  const out = { done: 0, withResults: 0, bidders: 0, direct: 0, firecrawl: 0, credits: 0, errors: [] as string[] };
  const one = async (t: Row) => {
    try {
      const r = await awardsHtml(t.tender_id_string);
      const p = parseAwards(r.html);
      out.credits += r.credits;
      if (r.via === 'direct') out.direct++; else out.firecrawl++;
      const patch: Row = { awards_at: new Date().toISOString(), awards_note: p.kind ? `award:${p.kind}` : p.note };
      if (p.rows.length) { patch.awards = p.rows; out.withResults++; out.bidders += p.rows.length; }
      const { error: e } = await admin.from('etimad_tenders').update(patch).eq('id', t.id);
      if (e) throw new Error(e.message);
      out.done++;
    } catch (e) { out.errors.push(`${t.tender_number || t.name}: ${(e as Error).message}`.slice(0, 200)); }
  };
  const rows = (list || []) as Row[];
  for (let i = 0; i < rows.length; i += 4) await Promise.all(rows.slice(i, i + 4).map(one));
  const { count } = await todo(admin);
  if (out.done || out.errors.length) await usage(admin, 'awards', out.credits,
    `${out.done} tenders · ${out.withResults} with results · ${out.direct} direct${out.errors.length ? ` · ${out.errors.length} errors` : ''}`, by);
  return { ...out, remaining: count ?? null };
}

/* ------------------------------------------------------------- history */

async function alexandria(calls: Row[]) {
  const k = key('FIRECRAWL_API_KEY');
  if (!k) throw new Error('missing_key:FIRECRAWL_API_KEY');
  const res = await fetch(FIRECRAWL, {
    method: 'POST', headers: { Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ alexandria: calls.map(c => ({ provider: PROVIDER, capability: c.capability, options: c.options || {} })), timeout: 110000 }),
  });
  const b = await res.json().catch(() => ({}));
  if (!res.ok || !b?.success) throw new Error(`firecrawl: ${typeof b?.error === 'string' ? b.error : JSON.stringify(b?.error || res.status)}`);
  return { items: (b.data?.alexandria || []) as Row[], credits: Number(b.data?.creditsCost) || 0 };
}

async function history(admin: Admin, by: string, body: Row) {
  const { data: s } = await admin.from('etimad_settings').select('keywords, tools').eq('id', 1).maybeSingle();
  const words: string[] = Array.isArray(body.keywords) && body.keywords.length ? body.keywords : (s?.keywords || []);
  const pages = Math.max(1, Math.min(6, Number(body.pages) || 2));
  const category = Number(body.category ?? 6);       // 6 awarded, 8 finished
  const tools = (s?.tools as Row | null)?.tools || [];
  const calls: Row[] = [];
  for (const kw of words) for (let p = 1; p <= pages; p++) calls.push({ ...searchCall(tools, kw, p, category), kw });
  const byId = new Map<string, Row>();
  const errors: string[] = [];
  let credits = 0;
  for (let i = 0; i < calls.length; i += 10) {
    const chunk = calls.slice(i, i + 10);
    let r;
    try { r = await alexandria(chunk); } catch (e) { errors.push(String((e as Error).message)); continue; }
    credits += r.credits;
    r.items.forEach((it, j) => {
      if (it?.error) { errors.push(`${chunk[j].kw}: ${it.error.message || it.error.code}`); return; }
      for (const raw of findTenders(it?.data)) {
        const row = normTender(raw as Row);
        if (!row) continue;
        const prev = byId.get(row.tender_id_string);
        const hits = new Set([...(prev?.keyword_hits || []), ...row.keyword_hits, chunk[j].kw]);
        byId.set(row.tender_id_string, { ...(prev || {}), ...row, summary: raw, keyword_hits: [...hits] });
      }
    });
  }
  const rows = [...byId.values()].map(r => ({ ...r, scopes: [...new Set([...r.scopes, ...classify(r.keyword_hits.join(' ')).scopes])] }));
  const ids = rows.map(r => r.tender_id_string);
  const known = new Set<string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await admin.from('etimad_tenders').select('tender_id_string').in('tender_id_string', ids.slice(i, i + 200));
    for (const x of data || []) known.add(x.tender_id_string);
  }
  const clean = rows.map(r => Object.fromEntries(Object.entries(r).filter(([, v]) => v !== null && v !== undefined && !(Array.isArray(v) && !v.length))));
  const fresh = clean.filter(r => !known.has(r.tender_id_string as string));
  for (let i = 0; i < fresh.length; i += 200) {
    const { error } = await admin.from('etimad_tenders').insert(fresh.slice(i, i + 200), { defaultToNull: false });
    if (error) throw new Error(error.message);
  }
  const note = `History: ${rows.length} past tenders from ${words.length} words · ${fresh.length} new${errors.length ? ` · ${errors.length} errors` : ''}`;
  await usage(admin, 'history', credits, note, by);
  return { found: rows.length, added: fresh.length, credits, errors: errors.slice(0, 5) };
}

/* ------------------------------------------------------------- server */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const admin = adminClient();
    const me = await whoIsAsking(req, admin);
    if (!me) return json({ error: 'not signed in' }, 401);
    if (!(me.role === 'admin' || me.department_id === 'tenders')) return json({ error: 'not_allowed' }, 403);
    const body = await req.json().catch(() => ({}));
    switch (String(body.action || '')) {
      case 'awards': return json(await awards(admin, me.id, body));
      case 'history': return json(await history(admin, me.id, body));
      case 'todo': { const { count } = await todo(admin); return json({ remaining: count ?? 0 }); }
      default: return json({ error: 'unknown action' }, 400);
    }
  } catch (e) {
    const m = String((e as Error)?.message ?? e);
    return json({ error: m }, m.startsWith('missing_key') ? 400 : 502);
  }
});
