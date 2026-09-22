import { NextRequest, NextResponse } from "next/server";
import { accountAction } from "@/lib/server-session";
const headers = { "Cache-Control": "no-store" };
async function run(action: string, data: Record<string, unknown> = {}) {
  try {
    const result = await accountAction(action, data);
    return NextResponse.json(result, { status: result.status ?? 200, headers });
  } catch { return NextResponse.json({ error: "Správa účtů není nyní dostupná." }, { status: 503, headers }); }
}
export async function GET() { return run("list"); }
export async function POST(req: NextRequest) {
  if (req.headers.get("origin") !== req.nextUrl.origin) return NextResponse.json({ error: "Neplatný původ požadavku." }, { status: 403 });
  try {
    const { action, ...data } = await req.json();
    if (!["revoke", "revoke_all", "password"].includes(action)) return NextResponse.json({ error: "Neplatná akce." }, { status: 400 });
    return run(action, data);
  } catch { return NextResponse.json({ error: "Neplatný požadavek." }, { status: 400 }); }
}
