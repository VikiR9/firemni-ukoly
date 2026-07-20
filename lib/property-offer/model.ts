/**
 * Stable wire format for client-facing property insurance offers.
 *
 * Breaking changes require a new schemaVersion. The model intentionally does
 * not contain a birth-number/national-ID field; those identifiers do not
 * belong in a shareable offer payload.
 */
export const PROPERTY_OFFER_SCHEMA_VERSION = "property-offer/v1" as const;

export type PropertyOfferSchemaVersion = typeof PROPERTY_OFFER_SCHEMA_VERSION;

export type CoverageStatus = "included" | "excluded" | "unknown";

export type CoverageCategory = "building" | "household" | "liability" | "assistance";

export type CurrencyCode = "CZK";

export interface Money {
  /** Amount in whole currency units. */
  amount: number;
  currency: CurrencyCode;
}

export interface SourceDocument {
  id: string;
  fileName: string;
  insurer: string;
  documentType: "calculation" | "preliminary-offer" | "other";
  pageCount: number;
  createdAt?: string;
}

/** Human-readable reference to a concrete source PDF page. */
export interface SourceRef {
  documentId: string;
  /** One-based PDF page number. */
  page: number;
  label?: string;
}

export type LimitBasis =
  | "insurance-event"
  | "insurance-year"
  | "sum-insured"
  | "service-call"
  | "unspecified";

export interface CoverageLimit {
  kind:
    | "fixed"
    | "percentage-of-sum-insured"
    | "sum-insured"
    | "included"
    | "unknown";
  amount?: Money;
  percentage?: number;
  minimum?: Money;
  basis?: LimitBasis;
  frequencyPerYear?: number;
  maximumDurationMonths?: number;
  note?: string;
}

export interface Deductible {
  kind: "fixed" | "none" | "choice" | "unknown";
  amount?: Money;
  options?: Money[];
  note?: string;
}

export type TerritoryCode = "CZ" | "EUROPE" | "WORLD" | "NOT_STATED" | "CUSTOM";

export interface Territory {
  code: TerritoryCode;
  label: string;
}

export interface NamedLimit {
  id: string;
  label: string;
  limit: CoverageLimit;
  sourceRefs: SourceRef[];
}

export interface CoverageItem {
  id: string;
  category: CoverageCategory;
  label: string;
  status: CoverageStatus;
  limit?: CoverageLimit;
  deductible?: Deductible;
  territory?: Territory;
  details: string[];
  sourceRefs: SourceRef[];
}

export interface QuoteValidity {
  /** ISO 8601 calendar date (YYYY-MM-DD). */
  issuedOn: string;
  /** ISO 8601 calendar date, or null when the source does not state one. */
  validUntil: string | null;
  kind: "until-date" | "period-from-issue" | "not-stated";
  note?: string;
  sourceRefs: SourceRef[];
}

export interface ClientDetails {
  name: string;
  email?: string;
  phone?: string;
  sourceRefs: SourceRef[];
}

export interface AdvisorDetails {
  name: string;
  company: string;
  email: string;
  phone: string;
  sourceRefs: SourceRef[];
}

export interface InsuredLocation {
  addressLine: string;
  postalCode: string;
  city: string;
  unit?: string;
  objectType: "apartment" | "house" | "other";
  occupancy: "permanent" | "recreational" | "unknown";
  floorAreaM2?: number;
  floor?: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
  sourceRefs: SourceRef[];
}

export interface InsurerIdentity {
  id: string;
  name: string;
  shortName: string;
}

export interface PremiumLine {
  id: string;
  label: string;
  annualPremium: Money;
  sourceRefs: SourceRef[];
}

export interface HouseholdSection {
  status: CoverageStatus;
  sumInsured: Money;
  deductible: Deductible;
  /** null means the source explicitly leaves the guarantee unspecified. */
  guaranteedSumInsured: boolean | null;
  limits: NamedLimit[];
  sourceRefs: SourceRef[];
}

export interface BuildingSection {
  status: CoverageStatus;
  sumInsured: Money;
  deductible: Deductible;
  /** null means the source explicitly leaves the guarantee unspecified. */
  guaranteedSumInsured: boolean | null;
  limits: NamedLimit[];
  sourceRefs: SourceRef[];
}

export interface LiabilitySection {
  status: CoverageStatus;
  limit: CoverageLimit;
  deductible: Deductible;
  scopes: CoverageItem[];
  sourceRefs: SourceRef[];
}

export interface AssistanceSection {
  status: CoverageStatus;
  /** null when included without a separately stated premium. */
  annualPremium: Money | null;
  coverages: CoverageItem[];
  sourceRefs: SourceRef[];
}

export interface OfferVariant {
  id: string;
  insurer: InsurerIdentity;
  product: string;
  packageName: string;
  annualPremium: Money;
  premiumBreakdown: PremiumLine[];
  validity: QuoteValidity;
  /** Optional for backward compatibility with property-offer/v1 payloads. */
  building?: BuildingSection;
  household: HouseholdSection;
  liability: LiabilitySection;
  assistance: AssistanceSection;
  /** Normalized comparison rows shared across insurers. */
  coverages: CoverageItem[];
  highlights: string[];
  gaps: string[];
  sourceRefs: SourceRef[];
}

export interface OfferRecommendation {
  variantId: string;
  label: string;
  summary: string;
  rationale: string[];
  caveats: string[];
  sourceRefs: SourceRef[];
}

export interface PropertyOffer {
  schemaVersion: PropertyOfferSchemaVersion;
  id: string;
  title: string;
  /** ISO 8601 calendar date (YYYY-MM-DD). */
  issueDate: string;
  generatedAt: string;
  client: ClientDetails;
  advisor: AdvisorDetails;
  insuredLocation: InsuredLocation;
  sourceDocuments: SourceDocument[];
  variants: OfferVariant[];
  recommendation: OfferRecommendation;
}
