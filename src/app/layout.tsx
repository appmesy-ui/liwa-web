export const metadata = { title: "LIWA", description: "Manufacturing OEE" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <header style={{borderBottom:"1px solid #222", padding:"10px 16px"}}>
          <a href="/" style={{fontWeight:600}}>LIWA</a>
          <a href="/dashboard" style={{marginLeft:16}}>Dashboard</a>
        </header>
        <main style={{maxWidth:960, margin:"0 auto", padding:"24px 16px"}}>{children}</main>
      </body>
    </html>
  );
}

