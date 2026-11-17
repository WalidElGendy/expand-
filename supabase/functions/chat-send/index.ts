/* ==========================================================================
   chat-send — one quick message (or a "seen" / "typing" signal) from one
   colleague to another. Nothing is stored.

   The caller's sign-in says who is writing: the sender's id, name and title
   are taken from their profile here, never from the request, so a message
   cannot claim to be from someone else. It is then broadcast to the
   recipient's private channel "inbox:<id>", which only the recipient can
   listen to (policy in migrations/quick_chat.sql). If they do not have the
   app open, it reaches nobody — the app says so before sending.

   Body: { to: uuid, kind: 'msg' | 'seen' | 'typing', text?, id?, ref?, ids? }
   ========================================================================== */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import { CORS, json, adminClient } from '../_shared/http.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clip = (v: unknown, n: number) => String(v ?? '').slice(0, n);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader) return json({ error: 'not signed in' }, 401);
  const caller = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
  const { data: meId } = await caller.rpc('my_profile_id');
  if (!meId) return json({ error: 'not signed in' }, 401);

  const body = await req.json().catch(() => ({}));
  const to = String(body.to || '');
  const kind = ['msg', 'seen', 'typing'].includes(body.kind) ? body.kind : null;
  if (!UUID.test(to) || !kind) return json({ error: 'bad request' }, 400);
  if (to === meId) return json({ error: 'cannot message yourself' }, 400);
  const text = clip(body.text, 1000).trim();
  if (kind === 'msg' && !text && !body.ref) return json({ error: 'empty message' }, 400);

  const admin = adminClient();
  const [{ data: me }, { data: them }, { data: hr }] = await Promise.all([
    admin.from('profiles').select('id, full_name, email, department_id, role, is_active, avatar_path').eq('id', meId).maybeSingle(),
    admin.from('profiles').select('id, is_active').eq('id', to).maybeSingle(),
    admin.from('hr_employees').select('position').eq('profile_id', meId).maybeSingle(),
  ]);
  if (!me?.is_active) return json({ error: 'not allowed' }, 403);
  if (!them?.is_active) return json({ error: 'that person is not active' }, 404);

  // A link to a screen of the app only: "#/p/<id>", never anything else.
  const ref = body.ref && /^#\/[\w\-\/]{0,200}$/.test(String(body.ref.route || ''))
    ? { route: String(body.ref.route), label: clip(body.ref.label, 160) } : null;

  const payload = {
    kind,
    id: UUID.test(String(body.id || '')) ? String(body.id) : crypto.randomUUID(),
    from: me.id,
    name: me.full_name || me.email,
    dept: me.department_id,
    role: me.role,
    title: (hr?.position || '').trim() || null,
    avatar: me.avatar_path || null,
    text: kind === 'msg' ? text : '',
    ref: kind === 'msg' ? ref : null,
    ids: kind === 'seen' && Array.isArray(body.ids) ? body.ids.filter((x: unknown) => UUID.test(String(x))).slice(0, 50) : [],
    at: new Date().toISOString(),
  };

  const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/realtime/v1/api/broadcast`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!}`,
    },
    body: JSON.stringify({ messages: [{ topic: `inbox:${to}`, event: 'chat', payload, private: true }] }),
  });
  if (!res.ok) return json({ error: `could not deliver (${res.status})` }, 502);
  await res.body?.cancel();
  return json({ ok: true, id: payload.id, at: payload.at });
});
