import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET() {
  try {
    const admin = supabaseAdmin(); // valida env vars en servidor
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const r = await fetch(`${url}/auth/v1/health`, { cache: 'no-store' });
    return Response.json({ ok: true, auth_health: r.ok });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
