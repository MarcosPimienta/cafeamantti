// The one list of inventory categories. Labels, new-product defaults, the
// Entradas entry type and the tag color all come from here; the database
// CHECK (inventory_category_check) must list the same ids.

export type EntryType = "MP" | "MAT" | "EQP" | "ENS";

export const ENTRY_TYPE_LABELS: Record<EntryType, string> = {
  MP: "Materia Prima",
  MAT: "Material",
  EQP: "Equipo",
  ENS: "Enseres",
};

/** Tag color for each entry type in the Entradas history. */
export const ENTRY_TYPE_BADGE: Record<EntryType, string> = {
  MP: "bg-[#C59F59]/10 text-[#C59F59]",
  MAT: "bg-blue-50 text-blue-600",
  EQP: "bg-slate-100 text-slate-700",
  ENS: "bg-teal-50 text-teal-700",
};

export const ENTRY_TYPES = Object.keys(ENTRY_TYPE_LABELS) as EntryType[];

export const INVENTORY_CATEGORIES = [
  { id: "cafe", label: "Café", prefix: "CAFT-", unit: "unidad", sellable: true, entryType: "MP", badge: "bg-[#C59F59]/10 text-[#C59F59]" },
  { id: "empaque", label: "Empaque", prefix: "EMP-", unit: "unidad", sellable: false, entryType: "MAT", badge: "bg-blue-50 text-blue-600" },
  { id: "accesorio", label: "Accesorio", prefix: "ACC-", unit: "unidad", sellable: false, entryType: "MAT", badge: "bg-purple-50 text-purple-600" },
  { id: "equipo", label: "Equipo", prefix: "EQP-", unit: "unidad", sellable: false, entryType: "EQP", badge: "bg-slate-100 text-slate-700" },
  { id: "enseres", label: "Enseres", prefix: "ENS-", unit: "unidad", sellable: false, entryType: "ENS", badge: "bg-teal-50 text-teal-700" },
] as const satisfies readonly {
  id: string;
  label: string;
  prefix: string;
  unit: string;
  sellable: boolean;
  entryType: EntryType;
  badge: string;
}[];

export type InventoryCategory = (typeof INVENTORY_CATEGORIES)[number]["id"];

export const CATEGORY_IDS: readonly InventoryCategory[] = INVENTORY_CATEGORIES.map((c) => c.id);

export const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(INVENTORY_CATEGORIES.map((c) => [c.id, c.label]));

export function isInventoryCategory(v: unknown): v is InventoryCategory {
  return typeof v === "string" && (CATEGORY_IDS as readonly string[]).includes(v);
}

export function categoryInfo(id: string) {
  return INVENTORY_CATEGORIES.find((c) => c.id === id);
}

/** Entradas entry type for a product's category (coffee = MP, equipo = EQP, enseres = ENS, rest = MAT). */
export function entryTypeFor(category: string): EntryType {
  return categoryInfo(category)?.entryType ?? "MAT";
}
