// Figures of the admin dashboard. Pure: the page loads the rows (income
// statement, receivables, production, inventory, comodatos) and these decide
// what each card says.

import type { StatementItem } from "@/utils/cashflow/incomeStatement";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Whole days from `from` to `to` (YYYY-MM-DD); negative when `to` is before. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Same day of the month before (the 31st becomes that month's last day). */
export function sameDayPrevMonth(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const last = new Date(Date.UTC(y, m - 1, 0)).getUTCDate();
  const t = new Date(Date.UTC(y, m - 2, Math.min(d, last)));
  return t.toISOString().slice(0, 10);
}

/** Change in % of the previous value (null when it was 0). */
export function pctChange(current: number, previous: number): number | null {
  return previous ? round2(((current - previous) / Math.abs(previous)) * 100) : null;
}

/** Net sales (sales less credit notes) dated on or before `lastDay`. */
export function netSalesThrough(sales: StatementItem[], deductions: StatementItem[], lastDay: string): number {
  const upTo = (xs: StatementItem[]) => xs.filter((x) => x.date <= lastDay).reduce((s, x) => s + x.amount, 0);
  return round2(upTo(sales) - upTo(deductions));
}

// ─────────────────────────────────────────────────────────────
// Receivables
// ─────────────────────────────────────────────────────────────

export type AgingKey = "por_vencer" | "d1_30" | "d31_60" | "d61_90" | "d90";
export const AGING_ORDER: AgingKey[] = ["por_vencer", "d1_30", "d31_60", "d61_90", "d90"];
export const AGING_LABELS: Record<AgingKey, string> = {
  por_vencer: "Por vencer",
  d1_30: "Vencido 1–30 días",
  d31_60: "Vencido 31–60 días",
  d61_90: "Vencido 61–90 días",
  d90: "Vencido +90 días",
};

export type Aging = {
  buckets: { key: AgingKey; amount: number; count: number }[];
  total: number;
  overdue: number;
  overdueCount: number;
  /** Days past due of the oldest overdue invoice (0 when none is overdue). */
  oldestOverdueDays: number;
  /** Who owes the most overdue money. */
  topDebtor: { name: string; amount: number } | null;
};

export function agingKey(daysPastDue: number): AgingKey {
  if (daysPastDue <= 0) return "por_vencer";
  if (daysPastDue <= 30) return "d1_30";
  if (daysPastDue <= 60) return "d31_60";
  if (daysPastDue <= 90) return "d61_90";
  return "d90";
}

export function receivablesAging(invoices: { balance: number; due_date: string; customer_name: string }[], today: string): Aging {
  const acc = new Map<AgingKey, { amount: number; count: number }>(AGING_ORDER.map((k) => [k, { amount: 0, count: 0 }]));
  const debt = new Map<string, number>();
  let oldest = 0;
  for (const inv of invoices) {
    const late = daysBetween(inv.due_date, today);
    const b = acc.get(agingKey(late))!;
    b.amount += inv.balance;
    b.count += 1;
    if (late > 0) {
      oldest = Math.max(oldest, late);
      debt.set(inv.customer_name, (debt.get(inv.customer_name) ?? 0) + inv.balance);
    }
  }
  const buckets = AGING_ORDER.map((key) => ({ key, amount: round2(acc.get(key)!.amount), count: acc.get(key)!.count }));
  const overdueBuckets = buckets.filter((b) => b.key !== "por_vencer");
  const top = [...debt].sort((a, b) => b[1] - a[1])[0];
  return {
    buckets,
    total: round2(buckets.reduce((s, b) => s + b.amount, 0)),
    overdue: round2(overdueBuckets.reduce((s, b) => s + b.amount, 0)),
    overdueCount: overdueBuckets.reduce((s, b) => s + b.count, 0),
    oldestOverdueDays: oldest,
    topDebtor: top ? { name: top[0], amount: round2(top[1]) } : null,
  };
}

// ─────────────────────────────────────────────────────────────
// Customers
// ─────────────────────────────────────────────────────────────

/** Customer of an income-statement sale ("FV-12 · Cliente", "Pedido #ab · Cliente (sin factura)"). */
export function customerOfSale(concept: string): string {
  const i = concept.indexOf(" · ");
  const name = (i >= 0 ? concept.slice(i + 3) : "").replace(/\s*\(sin factura\)$/, "").trim();
  return name || "Sin cliente";
}

export type TopCustomers = { rows: { name: string; amount: number }[]; total: number; topShare: number | null };

/** Biggest customers of the sales (less their credit notes), and the share of all sales they make. */
export function topCustomers(sales: StatementItem[], deductions: StatementItem[], n = 5): TopCustomers {
  const by = new Map<string, number>();
  for (const s of sales) by.set(customerOfSale(s.concept), (by.get(customerOfSale(s.concept)) ?? 0) + s.amount);
  for (const d of deductions) by.set(customerOfSale(d.concept), (by.get(customerOfSale(d.concept)) ?? 0) - d.amount);
  const all = [...by].map(([name, amount]) => ({ name, amount: round2(amount) })).filter((r) => r.amount > 0).sort((a, b) => b.amount - a.amount);
  const total = round2(all.reduce((s, r) => s + r.amount, 0));
  const rows = all.slice(0, n);
  return { rows, total, topShare: total ? round2((rows.reduce((s, r) => s + r.amount, 0) / total) * 100) : null };
}

// ─────────────────────────────────────────────────────────────
// Production and green coffee
// ─────────────────────────────────────────────────────────────

export type Batch = { process_type: string; input_quantity_kg: number; output_quantity_kg: number; movement_date: string };

/** Weight lost in the batches, in % of what went in (null without batches). */
export function lossPct(batches: Batch[]): number | null {
  const input = batches.reduce((s, b) => s + Number(b.input_quantity_kg || 0), 0);
  const output = batches.reduce((s, b) => s + Number(b.output_quantity_kg || 0), 0);
  return input > 0 ? round2((1 - output / input) * 100) : null;
}

export type Production = {
  /** Roasted kg out of the month's tostión batches. */
  roastedKg: number;
  /** Same, for the previous month up to the same day. */
  roastedPrevKg: number;
  tostionLossPct: number | null;
  trillaLossPct: number | null;
};

export function productionSummary(batches: Batch[], today: string): Production {
  const ym = today.slice(0, 7);
  const prevDay = sameDayPrevMonth(today);
  const prevYm = prevDay.slice(0, 7);
  const tostion = batches.filter((b) => b.process_type === "tostion");
  const trilla = batches.filter((b) => b.process_type === "trilla");
  const out = (xs: Batch[]) => round2(xs.reduce((s, b) => s + Number(b.output_quantity_kg || 0), 0));
  return {
    roastedKg: out(tostion.filter((b) => b.movement_date.slice(0, 7) === ym)),
    roastedPrevKg: out(tostion.filter((b) => b.movement_date.slice(0, 7) === prevYm && b.movement_date <= prevDay)),
    tostionLossPct: lossPct(tostion.filter((b) => b.movement_date.slice(0, 7) === ym)),
    trillaLossPct: lossPct(trilla.filter((b) => b.movement_date.slice(0, 7) === ym)),
  };
}

export type GreenCoffee = {
  verdeKg: number;
  pergaminoKg: number;
  /** Green kg there will be: verde plus pergamino after trilla. */
  usableKg: number;
  /** Green kg roasted a week, over the last `days` days. */
  weeklyUseKg: number;
  /** Weeks the green coffee lasts at that pace (null when nothing was roasted). */
  weeksLeft: number | null;
};

/** Trilla yield (green out of pergamino) used when there are no trilla batches to learn it from. */
export const DEFAULT_TRILLA_YIELD = 0.8;

export function greenCoffee(stock: { verdeKg: number; pergaminoKg: number }, batches: Batch[], today: string, days = 56): GreenCoffee {
  const since = new Date(Date.parse(`${today}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);
  const trilla = batches.filter((b) => b.process_type === "trilla");
  const trillaIn = trilla.reduce((s, b) => s + Number(b.input_quantity_kg || 0), 0);
  const trillaYield = trillaIn > 0 ? trilla.reduce((s, b) => s + Number(b.output_quantity_kg || 0), 0) / trillaIn : DEFAULT_TRILLA_YIELD;
  const usableKg = round2(stock.verdeKg + stock.pergaminoKg * trillaYield);
  const roastedIn = batches
    .filter((b) => b.process_type === "tostion" && b.movement_date >= since && b.movement_date <= today)
    .reduce((s, b) => s + Number(b.input_quantity_kg || 0), 0);
  const weeklyUseKg = round2(roastedIn / (days / 7));
  return {
    verdeKg: round2(stock.verdeKg),
    pergaminoKg: round2(stock.pergaminoKg),
    usableKg,
    weeklyUseKg,
    weeksLeft: weeklyUseKg > 0 ? round2(usableKg / weeklyUseKg) : null,
  };
}

// ─────────────────────────────────────────────────────────────
// Comodatos
// ─────────────────────────────────────────────────────────────

export type ComodatoStatus = "ok" | "justo" | "bajo" | "sin_compromiso";

export type ComodatoClient = {
  clientId: string;
  name: string;
  machines: number;
  /** Kg a month the client committed to across its machines (null when none was set). */
  commitmentKg: number | null;
  boughtKg: number;
  progress: number | null;
  status: ComodatoStatus;
};

export function comodatoStatus(progress: number | null): ComodatoStatus {
  if (progress === null) return "sin_compromiso";
  if (progress >= 1) return "ok";
  if (progress >= 0.75) return "justo";
  return "bajo";
}

type Unit = { assignment: { client_id: string; monthly_commitment_kg: number | null } | null; client: { id: string; name: string } | null };

/** Each client with machines in comodato: what it bought in the last 30 days against its commitment. Lowest first. */
export function comodatoClients(units: Unit[], kgLast30ByClient: Record<string, number>): ComodatoClient[] {
  const by = new Map<string, { name: string; machines: number; commitment: number }>();
  for (const u of units) {
    if (!u.assignment || !u.client) continue;
    const c = by.get(u.client.id) ?? { name: u.client.name, machines: 0, commitment: 0 };
    c.machines += 1;
    c.commitment += Number(u.assignment.monthly_commitment_kg ?? 0) || 0;
    by.set(u.client.id, c);
  }
  return [...by]
    .map(([clientId, c]) => {
      const boughtKg = round2(kgLast30ByClient[clientId] ?? 0);
      const commitmentKg = c.commitment > 0 ? round2(c.commitment) : null;
      const progress = commitmentKg ? round2(boughtKg / commitmentKg) : null;
      return { clientId, name: c.name, machines: c.machines, commitmentKg, boughtKg, progress, status: comodatoStatus(progress) };
    })
    .sort((a, b) => (a.progress ?? Infinity) - (b.progress ?? Infinity) || a.name.localeCompare(b.name));
}

// ─────────────────────────────────────────────────────────────
// Formatting
// ─────────────────────────────────────────────────────────────

/** "$18,4 M", "−$420.000": pesos, in millions from a million up. */
export function copShort(n: number): string {
  const sign = n < 0 ? "−" : "";
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${sign}$${(a / 1_000_000).toLocaleString("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} M`;
  return `${sign}$${Math.round(a).toLocaleString("es-CO")}`;
}
