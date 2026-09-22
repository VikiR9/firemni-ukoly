import { NextRequest, NextResponse } from "next/server";
import { gatewaySecret, sessionToken } from "@/lib/server-session";
import { supabase } from "@/lib/supabaseClient";
import { validUuid } from "@/lib/push-validation";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };
const validTime = (value: unknown): value is string => typeof value === "string" && value.length <= 40 && /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value));

async function history(action: string, data: Record<string, unknown>) {
  const { data: result, error } = await supabase.rpc("task_notification_history", {
    p_secret: gatewaySecret(), p_token: await sessionToken(), p_action: action, p_data: data,
  });
  if (error) throw new Error("History unavailable");
  return NextResponse.json(result, { status: result.status ?? 200, headers });
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const before_at = params.get("before_at"), before_id = params.get("before_id");
  if ((before_at || before_id) && (!validTime(before_at) || !validUuid(before_id))) {
    return NextResponse.json({ error: "Neplatná stránka historie." }, { status: 400, headers });
  }
  try {
    return await history(params.get("count") === "1" ? "count" : "list", before_at ? { before_at, before_id } : {});
  } catch {
    return NextResponse.json({ error: "Historii upozornění nelze načíst. Zkuste to znovu." }, { status: 503, headers });
  }
}

export async function POST(req: NextRequest) {
  if (req.headers.get("origin") !== req.nextUrl.origin) return NextResponse.json({ error: "Neplatný požadavek." }, { status: 403, headers });
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Neplatný požadavek." }, { status: 400, headers }); }
  if (!body || (body.action !== "read" && body.action !== "read_all") ||
      (body.action === "read" && !validUuid(body.id)) || (body.action === "read_all" && !validTime(body.through))) {
    return NextResponse.json({ error: "Neplatný požadavek." }, { status: 400, headers });
  }
  try {
    return await history(body.action, body.action === "read" ? { id: body.id } : { through: body.through });
  } catch {
    return NextResponse.json({ error: "Označení upozornění se nepodařilo uložit." }, { status: 503, headers });
  }
}
