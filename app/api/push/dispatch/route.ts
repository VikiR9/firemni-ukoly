import { NextRequest, NextResponse } from "next/server";
import { dispatchPush, workerAuthorized } from "@/lib/push-server";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(req: NextRequest) {
  if (!workerAuthorized(req.headers.get("authorization"))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { return NextResponse.json(await dispatchPush(), { headers: { "Cache-Control": "no-store" } }); }
  catch {
    console.error("Scheduled push dispatch failed; queued deliveries will be retried.");
    return NextResponse.json({ error: "Dispatch unavailable" }, { status: 503 });
  }
}
