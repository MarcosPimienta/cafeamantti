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
