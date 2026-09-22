import { NextResponse } from "next/server";
import { gatewaySecret, sessionUser } from "@/lib/server-session";
import { supabase } from "@/lib/supabaseClient";

export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };
  const user = await sessionUser();
  if (!user) return NextResponse.json({ error: "Přihlaste se pro zobrazení dostupnosti." }, { status: 401, headers });
  try {
    const { data, error } = await supabase.rpc("attendance_gateway", {
      p_secret: gatewaySecret(), p_actor: user.username,
      p_action: "availability", p_data: {},
    });
    if (error) throw error;
    return NextResponse.json(data, { headers });
  } catch {
    return NextResponse.json({ error: "Dostupnost týmu se nepodařilo načíst." }, { status: 503, headers });
  }
}
