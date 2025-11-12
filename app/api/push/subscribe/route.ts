import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, subscription } = body;

    if (!username || !subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Upsert subscription (endpoint is unique, so update if exists)
    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        username,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
      { onConflict: "endpoint" }
    );

    if (error) {
      console.error("Failed to save push subscription:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Subscribe endpoint error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
