// Expense categories: the built-in ones (in code) plus the ones the team
// adds in Ajustes → Categorías de gasto. Pure functions.

import {
  ADVANCE_CATEGORY,
  DEFAULT_DEPRECIATION_MONTHS,
  EXPENSE_CATEGORY_TYPE_MAP,
  RETIRED_EXPENSE_CATEGORIES,
  type ExpenseType,
} from "@/app/(admin)/admin/cashflow/types";

export type CategoryType = Exclude<ExpenseType, "ANTICIPO">;
export const CATEGORY_TYPES: CategoryType[] = ["COGS", "OPEX", "CAPEX"];

export type ExpenseCategory = {
  name: string;
  type: CategoryType;
  /** Fixed assets: suggested useful life in months. */
  months: number | null;
  builtIn: boolean;
  active: boolean;
  /** Custom ones only. */
  id?: string;
};

export type CustomCategoryRow = { id: string; name: string; expense_type: string; depreciation_months: number | null; active: boolean };

export const BUILT_IN_CATEGORIES: ExpenseCategory[] = Object.entries(EXPENSE_CATEGORY_TYPE_MAP).map(([name, type]) => ({
  name,
  type: type as CategoryType,
  months: DEFAULT_DEPRECIATION_MONTHS[name] ?? null,
  builtIn: true,
  active: true,
}));

const key = (name: string) => name.trim().toLowerCase();
const RESERVED = new Set([...BUILT_IN_CATEGORIES.map((c) => c.name), ADVANCE_CATEGORY, ...Object.keys(RETIRED_EXPENSE_CATEGORIES)].map(key));

/** Built-in categories first, then the team's (alphabetical); inactive ones are left out unless asked. */
export function mergeCategories(custom: CustomCategoryRow[], opts: { includeInactive?: boolean } = {}): ExpenseCategory[] {
  const own = custom
    .filter((c) => !RESERVED.has(key(c.name)) && CATEGORY_TYPES.includes(c.expense_type as CategoryType))
    .filter((c) => opts.includeInactive || c.active)
    .map((c) => ({ id: c.id, name: c.name, type: c.expense_type as CategoryType, months: c.depreciation_months ?? null, builtIn: false, active: c.active }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
  return [...BUILT_IN_CATEGORIES, ...own];
}

/** Category → nature, for every category (active or not: old expenses keep theirs). */
export const categoryTypes = (list: ExpenseCategory[]): Record<string, CategoryType> => Object.fromEntries(list.map((c) => [c.name, c.type]));

/** Category → suggested useful life, for the fixed asset ones. */
export const categoryMonths = (list: ExpenseCategory[]): Record<string, number> =>
  Object.fromEntries(list.filter((c) => c.type === "CAPEX" && c.months).map((c) => [c.name, c.months as number]));

export const namesOf = (list: ExpenseCategory[], filter: (c: ExpenseCategory) => boolean = () => true) => list.filter((c) => c.active && filter(c)).map((c) => c.name);

/** Problems with a new or edited category. `existing` are the names already taken. */
export function categoryProblems(c: { name: string; type: string; months?: number | null; account?: string | null }, existing: string[] = []): string[] {
  const p: string[] = [];
  const name = c.name.trim();
  if (name.length < 3) p.push("Escribe el nombre de la categoría (mínimo 3 letras).");
  else if (name.length > 80) p.push("El nombre de la categoría es muy largo (máximo 80 letras).");
  else if (RESERVED.has(key(name)) || existing.some((e) => key(e) === key(name))) p.push(`Ya existe una categoría "${name}".`);
  if (!CATEGORY_TYPES.includes(c.type as CategoryType)) p.push("Elige el tipo de la categoría.");
  if (c.type === "CAPEX" && !(Number.isInteger(Number(c.months)) && Number(c.months) > 0)) p.push("Indica la vida útil sugerida en meses.");
  if (c.account && !/^\d{4,10}$/.test(c.account.trim())) p.push("La cuenta contable debe ser un código PUC de 4 a 10 dígitos.");
  return p;
}
