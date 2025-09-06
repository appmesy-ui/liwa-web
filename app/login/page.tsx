// app/login/page.tsx
"use client";
export const dynamic = "force-dynamic";
export const revalidate = false;

export default function LoginPage() {
  return (
    <main style={{minHeight: "100vh", display: "grid", placeItems: "center"}}>
      <div style={{border: "1px solid #ddd", padding: 24, borderRadius: 12, background: "white"}}>
        <h1 style={{margin: 0, fontSize: 24}}>Login test</h1>
        <p style={{marginTop: 8, color: "#555"}}>Si ves esto, el render funciona.</p>
      </div>
    </main>
  );
}
