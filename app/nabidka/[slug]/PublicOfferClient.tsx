"use client";

import { useEffect, useRef, useState } from "react";

import { PropertyOfferDocument } from "@/app/components/property-offer/PropertyOfferDocument";
import {
  decryptPropertyOffer,
  type PropertyOffer,
  validatePropertyOffer,
} from "@/lib/property-offer";
import { downloadPropertyOfferPdf } from "@/lib/property-offer/pdf";
import { supabase } from "@/lib/supabaseClient";

import styles from "./PublicOfferPage.module.css";

const PUBLISHED_SLUG_PATTERN = /^[A-Za-z0-9_-]{12,32}$/;
const MAX_ENCRYPTED_PAYLOAD_LENGTH = 200_000;

interface PublicOfferClientProps {
  slug: string;
}

interface PublishedOfferRow {
  encrypted_payload: string;
  expires_at: string;
}

type ViewState =
  | { status: "loading" }
  | { status: "ready"; offer: PropertyOffer }
  | { status: "expired" }
  | { status: "error"; message: string; retryable: boolean };

type PdfState = "idle" | "working" | "done" | "error";

export function PublicOfferClient({ slug }: PublicOfferClientProps) {
  const [view, setView] = useState<ViewState>({ status: "loading" });
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [pdfState, setPdfState] = useState<PdfState>("idle");
  const [pdfMessage, setPdfMessage] = useState("");
  const documentRootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadOffer() {
      setView({ status: "loading" });

      try {
        const fragment = readFragment();
        const key = fragment.get("k");

        if (!key) {
          throw new PublicOfferError(
            "V odkazu chybí šifrovací klíč. Požádejte poradce o nový úplný odkaz.",
          );
        }

        if (!PUBLISHED_SLUG_PATTERN.test(slug)) {
          throw new PublicOfferError("Odkaz na nabídku nemá platný formát.");
        }

        const { data, error } = await supabase
          .rpc("get_published_offer", { p_slug: slug })
          .maybeSingle();

        if (error) {
          throw new PublicOfferError(
            "Nabídku se nyní nepodařilo načíst. Zkontrolujte připojení a zkuste to znovu.",
            true,
          );
        }

        if (!data) {
          if (!cancelled) setView({ status: "expired" });
          return;
        }

        const row = parsePublishedOfferRow(data);
        const expiresAt = Date.parse(row.expires_at);

        if (!Number.isFinite(expiresAt)) {
          throw new PublicOfferError("Nabídka obsahuje neplatný údaj o expiraci.");
        }

        if (expiresAt <= Date.now()) {
          if (!cancelled) setView({ status: "expired" });
          return;
        }

        const encryptedPayload = row.encrypted_payload;

        if (
          encryptedPayload.length === 0 ||
          encryptedPayload.length > MAX_ENCRYPTED_PAYLOAD_LENGTH
        ) {
          throw new PublicOfferError("Zašifrovaná nabídka má neplatnou velikost.");
        }

        const offer = await decryptPropertyOffer(encryptedPayload, key);
        const validation = validatePropertyOffer(offer);

        if (!validation.valid) {
          throw new PublicOfferError(
            "Data nabídky nejsou v podporovaném formátu. Požádejte poradce o nový odkaz.",
          );
        }

        if (!cancelled) setView({ status: "ready", offer });
      } catch (error) {
        if (cancelled) return;

        if (error instanceof PublicOfferError) {
          setView({
            status: "error",
            message: error.message,
            retryable: error.retryable,
          });
          return;
        }

        setView({
          status: "error",
          message:
            "Nabídku se nepodařilo odemknout. Odkaz může být neúplný nebo poškozený.",
          retryable: false,
        });
      }
    }

    void loadOffer();

    return () => {
      cancelled = true;
    };
  }, [loadAttempt, slug]);

  async function handlePdfDownload() {
    if (view.status !== "ready" || !documentRootRef.current) return;

    setPdfState("working");
    setPdfMessage("Připravuji PDF…");

    try {
      const fileName = await downloadPropertyOfferPdf(
        documentRootRef.current,
        view.offer,
      );
      setPdfState("done");
      setPdfMessage(`PDF bylo staženo jako ${fileName}.`);
    } catch {
      setPdfState("error");
      setPdfMessage("PDF se nepodařilo vytvořit. Zkuste tisk nebo akci opakujte.");
    }
  }

  if (view.status === "loading") {
    return (
      <main className={styles.statePage} aria-busy="true">
        <section className={styles.stateCard} role="status" aria-live="polite">
          <span className={styles.spinner} aria-hidden="true" />
          <p className={styles.eyebrow}>Zabezpečená nabídka</p>
          <h1>Otevírám vaše srovnání</h1>
          <p>Načítám zašifrovaná data a ověřuji jejich platnost.</p>
        </section>
      </main>
    );
  }

  if (view.status === "expired") {
    return (
      <main className={styles.statePage}>
        <section className={styles.stateCard} role="status">
          <span className={styles.stateIcon} aria-hidden="true">⌛</span>
          <p className={styles.eyebrow}>Odkaz již není aktivní</p>
          <h1>Platnost sdílené nabídky vypršela</h1>
          <p>
            Kvůli ochraně klientských údajů už tuto nabídku nelze zobrazit.
            Požádejte svého poradce o nový odkaz.
          </p>
        </section>
      </main>
    );
  }

  if (view.status === "error") {
    return (
      <main className={styles.statePage}>
        <section className={styles.stateCard} role="alert">
          <span className={styles.stateIcon} aria-hidden="true">!</span>
          <p className={styles.eyebrow}>Nabídku nelze zobrazit</p>
          <h1>Odkaz se nepodařilo otevřít</h1>
          <p>{view.message}</p>
          {view.retryable ? (
            <button
              className={styles.primaryButton}
              type="button"
              onClick={() => setLoadAttempt((attempt) => attempt + 1)}
            >
              Zkusit znovu
            </button>
          ) : null}
        </section>
      </main>
    );
  }

  const emailSubject = encodeURIComponent(
    `Dotaz k nabídce ${view.offer.title}`,
  );
  const advisorEmail = encodeURIComponent(view.offer.advisor.email.trim());

  return (
    <main className={styles.offerPage}>
      <div className={styles.toolbar} aria-label="Akce nabídky">
        <div className={styles.toolbarIntro}>
          <span className={styles.secureMark} aria-hidden="true">✓</span>
          <div>
            <strong>Soukromá nabídka</strong>
            <span>Odemčeno pouze ve vašem prohlížeči</span>
          </div>
        </div>

        <div className={styles.toolbarActions}>
          <button
            className={styles.primaryButton}
            type="button"
            onClick={() => void handlePdfDownload()}
            disabled={pdfState === "working"}
            aria-busy={pdfState === "working"}
          >
            {pdfState === "working" ? "Připravuji PDF…" : "Stáhnout PDF"}
          </button>
          <a
            className={styles.secondaryButton}
            href={`mailto:${advisorEmail}?subject=${emailSubject}`}
          >
            Kontakt poradce
          </a>
          <button
            className={styles.secondaryButton}
            type="button"
            onClick={() => window.print()}
          >
            Tisk
          </button>
        </div>

        <p
          className={styles.srOnly}
          role={pdfState === "error" ? "alert" : "status"}
          aria-live="polite"
        >
          {pdfMessage}
        </p>
      </div>

      <div ref={documentRootRef} className={styles.documentRoot}>
        <PropertyOfferDocument offer={view.offer} mode="screen" />
      </div>
    </main>
  );
}

function readFragment(): URLSearchParams {
  const fragment = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  return new URLSearchParams(fragment);
}

function parsePublishedOfferRow(value: unknown): PublishedOfferRow {
  if (
    value === null ||
    typeof value !== "object" ||
    typeof (value as Record<string, unknown>).encrypted_payload !== "string" ||
    typeof (value as Record<string, unknown>).expires_at !== "string"
  ) {
    throw new PublicOfferError("Úložiště vrátilo neplatná data nabídky.");
  }

  return value as PublishedOfferRow;
}

class PublicOfferError extends Error {
  constructor(
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "PublicOfferError";
  }
}
