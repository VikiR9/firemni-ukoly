import type {
  CoverageLimit,
  CoverageStatus,
  Deductible,
  Money,
  Territory,
  TerritoryCode,
} from "./model";

const DEFAULT_LOCALE = "cs-CZ";

export function formatCurrency(
  value: Money | number,
  options: { locale?: string; maximumFractionDigits?: number } = {},
): string {
  const amount = typeof value === "number" ? value : value.amount;
  const currency = typeof value === "number" ? "CZK" : value.currency;

  return new Intl.NumberFormat(options.locale ?? DEFAULT_LOCALE, {
    style: "currency",
    currency,
    currencyDisplay: "symbol",
    minimumFractionDigits: 0,
    maximumFractionDigits: options.maximumFractionDigits ?? 0,
  }).format(amount);
}
/**
 * Formats an ISO date without allowing the host timezone to shift its day.
 */
export function formatDate(value: string | Date, locale = DEFAULT_LOCALE): string {
  const date = typeof value === "string" ? isoCalendarDate(value) : value;

  if (Number.isNaN(date.getTime())) {
    return typeof value === "string" ? value : "";
  }

  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function formatPercent(value: number, locale = DEFAULT_LOCALE): string {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 2,
  }).format(value / 100);
}

export function getCoverageStateLabel(status: CoverageStatus): string {
  switch (status) {
    case "included":
      return "Kryto";
    case "excluded":
      return "Nekryto";
    case "unknown":
      return "Neuvedeno";
  }
}

export function getTerritoryLabel(territory: Territory | TerritoryCode): string {
  if (typeof territory !== "string") {
    return territory.label;
  }

  switch (territory) {
    case "CZ":
      return "Česká republika";
    case "EUROPE":
      return "Evropa";
    case "WORLD":
      return "Svět";
    case "NOT_STATED":
      return "Neuvedeno";
    case "CUSTOM":
      return "Individuální územní rozsah";
  }
}

export function formatDeductible(deductible: Deductible): string {
  switch (deductible.kind) {
    case "none":
      return "Bez spoluúčasti";
    case "fixed":
      return deductible.amount ? formatCurrency(deductible.amount) : "Pevná spoluúčast";
    case "choice":
      return deductible.options?.length
        ? deductible.options.map((option) => formatCurrency(option)).join(" / ")
        : "Volitelná spoluúčast";
    case "unknown":
      return deductible.note ?? "Spoluúčast neuvedena";
  }
}

export function formatCoverageLimit(limit: CoverageLimit): string {
  let value: string;

  switch (limit.kind) {
    case "fixed":
      value = limit.amount ? formatCurrency(limit.amount) : "Pevný limit";
      break;
    case "percentage-of-sum-insured":
      value = limit.percentage == null ? "Podíl z pojistné částky" : formatPercent(limit.percentage);
      if (limit.minimum) {
        value += `, min. ${formatCurrency(limit.minimum)}`;
      }
      break;
    case "sum-insured":
      value = "Do pojistné částky";
      break;
    case "included":
      value = "V ceně";
      break;
    case "unknown":
      value = "Limit neuveden";
      break;
  }

  const qualifiers: string[] = [];
  if (limit.basis === "insurance-event") qualifiers.push("na pojistnou událost");
  if (limit.basis === "insurance-year") qualifiers.push("na pojistný rok");
  if (limit.basis === "service-call") qualifiers.push("na zásah");
  if (limit.frequencyPerYear != null) qualifiers.push(`${limit.frequencyPerYear}× ročně`);
  if (limit.maximumDurationMonths != null) qualifiers.push(`max. ${limit.maximumDurationMonths} měsíců`);

  const formatted = qualifiers.length ? `${value} (${qualifiers.join(", ")})` : value;
  return limit.note ? `${formatted} – ${limit.note}` : formatted;
}

function isoCalendarDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(value);
  if (!match) return new Date(value);

  const [, year, month, day] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
}
