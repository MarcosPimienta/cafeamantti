import { describe, it, expect } from "vitest";
import { allocatePayment, billMatches, billProblems, billTotals, creditedOf, partialCreditEffect, partialCreditProblems, payableBalance, payablePaymentProblems, type BillLine } from "../ledger";
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
    expect(billProblems({ ...ok, lines: [line({ account: "", base: 0 })] })).toEqual([
      "Línea 1: elige la cuenta contable.",
      "Línea 1: el valor debe ser mayor a cero.",
    ]);
  });

  it("a fixed asset line needs its useful life and never moves stock", () => {
    const ok = { supplier_identification: "901980434", provider_number: "77", issue_date: "2026-10-15", due_date: "2026-10-15", lines: [line({})] };
    const CAPEX = ["Maquinaria y Equipo (PUC 1520)"];
    const molino = line({ category: CAPEX[0], account: "15200501", description: "Molino", depreciation_months: 120 });
    expect(billProblems({ ...ok, lines: [molino] }, CAPEX)).toEqual([]);
    expect(billProblems({ ...ok, lines: [{ ...molino, depreciation_months: null, inventory_id: "inv-1", inventory_qty: 1 }] }, CAPEX)).toEqual([
      "Línea 1: indica la vida útil del activo en meses.",
      "Línea 1: un activo fijo no entra al inventario.",
    ]);
  });

  it("each fixed asset line is its own part of a payment, with its useful life", () => {
    const lines = [
      line({}),
      line({ category: "Maquinaria y Equipo (PUC 1520)", account: "15200501", description: "Molino", base: 1000000, tax_rate: 19, depreciation_months: 120, in_service_date: "2026-10-20" }),
      line({ category: "Maquinaria y Equipo (PUC 1520)", account: "15200501", description: "Balanza", base: 100000, tax_rate: 19, depreciation_months: 60 }),
    ];
    const parts = allocatePayment(lines, billTotals(lines).total);
    expect(parts).toEqual([
      { category: "Costo de Ventas (Materia prima, insumos, empaques)", amount: 386750, tax: 61750 },
      { category: "Maquinaria y Equipo (PUC 1520)", amount: 1190000, tax: 190000, asset: { description: "Molino", months: 120, in_service_date: "2026-10-20", use: null } },
      { category: "Maquinaria y Equipo (PUC 1520)", amount: 119000, tax: 19000, asset: { description: "Balanza", months: 60, in_service_date: null, use: null } },
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

  it("a fixed asset line goes as FixedAsset when its class has a Siigo code, else to its 15xx account", () => {
    const bill = {
      supplier_identification: "901980434", provider_prefix: "FE", provider_number: "77", issue_date: "2026-10-15", due_date: "2026-10-15", total: 1190000,
      lines: [{ category: "Maquinaria y Equipo (PUC 1520)", account: "15200501", description: "Molino", base: 1000000, tax_id: 13156, retention_id: null, depreciation_months: 120 }],
    };
    expect(buildPurchaseBillPayload(bill, SETTINGS).payload.items[0]).toMatchObject({ type: "Account", code: "15200501" });
    const withCode = { ...SETTINGS, fixed_asset_codes: { "Maquinaria y Equipo (PUC 1520)": "MAQ-01" } };
    expect(buildPurchaseBillPayload(bill, withCode).payload.items[0]).toMatchObject({ type: "FixedAsset", code: "MAQ-01", taxes: [{ id: 13156 }] });
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

describe("searching purchase invoices", () => {
  const bill = { supplier_name: "Todo Empaques Restrepo SAS", supplier_identification: "901234567", provider_prefix: "FE", provider_number: "3692", siigo_name: "FC-1-45", notes: "Bolsas diciembre", lines: [{ description: "250 G 4PRO KRAFT NATURAL" }] };
  it.each(["todo empaques", "RESTREPO", "FE-3692", "fe3692", "3692", "fc-1-45", "kraft", "diciembre", "901234567", "90123"])("finds it by %s", (q) => expect(billMatches(bill, q)).toBe(true));
  it.each(["3693", "café", "9012", "erco"])("not by %s", (q) => expect(billMatches(bill, q)).toBe(false));
  it("an empty search keeps everything", () => expect(billMatches(bill, " ")).toBe(true));
});

describe("partial credit notes from a supplier", () => {
  it("lower what is owed", () => {
    expect(payableBalance(1899899, [], 299899)).toBe(1600000);
    expect(payableBalance(1000, [{ amount: 900 }], 200)).toBe(0);
    expect(creditedOf([{ total: 100, partial: true }, { total: 50, partial: true }, { total: 999, partial: false }])).toBe(150);
  });

  it("on an unpaid invoice nothing goes to saldo a favor; on a paid one the excess does", () => {
    expect(partialCreditEffect(1899899, 0, 0, 299899)).toEqual({ newValue: 1600000, excess: 0 });
    // VEM-74082, paid in full: a discount of $474.776 is money the supplier now holds.
    expect(partialCreditEffect(4274776, 0, 4274776, 474776)).toEqual({ newValue: 3800000, excess: 474776 });
    // Paid in part: only what passes the new value.
    expect(partialCreditEffect(4274776, 0, 3025224, 1474776)).toEqual({ newValue: 2800000, excess: 225224 });
    // A second note counts only its own excess.
    expect(partialCreditEffect(1000, 200, 900, 100)).toEqual({ newValue: 700, excess: 100 });
  });

  it("must be above zero and below what is left; all of it is a void, not a partial note", () => {
    expect(partialCreditProblems(1000, 0, 0)).toHaveLength(1);
    expect(partialCreditProblems(1000, 200, 900)[0]).toMatch(/supera/);
    expect(partialCreditProblems(1000, 200, 800)[0]).toMatch(/Toda la factura/);
    expect(partialCreditProblems(1000, 200, 300)).toEqual([]);
  });
});

