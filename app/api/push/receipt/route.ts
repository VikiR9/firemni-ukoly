import { NextRequest, NextResponse } from "next/server";
import { pushAction } from "@/lib/push-server";
import { validUuid } from "@/lib/push-validation";

export async function POST(req: NextRequest) {
  if (req.headers.get("origin") !== req.nextUrl.origin) return new NextResponse(null, { status: 403 });
  try {
    const { id, token } = await req.json();
    if (!validUuid(id) || !validUuid(token)) return new NextResponse(null, { status: 400 });
    // A per-message token confirms display even after the login cookie expires.
    // It grants no access to task content or any other notification.
    await pushAction("receipt", { id, receipt_token: token });
    return new NextResponse(null, { status: 204 });
  } catch { return new NextResponse(null, { status: 503 }); }
}
