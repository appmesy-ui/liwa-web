// middleware.ts
import { NextResponse, type NextRequest } from "next/server";
import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";

// Rutas que queremos proteger (añade aquí las privadas)
const PROTECTED_PREFIXES = ["/dashboard", "/settings", "/pending"];

function isProtected(pathname: string) {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export async function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;

  // Si no es una ruta protegida, dejar pasar sin tocar nada
  if (!isProtected(pathname)) {
    return NextResponse.next();
  }

  // Crear cliente ligado a la request/response
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });

  const { data, error } = await supabase.auth.getSession();

  // Si NO hay sesión, redirigir a /login (sin loop)
  if (error || !data.session) {
    // Si ya está en /login por alguna razón, no redirijas
    if (pathname === "/login") return res;

    const url = req.nextUrl.clone();
    url.pathname = "/login";

    // Solo setear "next" si aún no existe (evita crecer la query y bucles)
    if (!searchParams.has("next")) {
      url.searchParams.set("next", pathname);
    }
    return NextResponse.redirect(url);
  }

  // Si HAY sesión, dejar pasar
  return res;
}

// Aplica SOLO a rutas que nos interesan
export const config = {
  matcher: ["/dashboard/:path*", "/settings/:path*", "/pending/:path*"],
};
