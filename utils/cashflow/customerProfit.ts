// Profitability by customer: what each customer bought (before IVA, less
// credit notes), what that coffee cost, the margin it left, and — for
// customers with machines in comodato — the machines' depreciation. Shared
// expenses (transport, fees, admin) are not split among customers: they are
// shown apart. Pure functions; the server action gathers the documents.

import type { UnitCost } from "./accrual";

const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => Number(v ?? 0) || 0;

/** A line of a sale: which product (null = not recognized), how many, its value before IVA. */
export type SaleLine = { inventory_id: string | null; description: string; quantity: number; base: number };

/** An invoice, an order without invoice, or a credit note (kind "nota", subtracted). */
export type CustomerDoc = {
  customerKey: string;
  customer: string;
  date: string;
  doc: string;
  kind: "factura" | "pedido" | "web" | "nota";
  /** Value before IVA (positive also for notes). */
  base: number;
  lines: SaleLine[];
};

/** Machines a customer holds in comodato during the period. */
export type CustomerMachines = { customerKey: string; customer: string; machines: number; commitmentKg: number | null };

/** Unit cost plus the kilos of coffee in one unit (null = not coffee / unknown). */
export type UnitCostKg = UnitCost & { kg?: number | null };

export type CustomerProfitRow = {
  key: string;
  customer: string;
  docs: CustomerDoc[];
  sales: number;
  notes: number;
  netSales: number;
  cost: number;
  gross: number;
  /** % of net sales (null without sales). */
  grossPct: number | null;
  /** Kilos of coffee bought in the period. */
  kg: number;
  machines: number;
  /** Kilos the comodato commits them to in the period (null = no commitment). */
  commitmentKg: number | null;
  /** Depreciation of their machines in the period. */
  comodatoCost: number;
  /** What the customer leaves after coffee and machines. */
  contribution: number;
  contributionPct: number | null;
  /** Lines whose product or cost is unknown (their cost is not counted). */
  uncosted: { description: string; quantity: number }[];
};

export type CustomerProfit = {
  rows: CustomerProfitRow[];
  totals: { netSales: number; cost: number; gross: number; comodatoCost: number; contribution: number };
  /** Comodato depreciation with no customer to carry it (machines not assigned in Comodatos). */
  unassignedComodato: number;
};

const pct = (v: number, of: number) => (of ? round2((v / of) * 100) : null);

/**
 * Builds the table. Cost = units × unit cost of each line's product (notes
 * take value off sales, not cost: a discount returns no coffee). Comodato
 * depreciation is split evenly among the machines assigned to customers.
 */
export function customerProfit(
  docs: CustomerDoc[],
  costs: Map<string, UnitCostKg>,
  comodato: { machines: CustomerMachines[]; depreciation: number },
): CustomerProfit {
  const by = new Map<string, CustomerProfitRow>();
  const row = (key: string, customer: string): CustomerProfitRow => {
    let r = by.get(key);
    if (!r) {
      r = { key, customer, docs: [], sales: 0, notes: 0, netSales: 0, cost: 0, gross: 0, grossPct: null, kg: 0, machines: 0, commitmentKg: null, comodatoCost: 0, contribution: 0, contributionPct: null, uncosted: [] };
      by.set(key, r);
    }
    return r;
  };

  for (const d of docs) {
    const r = row(d.customerKey, d.customer);
    r.docs.push(d);
    if (d.kind === "nota") {
      r.notes += num(d.base);
      continue;
    }
    r.sales += num(d.base);
    for (const l of d.lines) {
      const c = l.inventory_id ? costs.get(l.inventory_id) : undefined;
      const q = Math.abs(num(l.quantity));
      if (c?.kg) r.kg += q * c.kg;
      if (!c || c.cost === null) {
        const known = r.uncosted.find((u) => u.description === (c?.name ?? l.description));
        if (known) known.quantity = round2(known.quantity + q);
        else r.uncosted.push({ description: c?.name ?? l.description, quantity: round2(q) });
        continue;
      }
      r.cost += q * c.cost;
    }
  }

  const assigned = comodato.machines.reduce((s, m) => s + num(m.machines), 0);
  const perMachine = assigned ? comodato.depreciation / assigned : 0;
  for (const m of comodato.machines) {
    const r = row(m.customerKey, m.customer);
    r.machines += num(m.machines);
    if (m.commitmentKg !== null) r.commitmentKg = round2((r.commitmentKg ?? 0) + m.commitmentKg);
  }

  const rows = [...by.values()].map((r) => {
    r.sales = round2(r.sales);
    r.notes = round2(r.notes);
    r.netSales = round2(r.sales - r.notes);
    r.cost = round2(r.cost);
    r.gross = round2(r.netSales - r.cost);
    r.grossPct = pct(r.gross, r.netSales);
    r.kg = round2(r.kg);
    r.comodatoCost = round2(r.machines * perMachine);
    r.contribution = round2(r.gross - r.comodatoCost);
    r.contributionPct = pct(r.contribution, r.netSales);
    r.docs.sort((a, b) => a.date.localeCompare(b.date));
    return r;
  }).sort((a, b) => b.netSales - a.netSales);

  const sum = (k: "netSales" | "cost" | "gross" | "comodatoCost" | "contribution") => round2(rows.reduce((s, r) => s + r[k], 0));
  return {
    rows,
    totals: { netSales: sum("netSales"), cost: sum("cost"), gross: sum("gross"), comodatoCost: sum("comodatoCost"), contribution: sum("contribution") },
    unassignedComodato: assigned ? 0 : round2(comodato.depreciation),
  };
}

/** The same customer whatever the document: by NIT (9 digits, no check digit), else by id or name. */
export function customerKey(nit: string | null | undefined, fallback: string): string {
  const d = String(nit ?? "").replace(/\D/g, "").slice(0, 9);
  return d && !/^2{9}$/.test(d) ? `nit:${d}` : /^2{9}$/.test(d) ? "consumidor-final" : `otro:${fallback.trim().toLowerCase()}`;
}
