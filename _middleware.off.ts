import { NextResponse, type NextRequest } from "next/server";
import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";

// Rutas protegidas
const PROTECTED_PREFIXES = ["/dashboard", "/settings", "/pending"];

function isProtected(pathname: string) {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export async function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;

  // Rutas públicas pasan directo
  if (!isProtected(pathname)) return NextResponse.next();

  // Necesitamos poder setear cookies/headers en la respuesta
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });

  // 1) Debe existir sesión
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user ?? null;

  if (!user) {
    // Marca cookie opcional (para UI si quisieras)
    res.cookies.set("liwa-auth", "0", { path: "/" });

    // Redirige a /signin, preservando ruta destino
    const url = req.nextUrl.clone();
    url.pathname = "/signin";
    if (!searchParams.has("next")) url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // 2) Debe existir membresía ACTIVA en liwa.org_members
  const { data: membership, error: memberError } = await supabase
    .schema("liwa")
    .from("org_members")
    .select("org_id, status")
    .eq("user_id", user.id)
    .single();

  const noMembership = memberError || !membership;
  const disabled = membership?.status !== "active";

  if (noMembership || disabled) {
    // Cierra sesión para evitar loops extraños
    await supabase.auth.signOut();

    const url = req.nextUrl.clone();
    url.pathname = "/signin";
    url.searchParams.set("reason", noMembership ? "no-org" : "disabled");
    if (!searchParams.has("next")) url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // 3) OK: autenticado + con org activa
  res.cookies.set("liwa-auth", "1", { path: "/" });
  return res;
}

export const config = {
  matcher: ["/dashboard/:path*", "/settings/:path*", "/pending/:path*"],
};
