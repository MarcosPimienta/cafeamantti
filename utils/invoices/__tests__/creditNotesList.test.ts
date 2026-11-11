import { describe, it, expect } from "vitest";
import { mergeCreditNotes, type AppCreditNote, type SiigoCreditNoteDoc } from "../creditNotesList";

const appNote = (o: Partial<AppCreditNote>): AppCreditNote => ({
  id: "a1", reason: 2, total: 357000, origin: "app", siigo_id: null, siigo_name: null, siigo_status: null, notes: null,
  created_at: "2026-11-11T20:39:00Z", invoice: { id: "inv-773", siigo_name: "FV-2-773", customer_name: "Authentic Trust SAS" }, ...o,
});

describe("mergeCreditNotes", () => {
  it("joins Siigo's note with the app's record by Siigo id", () => {
    const siigo: SiigoCreditNoteDoc[] = [{ id: "s45", name: "NC-2-45", date: "2026-11-11", reason: 2, total: 357000, invoice: { name: "FV-2-773" }, customer: { identification: "9008938438" }, stamp: { status: "Draft" } }];
    const [r, ...rest] = mergeCreditNotes(siigo, [appNote({ siigo_id: "s45", siigo_name: "NC-2-45" })], () => null);
    expect(rest).toHaveLength(0);
    expect(r).toMatchObject({ name: "NC-2-45", invoiceName: "FV-2-773", invoiceId: "inv-773", customer: "Authentic Trust SAS", reason: "Anulación de la factura", dian: "Draft", origin: "app" });
  });

  it("names the customer of a note made in Siigo by its NIT", () => {
    const siigo: SiigoCreditNoteDoc[] = [{ id: "s38", name: "NC-2-38", date: "2026-10-27", reason: 1, total: 50000, invoice: { name: "FV-2-689" }, customer: { identification: "43568800" }, stamp: { status: "Accepted" } }];
    const [r] = mergeCreditNotes(siigo, [], (nit) => (nit === "43568800" ? "Magally Lopera Sierra" : null));
    expect(r).toMatchObject({ customer: "Magally Lopera Sierra", origin: "siigo", invoiceId: null, reason: "Devolución parcial" });
  });

  it("keeps the app's notes Siigo didn't list, skips annulled ones, newest first", () => {
    const siigo: SiigoCreditNoteDoc[] = [
      { id: "old", name: "NC-2-10", date: "2026-03-01", reason: 3, total: 1 },
      { id: "x", name: "NC-2-11", date: "2026-03-02", annulled: true },
    ];
    const rows = mergeCreditNotes(siigo, [appNote({ id: "a2", siigo_name: "NC-2-50", created_at: "2026-11-12T10:00:00Z" })], () => null);
    expect(rows.map((r) => r.name)).toEqual(["NC-2-50", "NC-2-10"]);
  });
});
