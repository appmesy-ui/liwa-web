// middleware.ts
import { NextResponse } from "next/server";

// No hacemos nada: dejamos pasar todas las rutas.
export function middleware() {
  return NextResponse.next();
}

// Deshabilitado: sin matcher no se aplica a ninguna ruta.
export const config = {
  matcher: [],
};
