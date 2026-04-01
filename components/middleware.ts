// middleware.ts
import { NextResponse, type NextRequest } from "next/server";
import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";

const PROTECTED_PREFIXES = ["/dashboard", "/settings", "/pending"];
const isProtected = (p: string) =>
  PROTECTED_PREFIXES.some((x) => p === x || p.startsWith(x + "/"));

export async function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;
  if (!isProtected(pathname)) return NextResponse.next();

  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });
  const { data, error } = await supabase.auth.getSession();

  if (error || !data.session) {
    // no loop si ya está en /login
    if (pathname === "/login") return res;
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    if (!searchParams.has("next")) url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return res;
}

export const config = {
  matcher: ["/dashboard/:path*", "/settings/:path*", "/pending/:path*"],
};
