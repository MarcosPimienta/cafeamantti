// Customer deposits (cobros) registered from the bank statement: each one
// is assigned, invoice by invoice, to what it pays, and becomes one Siigo
// recibo de caja per customer branch. Pure functions.

export type CollectionMethod = "transfer" | "cash";

/** Kinds of withholding a customer can apply to an invoice it pays. */
export const RETENTION_TYPES = ["Retefuente", "ReteICA", "ReteIVA"] as const;
export type RetentionType = (typeof RETENTION_TYPES)[number];

/** A withholding as Siigo lists it in /v1/taxes. */
export type RetentionOption = { id: number; type: RetentionType; name: string; percentage: number };

/**
 * A withholding the customer applied to an invoice: it pays the invoice as
 * much as cash would, but the customer keeps the money and pays it to the
 * DIAN on Café Amantti's behalf.
 */
export type CollectionRetention = { id: number; type: RetentionType; name: string; percentage: number; base: number; value: number };

/** One invoice a deposit pays (part of). */
export type CollectionItem = {
  /** Siigo's invoice id (null for an imported RC that only names it). */
  siigo_invoice_id: string | null;
  /** FV-2-702 */
  name: string;
  due_date: string | null;
  /** Money of the deposit that pays it. */
  value: number;
  /** Withholdings the customer applied to it (they pay it too, without money). */
  retentions?: CollectionRetention[];
};

/** An open invoice the deposit can be assigned to. */
export type OpenInvoice = {
  id: string;
  name: string;
  due_date: string | null;
  balance: number;
  branch_office: number;
  customer_identification: string | null;
  /** Value before taxes (Retefuente and ReteICA are on it). */
  subtotal?: number;
  /** IVA charged (ReteIVA is on it). */
  iva?: number;
};

/** One invoice a deposit is assigned to: money, plus the withholdings applied to it. */
export type Assignment = { invoiceId: string; value: number; retentions?: CollectionRetention[] };

/** Cutoff of the receipts history: RCs made in Siigo since then are imported. */
export const RECEIPTS_SINCE = "2026-09-01";

const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => Number(v ?? 0) || 0;

/** ReteICA rates in Siigo are per thousand (9.66 = 9,66 ‰); the others, percentages. */
export const retentionRate = (type: RetentionType, percentage: number) => (type === "ReteICA" ? percentage / 1000 : percentage / 100);

/** The base a withholding is on: the IVA for ReteIVA, the value before taxes for the rest. */
export function retentionBase(type: RetentionType, inv: { subtotal?: number; iva?: number }): number {
  return round2(type === "ReteIVA" ? num(inv.iva) : num(inv.subtotal));
}

/** A withholding on an invoice, with its base and value computed. */
export function computeRetention(opt: RetentionOption, inv: { subtotal?: number; iva?: number }): CollectionRetention {
  const base = retentionBase(opt.type, inv);
  return { ...opt, base, value: Math.round(base * retentionRate(opt.type, opt.percentage)) };
}

/** Sum of an item's withholdings. */
export const retentionTotal = (r: { retentions?: { value: number }[] | null }) => round2((r.retentions ?? []).reduce((s, x) => s + num(x.value), 0));

/** What an assignment takes off the invoice's balance: money plus withholdings. */
export const appliedValue = (a: { value: number; retentions?: { value: number }[] | null }) => round2(num(a.value) + retentionTotal(a));

/** An invoice line as Siigo returns it (only what the base needs). */
export type SiigoInvoiceLine = { quantity?: number; price?: number; discount?: number | { value?: number } | null; taxes?: { type?: string; value?: number }[] };

/** Value before taxes and IVA of a Siigo invoice, from its lines (IVA falls back to total − subtotal). */
export function invoiceAmounts(items: SiigoInvoiceLine[] | undefined, total: number): { subtotal: number; iva: number } {
  const lines = items ?? [];
  const discountOf = (d: SiigoInvoiceLine["discount"]) => (typeof d === "number" ? d : num(d?.value));
  const subtotal = round2(lines.reduce((s, l) => s + num(l.quantity) * num(l.price) - discountOf(l.discount), 0));
  const taxed = lines.some((l) => (l.taxes ?? []).length);
  const iva = taxed ? round2(lines.reduce((s, l) => s + (l.taxes ?? []).filter((t) => t.type === "IVA").reduce((a, t) => a + num(t.value), 0), 0)) : round2(Math.max(0, num(total) - subtotal));
  return { subtotal, iva };
}

/** The withholdings of an assignment checked against Siigo's catalog, with the base recomputed from the invoice. */
export function normalizeRetentions(list: CollectionRetention[] | undefined, catalog: RetentionOption[], inv: { subtotal?: number; iva?: number }): CollectionRetention[] {
  const byId = new Map(catalog.map((c) => [c.id, c]));
  return (list ?? [])
    .filter((r) => num(r.value) > 0)
    .map((r) => {
      const opt = byId.get(Number(r.id));
      if (!opt) throw new Error(`La retención ${r.name ?? r.id} no existe en Siigo.`);
      return { ...opt, base: retentionBase(opt.type, inv), value: round2(num(r.value)) };
    });
}

/** What stops registering a deposit. */
export function collectionProblems(
  c: { date: string; amount: number; method: string; assigned: Assignment[] },
  invoices: OpenInvoice[],
  today: string
): string[] {
  const p: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.date)) p.push("Fecha del abono inválida.");
  else if (c.date > today) p.push("La fecha del abono no puede ser futura.");
  if (!["transfer", "cash"].includes(c.method)) p.push("Elige si entró al banco o a caja.");
  const amount = round2(num(c.amount));
  const assigned = c.assigned.filter((a) => appliedValue(a) > 0);
  // Only withholdings (the money came before): a receipt of $0 that settles them.
  const onlyRetentions = amount === 0 && assigned.length > 0 && assigned.every((a) => !(num(a.value) > 0) && retentionTotal(a) > 0);
  if (!(amount > 0) && !onlyRetentions) p.push("Escribe el valor del abono.");
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
    if (num(a.value) < 0) p.push(`${inv.name}: el abono no puede ser negativo.`);
    for (const r of a.retentions ?? []) {
      if (!(num(r.value) > 0)) p.push(`${inv.name}: escribe el valor de la ${r.name}.`);
      if (!(num(r.base) > 0)) p.push(`${inv.name}: la ${r.name} no tiene base.`);
    }
    if (new Set((a.retentions ?? []).map((r) => r.type)).size < (a.retentions ?? []).length) p.push(`${inv.name}: hay dos retenciones del mismo tipo.`);
    if (appliedValue(a) > round2(inv.balance) + 0.5) {
      p.push(retentionTotal(a) > 0 ? `${inv.name}: el abono más la retención supera su saldo (${round2(inv.balance)}).` : `${inv.name}: el valor supera su saldo (${round2(inv.balance)}).`);
    }
  }
  if (customers.size > 1) p.push("Un abono solo puede pagar facturas de un mismo cliente.");
  const total = round2(assigned.reduce((s, a) => s + num(a.value), 0));
  if (amount > 0 && assigned.length && Math.abs(total - amount) > 0.5) p.push(`Lo asignado (${total}) no cuadra con el valor del abono (${amount}).`);
  return p;
}

/** One recibo de caja per Siigo branch: a deposit for several sedes becomes several RCs. */
export function receiptsByBranch(assigned: Assignment[], invoices: OpenInvoice[]): Map<number, CollectionItem[]> {
  const byId = new Map(invoices.map((i) => [i.id, i]));
  const out = new Map<number, CollectionItem[]>();
  for (const a of assigned) {
    const inv = byId.get(a.invoiceId);
    if (!inv || !(appliedValue(a) > 0)) continue;
    const list = out.get(inv.branch_office) ?? [];
    const retentions = (a.retentions ?? []).filter((r) => num(r.value) > 0).map((r) => ({ ...r, base: round2(num(r.base)), value: round2(num(r.value)) }));
    list.push({ siigo_invoice_id: inv.id, name: inv.name, due_date: inv.due_date, value: round2(num(a.value)), ...(retentions.length ? { retentions } : {}) });
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
