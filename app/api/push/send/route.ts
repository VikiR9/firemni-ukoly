import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import webpush from "web-push";

// Configure web-push with VAPID keys from environment variables
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@example.com",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, title, body: messageBody } = body;

    if (!username || !title) {
      return NextResponse.json({ error: "Missing username or title" }, { status: 400 });
    }

    // Fetch all push subscriptions for this user
    const { data: subscriptions, error } = await supabase
      .from("push_subscriptions")
      .select("*")
      .eq("username", username);

    if (error) {
      console.error("Failed to fetch subscriptions:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    if (!subscriptions || subscriptions.length === 0) {
      return NextResponse.json({ message: "No subscriptions found for user" }, { status: 200 });
    }

    const payload = JSON.stringify({
      title,
      body: messageBody || title,
      url: "/",
    });

    // Send push to all user's subscriptions with explicit options for Apple compatibility
    const results = await Promise.allSettled(
      subscriptions.map((sub) => {
        // Apple Push requires specific TTL settings and proper content encoding
        const options: any = {
          TTL: 2419200, // 28 days (Apple's maximum)
          contentEncoding: 'aes128gcm', // Explicitly set encoding for Apple
        };
        
        // For Apple endpoints, topic MUST be a valid web origin (not just app name)
        if (sub.endpoint.includes('web.push.apple.com')) {
          options.topic = 'https://firemni-ukoly.vercel.app';
        }

        return webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          payload,
          options
        );
      })
    );

    // Remove failed subscriptions (e.g., expired or invalid)
    const failedIndexes: number[] = [];
    const errors: any[] = [];
    results.forEach((result, idx) => {
      if (result.status === "rejected") {
        const reason = result.reason;
        console.error(`Push failed for subscription ${subscriptions[idx].id}:`, {
          message: reason?.message,
          statusCode: reason?.statusCode,
          body: reason?.body,
          headers: reason?.headers,
          endpoint: subscriptions[idx].endpoint,
        });
        failedIndexes.push(idx);
        errors.push({
          subscriptionId: subscriptions[idx].id,
          endpoint: subscriptions[idx].endpoint,
          error: reason?.message || String(reason),
          statusCode: reason?.statusCode,
          body: reason?.body,
        });
      }
    });

    // Optionally delete failed subscriptions from DB
    if (failedIndexes.length > 0) {
      const failedIds = failedIndexes.map((i) => subscriptions[i].id);
      await supabase.from("push_subscriptions").delete().in("id", failedIds);
    }

    return NextResponse.json({
      success: true,
      sent: results.filter((r) => r.status === "fulfilled").length,
      failed: failedIndexes.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (e) {
    console.error("Send push endpoint error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
