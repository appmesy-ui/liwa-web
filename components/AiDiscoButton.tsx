"use client";

import Link from "next/link"; // 👈 se había perdido este import
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

type Props = {
  className?: string;
};

export default function AiDiscoButton({ className = "" }: Props) {
  const pathname = usePathname();
  const supabase = createClientComponentClient();
  const [logged, setLogged] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setLogged(Boolean(data?.session));
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!mounted) return;
      setLogged(Boolean(s));
    });
    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe();
    };
  }, [supabase]);

  // Ocultar si no corresponde
  if (pathname?.startsWith("/ai")) return null;
  if (pathname?.startsWith("/signin")) return null;
  if (logged !== true) return null;

  return (
    <>
      <div className={`relative group ${className}`}>
        <Link
          href="/ai"
          title="Abrir LIWA AI"
          aria-label="Abrir LIWA AI"
          className="
            relative inline-flex h-10 w-10 items-center justify-center rounded-full
            transition-transform hover:scale-[1.05] active:scale-[0.97]
            focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40
          "
        >
          {/* Borde animado como neón */}
          <span
            aria-hidden="true"
            className="
              absolute inset-0 rounded-full p-[2px]
              bg-[conic-gradient(from_0deg,#22d3ee,#a78bfa,#60a5fa,#f472b6,#22d3ee)]
              animate-borderGlow
            "
          >
            <span className="block h-full w-full rounded-full bg-slate-950" />
          </span>

          {/* Texto IA */}
          <span
            className="
              relative z-10 font-extrabold text-[12px] tracking-wide
              bg-clip-text text-transparent animate-textGlow
            "
            style={{
              backgroundImage:
                "conic-gradient(from 0deg, #e5e7eb, #22d3ee, #60a5fa, #a78bfa, #f472b6, #f59e0b, #10b981, #e5e7eb)",
            }}
          >
            IA
          </span>
        </Link>
      </div>

      <style jsx global>{`
        @keyframes borderGlow {
          0% {
            filter: brightness(1) blur(0px);
          }
          50% {
            filter: brightness(1.4) blur(2px);
          }
          100% {
            filter: brightness(1) blur(0px);
          }
        }
        @keyframes textGlow {
          0% {
            filter: hue-rotate(0deg);
          }
          100% {
            filter: hue-rotate(360deg);
          }
        }
        .animate-borderGlow {
          animation: borderGlow 3s ease-in-out infinite;
        }
        .animate-textGlow {
          animation: textGlow 6s linear infinite;
        }
      `}</style>
    </>
  );
}
