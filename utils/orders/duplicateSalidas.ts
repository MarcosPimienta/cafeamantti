// A sale typed twice in the inventory: first as a manual salida (Inventario →
// Salidas, "Venta Marcos"), then as an order that deducted the same product
// again. Pure functions.

/** A manual salida not tied to any order. */
export type ManualSalida = {
  id: string;
  inventory_id: string;
  quantity: number;
  movement_date: string;
  reason: string | null;
  income_id: string | null;
};

/** What the order took out of the inventory: its own salidas, by product. */
export type OrderForDuplicates = {
  created_at: string;
  customer: string;
  moved: { inventory_id: string; quantity: number }[];
};

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const words = (s: string) => fold(s).split(/[^a-z0-9]+/).filter(Boolean);

/** Names in the customer that can identify them in a salida's reason (4+ letters, not generic words). */
const GENERIC = new Set(["consumidor", "final", "cliente", "venta", "sas", "s.a.s", "ltda", "sociedad", "grupo"]);
function nameWords(customer: string): string[] {
  return words(customer).filter((w) => w.length >= 4 && !GENERIC.has(w) && !/^\d+$/.test(w));
}

/** The reason names the customer: a word of theirs, or its stem ("Marco" for "Marcos"). */
export function reasonNames(reason: string | null, customer: string): boolean {
  const said = words(reason ?? "");
  return nameWords(customer).some((n) => said.some((w) => w === n || (w.length >= 4 && (n.startsWith(w) || w.startsWith(n)) && Math.abs(n.length - w.length) <= 1)));
}

/** A salida that gives the product away is not the sale an invoiced order records. */
const NOT_A_SALE = /\b(muestra|regalo|cortesia|obsequio|degustacion)\b/;

const dayGap = (a: string, b: string) => Math.abs(Date.parse(`${a.slice(0, 10)}T12:00:00Z`) - Date.parse(`${b.slice(0, 10)}T12:00:00Z`)) / 86_400_000;

/**
 * Manual salidas that could be this same sale typed again: same product, same
 * quantity the order deducted, within 3 days of the order, and the reason
 * names the customer (samples and gifts don't count). Only products the
 * order already deducted count — those are the ones taken twice.
 */
export function duplicateSalidasFor(order: OrderForDuplicates & { total?: number }, salidas: ManualSalida[]): ManualSalida[] {
  const movedBy = new Map<string, number>();
  for (const m of order.moved) movedBy.set(m.inventory_id, (movedBy.get(m.inventory_id) ?? 0) + Math.abs(Number(m.quantity)));
  return salidas.filter((s) => {
    const took = movedBy.get(s.inventory_id);
    return !!took
      && Math.abs(Number(s.quantity)) === took
      && dayGap(s.movement_date, order.created_at) <= 3
      && !NOT_A_SALE.test(fold(s.reason ?? ""))
      && reasonNames(s.reason, order.customer);
  });
}

/**
 * For the whole board: each manual salida goes to at most one order (the
 * closest in date), and an order gets at most one salida per product — a
 * customer who buys often doesn't light up every order.
 */
export function assignDuplicateSalidas<T extends OrderForDuplicates & { id: string }>(orders: T[], salidas: ManualSalida[]): Map<string, ManualSalida[]> {
  const pairs: { order: T; salida: ManualSalida; gap: number }[] = [];
  for (const o of orders) for (const s of duplicateSalidasFor(o, salidas)) pairs.push({ order: o, salida: s, gap: dayGap(s.movement_date, o.created_at) });
  pairs.sort((a, b) => a.gap - b.gap || a.order.created_at.localeCompare(b.order.created_at));
  const usedSalida = new Set<string>();
  const usedSlot = new Set<string>();
  const out = new Map<string, ManualSalida[]>();
  for (const p of pairs) {
    const slot = `${p.order.id}|${p.salida.inventory_id}`;
    if (usedSalida.has(p.salida.id) || usedSlot.has(slot)) continue;
    usedSalida.add(p.salida.id);
    usedSlot.add(slot);
    out.set(p.order.id, [...(out.get(p.order.id) ?? []), p.salida]);
  }
  return out;
}

/** The orders a new manual salida would repeat (checked before saving it). */
export function ordersRepeatedBy<T extends OrderForDuplicates>(salida: ManualSalida, orders: T[]): T[] {
  return orders.filter((o) => duplicateSalidasFor(o, [salida]).length > 0);
}
