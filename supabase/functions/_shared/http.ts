/* ==========================================================================
   http.ts — the four lines every function in this project would otherwise
   repeat: CORS, a JSON reply, a service_role client, and "who is asking".

   `whoIsAsking` verifies the caller's own token rather than reading a user id
   out of the request body. The body is written by the browser, so anything in
   it is a claim, not a fact — trusting a `role` from there is exactly how a
   stranger promotes themselves to admin.
   ========================================================================== */

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...CORS, 'content-type': 'application/json' },
  });

export const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Every value of the app_role enum. Leaving one out does not error, it
    silently downgrades the person — 'lead' was once being filed as 'member'. */
export const ROLES = ['member', 'lead', 'manager', 'admin'];

export const APP = Deno.env.get('APP_URL') ?? 'https://expand.meshnet.co';

export const adminClient = (): SupabaseClient => createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);

export type Profile = {
  id: string; role: string; email: string | null;
  full_name: string | null; department_id: string | null;
};

/** The signed-in caller's profile, or null. Never throws. */
export async function whoIsAsking(req: Request, admin: SupabaseClient): Promise<Profile | null> {
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader) return null;
  const caller = createClient(
    Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );
  const { data: { user }, error } = await caller.auth.getUser();
  if (error || !user) return null;
  const { data } = await admin.from('profiles')
    .select('id, role, email, full_name, department_id')
    .eq('user_id', user.id).maybeSingle();
  return (data as Profile) ?? null;
}

/** A department's English name, for the one line of an email that says where
    somebody has landed. Falls back to the id, which is at least true. */
export async function deptName(admin: SupabaseClient, id: string | null): Promise<string> {
  if (!id) return '';
  const { data } = await admin.from('departments').select('name_en').eq('id', id).maybeSingle();
  return data?.name_en || id;
}

/** Supabase's admin API mints the link; we deliver it ourselves. `type` is
    'invite' for somebody who has no account yet and 'recovery' for somebody
    who does — using the wrong one either fails or creates a duplicate user. */
export async function actionLink(
  admin: SupabaseClient, type: 'invite' | 'recovery', email: string, redirectTo: string,
  data?: Record<string, unknown>,
): Promise<{ link?: string; error?: string }> {
  const { data: gen, error } = await admin.auth.admin.generateLink({
    type, email, options: { redirectTo, data },
  } as never);
  if (error) return { error: error.message };
  const link = (gen as { properties?: { action_link?: string } })?.properties?.action_link;
  return link ? { link } : { error: 'Supabase returned no link' };
}
