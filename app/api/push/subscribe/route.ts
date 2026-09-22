import { NextRequest, NextResponse } from "next/server";
import { sessionToken } from "@/lib/server-session";
import { pushAction, pushConfig } from "@/lib/push-server";
import { validPushEndpoint, validSubscription } from "@/lib/push-validation";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };

export async function GET() {
  try {
    const result = await pushAction("status", {}, await sessionToken());
    if (result.error) return NextResponse.json(result, { status: result.status ?? 400, headers });
    const config = pushConfig();
    return NextResponse.json({
      username: result.username,
      configured: !!config && result.scheduler_enabled === true,
      publicKey: config?.publicKey ?? null,
    }, { headers });
  } catch {
    return NextResponse.json({ error: "Upozornění nejsou nyní dostupná. Zkuste obnovit stav později." }, { status: 503, headers });
  }
}

export async function POST(req: NextRequest) {
  if (req.headers.get("origin") !== req.nextUrl.origin) return NextResponse.json({ error: "Neplatný požadavek." }, { status: 403 });
  try {
    const body = await req.json();
    const token = await sessionToken();
    let result;
    if (body.action === "status" || body.action === "unsubscribe") {
      if (!validPushEndpoint(body.endpoint)) return NextResponse.json({ error: "Neplatné zařízení." }, { status: 400 });
      result = await pushAction(body.action, { endpoint: body.endpoint }, token);
    } else {
      if (!pushConfig()) return NextResponse.json({ error: "Odesílání upozornění ještě není nastavené." }, { status: 503 });
      if (!validSubscription(body.subscription)) return NextResponse.json({ error: "Neplatná registrace zařízení." }, { status: 400 });
      const { endpoint, keys } = body.subscription;
      result = await pushAction("subscribe", { endpoint, ...keys }, token);
    }
    return NextResponse.json(result, { status: result.status ?? 200, headers });
  } catch {
    return NextResponse.json({ error: "Změnu upozornění se nepodařilo uložit." }, { status: 503, headers });
  }
}
