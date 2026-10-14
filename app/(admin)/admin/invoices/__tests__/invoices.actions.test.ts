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

import { annulInvoice, createInvoice, deletePayment, refreshInvoice, registerPayment, sendPendingToSiigo, stampInvoice } from "../actions";
import { updateOrderStatus, deleteManualAdminOrder } from "../../../actions";

const SETTINGS = {
  invoice_document_id: 24446, seller_id: 629, payment_transfer_id: 5638, payment_credit_id: 5640, credit_term_days: 30, sales_tax_id: 13156,
  final_consumer_identification: "222222222222", voucher_document_id: 9001, voucher_transfer_id: 77, voucher_cash_id: 78, voucher_web_id: 79,
  stamp_dian: true, expense_accounts: {}, fixed_asset_codes: {},
};
const ORDER = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

let db: FakeDB;
beforeEach(() => {
  h.calls = [];
  h.responses = {};
  db = seedDB({
    siigo_settings: [{ id: 1, config: SETTINGS }],
    inventory: [{ id: "inv1", product_code: "CAFT-250G", product_name: "Premium 250 g", category: "cafe", siigo_code: "004", current_stock: 10 }],
    clients: [{ id: "cl1", name: "Hotel Andino", document_type: "NIT", document_number: "900123456-7", address: "Cra 43A #1-50", city_code: "05001", email: "compras@andino.co", siigo_customer_id: "c-1" }],
    orders: [{ id: ORDER, status: "pending", total_amount: 70000, client_id: "cl1", shipping_info: { shipping_cost: 0 }, siigo_invoice_id: null }],
    order_items: [{ id: "oi1", order_id: ORDER, product_id: "Premium 250 g", inventory_id: "inv1", quantity: 2, price_at_time: 35000 }],
  });
  h.client = createFakeClient(db, { id: ADMIN_ID });
});

const invoice = () => db.rows("sales_invoices")[0];
const stock = () => db.byId("inventory", "inv1")!.current_stock;

describe("credit sales invoice", () => {
  it("a draft from a pending order snapshots the lines and deducts the stock", async () => {
    const res = await createInvoice(ORDER, { terms: "credito", termDays: 15 });
    expect(res).toMatchObject({ success: true, problems: [] });
    expect(invoice()).toMatchObject({ status: "borrador", payment_terms: "credito", term_days: 15, total: 70000, customer_name: "Hotel Andino", customer_identification: "900123456" });
    expect(invoice().lines).toEqual([expect.objectContaining({ code: "004", quantity: 2, unit_price: 35000, linked: true })]);
    expect(stock()).toBe(8);
    expect(db.byId("orders", ORDER)!.status).toBe("pending");
    expect(await createInvoice(ORDER, { terms: "credito" })).toMatchObject({ success: false, error: "Este pedido ya tiene factura." });
  });

  it("without enough stock no invoice is left behind", async () => {
    db.byId("inventory", "inv1")!.current_stock = 1;
    expect(await createInvoice(ORDER, { terms: "credito" })).toMatchObject({ success: false, error: "El stock no puede ser negativo" });
    expect(db.rows("sales_invoices")).toHaveLength(0);
  });

  it("a cash sale marks the order paid", async () => {
    expect(await createInvoice(ORDER, { terms: "contado" })).toMatchObject({ success: false, error: "Indica cómo pagó el cliente." });
    expect(await createInvoice(ORDER, { terms: "contado", method: "transfer" })).toMatchObject({ success: true });
    expect(db.byId("orders", ORDER)!.status).toBe("paid");
    expect(stock()).toBe(8);
  });

  it("annulling the draft returns the stock; the invoiced order can't be cancelled meanwhile", async () => {
    await createInvoice(ORDER, { terms: "credito" });
    expect(await updateOrderStatus(ORDER, "cancelled")).toMatchObject({ success: false, error: expect.stringContaining("factura en borrador") });
    expect(await deleteManualAdminOrder(ORDER)).toMatchObject({ success: false, error: expect.stringContaining("factura en borrador") });
    expect(await annulInvoice(invoice().id)).toMatchObject({ success: true });
    expect(invoice().status).toBe("anulada");
    expect(stock()).toBe(10);
  });

  it("the batch sends the invoice with credit terms, then its payments as cash receipts", async () => {
    await createInvoice(ORDER, { terms: "credito", termDays: 30 });
    const id = invoice().id;
    // Paid before being sent: the receipt waits for its invoice.
    expect(await registerPayment(id, { date: "2026-10-14", amount: 30000, method: "transfer" })).toMatchObject({ success: true, fullyPaid: false });

    h.responses["POST /v1/invoices"] = { id: "sg-inv", name: "FV-1-55", prefix: "FEA", number: 55, public_url: "https://x", stamp: { status: "Accepted", cufe: "cufe1" } };
    h.responses["POST /v1/vouchers"] = { id: "sg-rc", name: "RC-1-9" };
    const res = await sendPendingToSiigo();
    expect(res).toMatchObject({ success: true, invoicesSent: ["FV-1-55"], vouchersSent: ["RC-1-9"], invoicesFailed: [], vouchersFailed: [] });

    const inv = h.calls.find((c) => c.path === "/v1/invoices")!;
    expect(inv.opts?.idempotencyKey).toMatch(/^INV/);
    expect(inv.opts?.body).toMatchObject({ customer: { identification: "900123456" }, payments: [{ id: 5640, value: 70000 }] });
    expect(invoice()).toMatchObject({ status: "emitida", siigo_name: "FV-1-55", siigo_cufe: "cufe1", siigo_invoice_id: "sg-inv" });
    expect(invoice().due_date).toBe((inv.opts?.body as { payments: { due_date: string }[] }).payments[0].due_date);
    expect(db.byId("orders", ORDER)).toMatchObject({ siigo_invoice_id: "sg-inv", siigo_invoice: "FV-1-55" });

    const rc = h.calls.find((c) => c.path === "/v1/vouchers")!;
    expect(rc.opts?.body).toMatchObject({ type: "DebtPayment", items: [{ due: { prefix: "FV-1", consecutive: 55 }, value: 30000 }], payment: { id: 77, value: 30000 } });
    expect(db.rows("invoice_payments")[0]).toMatchObject({ siigo_status: "enviado", siigo_voucher_name: "RC-1-9" });

    // Sent payments stay; the issued invoice can't be annulled here.
    expect(await deletePayment(db.rows("invoice_payments")[0].id)).toMatchObject({ success: false });
    expect(await annulInvoice(id)).toMatchObject({ success: false });

    // The rest of the payment: the order becomes paid.
    expect(await registerPayment(id, { date: "2026-10-20", amount: 40000, method: "cash" })).toMatchObject({ success: true, fullyPaid: true, balance: 0 });
    expect(db.byId("orders", ORDER)!.status).toBe("paid");
    expect(stock()).toBe(8); // still deducted once
    expect(await registerPayment(id, { date: "2026-10-20", amount: 1000, method: "cash" })).toMatchObject({ success: false, error: "El pago supera el saldo de la factura." });
  });

  it("a Siigo rejection is kept on the invoice and the batch goes on", async () => {
    await createInvoice(ORDER, { terms: "credito" });
    h.responses["POST /v1/invoices"] = new Error("El código 004 no existe");
    const res = await sendPendingToSiigo();
    expect(res).toMatchObject({ success: true, invoicesSent: [], invoicesFailed: [{ error: "El código 004 no existe" }] });
    expect(invoice()).toMatchObject({ status: "error", siigo_error: "El código 004 no existe" });
  });
});

describe("an invoice annulled in Siigo", () => {
  it("is voided on refresh, frees the order (which can then be deleted) and returns the stock", async () => {
    await createInvoice(ORDER, { terms: "credito" });
    h.responses["POST /v1/invoices"] = { id: "sg-inv", name: "FV-2-719", prefix: "FEA", number: 719, stamp: { status: "Draft" } };
    await sendPendingToSiigo();
    expect(await deleteManualAdminOrder(ORDER)).toMatchObject({ success: false, error: expect.stringContaining("FV-2-719") });

    h.responses["GET /v1/invoices/sg-inv"] = { id: "sg-inv", name: "FV-2-719", annulled: true, stamp: { status: "Draft" } };
    expect(await refreshInvoice(invoice().id)).toMatchObject({ success: true, annulled: true });
    expect(invoice()).toMatchObject({ status: "anulada", siigo_error: "Anulada en Siigo" });
    expect(db.byId("orders", ORDER)).toMatchObject({ siigo_invoice_id: null });
    expect(stock()).toBe(10);

    expect(await deleteManualAdminOrder(ORDER)).toMatchObject({ success: true });
    expect(db.byId("orders", ORDER)).toBeUndefined();
  });
});

describe("sending a draft invoice to the DIAN", () => {
  beforeEach(async () => {
    await createInvoice(ORDER, { terms: "credito", termDays: 15 });
    h.responses["POST /v1/invoices"] = { id: "sg-inv", name: "FV-2-720", stamp: { status: "Draft" } };
    await sendPendingToSiigo();
  });

  it("updates the same Siigo invoice with stamp.send and today's date, keeping its number", async () => {
    h.responses["GET /v1/invoices/sg-inv"] = { id: "sg-inv", name: "FV-2-720", stamp: { status: "Draft" } };
    h.responses["PUT /v1/invoices/sg-inv"] = { id: "sg-inv", name: "FV-2-720", public_url: "https://doc", stamp: { status: "Accepted", cufe: "cufe-720" } };
    expect(await stampInvoice(invoice().id)).toMatchObject({ success: true, invoice: { siigo_status: "Accepted", siigo_cufe: "cufe-720" } });
    const put = h.calls.find((c) => c.method === "PUT")!;
    expect(put.path).toBe("/v1/invoices/sg-inv");
    expect(put.opts?.body).toMatchObject({ stamp: { send: true }, customer: { identification: "900123456" }, payments: [{ id: 5640, value: 70000 }] });
    expect(invoice()).toMatchObject({ siigo_name: "FV-2-720", siigo_status: "Accepted", siigo_cufe: "cufe-720" });
    expect(db.byId("orders", ORDER)).toMatchObject({ siigo_invoice: "FV-2-720", siigo_status: "Accepted" });
  });

  it("refuses one the DIAN already accepted or that has cash receipts", async () => {
    h.responses["GET /v1/invoices/sg-inv"] = { id: "sg-inv", stamp: { status: "Accepted" } };
    expect(await stampInvoice(invoice().id)).toMatchObject({ success: false, error: "La factura ya fue aceptada por la DIAN." });
    h.responses["GET /v1/invoices/sg-inv"] = { id: "sg-inv", stamp: { status: "Draft" } };
    db.rows("invoice_payments").push({ id: "p1", invoice_id: invoice().id, amount: 1000, siigo_status: "enviado" });
    expect(await stampInvoice(invoice().id)).toMatchObject({ success: false, error: expect.stringContaining("recibos de caja") });
    expect(h.calls.some((c) => c.method === "PUT")).toBe(false);
  });
});
