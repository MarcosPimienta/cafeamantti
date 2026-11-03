// The cost of what comes into stock. Entradas of materia prima and
// material must say what one unit cost (before IVA); an item's standard
// cost is the weighted average of its costed entradas. Pure functions.

import type { EntryType } from "./categories";

/** Since when entradas must carry their cost (the September 2026 cutover). */
export const COSTED_SINCE = "2026-09-01";

/** Materia prima and materiales are bought: their entradas need a cost. */
export const needsCost = (entryType: string | null | undefined) => entryType === "MP" || entryType === "MAT";

export function entryCostProblem(entryType: EntryType | string, unitCost: number | null | undefined): string | null {
  if (unitCost === null || unitCost === undefined || (unitCost as unknown) === "") return needsCost(entryType) ? "Escribe el costo unitario (sin IVA) de la entrada." : null;
  if (!(Number.isFinite(Number(unitCost)) && Number(unitCost) >= 0)) return "El costo debe ser un número mayor o igual a cero.";
  return null;
}

/** Weighted average cost of the costed entradas (null when none has a cost). */
export function weightedAverageCost(entries: { quantity: number | string; unit_cost: number | string | null }[]): number | null {
  let qty = 0;
  let value = 0;
  for (const e of entries) {
    const q = Number(e.quantity);
    if (e.unit_cost === null || e.unit_cost === undefined || !(q > 0)) continue;
    qty += q;
    value += q * Number(e.unit_cost);
  }
  return qty > 0 ? Math.round((value / qty) * 100) / 100 : null;
}

/** Cost per unit from an invoice line (before IVA): base ÷ quantity. */
export const lineUnitCost = (base: number | string, qty: number | string | null | undefined) =>
  Number(qty) > 0 ? Math.round((Number(base) / Number(qty)) * 100) / 100 : null;

export type EntryCostSummary = {
  /** Weighted average $/unit of the costed entradas. */
  average: number;
  count: number;
  quantity: number;
  lastCost: number;
  lastDate: string;
};

/** Per item: the weighted average of its costed entradas, how many and the last one. */
export function summarizeEntryCosts(rows: { inventory_id: string; quantity: number | string; unit_cost: number | string | null; movement_date?: string | null; created_at: string }[]): Record<string, EntryCostSummary> {
  const by = new Map<string, typeof rows>();
  for (const r of rows) {
    if (r.unit_cost === null || r.unit_cost === undefined || !(Number(r.quantity) > 0)) continue;
    by.set(r.inventory_id, [...(by.get(r.inventory_id) ?? []), r]);
  }
  const out: Record<string, EntryCostSummary> = {};
  for (const [id, list] of by) {
    const date = (r: (typeof rows)[number]) => (r.movement_date ?? r.created_at).slice(0, 10);
    const last = [...list].sort((a, b) => date(b).localeCompare(date(a)) || b.created_at.localeCompare(a.created_at))[0];
    out[id] = {
      average: weightedAverageCost(list)!,
      count: list.length,
      quantity: Math.round(list.reduce((s, r) => s + Number(r.quantity), 0) * 1000) / 1000,
      lastCost: Number(last.unit_cost),
      lastDate: date(last),
    };
  }
  return out;
}
