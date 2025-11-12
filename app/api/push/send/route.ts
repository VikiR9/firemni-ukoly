import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, title, body: messageBody } = body;

    if (!username || !title) {
      return NextResponse.json({ error: "Missing username or title" }, { status: 400 });
    }

    const appId = process.env.ONESIGNAL_APP_ID;
    const restApiKey = process.env.ONESIGNAL_REST_API_KEY;

    if (!appId || !restApiKey) {
      console.error("OneSignal credentials missing");
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    // Send notification via OneSignal REST API
    // Target user by external_user_id (username)
    const response = await fetch(`https://onesignal.com/api/v1/notifications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${restApiKey}`,
      },
      body: JSON.stringify({
        app_id: appId,
        include_external_user_ids: [username],
        headings: { en: title },
        contents: { en: messageBody || title },
        url: 'https://firemni-ukoly.vercel.app/',
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('OneSignal API error:', result);
      return NextResponse.json({ 
        success: false, 
        error: result.errors || 'Failed to send notification' 
      }, { status: response.status });
    }

    return NextResponse.json({
      success: true,
      sent: result.recipients || 0,
      oneSignalId: result.id,
    });
  } catch (e: any) {
    console.error("Send push endpoint error:", e);
    return NextResponse.json({ 
      error: "Internal server error",
      details: e?.message 
    }, { status: 500 });
  }
}
