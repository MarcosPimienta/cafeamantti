import { describe, it, expect } from "vitest";
import { allocatePayment, billProblems, billTotals, payableBalance, payablePaymentProblems, type BillLine } from "../ledger";
import { buildPaymentReceiptPayload, buildPurchaseBillPayload, type SiigoSettings } from "@/utils/siigo/mapping";

const line = (patch: Partial<BillLine>): BillLine => ({ category: "Costo de Ventas (Materia prima, insumos, empaques)", account: "52954001", description: "Empaques", base: 325000, tax_id: 13156, tax_rate: 19, retention_id: null, retention_rate: 0, ...patch });

describe("purchase invoices", () => {
  it("totals like FC-1-236 (325.000 + IVA 19%) and with Retefuente", () => {
    expect(billTotals([line({})])).toMatchObject({ subtotal: 325000, iva: 61750, withheld: 0, total: 386750 });
    expect(billTotals([line({ base: 1000000, tax_id: null, tax_rate: 0, retention_id: 9759, retention_rate: 4 })])).toMatchObject({ withheld: 40000, total: 960000 });
  });

  it("checks supplier, invoice number, dates and lines", () => {
    const ok = { supplier_identification: "901980434", provider_number: "1968", issue_date: "2026-10-15", due_date: "2026-11-14", lines: [line({})] };
    expect(billProblems(ok)).toEqual([]);
    expect(billProblems({ ...ok, provider_number: "FETD1968" })).toEqual(["El número de la factura del proveedor debe tener solo dígitos (el prefijo va aparte)."]);
    expect(billProblems({ ...ok, due_date: "2026-10-01" })).toEqual(["La fecha de vencimiento debe ser igual o posterior a la de la factura."]);
    expect(billProblems({ ...ok, lines: [line({ category: "Maquinaria y Equipo (PUC 1520)", account: "", base: 0 })] }, ["Maquinaria y Equipo (PUC 1520)"])).toEqual([
      "Línea 1: los activos fijos se registran en Flujo de Caja, no aquí.",
      "Línea 1: elige la cuenta contable.",
      "Línea 1: el valor debe ser mayor a cero.",
    ]);
  });

  it("a payment is split by category in proportion, IVA inside, adding up exactly", () => {
    const lines = [line({}), line({ category: "Costos de Producción (Maquila, Servicio de tostión)", account: "61800102", base: 100000, tax_id: null, tax_rate: 0 })];
    const parts = allocatePayment(lines, 243375); // half of 486.750
    expect(parts).toEqual([
      { category: "Costo de Ventas (Materia prima, insumos, empaques)", amount: 193375, tax: 30875 },
      { category: "Costos de Producción (Maquila, Servicio de tostión)", amount: 50000, tax: 0 },
    ]);
    expect(parts.reduce((s, p) => s + p.amount, 0)).toBe(243375);
  });

  it("balance and payment checks", () => {
    expect(payableBalance(386750, [{ amount: 100000 }])).toBe(286750);
    expect(payablePaymentProblems(286750, 300000, "2026-10-15")).toEqual(["El pago supera el saldo por pagar."]);
    expect(payablePaymentProblems(286750, 0, "x")).toEqual(["El valor del pago debe ser mayor a cero.", "Fecha del pago inválida."]);
  });
});

const SETTINGS = { purchase_document_id: 18133, purchase_payment_id: 4183, payment_receipt_document_id: 18132, payout_bank_id: 4182, payout_cash_id: 4177, expense_accounts: {}, fixed_asset_codes: {} } as SiigoSettings;

describe("Siigo payloads", () => {
  it("purchase invoice with the supplier's number, taxes per line, owed until paid", () => {
    const { payload, problems } = buildPurchaseBillPayload(
      { supplier_identification: "901980434", provider_prefix: "FETD", provider_number: "1968", issue_date: "2026-10-15", due_date: "2026-11-14", notes: "COMPRA EMPAQUES", total: 386750, lines: [{ account: "52954001", description: "Empaques", base: 325000, tax_id: 13156, retention_id: null }] },
      SETTINGS
    );
    expect(problems).toEqual([]);
    expect(payload).toEqual({
      document: { id: 18133 }, date: "2026-10-15", supplier: { identification: "901980434", branch_office: 0 },
      provider_invoice: { prefix: "FETD", number: "1968" }, observations: "COMPRA EMPAQUES",
      items: [{ type: "Account", code: "52954001", description: "Empaques", quantity: 1, price: 325000, taxes: [{ id: 13156 }] }],
      payments: [{ id: 4183, value: 386750, due_date: "2026-11-14" }],
    });
  });

  it("egreso against the supplier's invoice, like RP-999-108", () => {
    const { payload, problems } = buildPaymentReceiptPayload(
      { date: "2026-10-20", amount: 386750, method: "bank" },
      { supplier_identification: "901980434", prefix: "FETD", consecutive: "1968", date: "2026-11-14", label: "factura FETD1968" },
      SETTINGS
    );
    expect(problems).toEqual([]);
    expect(payload).toMatchObject({
      document: { id: 18132 }, date: "2026-10-20", type: "DebtPayment", supplier: { identification: "901980434" },
      items: [{ due: { prefix: "FETD", consecutive: 1968, quote: 1, date: "2026-11-14" }, value: 386750 }],
      payment: { id: 4182, value: 386750 },
    });
  });
});
