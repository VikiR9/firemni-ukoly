import { after, NextRequest, NextResponse } from "next/server";
import { dispatchPushSafely } from "@/lib/push-server";
import { gatewaySecret, sessionToken } from "@/lib/server-session";
import { supabase } from "@/lib/supabaseClient";
export async function POST(req: NextRequest) {
  if (req.headers.get("origin") !== req.nextUrl.origin) return NextResponse.json({ error: "Neplatný původ požadavku." }, { status: 403 });
  try {
    const { action, id, data } = await req.json();
    const { data: result, error } = await supabase.rpc("account_task_action", {
      p_secret: gatewaySecret(), p_token: await sessionToken(), p_action: action, p_task_id: id, p_data: data ?? {},
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (result.ok) after(dispatchPushSafely);
    return NextResponse.json(result, { status: result.status ?? 200, headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "Změnu úkolu se nepodařilo uložit." }, { status: 503 }); }
}
