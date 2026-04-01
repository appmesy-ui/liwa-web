"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RecoveryHashRedirect() {
  const router = useRouter();

  useEffect(() => {
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    const pathname = typeof window !== "undefined" ? window.location.pathname : "";
    if (hash.includes("type=recovery") && !pathname.startsWith("/auth/callback")) {
      router.replace(`/auth/callback${hash}`);
    }
  }, [router]);

  return null;
}
