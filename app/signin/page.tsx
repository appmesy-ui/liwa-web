return (
  <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-6">
    <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900/90 shadow-2xl backdrop-blur-md p-10 flex flex-col items-center text-center gap-6">
      
      {/* Bloque logo + texto */}
      <div className="flex flex-col items-center">
        <Image
          src="/liwa-logo.svg"
          alt="LIWA"
          width={200}
          height={60}
          priority
          className="mx-auto"
        />
        <p className="mt-2 text-slate-400 text-xs md:text-sm">
          Inicia sesión para continuar.
        </p>
      </div>

      {/* Formulario Supabase Auth centrado */}
      <div className="w-full max-w-sm mx-auto">
        <Auth
          supabaseClient={supabase}
          providers={[]}
          view="sign_in"
          redirectTo={
            typeof window !== "undefined"
              ? `${window.location.origin}/auth/callback`
              : "https://liwa-web.vercel.app/auth/callback"
          }
          appearance={{
            theme: ThemeSupa,
            variables: {
              default: {
                colors: {
                  brand: "#0EA5E9",
                  brandAccent: "#1E40AF",
                  inputBackground: "#0B1220",
                  inputText: "#E5E7EB",
                  messageText: "#93C5FD",
                  anchorTextColor: "#93C5FD",
                  defaultButtonBackground: "#0EA5E9",
                  defaultButtonBackgroundHover: "#1D4ED8",
                  defaultButtonText: "#FFFFFF",
                },
                radii: {
                  borderRadiusButton: "12px",
                  inputBorderRadius: "10px",
                },
              },
            },
            style: {
              button: { background: "#0EA5E9", color: "#FFFFFF", borderRadius: "12px" },
              input: {
                background: "#0B1220",
                border: "1px solid #334155",
                color: "#E5E7EB",
                borderRadius: "10px",
              },
              anchor: { color: "#93C5FD" },
              message: { color: "#93C5FD" },
            },
          }}
          localization={{
            variables: {
              sign_in: {
                email_label: "Email",
                password_label: "Contraseña",
                button_label: "Entrar",
              },
              forgotten_password: { link_text: "¿Olvidaste tu contraseña?" },
            },
          }}
        />
      </div>
    </div>
  </main>
);
