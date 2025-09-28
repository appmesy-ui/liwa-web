// middleware.ts
import { NextResponse, type NextRequest } from "next/server";
import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // 🔓 BYPASS: NO tocar nada de API ni estáticos (evita 308/loops)
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/robots") ||
    pathname.startsWith("/sitemap")
  ) {
    return NextResponse.next();
  }

  // Rutas públicas (sin sesión)
  if (pathname === "/" || pathname.startsWith("/login") || pathname.startsWith("/auth")) {
    return NextResponse.next();
  }

  // 🔐 El resto requiere sesión
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });

  // Refresca/inyecta sesión (no falla si no hay)
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", `${pathname}${search || ""}`);
    return NextResponse.redirect(url);
  }

  return res;
}

// ⛔️ Aplica a todo MENOS /api y estáticos
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};
