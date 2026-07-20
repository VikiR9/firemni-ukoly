"use client";
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

type OneSignalClient = {
  init: (options: {
    appId: string;
    allowLocalhostAsSecureOrigin: boolean;
    serviceWorkerParam: { scope: string };
    serviceWorkerPath: string;
  }) => Promise<void> | void;
};

declare global {
  interface Window {
    OneSignalDeferred?: Array<(oneSignal: OneSignalClient) => void>;
    __limmitOneSignalQueued?: boolean;
  }
}

export default function OneSignalInit() {
  const pathname = usePathname();

  useEffect(() => {
    // Public client offers do not need notification tracking or service workers.
    if (pathname.startsWith('/nabidka/')) return;
    if (typeof window === 'undefined') return;

    const supportedHost =
      process.env.NEXT_PUBLIC_ONESIGNAL_HOST ?? 'firemni-ukoly.vercel.app';
    if (window.location.hostname !== supportedHost) return;
    if (window.__limmitOneSignalQueued) return;

    window.OneSignalDeferred ??= [];
    window.__limmitOneSignalQueued = true;
    window.OneSignalDeferred.push(async function(OneSignal) {
      const currentSupportedHost =
        process.env.NEXT_PUBLIC_ONESIGNAL_HOST ?? 'firemni-ukoly.vercel.app';
      if (
        window.location.hostname !== currentSupportedHost ||
        window.location.pathname.startsWith('/nabidka/')
      ) {
        window.__limmitOneSignalQueued = false;
        return;
      }

      try {
        await OneSignal.init({
          appId: "605749d7-a29f-43a9-80d2-c789376b5476",
          allowLocalhostAsSecureOrigin: true,
          serviceWorkerParam: {
            scope: '/'
          },
          serviceWorkerPath: 'OneSignalSDKWorker.js'
        });
      } catch (error) {
        window.__limmitOneSignalQueued = false;
        console.warn('OneSignal initialization skipped:', error);
      }
    });

    if (!document.querySelector('script[data-onesignal-sdk]')) {
      const script = document.createElement('script');
      script.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
      script.defer = true;
      script.dataset.onesignalSdk = 'true';
      script.addEventListener('error', () => {
        window.__limmitOneSignalQueued = false;
      }, { once: true });
      document.head.appendChild(script);
    }
  }, [pathname]);

  return null;
}
