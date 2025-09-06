// app/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = false;

export default function Home() {
  return (
    <main style={{minHeight: "100vh", display: "grid", placeItems: "center", background: "#f6f7fb"}}>
      <div style={{border: "1px solid #ddd", padding: 24, borderRadius: 12, background: "white"}}>
        <h1 style={{margin: 0, fontSize: 24}}>Home test</h1>
        <p style={{marginTop: 8, color: "#555"}}>Si ves esto, el render básico funciona.</p>
      </div>
    </main>
  );
}
