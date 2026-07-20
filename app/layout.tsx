import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import OneSignalInit from "./OneSignalInit";
import AppNavigation from "./components/AppNavigation";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
        <meta name="theme-color" content="#081827" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        {/* Icons (using existing SVGs in /public) */}
        <link rel="icon" href="/window.svg" sizes="192x192" />
        <link rel="icon" href="/file.svg" sizes="512x512" />
        <link rel="apple-touch-icon" href="/window.svg" />
        <link rel="mask-icon" href="/window.svg" color="#0f8f8a" />
      </head>
      <body className="antialiased">
        <OneSignalInit />
        <AppNavigation />
        {children}
      </body>
    </html>
  );
}
