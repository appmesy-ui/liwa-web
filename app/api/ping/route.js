export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Validación de variables
  if (!url || !anon) {
    return new Response(JSON.stringify({
      ok: false,
      error: "Missing Supabase env vars",
    }), { status: 500, headers: { "content-type": "application/json" } });
  }

  // Salud del servicio de auth (GoTrue) de Supabase
  let healthOK = false;
  try {
    const res = await fetch(`${url}/auth/v1/health`, { cache: "no-store" });
    healthOK = res.ok;
  } catch (e) {
    healthOK = false;
  }

  return new Response(JSON.stringify({
    ok: true,
    supabase: {
      url,
      auth_health: healthOK
    }
  }), { status: 200, headers: { "content-type": "application/json" } });
}
