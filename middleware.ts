// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname, hash } = req.nextUrl;

  // No interceptar la pantalla de recuperación ni cualquier URL con el hash de recovery
  if (pathname.startsWith("/auth/callback") || (hash && hash.includes("type=recovery"))) {
    return NextResponse.next();
  }

  // 👉 Aquí iría tu lógica de redirects si la tienes (p.ej., proteger rutas privadas)
  // if (hasSession && pathname === "/login") return NextResponse.redirect(new URL("/dashboard", req.url));
  // if (!hasSession && pathname.startsWith("/dashboard")) return NextResponse.redirect(new URL("/login", req.url));

  return NextResponse.next();
}

export const config = {
  // Aplica a todo excepto assets estáticos
  matcher: ["/((?!_next|.*\\..*).*)"],
};
