// Profitability, not cash: what was sold in a month (before IVA) and what the
// coffee that left cost, whatever day the money moved. Pure functions; the
// server action gathers invoices, orders, incomes and inventory salidas.

import type { StatementItem } from "./incomeStatement";

const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => Number(v ?? 0) || 0;

/** A line of an invoice or credit note, as stored. */
export type ChargedLine = { quantity: number | string; unit_price: number | string; tax_included?: boolean; tax_rate?: number | string | null };

/** What a line is worth before IVA. */
export function lineBase(l: ChargedLine): number {
  const amount = num(l.quantity) * num(l.unit_price);
  const rate = num(l.tax_rate);
  // Stored prices are IVA-inclusive unless the line says otherwise.
  return round2(l.tax_included === false || !rate ? amount : amount / (1 + rate / 100));
}

export function linesBase(lines: ChargedLine[] | null | undefined, shipping: number | string = 0): number {
  return round2((lines ?? []).reduce((s, l) => s + lineBase(l), 0) + num(shipping));
}

/** A coffee product that left the inventory in the month. */
export type Salida = { date: string; inventory_id: string; quantity: number; reason: string | null };
/** Cost of one stock unit of a product (null = unknown). */
export type UnitCost = { name: string; unit: string | null; cost: number | null };

/**
 * The cost of what left: units × unit cost, one item per product. Products
 * without a known cost are listed apart so the screen can say so.
 */
export function costOfSalidas(salidas: Salida[], costs: Map<string, UnitCost>): { items: StatementItem[]; missing: { name: string; quantity: number }[] } {
  const by = new Map<string, number>();
  for (const s of salidas) by.set(s.inventory_id, (by.get(s.inventory_id) ?? 0) + Math.abs(num(s.quantity)));
  const items: StatementItem[] = [];
  const missing: { name: string; quantity: number }[] = [];
  for (const [id, qty] of by) {
    const c = costs.get(id);
    const q = round2(qty);
    if (!c || c.cost === null) {
      missing.push({ name: c?.name ?? id, quantity: q });
      continue;
    }
    items.push({
      date: "",
      concept: `${q.toLocaleString("es-CO")} ${c.unit ?? ""} ${c.name} × $${Math.round(c.cost).toLocaleString("es-CO")}`.replace(/\s+/g, " "),
      category: "Costo por unidad",
      amount: round2(q * c.cost),
    });
  }
  return { items, missing };
}

/**
 * A manual income of sales that no order or invoice explains (a sale typed
 * straight into Flujo de Caja, or a cobro of an invoice made in Siigo): it
 * counts as sales once, without the part that pays invoices of the app, and
 * without the IVA it says it has.
 */
export function unexplainedSale(income: { amount: number; tax: number }, appPortion: number): number {
  const total = num(income.amount) - num(appPortion);
  if (total <= 0.5) return 0;
  const share = num(income.amount) ? total / num(income.amount) : 0;
  return round2(total - num(income.tax) * share);
}

/** An invoice or credit note as Siigo returns it (only what the statement needs). */
export type SiigoSalesDoc = {
  id?: string;
  name?: string;
  date?: string;
  annulled?: boolean;
  /** On a credit note: the invoice it is against. */
  invoice?: { id?: string; name?: string };
  customer?: { identification?: string };
  items?: { quantity?: number | string; price?: number | string }[];
};

/** A Siigo invoice's or credit note's value before IVA: quantity × price of its items (Siigo's own sales report adds the same). */
export function siigoDocBase(d: SiigoSalesDoc): number {
  if (d.annulled) return 0;
  return round2((d.items ?? []).reduce((s, i) => s + num(i.quantity) * num(i.price), 0));
}

/**
 * An invoice voided by a credit note for all of it was never a sale: both
 * leave the statement. Notes for part of an invoice (a discount, a return),
 * or against an invoice of another period, stay as deductions.
 */
export function dropVoided(invoices: SiigoSalesDoc[], notes: SiigoSalesDoc[]): { invoices: SiigoSalesDoc[]; notes: SiigoSalesDoc[] } {
  const byRef = new Map<string, SiigoSalesDoc>();
  for (const i of invoices) {
    if (i.id) byRef.set(`id:${i.id}`, i);
    if (i.name) byRef.set(`name:${i.name}`, i);
  }
  const voided = new Set<SiigoSalesDoc>();
  const keptNotes: SiigoSalesDoc[] = [];
  for (const nc of notes) {
    const inv = (nc.invoice?.id && byRef.get(`id:${nc.invoice.id}`)) || (nc.invoice?.name && byRef.get(`name:${nc.invoice.name}`)) || null;
    if (inv && !voided.has(inv) && siigoDocBase(nc) >= siigoDocBase(inv) - 1) {
      voided.add(inv);
      continue;
    }
    keptNotes.push(nc);
  }
  return { invoices: invoices.filter((i) => !voided.has(i)), notes: keptNotes };
}

