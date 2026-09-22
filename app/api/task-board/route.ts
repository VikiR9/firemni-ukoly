import { after, NextRequest, NextResponse } from "next/server";
import { dispatchPushSafely } from "@/lib/push-server";
import { gatewaySecret, sessionUser } from "@/lib/server-session";
import { supabase } from "@/lib/supabaseClient";

async function handle(action: string, data: Record<string, unknown>) {
  const user = await sessionUser();
  if (!user)
    return NextResponse.json(
      { error: "Pro úpravu nástěnky se prosím znovu přihlaste." },
      { status: 401 },
    );
  try {
    const { data: result, error } = await supabase.rpc("task_board_gateway", {
      p_secret: gatewaySecret(),
      p_actor: user.username,
      p_action: action,
      p_data: data,
    });
    if (error?.message === "Projekt není dostupný.")
      return NextResponse.json(
        { error: error.message, code: "PROJECT_UNAVAILABLE" },
        { status: 404 },
      );
    if (error)
      return NextResponse.json({ error: error.message }, { status: 400 });
    if (action !== "snapshot") after(dispatchPushSafely);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "Nástěnku se nepodařilo načíst. Zkuste to znovu." },
      { status: 503 },
    );
  }
}
export async function GET(req: NextRequest) {
  return handle("snapshot", {
    project_id: req.nextUrl.searchParams.get("project_id"),
  });
}
export async function POST(req: NextRequest) {
  if (req.headers.get("origin") !== req.nextUrl.origin)
    return NextResponse.json(
      { error: "Neplatný původ požadavku." },
      { status: 403 },
    );
  try {
    const { action, ...data } = await req.json();
    return handle(String(action), data);
  } catch {
    return NextResponse.json({ error: "Neplatný požadavek." }, { status: 400 });
  }
}
