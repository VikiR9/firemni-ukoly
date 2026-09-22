import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep production verification separate from the running development server.
  distDir: process.env.LIMMIT_BUILD_DIR || ".next",
  async headers() {
    return ["/OneSignalSDKWorker.js", "/pwa-worker.js", "/push-worker.js"].map((source) => ({
      source,
      headers: [
        { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        { key: "Service-Worker-Allowed", value: "/" },
      ],
    }));
  },
};

export default nextConfig;
