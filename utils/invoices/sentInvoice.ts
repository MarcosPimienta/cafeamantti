// Siigo sometimes answers an invoice POST with a generic error and still
// creates the invoice moments later. Before calling an invoice failed (or
// sending it again), the app looks for it in Siigo by the order number the
// invoice carries in its observations ("Pedido Café Amantti #8be90fc1").
// Pure; the server action brings Siigo's list.

/** An invoice as GET /v1/invoices lists it (only what the match needs). */
export type SiigoInvoiceDoc = {
  id: string;
  name?: string;
  date?: string;
  total?: number;
  annulled?: boolean;
  observations?: string | null;
  public_url?: string;
  customer?: { identification?: string } | null;
  stamp?: { status?: string; cufe?: string; errors?: string } | null;
  metadata?: { created?: string } | null;
};

/** The order's tag in the observations: "#" + the first block of its id. */
export const orderTag = (orderId: string) => `#${orderId.split("-")[0]}`;

/** Siigo's error that gives no reason ("Please verify ()"). */
export const isGenericSiigoError = (msg: string) => /could not be completed with the data you submitted/i.test(msg);

export const GENERIC_ERROR_ES =
  "Siigo no aceptó la factura y no dijo por qué. A veces está lento y la crea unos minutos después: espera un momento y dale a «Enviar solo esta» otra vez; la app revisa primero si ya quedó creada en Siigo.";

/**
 * The Siigo invoice made for this order, or null: same order tag, same
 * customer and total, not annulled, and not already another app invoice
 * (`taken`, the Siigo ids the app has). The oldest one wins.
 */
export function findSentInvoice(
  docs: SiigoInvoiceDoc[],
  want: { orderId: string; identification: string | null; total: number },
  taken: ReadonlySet<string> = new Set()
): SiigoInvoiceDoc | null {
  const tag = new RegExp(`${orderTag(want.orderId)}(?![0-9a-f])`, "i");
  const matches = docs.filter(
    (d) =>
      !d.annulled &&
      !taken.has(d.id) &&
      tag.test(d.observations ?? "") &&
      (!want.identification || String(d.customer?.identification ?? "") === want.identification) &&
      Math.abs(Number(d.total ?? NaN) - Number(want.total)) < 1
  );
  const created = (d: SiigoInvoiceDoc) => d.metadata?.created ?? d.date ?? "";
  return matches.sort((a, b) => created(a).localeCompare(created(b)))[0] ?? null;
}
