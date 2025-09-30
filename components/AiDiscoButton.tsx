"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export default function AiDiscoButton() {
  const pathname = usePathname();
  const supabase = createClientComponentClient();

  // null = aún chequeando, true/false = estado real
  const [logged, setLogged] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;

    // 1) estado inicial
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setLogged(Boolean(data?.session));
    })();

    // 2) suscripción a cambios (login / logout / token refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setLogged(Boolean(session));
    });

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, [supabase]);

  // 🔒 ocultar en /ai, aún cargando, o sin sesión
  if (pathname?.startsWith("/ai")) return null;
  if (logged !== true) return null;

  return (
    <>
      <div
        className={`
          fixed z-50 inset-x-0 pointer-events-none
          [--liwa-ai-offset:16px] md:[--liwa-ai-offset:80px]
        `}
        style={{
          bottom:
            "calc(env(safe-area-inset-bottom, 0px) + var(--liwa-ai-offset))",
        }}
      >
        <div className="mx-4 md:mx-6 flex justify-start md:justify-end">
          <Link
            href="/ai"
            title="Abrir LIWA AI"
            aria-label="Abrir LIWA AI"
            className={`
              pointer-events-auto relative
              rounded-full bg-black
              h-14 w-14 sm:h-16 sm:w-16 md:h-20 md:w-20
              flex items-center justify-center
              transition-transform hover:scale-110 active:scale-95
              shadow-[0_0_18px_rgba(34,211,238,0.25)]
              focus:outline-none focus:ring-4 focus:ring-cyan-400/30
            `}
          >
            <span
              aria-hidden="true"
              className="
                absolute inset-0 rounded-full p-[2px]
                bg-[conic-gradient(from_0deg,#22d3ee,#a78bfa,#60a5fa,#22d3ee)]
                animate-[spin_9s_linear_infinite]
              "
            >
              <span className="block h-full w-full rounded-full bg-black" />
            </span>

            <span
              className="
                relative z-10
                text-lg sm:text-xl md:text-2xl
                font-extrabold tracking-wide
                bg-clip-text text-transparent
                animate-[liwaDisco_4s_linear_infinite]
              "
              style={{
                backgroundImage:
                  "conic-gradient(from 0deg, #d1d5db, #22d3ee, #60a5fa, #a78bfa, #f472b6, #f59e0b, #10b981, #d1d5db)",
              }}
            >
              AI
            </span>
          </Link>
        </div>
      </div>

      <style jsx global>{`
        @keyframes liwaDisco {
          0% {
            filter: hue-rotate(0deg);
          }
          100% {
            filter: hue-rotate(360deg);
          }
        }
      `}</style>
    </>
  );
}

