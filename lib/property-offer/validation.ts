import {
  PROPERTY_OFFER_SCHEMA_VERSION,
  type AssistanceSection,
  type BuildingSection,
  type CoverageItem,
  type CoverageLimit,
  type Deductible,
  type HouseholdSection,
  type LiabilitySection,
  type Money,
  type OfferVariant,
  type PropertyOffer,
  type QuoteValidity,
  type SourceRef,
  type Territory,
} from "./model";

export interface PropertyOfferValidationIssue {
  path: string;
  message: string;
}

export interface PropertyOfferValidationResult {
  valid: boolean;
  issues: PropertyOfferValidationIssue[];
}

const FORBIDDEN_PERSONAL_ID_KEYS = new Set([
  "birthnumber",
  "nationalid",
  "personalid",
  "rc",
  "rodnecislo",
  "rodnykod",
  "ssn",
  "socialsecuritynumber",
]);

const MAX_TRAVERSAL_DEPTH = 12;
const MAX_STRING_LENGTH = 5_000;
const MAX_ARRAY_LENGTH = 100;
const MAX_OBJECT_KEYS = 100;

export function validatePropertyOffer(value: unknown): PropertyOfferValidationResult {
  const issues: PropertyOfferValidationIssue[] = [];
  validateTraversalLimits(value, issues);
  if (issues.length > 0) return { valid: false, issues };

  rejectPersonalIdentifiers(value, "$", issues, new Set());

  const offer = record(value, "$", issues);
  if (!offer) return { valid: false, issues };

  literal(offer.schemaVersion, PROPERTY_OFFER_SCHEMA_VERSION, "$.schemaVersion", issues);
  nonEmptyString(offer.id, "$.id", issues);
  nonEmptyString(offer.title, "$.title", issues);
  isoDate(offer.issueDate, "$.issueDate", issues);
  isoDateTime(offer.generatedAt, "$.generatedAt", issues);

  validateClient(offer.client, "$.client", issues);
  validateAdvisor(offer.advisor, "$.advisor", issues);
  validateLocation(offer.insuredLocation, "$.insuredLocation", issues);

  const documents = array(offer.sourceDocuments, "$.sourceDocuments", issues);
  const documentPages = new Map<string, number>();
  if (documents) {
    documents.forEach((item, index) => {
      const path = `$.sourceDocuments[${index}]`;
      const document = record(item, path, issues);
      if (!document) return;
      const id = nonEmptyString(document.id, `${path}.id`, issues);
      nonEmptyString(document.fileName, `${path}.fileName`, issues);
      nonEmptyString(document.insurer, `${path}.insurer`, issues);
      enumValue(document.documentType, ["calculation", "preliminary-offer", "other"], `${path}.documentType`, issues);
      const pageCount = positiveInteger(document.pageCount, `${path}.pageCount`, issues);
      if (document.createdAt != null) isoDateTime(document.createdAt, `${path}.createdAt`, issues);
      if (id && pageCount) {
        if (documentPages.has(id)) issue(issues, `${path}.id`, `Duplicitní ID dokumentu „${id}“.`);
        documentPages.set(id, pageCount);
      }
    });
  }

  const variants = array(offer.variants, "$.variants", issues);
  const variantIds = new Set<string>();
  if (variants) {
    if (variants.length === 0) issue(issues, "$.variants", "Nabídka musí obsahovat alespoň jednu variantu.");
    if (variants.length > 3) issue(issues, "$.variants", "Nabídka může obsahovat nejvýše tři varianty.");
    variants.forEach((item, index) => {
      const variant = validateVariant(item, `$.variants[${index}]`, issues);
      if (!variant) return;
      if (variantIds.has(variant.id)) issue(issues, `$.variants[${index}].id`, `Duplicitní ID varianty „${variant.id}“.`);
      variantIds.add(variant.id);
    });
  }

  validateRecommendation(offer.recommendation, "$.recommendation", issues, variantIds);
  validateAllSourceReferences(value, documentPages, issues);

  return { valid: issues.length === 0, issues };
}

export function isPropertyOffer(value: unknown): value is PropertyOffer {
  return validatePropertyOffer(value).valid;
}

export function assertPropertyOffer(value: unknown): asserts value is PropertyOffer {
  const result = validatePropertyOffer(value);
  if (!result.valid) {
    const details = result.issues.map(({ path, message }) => `${path}: ${message}`).join("\n");
    throw new TypeError(`Neplatný datový formát nabídky majetkového pojištění:\n${details}`);
  }
}

function validateClient(value: unknown, path: string, issues: PropertyOfferValidationIssue[]): void {
  const client = record(value, path, issues);
  if (!client) return;
  nonEmptyString(client.name, `${path}.name`, issues);
  if (client.email != null) nonEmptyString(client.email, `${path}.email`, issues);
  if (client.phone != null) nonEmptyString(client.phone, `${path}.phone`, issues);
  validateSourceRefs(client.sourceRefs, `${path}.sourceRefs`, issues);
}

function validateAdvisor(value: unknown, path: string, issues: PropertyOfferValidationIssue[]): void {
  const advisor = record(value, path, issues);
  if (!advisor) return;
  nonEmptyString(advisor.name, `${path}.name`, issues);
  nonEmptyString(advisor.company, `${path}.company`, issues);
  nonEmptyString(advisor.email, `${path}.email`, issues);
  nonEmptyString(advisor.phone, `${path}.phone`, issues);
  validateSourceRefs(advisor.sourceRefs, `${path}.sourceRefs`, issues);
}

function validateLocation(value: unknown, path: string, issues: PropertyOfferValidationIssue[]): void {
  const location = record(value, path, issues);
  if (!location) return;
  nonEmptyString(location.addressLine, `${path}.addressLine`, issues);
  nonEmptyString(location.postalCode, `${path}.postalCode`, issues);
  nonEmptyString(location.city, `${path}.city`, issues);
  if (location.unit != null) nonEmptyString(location.unit, `${path}.unit`, issues);
  enumValue(location.objectType, ["apartment", "house", "other"], `${path}.objectType`, issues);
  enumValue(location.occupancy, ["permanent", "recreational", "unknown"], `${path}.occupancy`, issues);
  if (location.floorAreaM2 != null) positiveNumber(location.floorAreaM2, `${path}.floorAreaM2`, issues);
  if (location.floor != null) nonEmptyString(location.floor, `${path}.floor`, issues);
  if (location.coordinates != null) {
    const coordinates = record(location.coordinates, `${path}.coordinates`, issues);
    if (coordinates) {
      finiteNumber(coordinates.lat, `${path}.coordinates.lat`, issues, -90, 90);
      finiteNumber(coordinates.lng, `${path}.coordinates.lng`, issues, -180, 180);
    }
  }
  validateSourceRefs(location.sourceRefs, `${path}.sourceRefs`, issues);
}

function validateVariant(
  value: unknown,
  path: string,
  issues: PropertyOfferValidationIssue[],
): OfferVariant | null {
  const variant = record(value, path, issues);
  if (!variant) return null;

  const id = nonEmptyString(variant.id, `${path}.id`, issues);
  const insurer = record(variant.insurer, `${path}.insurer`, issues);
  if (insurer) {
    nonEmptyString(insurer.id, `${path}.insurer.id`, issues);
    nonEmptyString(insurer.name, `${path}.insurer.name`, issues);
    nonEmptyString(insurer.shortName, `${path}.insurer.shortName`, issues);
  }
  nonEmptyString(variant.product, `${path}.product`, issues);
  nonEmptyString(variant.packageName, `${path}.packageName`, issues);
  validateMoney(variant.annualPremium, `${path}.annualPremium`, issues);

  const premiumLines = array(variant.premiumBreakdown, `${path}.premiumBreakdown`, issues);
  if (premiumLines) {
    premiumLines.forEach((item, index) => {
      const linePath = `${path}.premiumBreakdown[${index}]`;
      const line = record(item, linePath, issues);
      if (!line) return;
      nonEmptyString(line.id, `${linePath}.id`, issues);
      nonEmptyString(line.label, `${linePath}.label`, issues);
      validateMoney(line.annualPremium, `${linePath}.annualPremium`, issues);
      validateSourceRefs(line.sourceRefs, `${linePath}.sourceRefs`, issues);
    });
  }

  validateValidity(variant.validity, `${path}.validity`, issues);
  if (variant.building != null) validateBuilding(variant.building, `${path}.building`, issues);
  validateHousehold(variant.household, `${path}.household`, issues);
  validateLiability(variant.liability, `${path}.liability`, issues);
  validateAssistance(variant.assistance, `${path}.assistance`, issues);
  validateCoverageArray(variant.coverages, `${path}.coverages`, issues);
  stringArray(variant.highlights, `${path}.highlights`, issues);
  stringArray(variant.gaps, `${path}.gaps`, issues);
  validateSourceRefs(variant.sourceRefs, `${path}.sourceRefs`, issues);

  return id ? (variant as unknown as OfferVariant) : null;
}

function validateValidity(value: unknown, path: string, issues: PropertyOfferValidationIssue[]): void {
  const validity = record(value, path, issues);
  if (!validity) return;
  isoDate(validity.issuedOn, `${path}.issuedOn`, issues);
  if (validity.validUntil !== null) isoDate(validity.validUntil, `${path}.validUntil`, issues);
  const kind = enumValue(validity.kind, ["until-date", "period-from-issue", "not-stated"], `${path}.kind`, issues);
  if (validity.note != null) nonEmptyString(validity.note, `${path}.note`, issues);
  validateSourceRefs(validity.sourceRefs, `${path}.sourceRefs`, issues);

  if (kind === "until-date" && validity.validUntil === null) {
    issue(issues, `${path}.validUntil`, "Platnost typu until-date vyžaduje koncové datum.");
  }
  if (kind === "not-stated" && validity.validUntil !== null) {
    issue(issues, `${path}.validUntil`, "Neuvedená platnost musí mít validUntil nastaveno na null.");
  }
  if (typeof validity.issuedOn === "string" && typeof validity.validUntil === "string" && validity.validUntil < validity.issuedOn) {
    issue(issues, `${path}.validUntil`, "Konec platnosti nesmí předcházet datu vystavení.");
  }
}

function validateHousehold(value: unknown, path: string, issues: PropertyOfferValidationIssue[]): void {
  const household = record(value, path, issues);
  if (!household) return;
  coverageStatus(household.status, `${path}.status`, issues);
  validateMoney(household.sumInsured, `${path}.sumInsured`, issues);
  validateDeductible(household.deductible, `${path}.deductible`, issues);
  if (household.guaranteedSumInsured !== null && typeof household.guaranteedSumInsured !== "boolean") {
    issue(issues, `${path}.guaranteedSumInsured`, "Očekávána boolean hodnota nebo null.");
  }
  const limits = array(household.limits, `${path}.limits`, issues);
  limits?.forEach((item, index) => {
    const itemPath = `${path}.limits[${index}]`;
    const namedLimit = record(item, itemPath, issues);
    if (!namedLimit) return;
    nonEmptyString(namedLimit.id, `${itemPath}.id`, issues);
    nonEmptyString(namedLimit.label, `${itemPath}.label`, issues);
    validateLimit(namedLimit.limit, `${itemPath}.limit`, issues);
    validateSourceRefs(namedLimit.sourceRefs, `${itemPath}.sourceRefs`, issues);
  });
  validateSourceRefs(household.sourceRefs, `${path}.sourceRefs`, issues);
}

function validateBuilding(value: unknown, path: string, issues: PropertyOfferValidationIssue[]): void {
  const building = record(value, path, issues);
  if (!building) return;
  coverageStatus(building.status, `${path}.status`, issues);
  validateMoney(building.sumInsured, `${path}.sumInsured`, issues);
  validateDeductible(building.deductible, `${path}.deductible`, issues);
  if (building.guaranteedSumInsured !== null && typeof building.guaranteedSumInsured !== "boolean") {
    issue(issues, `${path}.guaranteedSumInsured`, "Očekávána boolean hodnota nebo null.");
  }
  const limits = array(building.limits, `${path}.limits`, issues);
  limits?.forEach((item, index) => {
    const itemPath = `${path}.limits[${index}]`;
    const namedLimit = record(item, itemPath, issues);
    if (!namedLimit) return;
    nonEmptyString(namedLimit.id, `${itemPath}.id`, issues);
    nonEmptyString(namedLimit.label, `${itemPath}.label`, issues);
    validateLimit(namedLimit.limit, `${itemPath}.limit`, issues);
    validateSourceRefs(namedLimit.sourceRefs, `${itemPath}.sourceRefs`, issues);
  });
  validateSourceRefs(building.sourceRefs, `${path}.sourceRefs`, issues);
}

function validateLiability(value: unknown, path: string, issues: PropertyOfferValidationIssue[]): void {
  const liability = record(value, path, issues);
  if (!liability) return;
  coverageStatus(liability.status, `${path}.status`, issues);
  validateLimit(liability.limit, `${path}.limit`, issues);
  validateDeductible(liability.deductible, `${path}.deductible`, issues);
  validateCoverageArray(liability.scopes, `${path}.scopes`, issues);
  validateSourceRefs(liability.sourceRefs, `${path}.sourceRefs`, issues);
}

function validateAssistance(value: unknown, path: string, issues: PropertyOfferValidationIssue[]): void {
  const assistance = record(value, path, issues);
  if (!assistance) return;
  coverageStatus(assistance.status, `${path}.status`, issues);
  if (assistance.annualPremium !== null) validateMoney(assistance.annualPremium, `${path}.annualPremium`, issues);
  validateCoverageArray(assistance.coverages, `${path}.coverages`, issues);
  validateSourceRefs(assistance.sourceRefs, `${path}.sourceRefs`, issues);
}

function validateCoverageArray(value: unknown, path: string, issues: PropertyOfferValidationIssue[]): void {
  const coverages = array(value, path, issues);
  coverages?.forEach((item, index) => validateCoverage(item, `${path}[${index}]`, issues));
}

function validateCoverage(value: unknown, path: string, issues: PropertyOfferValidationIssue[]): void {
  const coverage = record(value, path, issues);
  if (!coverage) return;
  nonEmptyString(coverage.id, `${path}.id`, issues);
  enumValue(coverage.category, ["building", "household", "liability", "assistance"], `${path}.category`, issues);
  nonEmptyString(coverage.label, `${path}.label`, issues);
  coverageStatus(coverage.status, `${path}.status`, issues);
  if (coverage.limit != null) validateLimit(coverage.limit, `${path}.limit`, issues);
  if (coverage.deductible != null) validateDeductible(coverage.deductible, `${path}.deductible`, issues);
  if (coverage.territory != null) validateTerritory(coverage.territory, `${path}.territory`, issues);
  stringArray(coverage.details, `${path}.details`, issues);
  validateSourceRefs(coverage.sourceRefs, `${path}.sourceRefs`, issues);
}

function validateLimit(value: unknown, path: string, issues: PropertyOfferValidationIssue[]): void {
  const limit = record(value, path, issues);
  if (!limit) return;
  const kind = enumValue(
    limit.kind,
    ["fixed", "percentage-of-sum-insured", "sum-insured", "included", "unknown"],
    `${path}.kind`,
    issues,
  );
  if (limit.amount != null) validateMoney(limit.amount, `${path}.amount`, issues);
  if (limit.percentage != null) finiteNumber(limit.percentage, `${path}.percentage`, issues, 0, 100);
  if (limit.minimum != null) validateMoney(limit.minimum, `${path}.minimum`, issues);
  if (limit.basis != null) {
    enumValue(limit.basis, ["insurance-event", "insurance-year", "sum-insured", "service-call", "unspecified"], `${path}.basis`, issues);
  }
  if (limit.frequencyPerYear != null) positiveInteger(limit.frequencyPerYear, `${path}.frequencyPerYear`, issues);
  if (limit.maximumDurationMonths != null) positiveInteger(limit.maximumDurationMonths, `${path}.maximumDurationMonths`, issues);
  if (limit.note != null) nonEmptyString(limit.note, `${path}.note`, issues);
  if (kind === "fixed" && limit.amount == null) issue(issues, `${path}.amount`, "Pevný limit vyžaduje částku.");
  if (kind === "percentage-of-sum-insured" && limit.percentage == null) {
    issue(issues, `${path}.percentage`, "Procentní limit vyžaduje procento.");
  }
}

function validateDeductible(value: unknown, path: string, issues: PropertyOfferValidationIssue[]): void {
  const deductible = record(value, path, issues);
  if (!deductible) return;
  const kind = enumValue(deductible.kind, ["fixed", "none", "choice", "unknown"], `${path}.kind`, issues);
  if (deductible.amount != null) validateMoney(deductible.amount, `${path}.amount`, issues);
  if (deductible.options != null) {
    const options = array(deductible.options, `${path}.options`, issues);
    options?.forEach((option, index) => validateMoney(option, `${path}.options[${index}]`, issues));
  }
  if (deductible.note != null) nonEmptyString(deductible.note, `${path}.note`, issues);
  if (kind === "fixed" && deductible.amount == null) issue(issues, `${path}.amount`, "Pevná spoluúčast vyžaduje částku.");
  if (kind === "choice" && (!Array.isArray(deductible.options) || deductible.options.length === 0)) {
    issue(issues, `${path}.options`, "Volitelná spoluúčast vyžaduje alespoň jednu možnost.");
  }
}

function validateTerritory(value: unknown, path: string, issues: PropertyOfferValidationIssue[]): void {
  const territory = record(value, path, issues);
  if (!territory) return;
  enumValue(territory.code, ["CZ", "EUROPE", "WORLD", "NOT_STATED", "CUSTOM"], `${path}.code`, issues);
  nonEmptyString(territory.label, `${path}.label`, issues);
}

function validateMoney(value: unknown, path: string, issues: PropertyOfferValidationIssue[]): void {
  const money = record(value, path, issues);
  if (!money) return;
  nonNegativeInteger(money.amount, `${path}.amount`, issues);
  literal(money.currency, "CZK", `${path}.currency`, issues);
}

function validateSourceRefs(value: unknown, path: string, issues: PropertyOfferValidationIssue[]): void {
  const refs = array(value, path, issues);
  refs?.forEach((item, index) => {
    const refPath = `${path}[${index}]`;
    const ref = record(item, refPath, issues);
    if (!ref) return;
    nonEmptyString(ref.documentId, `${refPath}.documentId`, issues);
    positiveInteger(ref.page, `${refPath}.page`, issues);
    if (ref.label != null) nonEmptyString(ref.label, `${refPath}.label`, issues);
  });
}

function validateRecommendation(
  value: unknown,
  path: string,
  issues: PropertyOfferValidationIssue[],
  variantIds: Set<string>,
): void {
  const recommendation = record(value, path, issues);
  if (!recommendation) return;
  const variantId = nonEmptyString(recommendation.variantId, `${path}.variantId`, issues);
  nonEmptyString(recommendation.label, `${path}.label`, issues);
  nonEmptyString(recommendation.summary, `${path}.summary`, issues);
  stringArray(recommendation.rationale, `${path}.rationale`, issues);
  stringArray(recommendation.caveats, `${path}.caveats`, issues);
  validateSourceRefs(recommendation.sourceRefs, `${path}.sourceRefs`, issues);
  if (variantId && !variantIds.has(variantId)) {
    issue(issues, `${path}.variantId`, `Doporučená varianta „${variantId}“ v nabídce neexistuje.`);
  }
}

function validateAllSourceReferences(
  value: unknown,
  documentPages: Map<string, number>,
  issues: PropertyOfferValidationIssue[],
): void {
  walk(value, "$", new Set(), (item, path) => {
    if (!isRecord(item) || !("documentId" in item) || !("page" in item)) return;
    const documentId = item.documentId;
    const page = item.page;
    if (typeof documentId !== "string" || !Number.isInteger(page)) return;
    const pageCount = documentPages.get(documentId);
    if (pageCount == null) {
      issue(issues, `${path}.documentId`, `Odkazovaný dokument „${documentId}“ není v sourceDocuments.`);
    } else if ((page as number) > pageCount) {
      issue(issues, `${path}.page`, `Dokument „${documentId}“ má pouze ${pageCount} stran.`);
    }
  });
}

function validateTraversalLimits(
  root: unknown,
  issues: PropertyOfferValidationIssue[],
): void {
  const pending: Array<{ value: unknown; path: string; depth: number }> = [
    { value: root, path: "$", depth: 0 },
  ];
  const seen = new Set<object>();

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) continue;

    const { value, path, depth } = current;
    if (depth > MAX_TRAVERSAL_DEPTH) {
      issue(issues, path, `Datová struktura smí být vnořena nejvýše do ${MAX_TRAVERSAL_DEPTH} úrovní.`);
      continue;
    }

    if (typeof value === "string") {
      if (value.length > MAX_STRING_LENGTH) {
        issue(issues, path, `Text smí obsahovat nejvýše ${MAX_STRING_LENGTH} znaků.`);
      }
      continue;
    }

    if (value === null || typeof value !== "object" || seen.has(value)) continue;
    seen.add(value);

    if (Array.isArray(value)) {
      if (value.length > MAX_ARRAY_LENGTH) {
        issue(issues, path, `Pole smí obsahovat nejvýše ${MAX_ARRAY_LENGTH} položek.`);
      }
      value.slice(0, MAX_ARRAY_LENGTH).forEach((item, index) => {
        pending.push({ value: item, path: `${path}[${index}]`, depth: depth + 1 });
      });
      continue;
    }

    const entries = Object.entries(value);
    if (entries.length > MAX_OBJECT_KEYS) {
      issue(issues, path, `Objekt smí obsahovat nejvýše ${MAX_OBJECT_KEYS} klíčů.`);
    }
    entries.slice(0, MAX_OBJECT_KEYS).forEach(([key, item]) => {
      pending.push({ value: item, path: `${path}.${key}`, depth: depth + 1 });
    });
  }
}

function rejectPersonalIdentifiers(
  value: unknown,
  path: string,
  issues: PropertyOfferValidationIssue[],
  seen: Set<object>,
): void {
  walk(value, path, seen, (item, itemPath) => {
    if (!isRecord(item)) return;
    Object.keys(item).forEach((key) => {
      const normalized = key.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z]/g, "").toLowerCase();
      if (FORBIDDEN_PERSONAL_ID_KEYS.has(normalized)) {
        issue(issues, `${itemPath}.${key}`, "Rodné číslo ani jiný národní osobní identifikátor nesmí být v nabídce uložen.");
      }
    });
  });
}

function walk(
  value: unknown,
  path: string,
  seen: Set<object>,
  visitor: (value: unknown, path: string) => void,
): void {
  visitor(value, path);
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, `${path}[${index}]`, seen, visitor));
    return;
  }
  Object.entries(value).forEach(([key, item]) => walk(item, `${path}.${key}`, seen, visitor));
}

function record(value: unknown, path: string, issues: PropertyOfferValidationIssue[]): Record<string, unknown> | null {
  if (!isRecord(value)) {
    issue(issues, path, "Očekáván objekt.");
    return null;
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function array(value: unknown, path: string, issues: PropertyOfferValidationIssue[]): unknown[] | null {
  if (!Array.isArray(value)) {
    issue(issues, path, "Očekáváno pole.");
    return null;
  }
  return value;
}

function nonEmptyString(value: unknown, path: string, issues: PropertyOfferValidationIssue[]): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    issue(issues, path, "Očekáván neprázdný text.");
    return null;
  }
  return value;
}

function stringArray(value: unknown, path: string, issues: PropertyOfferValidationIssue[]): void {
  const items = array(value, path, issues);
  items?.forEach((item, index) => nonEmptyString(item, `${path}[${index}]`, issues));
}

function coverageStatus(value: unknown, path: string, issues: PropertyOfferValidationIssue[]): void {
  enumValue(value, ["included", "excluded", "unknown"], path, issues);
}

function enumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  path: string,
  issues: PropertyOfferValidationIssue[],
): T | null {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    issue(issues, path, `Očekávána jedna z hodnot: ${allowed.join(", ")}.`);
    return null;
  }
  return value as T;
}

function literal<T extends string>(
  value: unknown,
  expected: T,
  path: string,
  issues: PropertyOfferValidationIssue[],
): T | null {
  if (value !== expected) {
    issue(issues, path, `Očekávána hodnota „${expected}“.`);
    return null;
  }
  return expected;
}

function finiteNumber(
  value: unknown,
  path: string,
  issues: PropertyOfferValidationIssue[],
  minimum = Number.NEGATIVE_INFINITY,
  maximum = Number.POSITIVE_INFINITY,
): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    issue(issues, path, `Očekáváno číslo v rozsahu ${minimum} až ${maximum}.`);
    return null;
  }
  return value;
}

function positiveNumber(value: unknown, path: string, issues: PropertyOfferValidationIssue[]): number | null {
  const result = finiteNumber(value, path, issues, Number.MIN_VALUE);
  return result;
}

function positiveInteger(value: unknown, path: string, issues: PropertyOfferValidationIssue[]): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    issue(issues, path, "Očekáváno kladné celé číslo.");
    return null;
  }
  return value;
}

function nonNegativeInteger(value: unknown, path: string, issues: PropertyOfferValidationIssue[]): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    issue(issues, path, "Očekáváno nezáporné celé číslo.");
    return null;
  }
  return value;
}

function isoDate(value: unknown, path: string, issues: PropertyOfferValidationIssue[]): void {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    issue(issues, path, "Očekáváno datum ve formátu YYYY-MM-DD.");
    return;
  }
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    issue(issues, path, "Datum není platné.");
  }
}

function isoDateTime(value: unknown, path: string, issues: PropertyOfferValidationIssue[]): void {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    issue(issues, path, "Očekáváno platné ISO datum a čas.");
  }
}

function issue(issues: PropertyOfferValidationIssue[], path: string, message: string): void {
  issues.push({ path, message });
}

// Compile-time checks keep validators aligned with the public sections.
void (null as unknown as CoverageItem);
void (null as unknown as CoverageLimit);
void (null as unknown as Deductible);
void (null as unknown as BuildingSection);
void (null as unknown as HouseholdSection);
void (null as unknown as LiabilitySection);
void (null as unknown as AssistanceSection);
void (null as unknown as Money);
void (null as unknown as QuoteValidity);
void (null as unknown as SourceRef);
void (null as unknown as Territory);
