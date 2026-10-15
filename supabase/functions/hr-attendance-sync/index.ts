/* ==========================================================================
   hr-attendance-sync — pulls punches from the fingerprint system (Malachite)
   into hr_attendance.

   Who may start it:
     · HR or an admin, from the app ("Sync now"), with their own sign-in, or
     · the scheduler (pg_cron), with the token kept in the vault.
   Anybody else gets 401. The function is deployed without the gateway JWT
   check precisely so the scheduler can call it; the check is done here.

   The Malachite API key never reaches the browser or this repository: HR
   pastes it into HR → Settings, a database function puts it in the vault,
   and only this function (service role) can read it back.

   What a run does:
     1. lists every employee in Malachite (20 per page),
     2. pairs them with people here — device number on the profile, else
        work email, else an unambiguous name — and saves new pairings,
     3. fetches each paired employee's attendance for the date range,
     4. upserts one row per person per day; rows HR corrected by hand
        (source = 'manual') are never overwritten,
     5. writes a summary to hr_sync_runs for the Settings screen.
   ========================================================================== */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import { CORS, json, adminClient } from '../_shared/http.ts';
import { recordToRow, mergeRow, matchEmployees, syncRange } from './map.js';

type Auth = { name: string; headers: (k: string) => Record<string, string> };
const AUTHS: Auth[] = [
  { name: 'bearer', headers: (k) => ({ Authorization: `Bearer ${k}` }) },
  { name: 'raw', headers: (k) => ({ Authorization: k }) },
  { name: 'x-api-key', headers: (k) => ({ 'X-API-Key': k }) },
  { name: 'apikey', headers: (k) => ({ ApiKey: k }) },
];

function todayIn(tz: string): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return p.slice(0, 10);
}

async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const x = items[i++]; await fn(x); }
  }));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const admin = adminClient();
  const body = await req.json().catch(() => ({}));

  /* ---- who is asking */
  let trigger = 'manual', byId: string | null = null;
  const token = req.headers.get('x-sync-token');
  if (token) {
    const { data: okTok } = await admin.rpc('hr_sync_token_ok', { p_token: token });
    if (!okTok) return json({ error: 'not allowed' }, 401);
    trigger = 'schedule';
  } else {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader) return json({ error: 'not signed in' }, 401);
    const caller = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
    const { data: hr } = await caller.rpc('is_hr');
    if (!hr) return json({ error: 'only HR can sync attendance' }, 403);
    const { data: me } = await caller.rpc('my_profile_id');
    byId = (me as string) || null;
  }

  /* ---- settings and key */
  const { data: s } = await admin.from('hr_settings').select('*').eq('id', 1).maybeSingle();
  const tz = s?.timezone || 'Asia/Riyadh';
  const base = String(s?.fp_url || 'https://expandexpo.malhr.com').replace(/\/+$/, '');
  const { data: key } = await admin.rpc('hr_fp_key');
  if (!key) return json({ error: 'no fingerprint API key saved — add it in HR → Settings' }, 400);

  const range = syncRange({
    from: body.from, to: body.to, today: todayIn(tz), attendanceStart: s?.attendance_start,
    defaultDays: trigger === 'schedule' ? 3 : 7,
  });

  const { data: run } = await admin.from('hr_sync_runs')
    .insert({ trigger, by_id: byId, date_from: range.from, date_to: range.to }).select('id').single();
  const finish = async (ok: boolean, summary: Record<string, unknown>, error: string | null = null) => {
    await admin.from('hr_sync_runs').update({ finished_at: new Date().toISOString(), ok, summary, error }).eq('id', run?.id);
    await admin.from('hr_settings').update({ fp_last_sync: new Date().toISOString(), fp_last_ok: ok }).eq('id', 1);
  };

  /* ---- talking to Malachite: find which auth header it accepts, once */
  let auth: Auth | null = null;
  async function mal(path: string, init: RequestInit = {}): Promise<Response> {
    const tries = auth ? [auth] : AUTHS;
    let last: Response | null = null;
    for (const a of tries) {
      const res = await fetch(base + path, {
        ...init,
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...a.headers(key as string), ...(init.headers || {}) },
      });
      if (res.status !== 401 && res.status !== 403) { auth = a; return res; }
      last = res; await res.body?.cancel();
    }
    return last!;
  }

  try {
    /* 1. every employee in the fingerprint system */
    const remote: any[] = [];
    for (let page = 1, pages = 1; page <= pages && page <= 200; page++) {
      const res = await mal(`/v1/employee/list?pageNumber=${page}`);
      if (res.status === 401 || res.status === 403) throw new Error('the fingerprint system refused the API key');
      if (!res.ok) throw new Error(`employee list failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
      const j = await res.json();
      const recs = Array.isArray(j) ? j : (j.records || []);
      remote.push(...recs);
      pages = Array.isArray(j) ? 1 : (j.pageCount || Math.ceil((j.totalRecordsCount || recs.length) / 20) || 1);
      if (!recs.length) break;
    }

    /* 2. pair with people here */
    const [{ data: profiles }, { data: emps }] = await Promise.all([
      admin.from('profiles').select('id, email, full_name, is_active'),
      admin.from('hr_employees').select('profile_id, device_no'),
    ]);
    const dev = new Map((emps || []).map((e: any) => [e.profile_id, e.device_no]));
    const local = (profiles || []).filter((p: any) => p.is_active)
      .map((p: any) => ({ id: p.id, email: p.email, full_name: p.full_name, device_no: dev.get(p.id) || null }));
    const m = matchEmployees(remote, local);
    for (const l of m.links) {
      await admin.from('hr_employees').upsert({ profile_id: l.profile_id, device_no: l.device_no }, { onConflict: 'profile_id' });
    }

    /* 3–4. attendance per paired employee */
    const ids = [...new Set(m.byNo.values())];
    const { data: existingRows } = await admin.from('hr_attendance')
      .select('employee_id, day, source, clock_in, clock_out, in_remote')
      .gte('day', range.from).lte('day', range.to).in('employee_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
    const existing = new Map((existingRows || []).map((r: any) => [`${r.employee_id}|${r.day}`, r]));

    const rows: any[] = [], errors: string[] = [];
    let skippedManual = 0, records = 0;
    await pool([...m.byNo.entries()], 6, async ([no, pid]) => {
      try {
        const res = await mal(`/v1/employee/${encodeURIComponent(no)}/attendance`, {
          method: 'POST', body: JSON.stringify({ from: range.from, to: range.to }),
        });
        if (res.status === 204 || res.status === 404) { await res.body?.cancel(); return; }
        if (!res.ok) { errors.push(`${no}: HTTP ${res.status}`); await res.body?.cancel(); return; }
        const list = await res.json();
        for (const rec of (Array.isArray(list) ? list : [list])) {
          records++;
          const row = recordToRow(rec, pid, tz);
          if (!row || row.day < range.from || row.day > range.to) continue;
          const merged = mergeRow(existing.get(`${pid}|${row.day}`), row);
          if (!merged) { skippedManual++; continue; }
          rows.push(merged);
        }
      } catch (e) { errors.push(`${no}: ${(e as Error).message}`); }
    });

    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await admin.from('hr_attendance').upsert(rows.slice(i, i + 500), { onConflict: 'employee_id,day' });
      if (error) throw new Error(`saving attendance: ${error.message}`);
    }

    const summary = {
      from: range.from, to: range.to, auth: (auth as Auth | null)?.name ?? null,
      remote_employees: remote.length, matched: m.byNo.size, new_links: m.links,
      unmatched_remote: m.unmatchedRemote.slice(0, 200), unmatched_local: m.unmatchedLocal.slice(0, 200),
      records, saved: rows.length, skipped_manual: skippedManual, errors: errors.slice(0, 20), error_count: errors.length,
    };
    const ok = errors.length < Math.max(1, m.byNo.size);
    await finish(ok, summary, errors.length ? `${errors.length} employee(s) failed` : null);
    return json({ ok, ...summary });
  } catch (e) {
    const msg = (e as Error).message;
    await finish(false, { from: range.from, to: range.to }, msg);
    return json({ error: msg }, 502);
  }
});
