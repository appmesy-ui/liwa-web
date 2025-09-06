// app/signin/page.tsx (trozos clave)

return (
  <main className="min-h-screen grid place-items-center bg-[#0d1117] p-4 text-slate-200">
    {/* Card fija y compacta */}
    <div className="w-full max-w-[380px] mx-auto overflow-hidden">
      {/* logo */}
      <div className="mb-6 flex justify-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#161b22] ring-1 ring-[#30363d]">
          <Image src="/liwa.svg" alt="LIWA" width={28} height={28} priority />
        </div>
      </div>

      <h1 className="mb-3 text-center text-xl font-semibold text-slate-100">
        Sign in to LIWA
      </h1>

      {/* tarjeta */}
      <div className="rounded-md border border-[#30363d] bg-[#161b22] shadow-lg">
        <div className="p-6">
          <Auth
            supabaseClient={supabase}
            providers={[]}
            redirectTo={`${origin}/auth/callback`}
            appearance={{
              theme: ThemeSupa,
              variables: {
                default: {
                  colors: {
                    brand: "#238636",
                    brandAccent: "#2ea043",
                    inputText: "#e6edf3",
                    inputBackground: "#0d1117",
                    inputBorder: "#30363d",
                    anchorTextColor: "#58a6ff",
                  },
                  radii: { inputBorderRadius: "6px", borderRadiusButton: "6px" },
                  space: { buttonPadding: "0.625rem 1rem", inputPadding: "0.625rem 0.75rem" },
                },
              },
              className: {
                // clave: no permitir que el contenedor del Auth se haga más ancho que la card
                container: "w-full space-y-4",
                label: "text-slate-200 text-sm font-medium",
                input:
                  "h-10 bg-[#0d1117] border-[#30363d] text-slate-100 placeholder-slate-400 " +
                  "focus:ring-2 focus:ring-[#1f6feb] focus:border-[#1f6feb]",
                button:
                  "h-10 w-full bg-[#238636] hover:bg-[#2ea043] text-white font-medium " +
                  "shadow-sm focus:ring-2 focus:ring-offset-0 focus:ring-[#2ea043]",
                anchor: "text-[#58a6ff] hover:underline underline-offset-2",
                message: "text-sm",
              },
            }}
          />
        </div>
      </div>

      <div className="mt-4 rounded-md border border-[#30363d] bg-[#0d1117] px-6 py-4 text-sm text-slate-300 text-center">
        New to LIWA?{" "}
        <a href="/signup" className="text-[#58a6ff] hover:underline underline-offset-2">
          Create an account
        </a>
      </div>

      <p className="mt-6 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} TecnoFab · All rights reserved.
      </p>
    </div>
  </main>
);
