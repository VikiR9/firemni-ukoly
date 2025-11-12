import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import webpush from "web-push";
// @ts-ignore
import { p256 } from '@noble/curves/p256';

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

    // Helper: Generate VAPID JWT with URL-safe base64 (for Apple Push)
    const generateVapidJWT = (endpoint: string): string => {
      const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY!;
      const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';
      
      const url = new URL(endpoint);
      const audience = `${url.protocol}//${url.host}`;
      const exp = Math.floor(Date.now() / 1000) + 43200; // 12 hours
      
      // URL-safe base64 encode (no padding)
      const base64url = (data: string) =>
        Buffer.from(data).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
      
      const header = base64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
      const claims = base64url(JSON.stringify({ aud: audience, exp, sub: vapidSubject }));
      const unsignedToken = `${header}.${claims}`;
      
      // Sign with ES256 using @noble/curves (URL-safe throughout)
      const privateKeyBytes = Buffer.from(vapidPrivateKey.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
      const signature = p256.sign(Buffer.from(unsignedToken), privateKeyBytes).toCompactRawBytes();
      const signatureB64 = Buffer.from(signature).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
      
      return `${unsignedToken}.${signatureB64}`;
    };

    // Send push - custom implementation for Apple to preserve URL-safe base64
    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        const isApple = sub.endpoint.includes('web.push.apple.com');
        
        if (!isApple) {
          // Non-Apple: use web-push library
          return webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
            { TTL: 2419200 }
          );
        }
        
        // Apple: Manual HTTP/2 request with URL-safe base64 preserved
        const jwtToken = generateVapidJWT(sub.endpoint);
        const vapidPublicKey = process.env.VAPID_PUBLIC_KEY!;
        
        const response = await fetch(sub.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Encoding': 'aes128gcm',
            'Authorization': `vapid t=${jwtToken}, k=${vapidPublicKey}`,
            'Urgency': 'high',
            'Topic': 'https://firemni-ukoly.vercel.app',
            'TTL': '2419200',
          },
          body: payload,
        });
        
        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`Apple Push HTTP ${response.status}: ${errorBody}`);
        }
        
        return { success: true };
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

    // Do NOT delete failed subscriptions automatically during debugging
    // (Keep them so we can retry after fixes)
    // if (failedIndexes.length > 0) {
    //   const failedIds = failedIndexes.map((i) => subscriptions[i].id);
    //   await supabase.from("push_subscriptions").delete().in("id", failedIds);
    // }

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
