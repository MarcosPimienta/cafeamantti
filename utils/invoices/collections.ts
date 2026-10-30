// Customer deposits (cobros) registered from the bank statement: each one
// is assigned, invoice by invoice, to what it pays, and becomes one Siigo
// recibo de caja per customer branch. Pure functions.

export type CollectionMethod = "transfer" | "cash";

/** One invoice a deposit pays (part of). */
export type CollectionItem = {
  /** Siigo's invoice id (null for an imported RC that only names it). */
  siigo_invoice_id: string | null;
  /** FV-2-702 */
  name: string;
  due_date: string | null;
  value: number;
};

/** An open invoice the deposit can be assigned to. */
export type OpenInvoice = { id: string; name: string; due_date: string | null; balance: number; branch_office: number; customer_identification: string | null };

/** Cutoff of the receipts history: RCs made in Siigo since then are imported. */
export const RECEIPTS_SINCE = "2026-09-01";

const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => Number(v ?? 0) || 0;

/** What stops registering a deposit. */
export function collectionProblems(
  c: { date: string; amount: number; method: string; assigned: { invoiceId: string; value: number }[] },
  invoices: OpenInvoice[],
  today: string
): string[] {
  const p: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.date)) p.push("Fecha del abono inválida.");
  else if (c.date > today) p.push("La fecha del abono no puede ser futura.");
  if (!["transfer", "cash"].includes(c.method)) p.push("Elige si entró al banco o a caja.");
  const amount = round2(num(c.amount));
  if (!(amount > 0)) p.push("Escribe el valor del abono.");
  const assigned = c.assigned.filter((a) => num(a.value) > 0);
  if (!assigned.length) p.push("Asigna el abono a al menos una factura.");
  const byId = new Map(invoices.map((i) => [i.id, i]));
  const customers = new Set<string>();
  for (const a of assigned) {
    const inv = byId.get(a.invoiceId);
    if (!inv) {
      p.push("Una de las facturas ya no tiene saldo en Siigo: actualiza la página.");
      continue;
    }
    customers.add(inv.customer_identification ?? "");
    if (round2(num(a.value)) > round2(inv.balance) + 0.5) p.push(`${inv.name}: el valor supera su saldo (${round2(inv.balance)}).`);
  }
  if (customers.size > 1) p.push("Un abono solo puede pagar facturas de un mismo cliente.");
  const total = round2(assigned.reduce((s, a) => s + num(a.value), 0));
  if (amount > 0 && assigned.length && Math.abs(total - amount) > 0.5) p.push(`Lo asignado (${total}) no cuadra con el valor del abono (${amount}).`);
  return p;
}

/** One recibo de caja per Siigo branch: a deposit for several sedes becomes several RCs. */
export function receiptsByBranch(assigned: { invoiceId: string; value: number }[], invoices: OpenInvoice[]): Map<number, CollectionItem[]> {
  const byId = new Map(invoices.map((i) => [i.id, i]));
  const out = new Map<number, CollectionItem[]>();
  for (const a of assigned) {
    const inv = byId.get(a.invoiceId);
    if (!inv || !(num(a.value) > 0)) continue;
    const list = out.get(inv.branch_office) ?? [];
    list.push({ siigo_invoice_id: inv.id, name: inv.name, due_date: inv.due_date, value: round2(num(a.value)) });
    out.set(inv.branch_office, list);
  }
  return out;
}

/** "RC-1-249 · Elevate Nutrition · FV-2-702, FV-2-705" */
export function receiptConcept(r: { siigo_name?: string | null; customer_name: string; items: CollectionItem[] }) {
  return [r.siigo_name || "Cobro", r.customer_name, r.items.map((i) => i.name).join(", ")].join(" · ").slice(0, 200);
}

/** An RC read from Siigo, as a receipt of the history. */
export type SiigoVoucher = {
  id: string;
  name?: string;
  date: string;
  type?: string;
  customer?: { identification?: string; branch_office?: number };
  items?: { due?: { prefix?: string; consecutive?: number; date?: string }; value?: number }[];
  payment?: { id?: number; name?: string; value?: number };
  observations?: string;
};

/** RCs to import: debt payments dated since the cutoff that the app does not have yet. */
export function vouchersToImport(vouchers: SiigoVoucher[], known: Set<string>, since = RECEIPTS_SINCE): SiigoVoucher[] {
  return vouchers.filter((v) => v.type === "DebtPayment" && v.date >= since && !known.has(v.id));
}

export function itemsOfVoucher(v: SiigoVoucher): CollectionItem[] {
  return (v.items ?? [])
    .filter((i) => i.due?.prefix && i.due?.consecutive)
    .map((i) => ({ siigo_invoice_id: null, name: `${i.due!.prefix}-${i.due!.consecutive}`, due_date: i.due!.date ?? null, value: round2(num(i.value)) }));
}
