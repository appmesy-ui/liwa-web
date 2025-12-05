import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export async function GET() {
  try {
    const file = path.join(process.cwd(), ".data", "machines.json");
    const raw = await fs.readFile(file, "utf8");
    const obj = JSON.parse(raw);           // { "M1": {...}, "M2": {...}, ... }
    const codes = Object.keys(obj).sort(); // ["M1","M2","M5","M7",...]
    return NextResponse.json({ machines: codes });
  } catch (err) {
    // Devolvemos 200 con lista vacía para que la UI muestre el mensaje amable
    return NextResponse.json({ machines: [], error: String(err) }, { status: 200 });
  }
}
