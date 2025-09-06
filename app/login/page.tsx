// app/login/page.tsx
"use client";
export const dynamic = "force-dynamic";
export const revalidate = false;

export default function LoginTest() {
  return (
    <main style={{minHeight: "100vh", display: "grid", placeItems: "center", background: "#fff"}}>
      <div style={{border: "1px solid #ddd", padding: 24, borderRadius: 12, background: "white"}}>
        <h1 style={{margin: 0, fontSize: 24}}>Login test (sin Auth)</h1>
        <p style={{marginTop: 8, color: "#555"}}>/login está renderizando.</p>
      </div>
    </main>
  );
}
