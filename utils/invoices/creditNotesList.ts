// Every credit note in one list: the ones Siigo has (made from the app or
// straight in Siigo) and the app's own records, joined by their Siigo name.
// Pure; the server action brings both lists.

import { CREDIT_REASONS, type CreditReason } from "./ledger";

/** A credit note as GET /v1/credit-notes lists it (only what the list needs). */
export type SiigoCreditNoteDoc = {
  id: string;
  name?: string;
  date?: string;
  reason?: number | string;
  total?: number;
  annulled?: boolean;
  invoice?: { id?: string; name?: string } | null;
  customer?: { identification?: string } | null;
  stamp?: { status?: string } | null;
  observations?: string | null;
};

/** A credit note as the app keeps it, with its invoice. */
export type AppCreditNote = {
  id: string;
  reason: number;
  total: number;
  origin: "app" | "siigo";
  siigo_id: string | null;
  siigo_name: string | null;
  siigo_status: string | null;
  notes: string | null;
  created_at: string;
  invoice: { id: string; siigo_name: string | null; customer_name: string | null } | null;
};

export type CreditNoteRow = {
  key: string;
  date: string;
  name: string | null;
  invoiceName: string | null;
  /** The app's invoice, to jump to it (null for invoices made in Siigo). */
  invoiceId: string | null;
  customer: string;
  reason: string;
  total: number;
  /** DIAN status as Siigo says it (Draft = not sent yet). */
  dian: string | null;
  /** Made from the app, or straight in Siigo. */
  origin: "app" | "siigo";
  notes: string | null;
};

const reasonLabel = (r: unknown) => CREDIT_REASONS[Number(r) as CreditReason] ?? "Otro motivo";

/**
 * Siigo's notes, enriched with the app's record when there is one, plus the
 * app's notes Siigo didn't list (Siigo down, or older than the window).
 * Newest first. `nameOf` turns a NIT into the customer's name.
 */
export function mergeCreditNotes(siigo: SiigoCreditNoteDoc[], app: AppCreditNote[], nameOf: (nit: string) => string | null): CreditNoteRow[] {
  const byId = new Map(app.filter((n) => n.siigo_id).map((n) => [n.siigo_id as string, n]));
  const byName = new Map(app.filter((n) => n.siigo_name).map((n) => [n.siigo_name as string, n]));
  const used = new Set<string>();
  const rows: CreditNoteRow[] = [];

  for (const d of siigo) {
    if (d.annulled) continue;
    const mine = byId.get(d.id) ?? (d.name ? byName.get(d.name) : undefined);
    if (mine) used.add(mine.id);
    const nit = String(d.customer?.identification ?? "");
    rows.push({
      key: `siigo:${d.id}`,
      date: String(d.date ?? mine?.created_at ?? "").slice(0, 10),
      name: d.name ?? mine?.siigo_name ?? null,
      invoiceName: d.invoice?.name ?? mine?.invoice?.siigo_name ?? null,
      invoiceId: mine?.invoice?.id ?? null,
      customer: mine?.invoice?.customer_name ?? (nit ? nameOf(nit) ?? `NIT ${nit}` : "—"),
      reason: reasonLabel(d.reason ?? mine?.reason),
      total: Number(d.total ?? mine?.total ?? 0),
      dian: d.stamp?.status ?? mine?.siigo_status ?? null,
      origin: mine?.origin === "app" ? "app" : "siigo",
      notes: mine?.notes ?? d.observations ?? null,
    });
  }

  for (const n of app) {
    if (used.has(n.id)) continue;
    rows.push({
      key: `app:${n.id}`,
      date: n.created_at.slice(0, 10),
      name: n.siigo_name,
      invoiceName: n.invoice?.siigo_name ?? null,
      invoiceId: n.invoice?.id ?? null,
      customer: n.invoice?.customer_name ?? "—",
      reason: reasonLabel(n.reason),
      total: Number(n.total),
      dian: n.siigo_status,
      origin: n.origin,
      notes: n.notes,
    });
  }

  return rows.sort((a, b) => b.date.localeCompare(a.date) || String(b.name ?? "").localeCompare(String(a.name ?? ""), "es", { numeric: true }));
}
