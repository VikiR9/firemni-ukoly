import { NextRequest, NextResponse } from "next/server";
import { sessionToken } from "@/lib/server-session";
import { pushAction } from "@/lib/push-server";
import { validUuid } from "@/lib/push-validation";

// Only a delayed test for the authenticated user's own device. Real messages
// originate from committed database events, never arbitrary browser recipients.
export async function POST(req: NextRequest) {
  if (req.headers.get("origin") !== req.nextUrl.origin) return NextResponse.json({ error: "Neplatný požadavek." }, { status: 403 });
  try {
    const { subscriptionId } = await req.json();
    if (!validUuid(subscriptionId)) return NextResponse.json({ error: "Neplatné zařízení." }, { status: 400 });
    const result = await pushAction("test", { subscription_id: subscriptionId }, await sessionToken());
    return NextResponse.json(result, { status: result.status ?? 200, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Zkušební upozornění se nepodařilo naplánovat." }, { status: 503 });
  }
}
