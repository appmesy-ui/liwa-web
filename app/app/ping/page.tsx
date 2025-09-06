// app/ping/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = false;

export default function Ping() {
  return (
    <main style={{minHeight: "100vh", display: "grid", placeItems: "center", background: "#eef6ff"}}>
      <div style={{border: "1px solid #9ec1ff", padding: 24, borderRadius: 12, background: "white"}}>
        <h1 style={{margin: 0, fontSize: 24}}>Ping OK</h1>
        <p style={{marginTop: 8, color: "#333"}}>/ping está renderizando.</p>
      </div>
    </main>
  );
}
