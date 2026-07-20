import type { Metadata } from "next";

import { PublicOfferClient } from "./PublicOfferClient";

export const metadata: Metadata = {
  title: "Nabídka pojištění majetku a odpovědnosti",
  description: "Soukromé srovnání nabídek pojištění majetku a odpovědnosti.",
  referrer: "no-referrer",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

interface PublicOfferPageProps {
  params: Promise<{ slug: string }>;
}

export default async function PublicOfferPage({ params }: PublicOfferPageProps) {
  const { slug } = await params;

  return <PublicOfferClient slug={slug} />;
}
