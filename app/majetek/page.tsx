"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PropertyOfferDocument } from "@/app/components/property-offer/PropertyOfferDocument";
import { loadSession, type User } from "@/lib/auth";
import {
  REFERENCE_PROPERTY_OFFER,
  type CoverageStatus,
  type OfferVariant,
  type PropertyOffer,
  decryptJson,
  encryptPropertyOffer,
  encryptJson,
  generateOfferSlug,
  generateRevokeToken,
  isPropertyOffer,
  sha256Hex,
} from "@/lib/property-offer";
import { downloadPropertyOfferPdf } from "@/lib/property-offer/pdf";
import ModuleShell from "@/app/components/ModuleShell";
import { supabase } from "@/lib/supabaseClient";
import styles from "./PropertyEditor.module.css";

const LOCAL_STORAGE_KEY = "limmit:property-offer:v1";
const PUBLICATION_STORAGE_KEY = "limmit:property-publications:v1";
const LEGACY_CLOUD_KEY_STORAGE_KEY = "limmit:property-cloud-key:v1";
const CLOUD_ENCRYPTION_KEY_STORAGE_KEY = "limmit:property-cloud-encryption-key:v2";
const CLOUD_ACCESS_TOKEN_STORAGE_KEY = "limmit:property-cloud-access-token:v2";

type SavedPropertyCalculation = {
  id: string;
  name: string;
  payload: unknown;
  updated_at: string;
  displayName: string;
  decryptedOffer: PropertyOffer | null;
};

type StoredCalculationPayload = {
  name: string;
  offer: PropertyOffer;
};

type Publication = {
  slug: string;
  revokeToken: string;
  url: string | null;
  expiresAt: string;
};

type StoredPublication = Omit<Publication, "url">;

type Notice = {
  kind: "success" | "error" | "info";
  message: string;
};

const COVERAGE_LABEL: Record<CoverageStatus, string> = {
  included: "Zahrnuto",
  excluded: "Nesjednáno",
  unknown: "Nelze určit",
};

function cloneOffer(offer: PropertyOffer): PropertyOffer {
  return JSON.parse(JSON.stringify(offer)) as PropertyOffer;
}

function isStoredCalculationPayload(value: unknown): value is StoredCalculationPayload {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return typeof candidate.name === "string" && isPropertyOffer(candidate.offer);
}

function fixedAmount(
  value: { amount?: { amount: number } } | undefined,
): number {
  return value?.amount?.amount ?? 0;
}

function buildRecommendationForVariant(
  variant: OfferVariant,
): PropertyOffer["recommendation"] {
  return {
    variantId: variant.id,
    label: "Doporučená varianta v tomto srovnání",
    summary: `${variant.insurer.shortName} · ${variant.packageName} je nyní zvolena jako doporučená varianta. Doporučení vychází pouze z aktuálně zadaných údajů a před sjednáním je nutné ověřit úplné podmínky pojišťovny.`,
    rationale:
      variant.highlights.length > 0
        ? variant.highlights.slice(0, 3)
        : ["Doplňte konkrétní důvody doporučení podle potřeb klienta."],
    caveats:
      variant.gaps.length > 0
        ? variant.gaps.slice(0, 4)
        : ["Doplňte výluky, omezení a údaje, které je třeba před sjednáním ověřit."],
    sourceRefs: variant.sourceRefs,
  };
}

function createEmptyBuildingSection(): NonNullable<OfferVariant["building"]> {
  return {
    status: "unknown",
    sumInsured: { amount: 0, currency: "CZK" },
    deductible: { kind: "unknown" },
    guaranteedSumInsured: null,
    limits: [],
    sourceRefs: [],
  };
}

function createBlankVariant(offer: PropertyOffer, suffix: string): OfferVariant {
  const normalizedCoverages = Array.from(
    new Map(
      offer.variants
        .flatMap((variant) => variant.coverages)
        .map((coverage) => [coverage.id, coverage] as const),
    ).values(),
  ).map((coverage) => ({
    id: coverage.id,
    category: coverage.category,
    label: coverage.label,
    status: "unknown" as const,
    details: [],
    sourceRefs: [],
  }));

  return {
    id: `variant-${suffix}`,
    insurer: {
      id: `insurer-${suffix}`,
      name: "Nová pojišťovna",
      shortName: "Nová",
    },
    product: "Doplňte produkt",
    packageName: "Doplňte variantu",
    annualPremium: { amount: 0, currency: "CZK" },
    premiumBreakdown: [],
    validity: {
      issuedOn: offer.issueDate,
      validUntil: null,
      kind: "not-stated",
      note: "Platnost nebyla ve zdroji doplněna.",
      sourceRefs: [],
    },
    building: createEmptyBuildingSection(),
    household: {
      status: "unknown",
      sumInsured: { amount: 0, currency: "CZK" },
      deductible: { kind: "unknown" },
      guaranteedSumInsured: null,
      limits: [],
      sourceRefs: [],
    },
    liability: {
      status: "unknown",
      limit: { kind: "unknown" },
      deductible: { kind: "unknown" },
      scopes: normalizedCoverages.filter((coverage) => coverage.category === "liability"),
      sourceRefs: [],
    },
    assistance: {
      status: "unknown",
      annualPremium: null,
      coverages: normalizedCoverages.filter((coverage) => coverage.category === "assistance"),
      sourceRefs: [],
    },
    coverages: normalizedCoverages,
    highlights: [],
    gaps: [],
    sourceRefs: [],
  };
}

function readStoredPublications(): StoredPublication[] {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(PUBLICATION_STORAGE_KEY) || "[]",
    );
    if (!Array.isArray(parsed)) return [];

    const now = Date.now();
    return parsed
      .filter((item): item is Record<string, unknown> =>
        item !== null && typeof item === "object" && !Array.isArray(item),
      )
      .filter(
        (item) =>
          typeof item.slug === "string" &&
          typeof item.revokeToken === "string" &&
          typeof item.expiresAt === "string" &&
          Date.parse(item.expiresAt) > now,
      )
      .map(({ slug, revokeToken, expiresAt }) => ({
        slug: slug as string,
        revokeToken: revokeToken as string,
        expiresAt: expiresAt as string,
      }))
      .slice(0, 30);
  } catch {
    return [];
  }
}

function persistStoredPublications(publications: StoredPublication[]) {
  localStorage.setItem(
    PUBLICATION_STORAGE_KEY,
    JSON.stringify(publications.slice(0, 30)),
  );
}

function AppIcon({
  name,
  size = 18,
}: {
  name: "home" | "eye" | "save" | "link" | "download" | "refresh" | "plus" | "trash" | "shield";
  size?: number;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  const paths = {
    home: <><path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/></>,
    eye: <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/></>,
    save: <><path d="M5 3h12l2 2v16H5Z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/></>,
    link: <><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.1-1.1"/></>,
    download: <><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 21h16"/></>,
    refresh: <><path d="M20 6v5h-5"/><path d="M4 18v-5h5"/><path d="M18.5 9A7 7 0 0 0 6 6.5L4 11M5.5 15A7 7 0 0 0 18 17.5l2-4.5"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14"/></>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

export default function PropertyOfferEditorPage() {
  const router = useRouter();
  const documentRootRef = useRef<HTMLDivElement>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [offer, setOffer] = useState<PropertyOffer>(() =>
    cloneOffer(REFERENCE_PROPERTY_OFFER),
  );
  const [activeView, setActiveView] = useState<"editor" | "preview">("editor");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedPropertyCalculation[]>([]);
  const [currentCalculationId, setCurrentCalculationId] = useState<string | null>(null);
  const [saveName, setSaveName] = useState("Referenční majetková nabídka");
  const [shareDays, setShareDays] = useState(30);
  const [publication, setPublication] = useState<Publication | null>(null);
  const [storedPublications, setStoredPublications] = useState<StoredPublication[]>([]);

  const notify = useCallback((message: string, kind: Notice["kind"] = "success") => {
    setNotice({ message, kind });
    window.setTimeout(() => setNotice(null), 5000);
  }, []);

  const fetchSaved = useCallback(async () => {
    const cloudEncryptionKey = localStorage.getItem(CLOUD_ENCRYPTION_KEY_STORAGE_KEY);
    const cloudAccessToken = localStorage.getItem(CLOUD_ACCESS_TOKEN_STORAGE_KEY);
    if (!cloudEncryptionKey || !cloudAccessToken) {
      setSaved([]);
      return;
    }

    const { data, error } = await supabase.rpc("list_property_calculations", {
      p_access_token: cloudAccessToken,
    });

    if (error) {
      notify("Uložené nabídky se nepodařilo načíst.", "error");
      return;
    }
    const calculations = await Promise.all(
      ((data ?? []) as Array<Omit<SavedPropertyCalculation, "displayName" | "decryptedOffer">>)
        .map(async (row): Promise<SavedPropertyCalculation> => {
          try {
            const decrypted = await decryptJson<unknown>(
              JSON.stringify(row.payload),
              cloudEncryptionKey,
            );
            if (isStoredCalculationPayload(decrypted)) {
              return {
                ...row,
                displayName: decrypted.name,
                decryptedOffer: decrypted.offer,
              };
            }
          } catch {
            // A calculation encrypted on another device remains intentionally locked.
          }

          return {
            ...row,
            displayName: `${row.name} · nelze odemknout v tomto prohlížeči`,
            decryptedOffer: null,
          };
        }),
    );
    setSaved(calculations);
  }, [notify]);

  useEffect(() => {
    const user = loadSession();
    if (!user) {
      router.push("/login");
      return;
    }
    setCurrentUser(user);
    // Version 1 reused the encryption key as a database capability. It is
    // deliberately retired instead of silently carrying that coupling forward.
    localStorage.removeItem(LEGACY_CLOUD_KEY_STORAGE_KEY);
    void fetchSaved();

    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (isPropertyOffer(parsed)) {
          setOffer(parsed);
        }
      } catch {
        localStorage.removeItem(LOCAL_STORAGE_KEY);
      }
    }

    const activePublications = readStoredPublications();
    persistStoredPublications(activePublications);
    setStoredPublications(activePublications);
    if (activePublications[0]) {
      setPublication({ ...activePublications[0], url: null });
    }
  }, [fetchSaved, router]);

  useEffect(() => {
    if (!currentUser) return;
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(offer));
  }, [currentUser, offer]);

  const recommendedVariant = useMemo(
    () => offer.variants.find((variant) => variant.id === offer.recommendation.variantId),
    [offer],
  );

  const updateVariant = (
    variantId: string,
    updater: (variant: OfferVariant) => OfferVariant,
  ) => {
    setOffer((current) => ({
      ...current,
      variants: current.variants.map((variant) =>
        variant.id === variantId ? updater(variant) : variant,
      ),
    }));
  };

  const resetReference = () => {
    if (!window.confirm("Obnovit referenční srovnání a zahodit aktuální lokální úpravy?")) {
      return;
    }
    setOffer(cloneOffer(REFERENCE_PROPERTY_OFFER));
    setCurrentCalculationId(null);
    setSaveName("Referenční majetková nabídka");
    notify("Referenční srovnání bylo obnoveno.", "info");
  };

  const saveToCloud = async () => {
    if (!currentUser || !saveName.trim()) return;
    if (!isPropertyOffer(offer)) {
      notify("Nabídka obsahuje neplatné nebo příliš dlouhé údaje.", "error");
      return;
    }
    setBusy("save");
    try {
      const existingEncryptionKey = localStorage.getItem(
        CLOUD_ENCRYPTION_KEY_STORAGE_KEY,
      );
      const existingAccessToken = localStorage.getItem(
        CLOUD_ACCESS_TOKEN_STORAGE_KEY,
      );
      const accessToken = existingAccessToken ?? generateRevokeToken();
      const { encryptedPayload, key } = await encryptJson(
        { name: saveName.trim(), offer },
        existingEncryptionKey ?? undefined,
      );
      const { data, error } = await supabase.rpc("save_property_calculation", {
        p_id: currentCalculationId,
        p_name: "Šifrovaná majetková nabídka",
        p_payload: JSON.parse(encryptedPayload) as unknown,
        p_created_by: currentUser.username,
        p_access_token: accessToken,
      });
      if (error || !data) {
        throw new Error(error?.message ?? "Úložiště nepotvrdilo zápis.");
      }
      localStorage.setItem(CLOUD_ENCRYPTION_KEY_STORAGE_KEY, key);
      localStorage.setItem(CLOUD_ACCESS_TOKEN_STORAGE_KEY, accessToken);
      setCurrentCalculationId(data as string);
      await fetchSaved();
      notify("Nabídka je šifrovaně uložená v novém Supabase projektu.");
    } catch (error) {
      notify(
        `Uložení selhalo: ${error instanceof Error ? error.message : "neznámá chyba"}`,
        "error",
      );
    } finally {
      setBusy(null);
    }
  };

  const loadCalculation = (id: string) => {
    const calculation = saved.find((item) => item.id === id);
    if (!calculation?.decryptedOffer) {
      notify(
        "Nabídku nelze odemknout. Šifrovací klíč zůstává v prohlížeči, ve kterém byla uložena.",
        "error",
      );
      return;
    }
    setOffer(cloneOffer(calculation.decryptedOffer));
    setCurrentCalculationId(calculation.id);
    setSaveName(calculation.displayName);
    notify(`Načteno: ${calculation.displayName}`, "info");
  };

  const addVariant = () => {
    if (offer.variants.length >= 3) return;
    const suffix = Date.now().toString(36);
    const next = createBlankVariant(offer, suffix);
    setOffer((current) => ({
      ...current,
      variants: [...current.variants, next],
    }));
  };

  const removeVariant = (variantId: string) => {
    if (offer.variants.length <= 1) return;
    setOffer((current) => {
      const nextVariants = current.variants.filter((variant) => variant.id !== variantId);
      return {
        ...current,
        variants: nextVariants,
        recommendation:
          current.recommendation.variantId === variantId
            ? buildRecommendationForVariant(nextVariants[0])
            : current.recommendation,
      };
    });
  };

  const publishOffer = async () => {
    if (!currentUser || !isPropertyOffer(offer)) {
      notify("Nabídka není v platném formátu.", "error");
      return;
    }
    setBusy("publish");
    try {
      const [{ encryptedPayload, key }, slug, revokeToken] = await Promise.all([
        encryptPropertyOffer(offer),
        Promise.resolve(generateOfferSlug()),
        Promise.resolve(generateRevokeToken()),
      ]);
      const revokeHash = await sha256Hex(revokeToken);
      const expiresAt = new Date(Date.now() + shareDays * 86_400_000).toISOString();
      const { data, error } = await supabase.rpc("publish_encrypted_offer", {
        p_slug: slug,
        p_product_type: "property",
        p_schema_version: 1,
        p_encrypted_payload: encryptedPayload,
        p_revoke_hash: revokeHash,
        p_created_by: currentUser.username,
        p_expires_at: expiresAt,
      });

      if (error || data !== true) {
        throw new Error(
          `Odkaz se nepodařilo bezpečně uložit: ${error?.message ?? "úložiště nepotvrdilo zápis"}`,
        );
      }

      const base = `${window.location.origin}/nabidka`;
      const url = `${base}/${slug}#k=${encodeURIComponent(key)}`;
      const nextPublication = {
        slug,
        revokeToken,
        url,
        expiresAt,
      };
      setPublication(nextPublication);
      const storedPublication = { slug, revokeToken, expiresAt };
      const nextStored = [
        storedPublication,
        ...storedPublications.filter((item) => item.slug !== slug),
      ].slice(0, 30);
      setStoredPublications(nextStored);
      persistStoredPublications(nextStored);

      let copied = true;
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        copied = false;
      }
      notify(
        `Krátký šifrovaný odkaz byl vytvořen${copied ? " a zkopírován" : ""}.`,
      );
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Odkaz se nepodařilo vytvořit.",
        "error",
      );
    } finally {
      setBusy(null);
    }
  };

  const revokePublication = async () => {
    if (!publication) return;
    setBusy("revoke");
    try {
      const { data, error } = await supabase.rpc("revoke_published_offer", {
        p_slug: publication.slug,
        p_revoke_token: publication.revokeToken,
      });
      if (error || data !== true) {
        throw new Error(error?.message ?? "Úložiště nepotvrdilo zneplatnění.");
      }
      const nextStored = storedPublications.filter(
        (item) => item.slug !== publication.slug,
      );
      setStoredPublications(nextStored);
      persistStoredPublications(nextStored);
      setPublication(nextStored[0] ? { ...nextStored[0], url: null } : null);
      notify("Odkaz byl zneplatněn.", "info");
    } catch {
      notify("Odkaz se nepodařilo zneplatnit.", "error");
    } finally {
      setBusy(null);
    }
  };

  const downloadPdf = async () => {
    if (!documentRootRef.current) return;
    setBusy("pdf");
    try {
      const filename = await downloadPropertyOfferPdf(documentRootRef.current, offer);
      notify(`Staženo: ${filename}`);
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "PDF se nepodařilo vytvořit.",
        "error",
      );
    } finally {
      setBusy(null);
    }
  };

  if (!currentUser) {
    return <main className={styles.authLoading}>Načítám zabezpečený editor…</main>;
  }

  return (
    <ModuleShell user={currentUser} title="Pojištění majetku" section="Majetek · klientské nabídky" subtitle="Srovnání nemovitosti, domácnosti a odpovědnosti na jednom místě."
      items={[
        { label: "Editor nabídky", icon: <AppIcon name="home" />, active: activeView === "editor", onClick: () => setActiveView("editor") },
        { label: "Náhled a sdílení", icon: <AppIcon name="eye" />, active: activeView === "preview", onClick: () => setActiveView("preview") },
      ]}
      actions={<button className="module-action" onClick={resetReference}><AppIcon name="refresh" /> Referenční případ</button>}>
    <div className={styles.app}>
      {notice && (
        <div className={`${styles.notice} ${styles[notice.kind]}`} role="status">
          {notice.message}
        </div>
      )}



      {activeView === "editor" ? (
        <main className={styles.workspace}>
          <section className={styles.intro}>
            <div>
              <span className={styles.kicker}>Příprava nabídky</span>
              <h2>Přehledná nabídka pro vašeho klienta.</h2>
              <p>
                Webový odkaz i PDF vycházejí ze stejného srovnání. Ceny jsou roční,
                měsíční splátky se neodvozují a každé krytí má jednoznačný stav.
              </p>
            </div>
            <div className={styles.securityPill}>
              <AppIcon name="shield" size={20} />
              <div><strong>Šifrované sdílení</strong><span>Soukromý odkaz pro klienta</span></div>
            </div>
          </section>

          <section className={styles.saveBar}>
            <label>
              <span>Název kalkulace</span>
              <input maxLength={120} value={saveName} onChange={(event) => setSaveName(event.target.value)} />
            </label>
            <label>
              <span>Načíst uloženou</span>
              <select
                value={currentCalculationId ?? ""}
                onChange={(event) => event.target.value && loadCalculation(event.target.value)}
              >
                <option value="">Vyberte nabídku…</option>
                {saved.map((item) => (
                  <option key={item.id} value={item.id}>{item.displayName}</option>
                ))}
              </select>
            </label>
            <button className={styles.primaryButton} onClick={saveToCloud} disabled={busy === "save"}>
              <AppIcon name="save" /> {busy === "save" ? "Ukládám…" : "Uložit do cloudu"}
            </button>
          </section>

          <div className={styles.editorGrid}>
            <aside className={styles.sidebar}>
              <section className={styles.panel}>
                <div className={styles.panelHeading}>
                  <span>01</span><div><h3>Klient a riziko</h3><p>Bez rodného čísla ve výstupu.</p></div>
                </div>
                <div className={styles.fieldGrid}>
                  <label className={styles.fullField}><span>Jméno klienta</span><input maxLength={160} value={offer.client.name} onChange={(event) => setOffer((current) => ({ ...current, client: { ...current.client, name: event.target.value } }))} /></label>
                  <label><span>Telefon</span><input maxLength={40} value={offer.client.phone ?? ""} onChange={(event) => setOffer((current) => ({ ...current, client: { ...current.client, phone: event.target.value || undefined } }))} /></label>
                  <label><span>E-mail</span><input type="email" maxLength={254} value={offer.client.email ?? ""} onChange={(event) => setOffer((current) => ({ ...current, client: { ...current.client, email: event.target.value || undefined } }))} /></label>
                  <label className={styles.fullField}><span>Místo pojištění</span><input maxLength={250} value={offer.insuredLocation.addressLine} onChange={(event) => setOffer((current) => ({ ...current, insuredLocation: { ...current.insuredLocation, addressLine: event.target.value } }))} /></label>
                  <label><span>PSČ</span><input maxLength={16} value={offer.insuredLocation.postalCode} onChange={(event) => setOffer((current) => ({ ...current, insuredLocation: { ...current.insuredLocation, postalCode: event.target.value } }))} /></label>
                  <label><span>Město</span><input maxLength={100} value={offer.insuredLocation.city} onChange={(event) => setOffer((current) => ({ ...current, insuredLocation: { ...current.insuredLocation, city: event.target.value } }))} /></label>
                  <label><span>Jednotka / byt</span><input maxLength={50} value={offer.insuredLocation.unit ?? ""} onChange={(event) => setOffer((current) => ({ ...current, insuredLocation: { ...current.insuredLocation, unit: event.target.value || undefined } }))} /></label>
                  <label><span>Plocha m²</span><input type="number" min={0} step={1} value={offer.insuredLocation.floorAreaM2 ?? ""} onChange={(event) => setOffer((current) => ({ ...current, insuredLocation: { ...current.insuredLocation, floorAreaM2: event.target.value === "" ? undefined : Math.max(0, Number(event.target.value)) } }))} /></label>
                </div>
              </section>

              <section className={styles.panel}>
                <div className={styles.panelHeading}>
                  <span>02</span><div><h3>Doporučení poradce</h3><p>Oddělené od faktů pojišťoven.</p></div>
                </div>
                <label className={styles.stackField}>
                  <span>Doporučená varianta</span>
                  <select
                    value={offer.recommendation.variantId}
                    onChange={(event) => setOffer((current) => {
                      const selected = current.variants.find((variant) => variant.id === event.target.value);
                      return selected
                        ? { ...current, recommendation: buildRecommendationForVariant(selected) }
                        : current;
                    })}
                  >
                    {offer.variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.insurer.shortName} · {variant.packageName}</option>)}
                  </select>
                </label>
                <label className={styles.stackField}>
                  <span>Hlavní sdělení</span>
                  <textarea rows={4} maxLength={1200} value={offer.recommendation.summary} onChange={(event) => setOffer((current) => ({ ...current, recommendation: { ...current.recommendation, summary: event.target.value } }))} />
                </label>
                <div className={styles.recommendationPreview}>
                  <span>Aktuálně doporučeno</span>
                  <strong>{recommendedVariant?.insurer.shortName ?? "–"} · {recommendedVariant?.packageName ?? "–"}</strong>
                </div>
              </section>
            </aside>

            <section className={styles.variantSection}>
              <div className={styles.sectionTitle}>
                <div><span className={styles.kicker}>03 · Nabídky</span><h2>Normalizované varianty</h2></div>
                <button className={styles.outlineButton} onClick={addVariant} disabled={offer.variants.length >= 3} title={offer.variants.length >= 3 ? "Výstup podporuje nejvýše tři varianty" : undefined}><AppIcon name="plus" /> Přidat variantu</button>
              </div>
              <div className={styles.variantList}>
                {offer.variants.map((variant, index) => (
                  <article className={`${styles.variantCard} ${offer.recommendation.variantId === variant.id ? styles.recommendedCard : ""}`} key={variant.id}>
                    <div className={styles.variantTop}>
                      <div className={styles.variantNumber}>{String(index + 1).padStart(2, "0")}</div>
                      <div className={styles.variantIdentity}>
                        <input className={styles.insurerInput} aria-label={`Pojišťovna varianty ${index + 1}`} maxLength={160} value={variant.insurer.name} onChange={(event) => updateVariant(variant.id, (current) => ({ ...current, insurer: { ...current.insurer, name: event.target.value, shortName: event.target.value.split(" ")[0] || event.target.value } }))} />
                        <div className={styles.inlineFields}>
                          <input maxLength={120} value={variant.product} aria-label="Produkt" onChange={(event) => updateVariant(variant.id, (current) => ({ ...current, product: event.target.value }))} />
                          <input maxLength={180} value={variant.packageName} aria-label="Varianta" onChange={(event) => updateVariant(variant.id, (current) => ({ ...current, packageName: event.target.value }))} />
                        </div>
                      </div>
                      <label className={styles.priceField}><span>Ročně</span><div><input type="number" min={0} step={1} value={variant.annualPremium.amount} onChange={(event) => updateVariant(variant.id, (current) => ({ ...current, annualPremium: { ...current.annualPremium, amount: Math.max(0, Number(event.target.value) || 0) } }))} /><b>Kč</b></div></label>
                      <button className={styles.iconButton} onClick={() => removeVariant(variant.id)} disabled={offer.variants.length <= 1} aria-label={`Odstranit ${variant.insurer.shortName}`}><AppIcon name="trash" /></button>
                    </div>

                    <div className={styles.sectionStatusGrid}>
                      <label><span>Nemovitost</span><select value={variant.building?.status ?? "unknown"} data-status={variant.building?.status ?? "unknown"} onChange={(event) => updateVariant(variant.id, (current) => ({ ...current, building: { ...(current.building ?? createEmptyBuildingSection()), status: event.target.value as CoverageStatus }, coverages: current.coverages.map((item) => item.id === "building-insurance" ? { ...item, status: event.target.value as CoverageStatus } : item) }))}>{(Object.keys(COVERAGE_LABEL) as CoverageStatus[]).map((status) => <option key={status} value={status}>{COVERAGE_LABEL[status]}</option>)}</select></label>
                      <label><span>Domácnost</span><select value={variant.household.status} data-status={variant.household.status} onChange={(event) => updateVariant(variant.id, (current) => ({ ...current, household: { ...current.household, status: event.target.value as CoverageStatus } }))}>{(Object.keys(COVERAGE_LABEL) as CoverageStatus[]).map((status) => <option key={status} value={status}>{COVERAGE_LABEL[status]}</option>)}</select></label>
                      <label><span>Odpovědnost</span><select value={variant.liability.status} data-status={variant.liability.status} onChange={(event) => updateVariant(variant.id, (current) => ({ ...current, liability: { ...current.liability, status: event.target.value as CoverageStatus } }))}>{(Object.keys(COVERAGE_LABEL) as CoverageStatus[]).map((status) => <option key={status} value={status}>{COVERAGE_LABEL[status]}</option>)}</select></label>
                    </div>

                    <div className={styles.metricGrid}>
                      <label><span>Pojistná částka nemovitost</span><div><input type="number" min={0} step={1} value={variant.building?.sumInsured.amount ?? 0} onChange={(event) => updateVariant(variant.id, (current) => ({ ...current, building: { ...(current.building ?? createEmptyBuildingSection()), sumInsured: { ...(current.building?.sumInsured ?? { currency: "CZK" as const }), amount: Math.max(0, Number(event.target.value) || 0) } } }))} /><b>Kč</b></div></label>
                      <label><span>Spoluúčast nemovitost</span><div><input type="number" min={0} step={1} value={fixedAmount(variant.building?.deductible)} onChange={(event) => updateVariant(variant.id, (current) => { const amount = Math.max(0, Number(event.target.value) || 0); return { ...current, building: { ...(current.building ?? createEmptyBuildingSection()), deductible: { kind: amount === 0 ? "none" : "fixed", amount: { amount, currency: "CZK" } } } }; })} /><b>Kč</b></div></label>
                      <label><span>Pojistná částka domácnost</span><div><input type="number" min={0} step={1} value={variant.household.sumInsured.amount} onChange={(event) => updateVariant(variant.id, (current) => ({ ...current, household: { ...current.household, sumInsured: { ...current.household.sumInsured, amount: Math.max(0, Number(event.target.value) || 0) } } }))} /><b>Kč</b></div></label>
                      <label><span>Spoluúčast domácnost</span><div><input type="number" min={0} step={1} value={fixedAmount(variant.household.deductible)} onChange={(event) => updateVariant(variant.id, (current) => { const amount = Math.max(0, Number(event.target.value) || 0); return { ...current, household: { ...current.household, deductible: { kind: amount === 0 ? "none" : "fixed", amount: { amount, currency: "CZK" } } } }; })} /><b>Kč</b></div></label>
                      <label><span>Limit odpovědnosti</span><div><input type="number" min={0} step={1} value={fixedAmount(variant.liability.limit)} onChange={(event) => updateVariant(variant.id, (current) => ({ ...current, liability: { ...current.liability, limit: { ...current.liability.limit, kind: "fixed", amount: { amount: Math.max(0, Number(event.target.value) || 0), currency: "CZK" } } } }))} /><b>Kč</b></div></label>
                      <label><span>Spoluúčast odpovědnost</span><div><input type="number" min={0} step={1} value={fixedAmount(variant.liability.deductible)} onChange={(event) => updateVariant(variant.id, (current) => { const amount = Math.max(0, Number(event.target.value) || 0); return { ...current, liability: { ...current.liability, deductible: { kind: amount === 0 ? "none" : "fixed", amount: { amount, currency: "CZK" } } } }; })} /><b>Kč</b></div></label>
                    </div>

                    <div className={styles.coverageEditor}>
                      <div className={styles.coverageHeader}><span>Krytí</span><span>Stav dle kalkulace</span></div>
                      {variant.coverages.map((coverage) => (
                        <label key={coverage.id}>
                          <span>{coverage.label}</span>
                          <select
                            value={coverage.status}
                            data-status={coverage.status}
                            onChange={(event) => updateVariant(variant.id, (current) => ({
                              ...current,
                              coverages: current.coverages.map((item) => item.id === coverage.id ? { ...item, status: event.target.value as CoverageStatus } : item),
                              ...(coverage.id === "building-insurance"
                                ? { building: { ...(current.building ?? createEmptyBuildingSection()), status: event.target.value as CoverageStatus } }
                                : {}),
                            }))}
                          >
                            {(Object.keys(COVERAGE_LABEL) as CoverageStatus[]).map((status) => <option key={status} value={status}>{COVERAGE_LABEL[status]}</option>)}
                          </select>
                        </label>
                      ))}
                    </div>

                    <div className={styles.notesGrid}>
                      <label><span>Silné stránky · každý bod na nový řádek</span><textarea rows={3} maxLength={1500} value={variant.highlights.join("\n")} onChange={(event) => updateVariant(variant.id, (current) => ({ ...current, highlights: event.target.value.split("\n").map((value) => value.trim()).filter(Boolean) }))} /></label>
                      <label><span>Mezery v krytí · každý bod na nový řádek</span><textarea rows={3} maxLength={1500} value={variant.gaps.join("\n")} onChange={(event) => updateVariant(variant.id, (current) => ({ ...current, gaps: event.target.value.split("\n").map((value) => value.trim()).filter(Boolean) }))} /></label>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>
        </main>
      ) : (
        <main className={styles.previewWorkspace}>
          <section className={styles.outputToolbar}>
            <div>
              <span className={styles.kicker}>Klientský výstup</span>
              <h2>Stejná data pro odkaz i PDF</h2>
            </div>
            <div className={styles.shareControls}>
              <label><span>Platnost odkazu</span><select value={shareDays} onChange={(event) => setShareDays(Number(event.target.value))}><option value={7}>7 dní</option><option value={30}>30 dní</option><option value={90}>90 dní</option></select></label>
              <button className={styles.outlineButton} onClick={downloadPdf} disabled={busy === "pdf"}><AppIcon name="download" /> {busy === "pdf" ? "Generuji…" : "Stáhnout PDF"}</button>
              <button className={styles.primaryButton} onClick={publishOffer} disabled={busy === "publish"}><AppIcon name="link" /> {busy === "publish" ? "Šifruji…" : "Vytvořit odkaz"}</button>
            </div>
          </section>

          {publication && (
            <section className={styles.publicationBar}>
              <div>
                <span>Aktivní odkaz do {new Date(publication.expiresAt).toLocaleDateString("cs-CZ")}</span>
                {publication.url ? (
                  <a href={publication.url} target="_blank" rel="noreferrer">{publication.url}</a>
                ) : (
                  <p>Odkaz ani šifrovací klíč se z bezpečnostních důvodů v prohlížeči neukládají. Stále jej můžete zneplatnit.</p>
                )}
              </div>
              <div>{publication.url && <button className={styles.quietLightButton} onClick={() => navigator.clipboard.writeText(publication.url!)}>Kopírovat</button>}<button className={styles.dangerButton} onClick={revokePublication} disabled={busy === "revoke"}>Zneplatnit</button></div>
            </section>
          )}

          <div className={styles.previewShell}>
            <div className={styles.previewLabel}>Živý náhled · 3 strany A4</div>
            <div ref={documentRootRef}>
              <PropertyOfferDocument offer={offer} mode="screen" />
            </div>
          </div>
        </main>
      )}
    </div>
    </ModuleShell>
  );
}
