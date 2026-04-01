// app/api/me/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

// Importante: este handler debe correr en Node.js (no Edge)
export const runtime = "nodejs";

export async function GET(_req: NextRequest) {
  try {
    const cookieStore = cookies();
    // OJO: este helper solo acepta { cookies }, nada de "options"
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

    const {
      data: { session },
      error: sessionErr,
    } = await supabase.auth.getSession();

    if (sessionErr) {
      return NextResponse.json(
        { ok: false, error: sessionErr.message },
        { status: 500 }
      );
    }

    if (!session) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Si luego quieres leer en el esquema 'liwa':
    // const { data: profile } = await supabase
    //   .schema("liwa")
    //   .from("profiles")
    //   .select("*")
    //   .eq("id", session.user.id)
    //   .single();

    return NextResponse.json({
      ok: true,
      user: session.user,
      // profile, // ← descomenta si usas la consulta de arriba
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unexpected error" },
      { status: 500 }
    );
  }
}
