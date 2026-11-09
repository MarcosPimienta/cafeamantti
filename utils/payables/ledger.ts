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
  /** Fixed asset line (equipo, muebles…): useful life in months. */
  depreciation_months?: number | null;
  /** Fixed asset line: when it starts being used (empty = the payment date). */
  in_service_date?: string | null;
  /** Fixed asset line: where it is used (producción, punto de venta, comodato, administración). */
  asset_use?: string | null;
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
    else if (capexCategories.includes(l.category)) {
      if (!(Number.isInteger(num(l.depreciation_months)) && num(l.depreciation_months) > 0)) p.push(`Línea ${n}: indica la vida útil del activo en meses.`);
      if (l.inventory_id) p.push(`Línea ${n}: un activo fijo no entra al inventario.`);
    }
    if (!/^\d{4,10}$/.test(l.account ?? "")) p.push(`Línea ${n}: elige la cuenta contable.`);
    if (!(num(l.base) > 0)) p.push(`Línea ${n}: el valor debe ser mayor a cero.`);
    if (l.inventory_id && !(num(l.inventory_qty) > 0)) p.push(`Línea ${n}: indica cuánto entra al inventario.`);
  });
  return p;
}

export function paidOf(payments: { amount: number | string }[]): number {
  return round2(payments.reduce((s, p) => s + num(p.amount), 0));
}

/** What is still owed (never negative), after the supplier's partial credit notes. */
export function payableBalance(total: number | string, payments: { amount: number | string }[], credited: number | string = 0): number {
  return Math.max(0, round2(num(total) - num(credited) - paidOf(payments)));
}

/** Sum of an invoice's partial credit notes. */
export function creditedOf(notes: { total: number | string; partial?: boolean | null }[] | null | undefined): number {
  return round2((notes ?? []).filter((n) => n.partial).reduce((s, n) => s + num(n.total), 0));
}

/**
 * A partial credit note: what it leaves the invoice worth, and the part of
 * what was already paid that the supplier now holds (saldo a favor).
 */
export function partialCreditEffect(total: number, creditedBefore: number, paid: number, amount: number): { newValue: number; excess: number } {
  const newValue = round2(total - creditedBefore - amount);
  const before = Math.max(0, round2(paid - (total - creditedBefore)));
  return { newValue, excess: Math.max(0, round2(Math.max(0, paid - newValue) - before)) };
}

export function partialCreditProblems(total: number, creditedBefore: number, amount: number): string[] {
  const p: string[] = [];
  const left = round2(total - creditedBefore);
  if (!(Number.isFinite(amount) && amount > 0)) p.push("El valor de la nota crédito debe ser mayor a cero.");
  else if (amount > left + 0.5) p.push("La nota crédito supera lo que queda de la factura.");
  else if (amount > left - 0.5) p.push("La nota crédito es por todo lo que queda de la factura: usa «Toda la factura» para anularla.");
  return p;
}

export function payablePaymentProblems(balance: number, amount: number, date: string): string[] {
  const p: string[] = [];
  if (!(Number.isFinite(amount) && amount > 0)) p.push("El valor del pago debe ser mayor a cero.");
  else if (amount > balance + 0.5) p.push("El pago supera el saldo por pagar.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) p.push("Fecha del pago inválida.");
  return p;
}

export type PaymentPart = {
  category: string;
  amount: number;
  tax: number;
  /** A fixed asset line: its own part, so Flujo de Caja registers (and depreciates) it. */
  asset?: { description: string; months: number; in_service_date: string | null; use: string | null };
};

/**
 * Splits a payment across the invoice's categories in proportion to what
 * each line leaves owed, with the IVA inside each part (for Flujo de Caja).
 * Fixed asset lines (with a useful life) are not merged: each one is a part.
 */
export function allocatePayment(lines: BillLine[], amount: number): PaymentPart[] {
  const { perLine, total } = billTotals(lines);
  if (!(total > 0)) return [];
  const byKey = new Map<string, PaymentPart>();
  lines.forEach((l, i) => {
    const share = perLine[i].owed / total;
    const months = num(l.depreciation_months);
    const key = months > 0 ? `asset:${i}` : `cat:${l.category}`;
    const part = byKey.get(key) ?? {
      category: l.category,
      amount: 0,
      tax: 0,
      ...(months > 0 ? { asset: { description: l.description, months, in_service_date: l.in_service_date || null, use: l.asset_use || null } } : {}),
    };
    part.amount += amount * share;
    part.tax += perLine[i].owed > 0 ? (amount * share * perLine[i].iva) / perLine[i].owed : 0;
    byKey.set(key, part);
  });
  const parts = [...byKey.values()].map((v) => ({ ...v, amount: round2(v.amount), tax: round2(v.tax) }));
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

const searchKey = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Whether a purchase invoice matches what was typed: supplier name, its NIT,
 * the supplier's invoice number ("FE-123", "fe123" or just "123"), the Siigo
 * number, a line description, or a note.
 */
export function billMatches(
  bill: { supplier_name: string; supplier_identification?: string | null; provider_prefix?: string | null; provider_number: string; siigo_name?: string | null; notes?: string | null; lines?: { description?: string | null }[] },
  query: string
): boolean {
  const q = searchKey(query);
  if (!q) return true;
  const texts = [
    bill.supplier_name,
    `${bill.provider_prefix ?? ""}${bill.provider_number}`,
    bill.provider_number,
    bill.siigo_name ?? "",
    bill.notes ?? "",
    ...(bill.lines ?? []).map((l) => l.description ?? ""),
  ];
  if (texts.some((t) => searchKey(t).includes(q))) return true;
  // A NIT is only matched from 5 digits on, so typing an amount or a short number doesn't bring every supplier.
  return q.length >= 5 && !!bill.supplier_identification && searchKey(bill.supplier_identification).includes(q);
}
