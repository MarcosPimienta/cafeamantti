// Date / amount limits and sorting shared by the admin lists (Facturas,
// Compras, Conciliación bancaria). Pure functions.

/** A typed amount ("1.500.000", "$ 150,000", "150000") as a number; null when empty. */
export function parseAmount(text: string): number | null {
  const digits = text.replace(/[^\d]/g, "");
  return digits ? Number(digits) : null;
}

/** Dates are YYYY-MM-DD and inclusive; amounts are compared as given (pass the absolute value for signed money). */
export type ListRange = { from?: string; to?: string; min?: number | null; max?: number | null };

export function isRangeSet(r: ListRange): boolean {
  return !!(r.from || r.to || r.min != null || r.max != null);
}

export function inRange(date: string, amount: number, r: ListRange): boolean {
  if (r.from && date < r.from) return false;
  if (r.to && date > r.to) return false;
  if (r.min != null && amount < r.min) return false;
  if (r.max != null && amount > r.max) return false;
  return true;
}

export type ListSort = "fecha-desc" | "fecha-asc" | "valor-desc" | "valor-asc" | "saldo-desc" | "vence-asc";

export type SortKeys = { date: string; amount: number; balance?: number; due?: string; tiebreak?: string };

/** A sorted copy. Ties go to the newest (by date, then tiebreak). */
export function sortRows<T>(rows: T[], sort: ListSort, keys: (row: T) => SortKeys): T[] {
  const k = new Map(rows.map((r) => [r, keys(r)]));
  const newest = (a: SortKeys, b: SortKeys) => b.date.localeCompare(a.date) || (b.tiebreak ?? "").localeCompare(a.tiebreak ?? "");
  const by: Record<ListSort, (a: SortKeys, b: SortKeys) => number> = {
    "fecha-desc": newest,
    "fecha-asc": (a, b) => -newest(a, b),
    "valor-desc": (a, b) => b.amount - a.amount || newest(a, b),
    "valor-asc": (a, b) => a.amount - b.amount || newest(a, b),
    "saldo-desc": (a, b) => (b.balance ?? 0) - (a.balance ?? 0) || newest(a, b),
    "vence-asc": (a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999") || newest(a, b),
  };
  return [...rows].sort((a, b) => by[sort](k.get(a)!, k.get(b)!));
}
