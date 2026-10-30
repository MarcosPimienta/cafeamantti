import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeClient, seedDB, ADMIN_ID, type FakeDB } from "@/test/fakeSupabase";

const h = vi.hoisted(() => ({
  client: null as unknown,
  calls: [] as { method: string; path: string; opts?: { body?: unknown; idempotencyKey?: string } }[],
  responses: {} as Record<string, unknown>,
}));
vi.mock("@/utils/supabase/server", () => ({ createClient: async () => h.client }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/utils/siigo/api", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/utils/siigo/api")>();
  const siigo = {
    request: async (method: string, path: string, opts?: { body?: unknown; idempotencyKey?: string }) => {
      h.calls.push({ method, path, opts });
      const r = h.responses[`${method} ${path}`];
      if (r instanceof Error) throw r;
      if (r === undefined) throw new Error(`unexpected Siigo call ${method} ${path}`);
      return r;
    },
  };
  return { ...real, getSiigoClient: () => siigo, siigoConfigFromEnv: () => ({ username: "u", accessKey: "k", partnerId: "CafeAmantti" }) };
});

import { annulBill, createBill, deleteAdvance, deletePayablePayment, getAdvanceBalance, registerAdvance, registerAdvanceRefund, registerPayablePayment, retryBill, retryPayablePayment, updateBill } from "../actions";

const SETTINGS = { purchase_document_id: 18133, purchase_payment_id: 4183, payment_receipt_document_id: 18132, payout_bank_id: 4182, payout_cash_id: 4177, expense_accounts: {}, fixed_asset_codes: {} };
const CC = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const EMPAQUES = "Costo de Ventas (Materia prima, insumos, empaques)";

let db: FakeDB;
beforeEach(() => {
  h.calls = [];
  h.responses = { "GET /v1/customers": { results: [{ id: "s" }] } };
  db = seedDB({
    siigo_settings: [{ id: 1, config: SETTINGS }],
    suppliers: [{ id: "sup1", name: "Todo Empaques SAS", document_type: "NIT", document_number: "901980434-1", address: "Cra 1", city: "Medellín" }, { id: "sup2", name: "Juan Técnico", document_number: "71709773" }],
    cuentas_cobro: [{ id: CC, number: 57, type: "gasto", status: "firmada", issuer_name: "Juan Técnico", issuer_document: "71709773", total_amount: 620000, concept: "Mantenimiento",
      siigo_ds_id: "ds-1", siigo_ds_name: "DS-1-45", siigo_ds_owed: 582800, siigo_ds_category: "Mantenimiento y Reparaciones", siigo_ds_date: "2026-10-12", expense_id: null }],
  });
  h.client = createFakeClient(db, { id: ADMIN_ID });
});

const bill = () => db.rows("purchase_bills")[0];
const expenses = () => db.rows("cashflow_expenses");
const input = {
  supplierId: "sup1", providerPrefix: "fetd", providerNumber: "1968", issueDate: "2026-10-15", dueDate: "2026-11-14", notes: "Empaques",
  lines: [{ category: EMPAQUES, account: "52954001", description: "Empaques kraft", base: 325000, tax_id: 13156, tax_rate: 19, retention_id: null, retention_rate: 0 }],
};

describe("purchase invoices (companies)", () => {
  it("are saved and sent to Siigo as purchase invoices owed to the supplier — never as support documents", async () => {
    h.responses["POST /v1/purchases"] = { id: "fc-1", name: "FC-1-240" };
    expect(await createBill(input)).toMatchObject({ success: true, sent: true, siigoName: "FC-1-240" });
    expect(bill()).toMatchObject({ status: "registrada", provider_prefix: "FETD", supplier_identification: "901980434", total: 386750, iva: 61750, siigo_name: "FC-1-240" });
    expect(h.calls.find((c) => c.path === "/v1/purchases")!.opts?.body).toMatchObject({ provider_invoice: { prefix: "FETD", number: "1968" }, payments: [{ id: 4183, value: 386750 }] });
    expect(h.calls.some((c) => c.path === "/v1/purchase-support-documents")).toBe(false);
    expect(expenses()).toHaveLength(0); // nothing in Flujo de Caja until it's paid
  });

  it("a Siigo rejection keeps the invoice with its error", async () => {
    h.responses["POST /v1/purchases"] = new Error("La cuenta 52954001 no existe");
    expect(await createBill(input)).toMatchObject({ success: true, sent: false, siigoError: "La cuenta 52954001 no existe" });
    expect(bill()).toMatchObject({ status: "error", siigo_error: "La cuenta 52954001 no existe" });
  });

  it("a payment makes the Siigo egreso and the Flujo de Caja expense on its date, for what was paid", async () => {
    h.responses["POST /v1/purchases"] = { id: "fc-1", name: "FC-1-240" };
    await createBill(input);
    h.responses["POST /v1/payment-receipts"] = { id: "rp-1", name: "RP-1-79" };
    const res = await registerPayablePayment({ billId: bill().id }, { date: "2026-10-20", amount: 200000, method: "bank" });
    expect(res).toMatchObject({ success: true, siigo: { sent: true, name: "RP-1-79" } });
    const rp = h.calls.find((c) => c.path === "/v1/payment-receipts")!;
    expect(rp.opts?.body).toMatchObject({ type: "DebtPayment", items: [{ due: { prefix: "FETD", consecutive: 1968, date: "2026-11-14" }, value: 200000 }], payment: { id: 4182, value: 200000 } });
    expect(expenses()).toEqual([expect.objectContaining({ category: EMPAQUES, amount: 200000, supplier_id: "sup1" })]);
    expect(db.rows("daily_cashflows").map((d) => d.date)).toContain("2026-10-20");
    expect(db.rows("payable_payments")[0]).toMatchObject({ siigo_status: "enviado", siigo_name: "RP-1-79" });
    expect(await registerPayablePayment({ billId: bill().id }, { date: "2026-10-21", amount: 200000, method: "bank" })).toMatchObject({ success: false, error: "El pago supera el saldo por pagar." });
  });

  it("equipment on credit: the invoice owes it, and each payment registers its part of the asset in Flujo de Caja", async () => {
    const MAQ = "Maquinaria y Equipo (PUC 1520)";
    h.responses["POST /v1/purchases"] = { id: "fc-2", name: "FC-1-241" };
    const molino = { category: MAQ, account: "15200501", description: "Molino Mahlkönig", base: 10000000, tax_id: 13156, tax_rate: 19, retention_id: null, retention_rate: 0, depreciation_months: 120 };
    expect(await createBill({ ...input, lines: [molino] })).toMatchObject({ success: true, sent: true });
    expect(bill()).toMatchObject({ total: 11900000, lines: [expect.objectContaining({ depreciation_months: 120, in_service_date: "2026-10-15" })] });
    expect(h.calls.find((c) => c.path === "/v1/purchases")!.opts?.body).toMatchObject({ items: [{ type: "Account", code: "15200501", taxes: [{ id: 13156 }] }] });
    h.responses["POST /v1/payment-receipts"] = { id: "rp-2", name: "RP-1-90" };
    await registerPayablePayment({ billId: bill().id }, { date: "2026-10-20", amount: 5950000, method: "bank" });
    expect(expenses()).toEqual([expect.objectContaining({
      category: MAQ, expense_type: "CAPEX", amount: 5950000, tax_amount: 950000, net_amount: 5000000,
      depreciation_months: 120, asset_kind: "Molino Mahlkönig", in_service_date: "2026-10-15",
    })]);
    expect(await createBill({ ...input, providerNumber: "1969", lines: [{ ...molino, depreciation_months: null }] })).toMatchObject({ success: false, error: "Línea 1: indica la vida útil del activo en meses." });
  });

  it("lines can use the team's categories: a fixed asset one asks for a useful life, a cost one is paid as COGS", async () => {
    db.rows("expense_categories").push(
      { id: "c1", name: "Bodega", expense_type: "CAPEX", depreciation_months: 240, active: true },
      { id: "c2", name: "Fletes de café verde", expense_type: "COGS", depreciation_months: null, active: true }
    );
    expect(await createBill({ ...input, lines: [{ ...input.lines[0], category: "Bodega", account: "15160501" }] })).toMatchObject({ success: false, error: "Línea 1: indica la vida útil del activo en meses." });
    h.responses["POST /v1/purchases"] = { id: "fc-3", name: "FC-1-242" };
    await createBill({ ...input, lines: [{ ...input.lines[0], category: "Fletes de café verde", account: "61350595", tax_id: null, tax_rate: 0 }] });
    h.responses["POST /v1/payment-receipts"] = { id: "rp-3", name: "RP-1-91" };
    await registerPayablePayment({ billId: bill().id }, { date: "2026-10-20", amount: 325000, method: "bank" });
    expect(expenses()).toEqual([expect.objectContaining({ category: "Fletes de café verde", expense_type: "COGS", amount: 325000 })]);
  });

  it("a payment Siigo rejects stays in Flujo de Caja and can be retried or deleted (with its expense)", async () => {
    h.responses["POST /v1/purchases"] = { id: "fc-1", name: "FC-1-240" };
    await createBill(input);
    h.responses["POST /v1/payment-receipts"] = new Error("Tipo de documento inválido");
    expect(await registerPayablePayment({ billId: bill().id }, { date: "2026-10-20", amount: 386750, method: "cash" })).toMatchObject({ success: true, siigo: { sent: false, error: "Tipo de documento inválido" } });
    const p = db.rows("payable_payments")[0];
    expect(p.siigo_status).toBe("error");
    h.responses["POST /v1/payment-receipts"] = { id: "rp-2", name: "RP-1-80" };
    expect(await retryPayablePayment(p.id)).toMatchObject({ success: true, name: "RP-1-80" });
    expect(await deletePayablePayment(p.id)).toMatchObject({ success: false });
    db.rows("payable_payments")[0].siigo_status = "error";
    expect(await deletePayablePayment(p.id)).toMatchObject({ success: true });
    expect(expenses()).toHaveLength(0);
  });
});

describe("paying a signed cuenta de cobro", () => {
  it("pays what the support document left owed, against CC + number", async () => {
    h.responses["POST /v1/payment-receipts"] = { id: "rp-3", name: "RP-1-81" };
    const res = await registerPayablePayment({ cuentaCobroId: CC }, { date: "2026-10-16", amount: 582800, method: "bank" });
    expect(res).toMatchObject({ success: true, siigo: { sent: true } });
    expect(h.calls.find((c) => c.path === "/v1/payment-receipts")!.opts?.body).toMatchObject({ supplier: { identification: "71709773" }, items: [{ due: { prefix: "CC", consecutive: 57, date: "2026-10-12" }, value: 582800 }] });
    expect(expenses()).toEqual([expect.objectContaining({ category: "Mantenimiento y Reparaciones", amount: 582800, supplier_id: "sup2" })]);
    expect(await registerPayablePayment({ cuentaCobroId: CC }, { date: "2026-10-16", amount: 1, method: "bank" })).toMatchObject({ success: false, error: "El pago supera el saldo por pagar." });
  });

  it("one typed into Siigo by hand only goes to Flujo de Caja", async () => {
    Object.assign(db.byId("cuentas_cobro", CC)!, { siigo_ds_id: null, siigo_ds_status: "manual", siigo_ds_owed: null });
    expect(await registerPayablePayment({ cuentaCobroId: CC }, { date: "2026-10-16", amount: 620000, method: "cash" })).toMatchObject({ success: true, siigo: null });
    expect(db.rows("payable_payments")[0].siigo_status).toBe("no_aplica");
    expect(h.calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("one already registered as an expense the old way is paid", async () => {
    db.byId("cuentas_cobro", CC)!.expense_id = "old";
    expect(await registerPayablePayment({ cuentaCobroId: CC }, { date: "2026-10-16", amount: 1, method: "bank" })).toMatchObject({ success: false, error: expect.stringContaining("ya se registró como gasto") });
  });
});

describe("purchase invoices that bring stock in", () => {
  beforeEach(() => {
    db.rows("inventory").push(
      { id: "verde", product_code: "CAFV-001", product_name: "Café Verde", unit: "kg", category: "cafe", current_stock: 10 },
      { id: "srv", product_code: "SRV-001", product_name: "Mantenimiento", unit: "servicio", category: "servicio", current_stock: 0 },
    );
  });
  const coffee = { ...input, providerNumber: "77", lines: [{ ...input.lines[0], description: "Café verde excelso", base: 1000000, tax_id: null, tax_rate: 0, inventory_id: "verde", inventory_qty: 598 }] };

  it("the line's product enters stock, linked to the invoice, on the invoice date", async () => {
    h.responses["POST /v1/purchases"] = { id: "fc-9", name: "FC-1-250" };
    expect(await createBill(coffee)).toMatchObject({ success: true, stocked: ["598 kg Café Verde"] });
    expect(db.byId("inventory", "verde")!.current_stock).toBe(608);
    expect(db.rows("inventory_movements")).toEqual([expect.objectContaining({ inventory_id: "verde", type: "entrada", quantity: 598, entry_type: "MP", tab_source: "entrada", movement_date: "2026-10-15", purchase_bill_id: bill().id, reason: "Compra · Todo Empaques SAS FETD77" })]);
  });

  it("stays in stock even if Siigo rejects the invoice (the purchase happened)", async () => {
    h.responses["POST /v1/purchases"] = new Error("Siigo caído");
    expect(await createBill(coffee)).toMatchObject({ success: true, sent: false });
    expect(db.byId("inventory", "verde")!.current_stock).toBe(608);
  });

  it("annulling takes it back out — unless it was already used", async () => {
    h.responses["POST /v1/purchases"] = new Error("Siigo caído"); // not in Siigo: can be annulled here
    await createBill(coffee);
    db.byId("inventory", "verde")!.current_stock = 100; // part of it was roasted
    expect(await annulBill(bill().id)).toMatchObject({ success: false, error: expect.stringContaining("ya se usó parte") });
    db.byId("inventory", "verde")!.current_stock = 700;
    expect(await annulBill(bill().id)).toMatchObject({ success: true });
    expect(db.byId("inventory", "verde")!.current_stock).toBe(102);
    expect(db.rows("inventory_movements")).toHaveLength(0);
  });

  it("services don't take stock; a product without quantity is asked for", async () => {
    expect(await createBill({ ...coffee, lines: [{ ...coffee.lines[0], inventory_id: "srv", inventory_qty: 1 }] })).toMatchObject({ success: false, error: expect.stringContaining("no lleva inventario") });
    // Nor the KRUPS machine: IMUSA ships each one sold, it is never stocked.
    db.rows("inventory").push({ id: "krups", product_code: "EQP-KRUPS-CC", product_name: "Cafetera KRUPS", unit: "unidad", category: "equipo", current_stock: 0 });
    expect(await createBill({ ...coffee, lines: [{ ...coffee.lines[0], inventory_id: "krups", inventory_qty: 1 }] })).toMatchObject({ success: false, error: expect.stringContaining("venta por pedido") });
    expect(db.rows("purchase_bills")).toHaveLength(0);
    expect(await createBill({ ...coffee, lines: [{ ...coffee.lines[0], inventory_qty: 0 }] })).toMatchObject({ success: false, error: expect.stringContaining("indica cuánto entra") });
  });
});

describe("supplier invoices without a prefix", () => {
  it("go as FC (Siigo requires a prefix), so payments find them too", async () => {
    h.responses["POST /v1/purchases"] = { id: "fc-388", name: "FC-1-251" };
    expect(await createBill({ ...input, providerPrefix: "  ", providerNumber: "388" })).toMatchObject({ success: true, sent: true });
    expect(bill()).toMatchObject({ provider_prefix: "FC", provider_number: "388" });
    expect(h.calls.find((c) => c.path === "/v1/purchases")!.opts?.body).toMatchObject({ provider_invoice: { prefix: "FC", number: "388" } });
  });

  it("one saved without prefix before is fixed when it is sent again", async () => {
    h.responses["POST /v1/purchases"] = new Error("The field provider_invoice.prefix is required");
    await createBill({ ...input, providerNumber: "389" });
    db.rows("purchase_bills")[0].provider_prefix = "";
    h.responses["POST /v1/purchases"] = { id: "fc-389", name: "FC-1-252" };
    expect(await retryBill(bill().id)).toMatchObject({ success: true, siigoName: "FC-1-252" });
    expect(bill().provider_prefix).toBe("FC");
  });
});

describe("editing a purchase invoice not yet in Siigo", () => {
  beforeEach(() => {
    db.rows("inventory").push({ id: "verde", product_code: "CAFV-001", product_name: "Café Verde", unit: "kg", category: "cafe", current_stock: 10 });
  });
  const coffee = { ...input, providerPrefix: "", providerNumber: "388", lines: [{ ...input.lines[0], base: 765000, tax_id: null, tax_rate: 0, inventory_id: "verde", inventory_qty: 9 }] };

  it("fixes what was wrong, moves only the stock difference and sends it again", async () => {
    h.responses["POST /v1/purchases"] = new Error("The field provider_invoice.prefix is required");
    await createBill(coffee);
    expect(db.byId("inventory", "verde")!.current_stock).toBe(19);
    h.responses["POST /v1/purchases"] = { id: "fc-388", name: "FC-1-260" };
    const res = await updateBill(bill().id, { ...coffee, providerPrefix: "FE", lines: [{ ...coffee.lines[0], base: 800000, inventory_qty: 12 }] });
    expect(res).toMatchObject({ success: true, sent: true, siigoName: "FC-1-260", stocked: ["12 kg Café Verde"] });
    expect(bill()).toMatchObject({ provider_prefix: "FE", total: 800000, status: "registrada", siigo_error: null });
    expect(db.byId("inventory", "verde")!.current_stock).toBe(22); // 10 + 12
    expect(db.rows("inventory_movements")).toEqual([expect.objectContaining({ quantity: 12, purchase_bill_id: bill().id })]);
  });

  it("can't lower what entered once it was used, nor edit one already in Siigo", async () => {
    h.responses["POST /v1/purchases"] = new Error("boom");
    await createBill(coffee);
    db.byId("inventory", "verde")!.current_stock = 2; // 9 entered, 8 used meanwhile... only 2 left
    expect(await updateBill(bill().id, { ...coffee, lines: [{ ...coffee.lines[0], inventory_qty: 5 }] })).toMatchObject({ success: false, error: expect.stringContaining("ya se usó parte") });
    expect(db.byId("inventory", "verde")!.current_stock).toBe(2);
    expect(bill().provider_number).toBe("388");
    db.rows("purchase_bills")[0].siigo_id = "fc-x";
    expect(await updateBill(bill().id, coffee)).toMatchObject({ success: false, error: expect.stringContaining("ya está en Siigo") });
  });
});

describe("saldo a favor (supplier advances)", () => {
  const receipts = (type: string) => h.calls.filter((c) => c.path === "/v1/payment-receipts" && (c.opts?.body as { type?: string })?.type === type);
  const journals = () => h.calls.filter((c) => c.path === "/v1/journals");
  const moves = () => db.rows("supplier_advances");
  const anticipoRows = () => expenses().filter((e) => e.expense_type === "ANTICIPO");
  const balance = async () => ((await getAdvanceBalance({ billId: bill().id })) as { balance: number }).balance;

  beforeEach(async () => {
    db.rows("siigo_settings")[0].config = { ...SETTINGS, advance_journal_document_id: 28547 };
    h.responses["POST /v1/purchases"] = { id: "fc-1", name: "FC-1-240" };
    h.responses["POST /v1/payment-receipts"] = { id: "rp-1", name: "RP-1-90" };
    h.responses["POST /v1/journals"] = { id: "cc-1", name: "CC-3-40" };
    await createBill(input); // owes 386.750
  });

  it("an overpayment is refused unless the excess is kept as saldo a favor", async () => {
    expect(await registerPayablePayment({ billId: bill().id }, { date: "2026-10-20", amount: 400000, method: "bank" })).toMatchObject({ success: false, error: "El pago supera el saldo por pagar." });
    expect(db.rows("payable_payments")).toHaveLength(0);
    expect(expenses()).toHaveLength(0);
  });

  it("the excess becomes an advance: its own Siigo egreso and an ANTICIPO outflow that is not an expense", async () => {
    const res = await registerPayablePayment({ billId: bill().id }, { date: "2026-10-20", amount: 400000, method: "bank", keepExcess: true });
    expect(res).toMatchObject({ success: true, siigo: { sent: true }, advance: { amount: 13250, sent: true, name: "RP-1-90" } });
    expect(db.rows("payable_payments")[0]).toMatchObject({ amount: 386750, method: "bank" });
    expect(receipts("DebtPayment")[0].opts?.body).toMatchObject({ payment: { value: 386750 } });
    expect(receipts("AdvancePayment")[0].opts).toMatchObject({ body: { supplier: { identification: "901980434" }, payment: { id: 4182, value: 13250 } }, idempotencyKey: expect.stringContaining("ANT") });
    expect(moves()[0]).toMatchObject({ kind: "anticipo", amount: 13250, siigo_status: "enviado", siigo_name: "RP-1-90", payment_id: db.rows("payable_payments")[0].id });
    expect(anticipoRows()).toEqual([expect.objectContaining({ amount: 13250, category: "Anticipos a proveedores", supplier_id: "sup1" })]);
    expect(await balance()).toBe(13250);
  });

  it("the balance pays the next invoice: a journal crosses 22050501 against the invoice and 13300501 against the anticipo egreso", async () => {
    await registerPayablePayment({ billId: bill().id }, { date: "2026-10-20", amount: 500000, method: "bank", keepExcess: true });
    h.responses["POST /v1/purchases"] = { id: "fc-2", name: "FC-1-241" };
    await createBill({ ...input, providerNumber: "1970" });
    const next = db.rows("purchase_bills")[1];
    h.calls = [];
    expect(await registerPayablePayment({ billId: next.id }, { date: "2026-10-25", amount: 200000, method: "advance" })).toMatchObject({ success: false, error: "El proveedor no tiene saldo a favor suficiente." });
    const res = await registerPayablePayment({ billId: next.id }, { date: "2026-10-25", amount: 100000, method: "advance" });
    expect(res).toMatchObject({ success: true, crossed: 100000, siigo: { sent: true, name: "CC-3-40" } });
    expect(h.calls.filter((c) => c.path === "/v1/payment-receipts")).toHaveLength(0);
    expect(journals()[0].opts).toMatchObject({
      idempotencyKey: expect.stringContaining("CRU"),
      body: {
        document: { id: 28547 },
        date: "2026-10-25",
        items: [
          { account: { code: "22050501", movement: "Debit" }, customer: { identification: "901980434" }, due: { prefix: "FETD", consecutive: 1970, quote: 1, date: "2026-11-14" }, value: 100000 },
          { account: { code: "13300501", movement: "Credit" }, customer: { identification: "901980434" }, due: { prefix: "RP-1", consecutive: 90, quote: 1, date: "2026-10-20" }, value: 100000 },
        ],
      },
    });
    const pay = db.rows("payable_payments").find((p) => p.method === "advance")!;
    expect(pay).toMatchObject({ amount: 100000, siigo_status: "enviado", siigo_name: "CC-3-40" });
    const day = expenses().filter((e) => pay.expense_ids.includes(e.id));
    expect(day.reduce((s, e) => s + Number(e.amount), 0)).toBe(0); // cash doesn't move that day
    expect(day).toEqual(expect.arrayContaining([expect.objectContaining({ category: EMPAQUES, amount: 100000 }), expect.objectContaining({ expense_type: "ANTICIPO", amount: -100000 })]));
    expect(moves().find((m) => m.kind === "cruce")).toMatchObject({ amount: 100000, payment_id: pay.id, applied: [{ advance_id: moves()[0].id, amount: 100000 }] });
    expect(await balance()).toBe(13250);

    // Nothing in Siigo can be deleted from the app; once out of Siigo, the anticipo still can't while a cruce uses it.
    expect(await deletePayablePayment(pay.id)).toMatchObject({ success: false, error: expect.stringContaining("Siigo") });
    db.rows("supplier_advances")[0].siigo_status = "error";
    db.rows("payable_payments")[0].siigo_status = "error";
    expect(await deletePayablePayment(db.rows("payable_payments")[0].id)).toMatchObject({ success: false, error: expect.stringContaining("ya se usó") });
    pay.siigo_status = "error";
    expect(await deletePayablePayment(pay.id)).toMatchObject({ success: true });
    db.rows("supplier_advances").splice(db.rows("supplier_advances").findIndex((m) => m.kind === "cruce"), 1); // ON DELETE CASCADE
    expect(await deletePayablePayment(db.rows("payable_payments")[0].id)).toMatchObject({ success: true });
    expect(anticipoRows()).toHaveLength(0);
  });

  it("a cruce whose anticipo never reached Siigo waits with the reason, and goes once it does", async () => {
    h.responses["POST /v1/payment-receipts"] = new Error("Siigo caído");
    await registerAdvance({ supplierId: "sup1", date: "2026-10-10", amount: 50000, method: "bank" });
    const res = await registerPayablePayment({ billId: bill().id }, { date: "2026-10-25", amount: 30000, method: "advance" });
    expect(res).toMatchObject({ success: true, siigo: { sent: false, error: expect.stringContaining("no tiene su egreso de Siigo") } });
    expect(journals()).toHaveLength(0);
    h.responses["POST /v1/payment-receipts"] = { id: "rp-7", name: "RP-1-95" };
    const anticipo = moves().find((m) => m.kind === "anticipo")!;
    const { retryAdvance } = await import("../actions");
    expect(await retryAdvance(anticipo.id)).toMatchObject({ success: true, name: "RP-1-95" });
    const pay = db.rows("payable_payments").find((p) => p.method === "advance")!;
    expect(await retryPayablePayment(pay.id)).toMatchObject({ success: true, name: "CC-3-40" });
    expect((journals()[0].opts?.body as { items: { due?: { prefix: string; consecutive: number } }[] }).items[1].due).toMatchObject({ prefix: "RP-1", consecutive: 95 });
  });

  it("a past advance already in Siigo keeps its RP; a refund goes to Siigo as bank against 13300501", async () => {
    h.calls = [];
    expect(await registerAdvance({ supplierId: "sup1", date: "2026-10-10", amount: 50000, method: "bank", alreadyInSiigo: true })).toMatchObject({ success: false, error: expect.stringContaining("RP-1-48") });
    expect(await registerAdvance({ supplierId: "sup1", date: "2026-10-10", amount: 50000, method: "bank", alreadyInSiigo: true, siigoReceipt: "rp-1-53" })).toMatchObject({ success: true, advance: { manual: true, sent: false, name: "RP-1-53" } });
    expect(h.calls).toHaveLength(0);
    expect(await registerAdvanceRefund({ supplierId: "sup1", date: "2026-10-22", amount: 60000, method: "bank" })).toMatchObject({ success: false, error: expect.stringContaining("supera el saldo") });
    expect(await registerAdvanceRefund({ supplierId: "sup1", date: "2026-10-22", amount: 20000, method: "bank" })).toMatchObject({ success: true, siigo: { sent: true, name: "CC-3-40" } });
    expect(journals()[0].opts).toMatchObject({
      idempotencyKey: expect.stringContaining("DEV"),
      body: { items: [
        { account: { code: "11200501", movement: "Debit" }, value: 20000 },
        { account: { code: "13300501", movement: "Credit" }, due: { prefix: "RP-1", consecutive: 53, date: "2026-10-10" }, value: 20000 },
      ] },
    });
    expect(anticipoRows().map((e) => Number(e.amount)).sort((a, b) => a - b)).toEqual([-20000, 50000]);
    expect(await balance()).toBe(30000);
    const anticipo = moves().find((m) => m.kind === "anticipo")!;
    const refund = moves().find((m) => m.kind === "devolucion")!;
    expect(await deleteAdvance(refund.id)).toMatchObject({ success: false, error: expect.stringContaining("Siigo") });
    refund.siigo_status = "error";
    expect(await deleteAdvance(anticipo.id)).toMatchObject({ success: false, error: expect.stringContaining("ya se usó") });
    expect(await deleteAdvance(refund.id)).toMatchObject({ success: true });
    expect(await deleteAdvance(anticipo.id)).toMatchObject({ success: true });
    expect(anticipoRows()).toHaveLength(0);
  });
});
