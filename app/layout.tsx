import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AppNavigation from "./components/AppNavigation";
import PwaInit from "./PwaInit";
import SessionGate from "./components/SessionGate";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#102e32' };

export const metadata: Metadata = {
  title: {
    default: "LIMMIT | Firemní aplikace",
    template: "%s | LIMMIT",
  },
  description: "Firemní aplikace LIMMIT pro úkoly, kalkulace a klientské nabídky.",
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="cs" className={`${geistSans.variable} ${geistMono.variable}`}>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        {/* All app icons use the supplied LIMMIT asset. */}
        <link rel="icon" href="/app-icon-192.png?v=2" sizes="192x192" />
        <link rel="icon" href="/app-icon-512.png?v=2" sizes="512x512" />
        <link rel="apple-touch-icon" href="/app-icon-192.png?v=2" />
      </head>
      <body className="antialiased">
        <PwaInit />
        <SessionGate>
          <AppNavigation />
          {children}
        </SessionGate>
      </body>
    </html>
  );
}
