import type { ReactNode } from "react";

import {
  formatCoverageLimit,
  formatCurrency,
  formatDate,
  formatDeductible,
  getCoverageStateLabel,
  getTerritoryLabel,
  type CoverageItem,
  type CoverageStatus,
  type OfferVariant,
  type PropertyOffer,
  type SourceDocument,
  type SourceRef,
} from "@/lib/property-offer";

import styles from "./PropertyOfferDocument.module.css";

export interface PropertyOfferDocumentProps {
  offer: PropertyOffer;
  mode?: "screen" | "pdf";
}

type IconName =
  | "advisor"
  | "alert"
  | "calendar"
  | "document"
  | "home"
  | "liability"
  | "shield"
  | "spark";

const OBJECT_TYPE_LABELS = {
  apartment: "Byt",
  house: "Rodinný dům",
  other: "Nemovitost",
} as const;

const OCCUPANCY_LABELS = {
  permanent: "trvale obývaný",
  recreational: "rekreačně užívaný",
  unknown: "způsob užívání neuveden",
} as const;

const STATUS_SYMBOLS: Record<CoverageStatus, string> = {
  included: "✓",
  excluded: "—",
  unknown: "?",
};

const STATUS_CLASSES: Record<CoverageStatus, string> = {
  included: styles.statusIncluded,
  excluded: styles.statusExcluded,
  unknown: styles.statusUnknown,
};

function classNames(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

function validityLabel(variant: OfferVariant): string {
  if (variant.validity.validUntil) {
    return `do ${formatDate(variant.validity.validUntil)}`;
  }

  return variant.validity.note || "ve zdroji neuvedena";
}

function compactCoverageDetail(item: CoverageItem): string | null {
  if (item.status !== "included") return null;

  if (item.deductible?.note) {
    return `Spoluúčast ${formatDeductible(item.deductible)}`;
  }

  const detail = item.limit
    ? formatCoverageLimit(item.limit)
    : item.territory
      ? getTerritoryLabel(item.territory)
      : item.details[0];

  return detail || null;
}

const SALIENT_COVERAGE_IDS = [
  "building-insurance",
  "basic-perils",
  "water-damage",
  "flood-inundation",
  "atmospheric-precipitation",
  "burglary-robbery",
  "glass",
  "electrical-risks",
  "lost-water",
  "civil-liability",
] as const;

function normalizedCoverageRows(variants: OfferVariant[]): CoverageItem[] {
  const rows = new Map<string, CoverageItem>();

  for (const variant of variants) {
    for (const coverage of variant.coverages) {
      if (!rows.has(coverage.id)) rows.set(coverage.id, coverage);
    }
  }

  return SALIENT_COVERAGE_IDS.flatMap((id) => {
    const row = rows.get(id);
    return row ? [row] : [];
  });
}

function buildingStatus(variant: OfferVariant): CoverageStatus {
  return variant.building?.status ?? "unknown";
}

function buildingPrimaryLabel(variant: OfferVariant): string {
  const building = variant.building;

  if (!building || building.status === "unknown") return "Neuvedeno";
  if (building.status === "excluded") return "Nesjednáno";

  return formatCurrency(building.sumInsured);
}

function buildingDeductibleLabel(variant: OfferVariant): string | null {
  const building = variant.building;
  if (!building || building.status !== "included") return null;

  return `spoluúčast ${formatDeductible(building.deductible)}`;
}

function buildingMatrixDetail(variant: OfferVariant): string | null {
  const building = variant.building;
  if (!building || building.status !== "included") return null;

  return `${formatCurrency(building.sumInsured)} · ${formatDeductible(building.deductible)}`;
}

function sourceForRef(
  ref: SourceRef | undefined,
  sources: SourceDocument[],
): SourceDocument | undefined {
  return ref ? sources.find((source) => source.id === ref.documentId) : undefined;
}

function sourceLabelForVariant(
  variant: OfferVariant,
  sources: SourceDocument[],
): string {
  const reference = variant.sourceRefs[0] ?? variant.validity.sourceRefs[0];
  return sourceForRef(reference, sources)?.fileName ?? "Zdrojová kalkulace";
}

function referenceLabel(refs: SourceRef[], sources: SourceDocument[]): string {
  const seenDocuments = new Set<string>();
  const references = refs.filter((ref) => {
    if (seenDocuments.has(ref.documentId)) return false;
    seenDocuments.add(ref.documentId);
    return true;
  }).slice(0, 3).map((ref) => {
    const source = sourceForRef(ref, sources);
    const documentName = source?.fileName ?? ref.documentId;
    return `${documentName}, str. ${ref.page}`;
  });

  return references.length ? references.join("; ") : "viz zdrojová nabídka";
}

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const commonProps = {
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

  switch (name) {
    case "advisor":
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
          <path d="m16.5 11.8 1.4 1.4 2.6-2.8" />
        </svg>
      );
    case "alert":
      return (
        <svg {...commonProps}>
          <path d="M10.3 4.2 2.7 18a2 2 0 0 0 1.8 3h15a2 2 0 0 0 1.8-3L13.7 4.2a2 2 0 0 0-3.4 0Z" />
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...commonProps}>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M16 3v4M8 3v4M3 10h18" />
        </svg>
      );
    case "document":
      return (
        <svg {...commonProps}>
          <path d="M6 2h8l4 4v16H6z" />
          <path d="M14 2v5h5M9 12h6M9 16h6" />
        </svg>
      );
    case "home":
      return (
        <svg {...commonProps}>
          <path d="m3 11 9-8 9 8" />
          <path d="M5 10v11h14V10M9 21v-7h6v7" />
        </svg>
      );
    case "liability":
      return (
        <svg {...commonProps}>
          <path d="M12 22s8-3.8 8-10V5l-8-3-8 3v7c0 6.2 8 10 8 10Z" />
          <path d="M9 12h6M12 9v6" />
        </svg>
      );
    case "shield":
      return (
        <svg {...commonProps}>
          <path d="M12 22s8-3.8 8-10V5l-8-3-8 3v7c0 6.2 8 10 8 10Z" />
          <path d="m8.5 12 2.2 2.2 4.8-5" />
        </svg>
      );
    case "spark":
      return (
        <svg {...commonProps}>
          <path d="m12 2 1.4 4.6L18 8l-4.6 1.4L12 14l-1.4-4.6L6 8l4.6-1.4Z" />
          <path d="m18.5 14 .8 2.7 2.7.8-2.7.8-.8 2.7-.8-2.7-2.7-.8 2.7-.8Z" />
          <path d="m5 14 .7 2.3L8 17l-2.3.7L5 20l-.7-2.3L2 17l2.3-.7Z" />
        </svg>
      );
  }
}

function Brand() {
  return (
    <div className={styles.brand} aria-label="LIMMIT">
      <span className={styles.brandMark} aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </span>
      <span className={styles.brandWord}>LIMMIT</span>
    </div>
  );
}

function PageShell({
  children,
  generatedAt,
  label,
  number,
  offerId,
}: {
  children: ReactNode;
  generatedAt: string;
  label: string;
  number: number;
  offerId: string;
}) {
  return (
    <section
      className={classNames(styles.page, "offer-pdf-page")}
      aria-labelledby={`offer-page-${number}-heading`}
      data-offer-page={number}
    >
      <header className={styles.pageHeader}>
        <Brand />
        <div className={styles.documentKind}>Rozhodovací brief poradce</div>
        <div className={styles.pageLabel}>{label}</div>
      </header>

      <div className={styles.pageContent}>{children}</div>

      <footer className={styles.pageFooter}>
        <span>
          Nabídka <strong>{offerId}</strong> · vytvořeno {formatDate(generatedAt)}
        </span>
        <span>
          Důvěrné · <strong>{number} / 3</strong>
        </span>
      </footer>
    </section>
  );
}

function CoverageStatusBadge({
  label: labelOverride,
  status,
}: {
  label?: string;
  status: CoverageStatus;
}) {
  const label = labelOverride ?? getCoverageStateLabel(status);

  return (
    <span
      className={classNames(styles.statusBadge, STATUS_CLASSES[status])}
      aria-label={`Stav krytí: ${label}`}
    >
      <span className={styles.statusIcon} aria-hidden="true">
        {STATUS_SYMBOLS[status]}
      </span>
      <span>{label}</span>
    </span>
  );
}

function OfferSummaryCard({
  index,
  recommended,
  variant,
}: {
  index: number;
  recommended: boolean;
  variant: OfferVariant;
}) {
  return (
    <article
      className={classNames(
        styles.offerCard,
        recommended && styles.offerCardRecommended,
      )}
      aria-label={`${variant.insurer.name}, ${variant.packageName}${recommended ? ", doporučená varianta" : ""}`}
    >
      {recommended ? (
        <div className={styles.recommendedFlag}>
          <Icon name="spark" size={11} />
          Doporučujeme
        </div>
      ) : null}

      <div className={styles.insurerRow}>
        <span className={styles.insurerName}>{variant.insurer.shortName}</span>
        <span className={styles.rank}>0{index + 1}</span>
      </div>
      <p className={styles.productName}>
        {variant.product} · {variant.packageName}
      </p>

      <div className={styles.price}>
        <strong>{formatCurrency(variant.annualPremium)}</strong>
        <span>/ rok</span>
      </div>

      <div className={styles.miniFacts}>
        <div className={classNames(styles.miniFact, styles.buildingFact)}>
          <Icon name="home" size={14} />
          <span>
            Nemovitost <strong>{buildingPrimaryLabel(variant)}</strong>
            {buildingDeductibleLabel(variant) ? (
              <small>{buildingDeductibleLabel(variant)}</small>
            ) : null}
          </span>
        </div>
        <div className={styles.miniFact}>
          <Icon name="home" size={14} />
          <span>
            Domácnost <strong>{formatCurrency(variant.household.sumInsured)}</strong>
          </span>
        </div>
        <div className={styles.miniFact}>
          <Icon name="liability" size={14} />
          <span>
            Odpovědnost <strong>{formatCoverageLimit(variant.liability.limit)}</strong>
          </span>
        </div>
        <div className={styles.miniFact}>
          <Icon name="shield" size={14} />
          <span>
            Spoluúčast <strong>{formatDeductible(variant.household.deductible)}</strong>
          </span>
        </div>
        <div className={styles.miniFact}>
          <Icon name="calendar" size={14} />
          <span>
            Platnost <strong>{validityLabel(variant)}</strong>
          </span>
        </div>
      </div>
    </article>
  );
}

function CoverageMatrix({
  rows,
  variants,
  recommendedId,
}: {
  rows: CoverageItem[];
  variants: OfferVariant[];
  recommendedId: string;
}) {
  return (
    <>
      <div className={styles.matrixWrap}>
        <table className={styles.matrix}>
          <caption>
            Srovnání rozsahu krytí mezi nabízenými variantami pojištění
          </caption>
          <thead>
            <tr>
              <th scope="col">Riziko nebo služba</th>
              {variants.map((variant) => (
                <th
                  key={variant.id}
                  className={
                    variant.id === recommendedId ? styles.recommendedColumn : undefined
                  }
                  scope="col"
                >
                  <span>{variant.insurer.shortName}</span>
                  <strong>{variant.packageName}</strong>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <th scope="row">{row.label}</th>
                {variants.map((variant) => {
                  const item = variant.coverages.find((coverage) => coverage.id === row.id);
                  const isBuilding = row.id === "building-insurance";
                  const status = isBuilding
                    ? buildingStatus(variant)
                    : item?.status ?? "unknown";
                  const detail = isBuilding
                    ? buildingMatrixDetail(variant)
                    : item
                      ? compactCoverageDetail(item)
                      : null;

                  return (
                    <td
                      key={variant.id}
                      className={
                        variant.id === recommendedId
                          ? styles.recommendedColumn
                          : undefined
                      }
                    >
                      <div className={styles.matrixCell}>
                        <CoverageStatusBadge
                          label={isBuilding && status === "excluded" ? "Nesjednáno" : undefined}
                          status={status}
                        />
                        {detail ? <span className={styles.matrixLimit}>{detail}</span> : null}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={styles.matrixMobile} aria-label="Srovnání krytí pro mobilní zobrazení">
        {variants.map((variant) => (
          <section className={styles.mobileCoverageCard} key={variant.id}>
            <h3>
              {variant.insurer.shortName} · {variant.packageName}
            </h3>
            {rows.map((row) => {
              const item = variant.coverages.find((coverage) => coverage.id === row.id);
              const isBuilding = row.id === "building-insurance";
              const status = isBuilding
                ? buildingStatus(variant)
                : item?.status ?? "unknown";
              const detail = isBuilding
                ? buildingMatrixDetail(variant)
                : item
                  ? compactCoverageDetail(item)
                  : null;

              return (
                <div className={styles.mobileCoverageRow} key={row.id}>
                  <span>
                    <strong>{row.label}</strong>
                    {detail ? <small>{detail}</small> : null}
                  </span>
                  <CoverageStatusBadge
                    label={isBuilding && status === "excluded" ? "Nesjednáno" : undefined}
                    status={status}
                  />
                </div>
              );
            })}
          </section>
        ))}
      </div>
    </>
  );
}

function VariantDetail({
  recommended,
  sources,
  variant,
}: {
  recommended: boolean;
  sources: SourceDocument[];
  variant: OfferVariant;
}) {
  const exceptionalDeductible = variant.coverages.find(
    (coverage) => coverage.status === "included" && coverage.deductible?.note,
  );
  const namedLimits = variant.household.limits.slice(
    0,
    exceptionalDeductible ? 1 : 2,
  );
  const fallbacks = variant.coverages
    .filter((coverage) => coverage.status === "included" && coverage.limit)
    .slice(0, Math.max(0, 2 - namedLimits.length));

  return (
    <article className={styles.variantDetail}>
      <div
        className={classNames(
          styles.variantIdentity,
          recommended && styles.variantIdentityRecommended,
        )}
      >
        <div>
          <span>{recommended ? "Doporučená varianta" : "Srovnávaná varianta"}</span>
          <h3>
            {variant.insurer.shortName}
            <br />
            {variant.packageName}
          </h3>
          <p>{variant.product}</p>
        </div>
        <div className={styles.detailPrice}>
          <strong>{formatCurrency(variant.annualPremium)}</strong>
          <small>roční pojistné</small>
        </div>
      </div>

      <div className={styles.variantCore}>
        <h4 className={styles.detailHeading}>
          <Icon name="document" size={13} />
          Parametry nabídky
        </h4>
        <div className={styles.coreMetrics}>
          <div className={styles.coreMetric}>
            <span>Nemovitost / budova</span>
            <strong>{buildingPrimaryLabel(variant)}</strong>
            {buildingDeductibleLabel(variant) ? (
              <small>{buildingDeductibleLabel(variant)}</small>
            ) : null}
          </div>
          <div className={styles.coreMetric}>
            <span>Domácnost</span>
            <strong>{formatCurrency(variant.household.sumInsured)}</strong>
            <small>spoluúčast {formatDeductible(variant.household.deductible)}</small>
          </div>
          <div className={styles.coreMetric}>
            <span>Odpovědnost</span>
            <strong>{formatCoverageLimit(variant.liability.limit)}</strong>
          </div>
          <div className={styles.coreMetric}>
            <span>Nabídka platí</span>
            <strong>{validityLabel(variant)}</strong>
          </div>
        </div>
        <ul className={styles.detailList}>
          {exceptionalDeductible?.deductible ? (
            <li>
              {exceptionalDeductible.label}:{" "}
              <strong>
                spoluúčast {formatDeductible(exceptionalDeductible.deductible)}
              </strong>
            </li>
          ) : null}
          {namedLimits.map((limit) => (
            <li key={limit.id}>
              {limit.label}: <strong>{formatCoverageLimit(limit.limit)}</strong>
            </li>
          ))}
          {fallbacks.map((coverage) => (
            <li key={coverage.id}>
              {coverage.label}: <strong>{formatCoverageLimit(coverage.limit!)}</strong>
            </li>
          ))}
        </ul>
      </div>

      <div className={styles.variantAssessment}>
        <div className={styles.assessmentGroup}>
          <div className={styles.assessmentLabel}>
            <Icon name="shield" size={12} />
            Silné stránky
          </div>
          <ul className={styles.detailList}>
            {(variant.highlights.length ? variant.highlights : ["Rozsah dle zdrojové nabídky"])
              .slice(0, 2)
              .map((highlight) => (
                <li key={highlight}>{highlight}</li>
              ))}
          </ul>
        </div>
        <div className={styles.assessmentGroup}>
          <div
            className={classNames(
              styles.assessmentLabel,
              styles.assessmentLabelCaution,
            )}
          >
            <Icon name="alert" size={12} />
            Co pohlídat
          </div>
          <ul className={styles.detailList}>
            {(variant.gaps.length ? variant.gaps : ["Ověřit finální znění smlouvy"])
              .slice(0, 2)
              .map((gap) => (
                <li key={gap}>{gap}</li>
              ))}
          </ul>
          <span className={styles.visuallyHidden}>
            Zdroj: {sourceLabelForVariant(variant, sources)}
          </span>
        </div>
      </div>
    </article>
  );
}

export function PropertyOfferDocument({
  offer,
  mode = "screen",
}: PropertyOfferDocumentProps) {
  const variants = offer.variants.slice(0, 3);
  const recommendedVariant =
    variants.find((variant) => variant.id === offer.recommendation.variantId) ??
    variants[0];
  const coverageRows = normalizedCoverageRows(variants);
  const location = offer.insuredLocation;
  const address = `${location.addressLine}, ${location.postalCode} ${location.city}`;
  const decisionPoints = [
    ...offer.recommendation.rationale.slice(0, 2),
    ...offer.recommendation.caveats.slice(0, 1).map((caveat) => `Pohlídat: ${caveat}`),
  ].slice(0, 3);

  return (
    <article
      className={styles.document}
      data-mode={mode}
      aria-label={`Nabídka pojištění pro ${offer.client.name}`}
    >
      <div className={styles.pages}>
        <PageShell
          generatedAt={offer.generatedAt}
          label="01 · Rozhodnutí"
          number={1}
          offerId={offer.id}
        >
          <div className={styles.hero}>
            <div>
              <p className={styles.eyebrow}>Nabídka pojištění majetku</p>
              <h1 id="offer-page-1-heading">Jasné srovnání pro klidné rozhodnutí</h1>
              <p className={styles.heroIntro}>
                Nemovitost, domácnost, odpovědnost a asistence v jednom přehledu.
                Částky jsme sjednotili tak, aby byly nabídky čitelné vedle sebe.
              </p>
            </div>
            <div className={styles.heroMetric}>
              <span>Srovnáváme</span>
              <strong>{variants.length}</strong>
              <small>{variants.length === 1 ? "variantu" : "varianty pojištění"}</small>
            </div>
          </div>

          <div className={styles.contextGrid}>
            <div className={styles.contextBlock}>
              <span className={styles.metaLabel}>Klient</span>
              <strong>{offer.client.name}</strong>
              <small>individuální nabídka</small>
            </div>
            <div className={styles.contextBlock}>
              <span className={styles.metaLabel}>Místo pojištění</span>
              <strong>{address}</strong>
              <small>
                {OBJECT_TYPE_LABELS[location.objectType]} · {OCCUPANCY_LABELS[location.occupancy]}
                {location.floor ? ` · ${location.floor}` : ""}
                {location.floorAreaM2 ? ` · ${location.floorAreaM2} m²` : ""}
              </small>
            </div>
          </div>

          <section className={styles.recommendation} aria-label="Doporučení poradce">
            <div className={styles.recommendationIcon}>
              <Icon name="spark" size={22} />
            </div>
            <div className={styles.recommendationCopy}>
              <p className={styles.eyebrow}>Doporučení poradce</p>
              <h2>{offer.recommendation.label}</h2>
              <p>{offer.recommendation.summary}</p>
            </div>
            <div className={styles.recommendationVariant}>
              <span>Naše volba</span>
              <strong>
                {recommendedVariant
                  ? `${recommendedVariant.insurer.shortName} · ${recommendedVariant.packageName}`
                  : "Vybereme společně"}
              </strong>
            </div>
          </section>

          <div className={styles.offerGrid} aria-label="Přehled nabízených variant">
            {variants.map((variant, index) => (
              <OfferSummaryCard
                index={index}
                key={variant.id}
                recommended={variant.id === offer.recommendation.variantId}
                variant={variant}
              />
            ))}
          </div>

          <section className={styles.decisionStrip} aria-label="Hlavní důvody doporučení">
            <h3>Proč tato volba</h3>
            <ol>
              {(decisionPoints.length
                ? decisionPoints
                : ["Rozsah a parametry společně ověříme před sjednáním."]
              ).map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ol>
          </section>
        </PageShell>

        <PageShell
          generatedAt={offer.generatedAt}
          label="02 · Srovnání"
          number={2}
          offerId={offer.id}
        >
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>Rozsah krytí</p>
              <h2 id="offer-page-2-heading">Co jednotlivé varianty opravdu obsahují</h2>
            </div>
            <p>
              „Neuvedeno“ neznamená automaticky výluku. Označuje údaj, který je
              potřeba před sjednáním potvrdit v podmínkách nebo s pojišťovnou.
            </p>
          </div>

          <div className={styles.legend} aria-label="Legenda stavů krytí">
            <CoverageStatusBadge status="included" />
            <CoverageStatusBadge status="excluded" />
            <CoverageStatusBadge status="unknown" />
          </div>

          <CoverageMatrix
            recommendedId={offer.recommendation.variantId}
            rows={coverageRows}
            variants={variants}
          />

          <div className={styles.matrixNote}>
            <section className={styles.noteCard}>
              <h3>Cena, částka a spoluúčast</h3>
              <ul>
                {variants.map((variant) => (
                  <li key={variant.id}>
                    <strong>{variant.insurer.shortName}:</strong>{" "}
                    {formatCurrency(variant.annualPremium)} ročně · domácnost{" "}
                    {formatCurrency(variant.household.sumInsured)} ·{" "}
                    {formatDeductible(variant.household.deductible)} · nemovitost{" "}
                    {buildingPrimaryLabel(variant)}
                    {buildingDeductibleLabel(variant)
                      ? ` · ${buildingDeductibleLabel(variant)}`
                      : ""}
                  </li>
                ))}
              </ul>
            </section>
            <section className={styles.noteCard}>
              <h3>Odpovědnost a asistence</h3>
              <ul>
                {variants.map((variant) => (
                  <li key={variant.id}>
                    <strong>{variant.insurer.shortName}:</strong> odpovědnost{" "}
                    {formatCoverageLimit(variant.liability.limit)} · asistence{" "}
                    {getCoverageStateLabel(variant.assistance.status).toLocaleLowerCase("cs")}
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </PageShell>

        <PageShell
          generatedAt={offer.generatedAt}
          label="03 · Detaily"
          number={3}
          offerId={offer.id}
        >
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>Přesné parametry</p>
              <h2 id="offer-page-3-heading">Detail po variantách a zdroje údajů</h2>
            </div>
            <p>
              Zde jsou klíčové limity, platnost kalkulací a body, které stojí za
              kontrolu před finálním sjednáním.
            </p>
          </div>

          <div className={styles.detailStack}>
            {variants.map((variant) => (
              <VariantDetail
                key={variant.id}
                recommended={variant.id === offer.recommendation.variantId}
                sources={offer.sourceDocuments}
                variant={variant}
              />
            ))}
          </div>

          <div className={styles.lowerGrid}>
            <section className={styles.sourcePanel}>
              <p className={styles.eyebrow}>Dohledatelnost</p>
              <h3>Podklady použité pro srovnání</h3>
              <ol className={styles.sourceList}>
                {offer.sourceDocuments.slice(0, 4).map((source, index) => (
                  <li key={source.id}>
                    <span className={styles.sourceNumber}>{index + 1}</span>
                    <span>
                      <strong>{source.fileName}</strong>
                      {source.insurer} · {source.pageCount} str.
                      {source.createdAt ? ` · ${formatDate(source.createdAt)}` : ""}
                    </span>
                  </li>
                ))}
              </ol>
              <p className={styles.disclaimer}>
                Doporučení vychází z dodaných kalkulací. Při rozporu mají přednost
                originální nabídky, pojistné podmínky a finální pojistná smlouva.
                Konkrétní odkazy: {referenceLabel(offer.recommendation.sourceRefs, offer.sourceDocuments)}.
              </p>
            </section>

            <aside className={styles.advisorCard} aria-label="Kontakt na poradce">
              <p className={styles.eyebrow}>Váš poradce</p>
              <h2>{offer.advisor.name}</h2>
              <p>Pojišťovací specialista · {offer.advisor.company}</p>
              <div className={styles.advisorMeta}>
                <span>
                  <Icon name="advisor" size={13} />
                  {offer.advisor.phone}
                </span>
                <span>
                  <Icon name="document" size={13} />
                  {offer.advisor.email}
                </span>
              </div>
              <p className={styles.disclaimer}>
                Rád s vámi projdu rozdíly, ověřím otevřené body a připravím finální
                sjednání vybrané varianty.
              </p>
            </aside>
          </div>
        </PageShell>
      </div>
    </article>
  );
}
