import { describe, it, expect } from "vitest";
import { balanceDue, daysOverdue, invoiceLinesFromOrder, paymentProblems, paymentState, type LedgerInvoice } from "../ledger";
import { addDays, buildInvoicePayload, buildVoucherPayload, splitDocumentName, type SiigoSettings } from "@/utils/siigo/mapping";

const credit: LedgerInvoice = { total: 100000, status: "emitida", payment_terms: "credito", due_date: "2026-10-10" };

describe("what the customer owes", () => {
  it("balance and state follow the payments", () => {
    expect(balanceDue(credit, [])).toBe(100000);
    expect(paymentState(credit, [])).toBe("pendiente");
    expect(paymentState(credit, [{ amount: 40000 }])).toBe("parcial");
    expect(balanceDue(credit, [{ amount: 40000 }, { amount: "60000" }])).toBe(0);
    expect(paymentState(credit, [{ amount: 40000 }, { amount: 60000 }])).toBe("pagada");
  });

  it("a cash sale is paid when invoiced and takes no payments", () => {
    const cash = { ...credit, payment_terms: "contado" as const };
    expect(balanceDue(cash, [])).toBe(0);
    expect(paymentState(cash, [])).toBe("pagada");
    expect(paymentProblems(cash, [], 1000, "2026-10-14")).toContain("La factura es de contado: ya quedó pagada al facturar.");
  });

  it("overdue only when issued, past the due date and still owed", () => {
    expect(daysOverdue(credit, [], "2026-10-14")).toBe(4);
    expect(daysOverdue(credit, [], "2026-10-10")).toBe(0);
    expect(daysOverdue(credit, [{ amount: 100000 }], "2026-10-14")).toBe(0);
    expect(daysOverdue({ ...credit, status: "borrador" }, [], "2026-10-14")).toBe(0);
  });

  it("rejects payments that are empty, too big, undated or on a voided invoice", () => {
    expect(paymentProblems(credit, [{ amount: 90000 }], 10000, "2026-10-14")).toEqual([]);
    expect(paymentProblems(credit, [{ amount: 90000 }], 20000, "2026-10-14")).toEqual(["El pago supera el saldo de la factura."]);
    expect(paymentProblems(credit, [], 0, "2026-10-14")).toEqual(["El valor del pago debe ser mayor a cero."]);
    expect(paymentProblems(credit, [], 1000, "14/10/2026")).toEqual(["Fecha del pago inválida."]);
    expect(paymentProblems({ ...credit, status: "anulada" }, [], 1000, "2026-10-14")).toEqual(["La factura está anulada."]);
  });

  it("copies the order lines with the Siigo code, IVA and link", () => {
    const lines = invoiceLinesFromOrder([
      { quantity: 2, price_at_time: "35000", inventory: { id: "i1", product_code: "CAFT-250G", product_name: "Premium 250 g", siigo_code: "004", sales_tax_id: null } },
      { product_id: "Viejo", quantity: 1, price_at_time: 5000, inventory: null },
    ]);
    expect(lines).toEqual([
      { inventory_id: "i1", code: "004", name: "Premium 250 g", quantity: 2, unit_price: 35000, tax_id: null, linked: true },
      { inventory_id: null, code: null, name: "Viejo", quantity: 1, unit_price: 5000, tax_id: null, linked: false },
    ]);
  });
});

const SETTINGS = {
  invoice_document_id: 24446, seller_id: 629, payment_transfer_id: 5638, payment_credit_id: 5640, credit_term_days: 30, sales_tax_id: 13156,
  voucher_document_id: 9001, voucher_transfer_id: 77, voucher_cash_id: 78, stamp_dian: true, expense_accounts: {}, fixed_asset_codes: {},
} as unknown as SiigoSettings;

describe("Siigo payloads for credit sales", () => {
  it("a credit invoice uses the credit payment with its due date", () => {
    const { payload, problems } = buildInvoicePayload(
      { id: "o1", total_amount: 70000, shipping_cost: 0, notes: null, payment_method: "credit", term_days: 15 },
      [{ product_code: "004", name: "Premium", quantity: 2, unit_price: 35000, linked: true, tax_id: null }],
      "1036123456", SETTINGS, "2026-10-14"
    );
    expect(problems).toEqual([]);
    expect(payload.payments).toEqual([{ id: 5640, value: 70000, due_date: "2026-10-29" }]);
  });

  it("splits Siigo document names and adds days across months", () => {
    expect(splitDocumentName("FV-1-55")).toEqual({ prefix: "FV-1", consecutive: 55 });
    expect(splitDocumentName("")).toBeNull();
    expect(addDays("2026-10-20", 30)).toBe("2026-11-19");
  });

  it("a payment becomes a DebtPayment receipt against the invoice", () => {
    const { payload, problems } = buildVoucherPayload(
      { id: "p1", payment_date: "2026-11-02", amount: 40000, method: "transfer", notes: "Bancolombia" },
      { siigo_name: "FV-1-55", due_date: "2026-11-13", customer_identification: "1036123456" },
      SETTINGS
    );
    expect(problems).toEqual([]);
    expect(payload).toMatchObject({
      document: { id: 9001 }, date: "2026-11-02", type: "DebtPayment", customer: { identification: "1036123456" },
      items: [{ due: { prefix: "FV-1", consecutive: 55, quote: 1, date: "2026-11-13" }, value: 40000 }],
      payment: { id: 77, value: 40000 },
    });
  });

  it("a receipt needs its settings and an issued invoice", () => {
    const { problems } = buildVoucherPayload({ id: "p1", payment_date: "2026-11-02", amount: 1, method: "web" }, { siigo_name: null, due_date: null, customer_identification: null }, { ...SETTINGS, voucher_document_id: null } as SiigoSettings);
    expect(problems).toEqual([
      "Elige el tipo de recibo de caja en Ajustes → Siigo.",
      "Elige la forma de pago de los recibos de caja para este medio en Ajustes → Siigo.",
      "La factura aún no tiene número de Siigo: envíala primero.",
      "La factura no tiene la identificación del cliente.",
    ]);
  });
});

import { creditNoteLines } from "../ledger";
import { buildCreditNotePayload } from "@/utils/siigo/mapping";

describe("credit note lines", () => {
  const inv = { total: 105000, credited: 0, lines: [
    { inventory_id: "a", code: "004", name: "Premium 250 g", quantity: 2, unit_price: 35000, tax_id: null, linked: true },
    { inventory_id: "b", code: "0040", name: "Honey 250 g", quantity: 1, unit_price: 35000, tax_id: null, linked: true },
  ] };

  it("an annulment takes every line, once", () => {
    expect(creditNoteLines(inv, { reason: 2, cancelOrder: false }).lines).toHaveLength(2);
    expect(creditNoteLines({ ...inv, credited: 1000 }, { reason: 2, cancelOrder: false }).problems[0]).toMatch(/ya tiene notas crédito/);
  });

  it("a return can't exceed what is left to return", () => {
    const ok = creditNoteLines(inv, { reason: 1, items: [{ index: 0, quantity: 1, restock: false }, { index: 1, quantity: 0, restock: true }] });
    expect(ok).toEqual({ lines: [expect.objectContaining({ code: "004", quantity: 1, restock: false })], problems: [] });
    expect(creditNoteLines(inv, { reason: 1, items: [{ index: 0, quantity: 2, restock: true }] }, { 0: 1 }).problems).toEqual(['"Premium 250 g": solo quedan 1 por devolver.']);
    expect(creditNoteLines(inv, { reason: 1, items: [] }).problems).toEqual(["Indica qué productos o valores incluye la nota crédito."]);
  });

  it("a discount keeps the units at a lower price and can't exceed the line", () => {
    expect(creditNoteLines(inv, { reason: 3, items: [{ index: 0, amount: 10000 }] }).lines[0]).toMatchObject({ quantity: 2, unit_price: 5000 });
    expect(creditNoteLines(inv, { reason: 4, items: [{ index: 1, amount: 40000 }] }).problems).toEqual(['"Honey 250 g": la rebaja supera el valor de la línea.']);
  });

  it("the Siigo body mirrors the invoice payment and adds shipping on an annulment", () => {
    const { payload, problems, total } = buildCreditNotePayload(
      { siigo_invoice_id: "sg", payment_terms: "credito", payment_method: null, due_date: "2026-10-29" },
      { reason: 2, lines: inv.lines, shipping: 8000, invoiceName: "FV-2-720" },
      { ...SETTINGS, credit_note_document_id: 27178, shipping_product_code: "ENVIO", sales_tax_id: 9755 } as SiigoSettings,
      "2026-10-15"
    );
    expect(problems).toEqual([]);
    expect(total).toBe(113000);
    expect(payload).toMatchObject({ document: { id: 27178 }, invoice: "sg", reason: 2, date: "2026-10-15", payments: [{ id: 5640, value: 113000, due_date: "2026-10-29" }] });
    expect(payload.items).toEqual([
      { code: "004", description: "Premium 250 g", quantity: 2, taxed_price: 35000, taxes: [{ id: 9755 }] },
      { code: "0040", description: "Honey 250 g", quantity: 1, taxed_price: 35000, taxes: [{ id: 9755 }] },
      { code: "ENVIO", description: "Envío", quantity: 1, price: 8000, taxes: [] },
    ]);
  });
});

import { lineGross } from "@/utils/siigo/mapping";
describe("IVA on top", () => {
  it("a line before IVA charges its rate on top; one with IVA included charges its price", () => {
    expect(lineGross({ quantity: 6, unit_price: 140400, tax_included: false, tax_rate: 5 }, true)).toBe(884520);
    expect(lineGross({ quantity: 6, unit_price: 140400 }, true)).toBe(842400);
    expect(lineGross({ quantity: 6, unit_price: 140400, tax_included: false, tax_rate: 5 }, false)).toBe(842400); // product without IVA
  });
});

import { relinkLines } from "../ledger";
describe("relinking invoice lines", () => {
  const line = { inventory_id: "a", code: "AROM-SURT", name: "Aromáticas", quantity: 1, unit_price: 1000, tax_id: null, linked: false };
  it("takes the Siigo code of a product linked after the invoice", () => {
    const next = relinkLines([line], [{ id: "a", product_code: "AROM-SURT", siigo_code: "0038", siigo_product_id: "x" }]);
    expect(next[0]).toMatchObject({ code: "0038", linked: true });
  });
  it("keeps the same lines when nothing changed or the product is gone", () => {
    const lines = [line];
    expect(relinkLines(lines, [{ id: "a", product_code: "AROM-SURT" }])).toBe(lines);
    expect(relinkLines(lines, [])).toBe(lines);
  });
});
