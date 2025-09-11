// middleware.ts
import { NextResponse, type NextRequest } from "next/server";
import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });

  // Mantén la sesión en cookies (no falla si no hay sesión)
  await supabase.auth.getSession();

  const { pathname } = req.nextUrl;

  // 🔓 Rutas públicas (no requieren sesión)
  const isPublic =
    pathname === "/" ||
    pathname.startsWith("/signin") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/_next") ||        // assets Next
    pathname.startsWith("/api/diag");       // <-- habilitamos /api/diag

  if (isPublic) return res;

  // Para el resto: exigir sesión
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = "/signin";
    url.searchParams.set("redirectedFrom", pathname);
    return NextResponse.redirect(url);
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
