"use client";

import type { PropertyOffer } from ".";
import { LIMMIT_LOGO_SRC } from "../logo";

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

function safeFilePart(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "klient";
}

async function waitForDocumentLayout(): Promise<void> {
  if ("fonts" in document) {
    await document.fonts.ready;
  }
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
}

export async function downloadPropertyOfferPdf(
  root: HTMLElement,
  offer: PropertyOffer,
): Promise<string> {
  const pages = Array.from(
    root.querySelectorAll<HTMLElement>(".offer-pdf-page"),
  );

  if (pages.length === 0) {
    throw new Error("Nebyly nalezeny žádné stránky nabídky.");
  }
  const sourceDocument = pages[0].parentElement?.parentElement;
  if (!(sourceDocument instanceof HTMLElement)) {
    throw new Error("Nebylo nalezeno rozvržení nabídky.");
  }

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  const staging = document.createElement("div");
  staging.className = "offer-pdf-exporting";
  staging.setAttribute("aria-hidden", "true");
  Object.assign(staging.style, {
    position: "fixed",
    inset: "0 auto auto 0",
    width: "794px",
    height: "1123px",
    overflow: "hidden",
    pointerEvents: "none",
    backgroundColor: "#ffffff",
    zIndex: "2147483647",
  });

  root.classList.add("offer-pdf-exporting");
  document.body.appendChild(staging);

  try {
    await waitForDocumentLayout();

    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
      compress: true,
      putOnlyUsedFonts: true,
    });

    pdf.setProperties({
      title: `Nabídka pojištění majetku - ${offer.client.name}`,
      subject: "Srovnání pojištění nemovitosti, domácnosti a odpovědnosti",
      author: "LIMMIT s.r.o.",
      creator: "LIMMIT firemní aplikace",
    });

    const logoResponse = await fetch(LIMMIT_LOGO_SRC);
    if (!logoResponse.ok) throw new Error("Logo pro PDF se nepodařilo načíst.");
    const logoBytes = new Uint8Array(await logoResponse.arrayBuffer());

    for (let index = 0; index < pages.length; index += 1) {
      // Capture every page from the same viewport position. Capturing the
      // stacked, off-screen originals made html2canvas intermittently omit a
      // header or footer on later pages.
      const exportPage = pages[index].cloneNode(true) as HTMLElement;
      exportPage.style.margin = "0";
      exportPage.style.boxShadow = "none";
      const capturedBrand = exportPage.querySelector<HTMLElement>(
        '[aria-label="LIMMIT"]',
      );
      if (capturedBrand) capturedBrand.style.visibility = "hidden";
      const exportDocument = sourceDocument.cloneNode(false) as HTMLElement;
      exportDocument.removeAttribute("id");
      exportDocument.replaceChildren(exportPage);
      staging.replaceChildren(exportDocument);
      await waitForDocumentLayout();

      const canvas = await html2canvas(exportPage, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        width: 794,
        height: 1123,
        windowWidth: 794,
        windowHeight: 1123,
        logging: false,
      });

      if (index > 0) {
        pdf.addPage("a4", "portrait");
      }

      const image = canvas.toDataURL("image/jpeg", 0.96);
      pdf.addImage(
        image,
        "JPEG",
        0,
        0,
        A4_WIDTH_MM,
        A4_HEIGHT_MM,
        undefined,
        "FAST",
      );

      // Embed the supplied image on every page, without re-drawing the brand.
      pdf.addImage(logoBytes, "PNG", 11.65, 6.3, 7.4, 7.4, "limmit-logo", "FAST");
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(15);
      pdf.setTextColor(26, 46, 115);
      pdf.text("LIMMIT", 21.1, 12.35);
    }

    const issueDate = offer.issueDate || offer.generatedAt.slice(0, 10) || new Date().toISOString().slice(0, 10);
    const filename = `Nabidka_majetku_${safeFilePart(offer.client.name)}_${issueDate}.pdf`;
    pdf.save(filename);
    return filename;
  } finally {
    staging.remove();
    root.classList.remove("offer-pdf-exporting");
  }
}
