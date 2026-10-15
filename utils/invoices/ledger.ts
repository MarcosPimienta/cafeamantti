// Sales invoices and what the customer still owes. Pure functions.

export type InvoiceStatus = "borrador" | "emitida" | "error" | "anulada";
export type PaymentMethod = "web" | "transfer" | "cash";
export type PaymentState = "pendiente" | "parcial" | "pagada";

export type InvoiceLine = {
  inventory_id: string | null;
  /** Code sent to Siigo (linked Siigo code, else the app code). */
  code: string | null;
  name: string;
  quantity: number;
  unit_price: number;
  /** The product's own IVA (null = general, 0 = none). */
  tax_id: number | null;
  /** Linked to a Siigo product. */
  linked: boolean;
};

export type LedgerInvoice = {
  total: number | string;
  /** Sum of its credit notes: lowers what is owed. */
  credited?: number | string | null;
  status: InvoiceStatus;
  payment_terms: "credito" | "contado";
  due_date: string | null;
};
export type LedgerPayment = { amount: number | string };

const num = (v: unknown) => Number(v ?? 0) || 0;
const round2 = (n: number) => Math.round(n * 100) / 100;

export function paidAmount(payments: LedgerPayment[]): number {
  return round2(payments.reduce((s, p) => s + num(p.amount), 0));
}

/** What the customer still owes (never negative). A cash sale is paid when invoiced. */
export function balanceDue(invoice: LedgerInvoice, payments: LedgerPayment[]): number {
  if (invoice.payment_terms === "contado") return 0;
  return Math.max(0, round2(num(invoice.total) - num(invoice.credited) - paidAmount(payments)));
}

export function paymentState(invoice: LedgerInvoice, payments: LedgerPayment[]): PaymentState {
  if (invoice.payment_terms === "contado") return "pagada";
  const paid = paidAmount(payments);
  if (paid <= 0) return "pendiente";
  return balanceDue(invoice, payments) <= 0.5 ? "pagada" : "parcial";
}

/** Days past the due date with money still owed; 0 if not overdue. */
export function daysOverdue(invoice: LedgerInvoice, payments: LedgerPayment[], today: string): number {
  if (invoice.status !== "emitida" || !invoice.due_date || balanceDue(invoice, payments) <= 0.5) return 0;
  const ms = Date.parse(`${today}T00:00:00Z`) - Date.parse(`${invoice.due_date}T00:00:00Z`);
  return Math.max(0, Math.floor(ms / 86_400_000));
}

/** Problems with a new payment, before saving it. */
export function paymentProblems(invoice: LedgerInvoice, payments: LedgerPayment[], amount: number, date: string): string[] {
  const problems: string[] = [];
  if (invoice.status === "anulada") problems.push("La factura está anulada.");
  if (invoice.payment_terms === "contado") problems.push("La factura es de contado: ya quedó pagada al facturar.");
  if (!(Number.isFinite(amount) && amount > 0)) problems.push("El valor del pago debe ser mayor a cero.");
  else if (amount > balanceDue(invoice, payments) + 0.5) problems.push("El pago supera el saldo de la factura.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) problems.push("Fecha del pago inválida.");
  return problems;
}

export type OrderItemForInvoice = {
  product_id?: string | null;
  quantity: number | string;
  price_at_time: number | string;
  inventory?: { id?: string; product_code?: string; product_name?: string; siigo_code?: string | null; siigo_product_id?: string | null; sales_tax_id?: number | null } | null;
};

/** The order's items as invoice lines (a copy kept with the invoice). */
export function invoiceLinesFromOrder(items: OrderItemForInvoice[]): InvoiceLine[] {
  return items.map((it) => {
    const inv = it.inventory ?? null;
    return {
      inventory_id: inv?.id ?? null,
      code: inv ? (inv.siigo_code?.trim() || inv.product_code || null) : null,
      name: inv?.product_name ?? it.product_id ?? "Producto",
      quantity: num(it.quantity),
      unit_price: num(it.price_at_time),
      tax_id: inv?.sales_tax_id ?? null,
      linked: !!(inv && (inv.siigo_product_id || inv.siigo_code)),
    };
  });
}

// ── Credit notes ────────────────────────────────────────────

export type CreditReason = 1 | 2 | 3 | 4;
export const CREDIT_REASONS: Record<CreditReason, string> = {
  1: "Devolución parcial",
  2: "Anulación de la factura",
  3: "Rebaja o descuento",
  4: "Ajuste de precio",
};

export type CreditNoteLine = InvoiceLine & { restock: boolean };
export type CreditInput =
  | { reason: 2; notes?: string | null; cancelOrder: boolean }
  | { reason: 1; notes?: string | null; items: { index: number; quantity: number; restock: boolean }[] }
  | { reason: 3 | 4; notes?: string | null; items: { index: number; amount: number }[] };

/**
 * The lines of a credit note from what the admin chose, checked against the
 * invoice: no more units than invoiced (minus earlier returns), no more
 * value than each line, and never more than the invoice still has.
 */
export function creditNoteLines(
  invoice: { lines: InvoiceLine[]; total: number | string; credited?: number | string | null },
  input: CreditInput,
  returned: Record<number, number> = {}
): { lines: CreditNoteLine[]; problems: string[] } {
  const problems: string[] = [];
  const lines: CreditNoteLine[] = [];
  if (input.reason === 2) {
    if (num(invoice.credited) > 0.5) problems.push("La factura ya tiene notas crédito: anúlala por el saldo con una rebaja o en Siigo.");
    return { lines: invoice.lines.map((l) => ({ ...l, restock: false })), problems };
  }
  for (const it of input.items) {
    const line = invoice.lines[it.index];
    if (!line) { problems.push("Producto inválido."); continue; }
    if (input.reason === 1) {
      const r = it as { quantity: number; restock: boolean };
      const left = round2(line.quantity - (returned[it.index] ?? 0));
      if (!(r.quantity > 0)) continue;
      if (r.quantity > left + 1e-9) problems.push(`"${line.name}": solo quedan ${left} por devolver.`);
      lines.push({ ...line, quantity: round2(r.quantity), restock: !!r.restock });
    } else {
      const amount = round2(num((it as { amount: number }).amount));
      if (!(amount > 0)) continue;
      if (amount > round2(line.quantity * line.unit_price) + 0.5) problems.push(`"${line.name}": la rebaja supera el valor de la línea.`);
      // Same units, a lower price per unit: the note is the difference.
      lines.push({ ...line, unit_price: round2(amount / line.quantity), restock: false });
    }
  }
  if (!lines.length) problems.push("Indica qué productos o valores incluye la nota crédito.");
  const total = round2(lines.reduce((s, l) => s + l.quantity * l.unit_price, 0));
  if (total > round2(num(invoice.total) - num(invoice.credited)) + 0.5) problems.push("La nota crédito supera el valor pendiente de la factura.");
  return { lines, problems };
}
