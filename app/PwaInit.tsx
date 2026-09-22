"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { preparePushWorker } from "@/lib/push-client";
export default function PwaInit() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname.startsWith("/nabidka/") || !("serviceWorker" in navigator))
      return;
    void preparePushWorker()
      .catch((error) => console.warn("PWA registration failed", error));
  }, [pathname]);
  return null;
}
