// Shared insurance configuration between Kalkulace and Průzkum trhu modules

export const INSURERS = [
  { id: "allianz", name: "Allianz pojišťovna, a.s.", shortName: "Allianz" },
  { id: "cpp", name: "Česká podnikatelská pojišťovna, a.s.", shortName: "ČPP" },
  { id: "csob", name: "ČSOB Pojišťovna, a. s.", shortName: "ČSOB" },
  { id: "direct", name: "Direct pojišťovna, a.s.", shortName: "Direct" },
  { id: "gcp", name: "Generali Česká pojišťovna a.s.", shortName: "GČP" },
  { id: "kooperativa", name: "Kooperativa pojišťovna, a.s.", shortName: "Kooperativa" },
  { id: "pillow", name: "Pillow pojišťovna, a.s.", shortName: "Pillow" },
  { id: "vzp", name: "Pojišťovna VZP, a.s.", shortName: "HVP" },
  { id: "slavia", name: "Slavia pojišťovna a.s.", shortName: "Slavia" },
  { id: "uniqa", name: "UNIQA pojišťovna, a.s.", shortName: "Uniqa" },
] as const;

export type InsurerId = typeof INSURERS[number]["id"];

// Core insurance types that are always available
export const CORE_INSURANCE_TYPES = [
  { id: "pov", name: "POV (Povinné ručení)", category: "core" },
  { id: "allrisk_5", name: "Havarijní 5%", category: "allrisk" },
  { id: "allrisk_10", name: "Havarijní 10%", category: "allrisk" },
] as const;

// Additional insurance modules (pripojisteni) - these are shared with Kalkulace
export const DEFAULT_MODULES = [
  { id: "m_glass", name: "Skla" },
  { id: "m_assist", name: "Asistence" },
  { id: "m_accident", name: "Úraz" },
  { id: "m_luggage", name: "Zavazadla" },
  { id: "m_gap", name: "GAP" },
  { id: "m_replacement", name: "Náhradní vozidlo" },
] as const;

export type ModuleId = typeof DEFAULT_MODULES[number]["id"];

// All row types for the research table
export const ALL_ROW_TYPES = [
  ...CORE_INSURANCE_TYPES,
  ...DEFAULT_MODULES.map(m => ({ ...m, category: "module" as const })),
];

export type RowTypeId = typeof ALL_ROW_TYPES[number]["id"];

// Helper functions
export function getInsurerById(id: string) {
  return INSURERS.find(i => i.id === id);
}

export function getInsurerName(id: string, short = false): string {
  const insurer = getInsurerById(id);
  return insurer ? (short ? insurer.shortName : insurer.name) : id;
}

export function getRowTypeById(id: string) {
  return ALL_ROW_TYPES.find(r => r.id === id);
}

export function getRowTypeName(id: string): string {
  const rowType = getRowTypeById(id);
  return rowType ? rowType.name : id;
}
