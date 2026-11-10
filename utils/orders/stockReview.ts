// An order whose inventory is "por revisar": the sale happened, but whether
// (and which) salida took its products out is not known yet — typically an
// invoice made straight in Siigo, imported later, whose bags someone already
// took out by hand ("Venta Niku Medellín"). It never deducts by itself; from
// the order you either pick the manual salida that was this sale, or deduct
// now. Pure functions.

import { reasonNames, type ManualSalida } from "./duplicateSalidas";

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const dayGap = (a: string, b: string) => Math.abs(Date.parse(`${a.slice(0, 10)}T12:00:00Z`) - Date.parse(`${b.slice(0, 10)}T12:00:00Z`)) / 86_400_000;

/** How far from the order's date a manual salida can be and still be offered. */
export const CANDIDATE_DAYS = 20;

export type OrderForReview = {
  created_at: string;
  customer: string;
  items: { inventory_id: string | null; quantity: number }[];
};

export type SalidaCandidate = ManualSalida & {
  /** The reason names the customer. */
  named: boolean;
  /** Takes exactly what the order still needs of that product. */
  sameQty: boolean;
  days: number;
};

/** Units of each product the order still has no salida for. */
export function missingUnits(order: OrderForReview, linked: { inventory_id: string; quantity: number }[]): Map<string, number> {
  const need = new Map<string, number>();
  for (const it of order.items) if (it.inventory_id) need.set(it.inventory_id, (need.get(it.inventory_id) ?? 0) + Math.abs(Number(it.quantity)));
  for (const m of linked) if (need.has(m.inventory_id)) need.set(m.inventory_id, need.get(m.inventory_id)! - Math.abs(Number(m.quantity)));
  for (const [k, v] of need) if (v <= 1e-9) need.delete(k);
  return need;
}

/**
 * Manual salidas that could be this sale: a product the order still lacks,
 * within CANDIDATE_DAYS of it, not a gift or sample unless it names the
 * customer. Those naming the customer first, then the exact quantity, then
 * the closest date.
 */
export function salidaCandidates(order: OrderForReview, missing: Map<string, number>, salidas: ManualSalida[]): SalidaCandidate[] {
  return salidas
    .filter((s) => missing.has(s.inventory_id) && dayGap(s.movement_date, order.created_at) <= CANDIDATE_DAYS)
    .map((s) => ({
      ...s,
      named: reasonNames(s.reason, order.customer),
      sameQty: Math.abs(Number(s.quantity)) === missing.get(s.inventory_id),
      days: Math.round(dayGap(s.movement_date, order.created_at)),
    }))
    .filter((s) => s.named || !/\b(muestra|regalo|cortesia|obsequio|degustacion)\b/.test(fold(s.reason ?? "")))
    .sort((a, b) => Number(b.named) - Number(a.named) || Number(b.sameQty) - Number(a.sameQty) || a.days - b.days);
}
