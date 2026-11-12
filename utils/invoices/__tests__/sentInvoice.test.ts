import { describe, it, expect } from "vitest";
import { findSentInvoice, isGenericSiigoError, orderTag, type SiigoInvoiceDoc } from "../sentInvoice";

const doc = (over: Partial<SiigoInvoiceDoc>): SiigoInvoiceDoc => ({
  id: "s1",
  name: "FV-2-778",
  total: 157500,
  observations: "Pedido Café Amantti #290a5923 · LA 10",
  customer: { identification: "901656887" },
  metadata: { created: "2026-11-12T10:50:49" },
  ...over,
});
const want = { orderId: "290a5923-a0ad-4586-8361-53395ce6942f", identification: "901656887", total: 157500 };

describe("finding an invoice Siigo created despite an error", () => {
  it("matches by order tag, customer and total", () => {
    expect(orderTag(want.orderId)).toBe("#290a5923");
    expect(findSentInvoice([doc({})], want)?.name).toBe("FV-2-778");
  });

  it("ignores other orders, customers, totals, annulled and taken invoices", () => {
    expect(findSentInvoice([doc({ observations: "Pedido Café Amantti #e3517fac · JUMBO" })], want)).toBeNull();
    expect(findSentInvoice([doc({ observations: "Pedido Café Amantti #290a5923ab" })], want)).toBeNull();
    expect(findSentInvoice([doc({ customer: { identification: "902038087" } })], want)).toBeNull();
    expect(findSentInvoice([doc({ total: 60000 })], want)).toBeNull();
    expect(findSentInvoice([doc({ annulled: true })], want)).toBeNull();
    expect(findSentInvoice([doc({})], want, new Set(["s1"]))).toBeNull();
  });

  it("takes the oldest when Siigo made two", () => {
    const docs = [doc({ id: "b", name: "FV-2-779", metadata: { created: "2026-11-12T11:00:00" } }), doc({ id: "a" })];
    expect(findSentInvoice(docs, want)?.name).toBe("FV-2-778");
  });

  it("recognises Siigo's reasonless error", () => {
    expect(isGenericSiigoError("Your request could not be completed with the data you submitted. Please verify ()")).toBe(true);
    expect(isGenericSiigoError("The invoice field has an invalid value (invoice)")).toBe(false);
  });
});
