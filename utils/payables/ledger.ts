// Purchases from suppliers and their payments. Pure functions.

export type BillLine = {
  /** Expense category (Flujo de Caja): where the payment lands. */
  category: string;
  /** Siigo ledger account (PUC). */
  account: string;
  description: string;
  /** Value before IVA. */
  base: number;
  tax_id: number | null;
  tax_rate: number;
  retention_id: number | null;
  retention_rate: number;
  /** Inventory product this line brings in (e.g. Café Verde), if any. */
  inventory_id?: string | null;
  /** How much of it came in, in the product's unit (kg, units…). */
  inventory_qty?: number | null;
};

/** "advance" = paid with the supplier's balance (saldo a favor), no money moves. */
export type PayableMethod = "bank" | "cash" | "advance";

const num = (v: unknown) => Number(v ?? 0) || 0;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Totals of a purchase invoice and what each line leaves owed. */
export function billTotals(lines: BillLine[]) {
  const perLine = lines.map((l) => {
    const base = round2(num(l.base));
    const iva = round2((base * num(l.tax_rate)) / 100);
    const withheld = round2((base * num(l.retention_rate)) / 100);
    return { base, iva, withheld, owed: round2(base + iva - withheld) };
  });
  const sum = (k: "base" | "iva" | "withheld" | "owed") => round2(perLine.reduce((s, l) => s + l[k], 0));
  return { subtotal: sum("base"), iva: sum("iva"), withheld: sum("withheld"), total: sum("owed"), perLine };
}

/** Problems with a purchase invoice before saving it. */
export function billProblems(bill: { supplier_identification: string; provider_number: string; issue_date: string; due_date: string; lines: BillLine[] }, capexCategories: string[] = []): string[] {
  const p: string[] = [];
  if (!bill.supplier_identification) p.push("Elige un proveedor con NIT.");
  if (!bill.provider_number.trim()) p.push("Escribe el número de la factura del proveedor.");
  else if (!/^\d+$/.test(bill.provider_number.trim())) p.push("El número de la factura del proveedor debe tener solo dígitos (el prefijo va aparte).");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(bill.issue_date)) p.push("Fecha de la factura inválida.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(bill.due_date) || bill.due_date < bill.issue_date) p.push("La fecha de vencimiento debe ser igual o posterior a la de la factura.");
  if (!bill.lines.length) p.push("Agrega al menos una línea.");
  bill.lines.forEach((l, i) => {
    const n = i + 1;
    if (!l.category) p.push(`Línea ${n}: elige la categoría.`);
    else if (capexCategories.includes(l.category)) p.push(`Línea ${n}: los activos fijos se registran en Flujo de Caja, no aquí.`);
    if (!/^\d{4,10}$/.test(l.account ?? "")) p.push(`Línea ${n}: elige la cuenta contable.`);
    if (!(num(l.base) > 0)) p.push(`Línea ${n}: el valor debe ser mayor a cero.`);
    if (l.inventory_id && !(num(l.inventory_qty) > 0)) p.push(`Línea ${n}: indica cuánto entra al inventario.`);
  });
  return p;
}

export function paidOf(payments: { amount: number | string }[]): number {
  return round2(payments.reduce((s, p) => s + num(p.amount), 0));
}

/** What is still owed (never negative). */
export function payableBalance(total: number | string, payments: { amount: number | string }[]): number {
  return Math.max(0, round2(num(total) - paidOf(payments)));
}

export function payablePaymentProblems(balance: number, amount: number, date: string): string[] {
  const p: string[] = [];
  if (!(Number.isFinite(amount) && amount > 0)) p.push("El valor del pago debe ser mayor a cero.");
  else if (amount > balance + 0.5) p.push("El pago supera el saldo por pagar.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) p.push("Fecha del pago inválida.");
  return p;
}

/**
 * Splits a payment across the invoice's categories in proportion to what
 * each line leaves owed, with the IVA inside each part (for Flujo de Caja).
 */
export function allocatePayment(lines: BillLine[], amount: number): { category: string; amount: number; tax: number }[] {
  const { perLine, total } = billTotals(lines);
  if (!(total > 0)) return [];
  const byCat = new Map<string, { amount: number; tax: number }>();
  lines.forEach((l, i) => {
    const share = perLine[i].owed / total;
    const part = byCat.get(l.category) ?? { amount: 0, tax: 0 };
    part.amount += amount * share;
    part.tax += perLine[i].owed > 0 ? (amount * share * perLine[i].iva) / perLine[i].owed : 0;
    byCat.set(l.category, part);
  });
  const parts = [...byCat].map(([category, v]) => ({ category, amount: round2(v.amount), tax: round2(v.tax) }));
  // Rounding leftovers go to the largest part, so the parts add up to the payment.
  const diff = round2(amount - parts.reduce((s, x) => s + x.amount, 0));
  if (diff !== 0 && parts.length) parts.sort((a, b) => b.amount - a.amount)[0].amount = round2(parts[0].amount + diff);
  return parts;
}

// ── Saldo a favor (anticipos) ───────────────────────────────

export type AdvanceKind = "anticipo" | "cruce" | "devolucion";

/** The supplier's balance: what was advanced minus what was crossed or returned. */
export function advanceBalance(moves: { kind: AdvanceKind | string; amount: number | string }[]): number {
  return round2(moves.reduce((s, m) => s + (m.kind === "anticipo" ? num(m.amount) : -num(m.amount)), 0));
}

/** A transfer against a document: what pays it and what is left over as an advance. */
export function splitPayment(balance: number, amount: number): { toDocument: number; excess: number } {
  const toDocument = round2(Math.min(Math.max(0, balance), amount));
  return { toDocument, excess: round2(amount - toDocument) };
}

/** What stops paying a document with the supplier's balance. */
export function advanceUseProblems(documentBalance: number, available: number, amount: number): string[] {
  const p: string[] = [];
  if (!(Number.isFinite(amount) && amount > 0)) p.push("El valor debe ser mayor a cero.");
  else if (amount > documentBalance + 0.5) p.push("El pago supera el saldo por pagar.");
  else if (amount > available + 0.5) p.push("El proveedor no tiene saldo a favor suficiente.");
  return p;
}

/**
 * Which anticipos a cruce or devolución of `amount` takes, oldest first:
 * each anticipo has what it was minus what earlier moves already took.
 */
export function allocateAdvances(
  moves: { id: string; kind: AdvanceKind | string; amount: number | string; move_date: string; siigo_name?: string | null; applied?: { advance_id: string; amount: number }[] | null }[],
  amount: number
): { advance_id: string; receipt: string | null; date: string; amount: number }[] {
  const taken = new Map<string, number>();
  for (const m of moves) for (const a of m.applied ?? []) taken.set(a.advance_id, (taken.get(a.advance_id) ?? 0) + num(a.amount));
  const out: { advance_id: string; receipt: string | null; date: string; amount: number }[] = [];
  let left = round2(amount);
  const anticipos = moves.filter((m) => m.kind === "anticipo").sort((a, b) => a.move_date.localeCompare(b.move_date));
  for (const a of anticipos) {
    if (left <= 0) break;
    const free = round2(num(a.amount) - (taken.get(a.id) ?? 0));
    if (free <= 0) continue;
    const use = round2(Math.min(free, left));
    out.push({ advance_id: a.id, receipt: a.siigo_name ?? null, date: a.move_date, amount: use });
    left = round2(left - use);
  }
  return out;
}
