import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeClient, seedDB, ADMIN_ID, type FakeDB } from "@/test/fakeSupabase";

type Call = { method: string; path: string; opts?: { body?: unknown; query?: Record<string, unknown>; idempotencyKey?: string } };
const h = vi.hoisted(() => ({
  client: null as unknown,
  calls: [] as { method: string; path: string; opts?: Record<string, unknown> }[],
  responses: {} as Record<string, unknown>,
  configured: true,
}));
vi.mock("@/utils/supabase/server", () => ({ createClient: async () => h.client }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/utils/siigo/api", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/utils/siigo/api")>();
  const siigo = {
    request: async (method: string, path: string, opts?: Record<string, unknown>) => {
      h.calls.push({ method, path, opts });
      const key = `${method} ${path}`;
      const r = h.responses[key];
      if (r instanceof Error) throw r;
      if (r === undefined) throw new Error(`unexpected Siigo call ${key}`);
      return typeof r === "function" ? (r as (o: unknown) => unknown)(opts) : r;
    },
    listAll: async (path: string, query?: Record<string, unknown>) => {
      h.calls.push({ method: "LIST", path, opts: { query } });
      return h.responses[`LIST ${path}`] ?? [];
    },
  };
  return { ...real, getSiigoClient: () => siigo, siigoConfigFromEnv: () => (h.configured ? { username: "u", accessKey: "k", partnerId: "CafeAmantti" } : null) };
});

import { createSiigoInvoice, previewSiigoInvoice, refreshSiigoInvoice, saveSiigoSettings, compareSiigoProducts, createSiigoProducts, createSiigoPurchase, pullSiigoInvoices, linkSiigoProducts } from "../actions";
import { SiigoError } from "@/utils/siigo/api";

const SETTINGS = {
  invoice_document_id: 24446, seller_id: 629, payment_web_id: 5636, payment_transfer_id: 5638, sales_tax_id: 13156, shipping_product_code: "ENVIO",
  final_consumer_identification: "222222222222", product_account_group_id: 1253, purchase_document_id: 25000, purchase_payment_id: 7000,
  expense_accounts: { "Servicios Públicos (Agua, luz, internet)": "51353501" }, fixed_asset_codes: {}, stamp_dian: true,
};
const ORDER_ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

let db: FakeDB;
beforeEach(() => {
  h.calls = [];
  h.responses = {};
  h.configured = true;
  db = seedDB({
    siigo_settings: [{ id: 1, config: SETTINGS }],
    inventory: [{ id: "inv1", product_code: "CAFT-250", product_name: "Premium 250 g", is_sellable: true, siigo_product_id: "sp-caft" }, { id: "inv2", product_code: "HON-250", product_name: "Honey 250 g", is_sellable: true }],
    clients: [{ id: "cl1", name: "Ana Gómez", document_type: "CC", document_number: "1036123456", address: "Cra 43A #1-50", city_code: "05001", email: "ana@x.co" }],
    orders: [{ id: ORDER_ID, status: "paid", total_amount: 78000, client_id: "cl1", shipping_info: { shipping_cost: 8000 }, siigo_invoice_id: null }],
    order_items: [{ id: "oi1", order_id: ORDER_ID, product_id: "Premium 250 g", inventory_id: "inv1", quantity: 2, price_at_time: 35000 }],
    daily_cashflows: [{ id: "d1", date: "2026-09-30" }],
    suppliers: [{ id: "sup1", name: "EPM", document_number: "890904996-1" }],
    cashflow_expenses: [{ id: "e1", cashflow_id: "d1", concept: "Energía", category: "Servicios Públicos (Agua, luz, internet)", expense_type: "OPEX", amount: 250000, tax_amount: 0, net_amount: 250000, supplier_id: "sup1" }],
  });
  h.client = createFakeClient(db, { id: ADMIN_ID });
});

const calls = (key: string) => (h.calls as Call[]).filter((c) => `${c.method} ${c.path}` === key);

describe("sales invoice from an order", () => {
  it("preview lists the lines, the client and that it goes to the DIAN, without calling Siigo", async () => {
    const res = await previewSiigoInvoice(ORDER_ID, "web");
    expect(res).toMatchObject({ success: true, problems: [], electronic: true, total: 78000, customer: "Ana Gómez (1036123456)" });
    expect(h.calls).toHaveLength(0);
  });

  it("finds the customer in Siigo (or creates it), creates the invoice once and stores the result", async () => {
    h.responses["GET /v1/customers"] = { results: [] };
    h.responses["POST /v1/customers"] = { id: "cust-1" };
    h.responses["POST /v1/invoices"] = { id: "inv-uuid", name: "FV-1-55", public_url: "https://documentview.siigo.com/x", stamp: { status: "Accepted", cufe: "abc" } };
    const res = await createSiigoInvoice(ORDER_ID, "web");
    expect(res).toMatchObject({ success: true });
    expect(calls("POST /v1/customers")[0].opts?.body).toMatchObject({ identification: "1036123456", address: { city: { city_code: "05001" } } });
    const inv = calls("POST /v1/invoices")[0];
    expect(inv.opts?.idempotencyKey).toMatch(/^FV[a-f0-9]{28}$/);
    expect(inv.opts?.body).toMatchObject({ customer: { identification: "1036123456" }, stamp: { send: true }, payments: [{ id: 5636, value: 78000 }] });
    expect(db.byId("orders", ORDER_ID)).toMatchObject({ siigo_invoice_id: "inv-uuid", siigo_invoice: "FV-1-55", siigo_status: "Accepted", siigo_cufe: "abc" });
    expect(db.byId("clients", "cl1")!.siigo_customer_id).toBe("cust-1");
    expect(db.rows("siigo_sync_log").map((l) => [l.entity, l.status])).toEqual([["customer", "ok"], ["invoice", "ok"]]);

    // A second attempt is refused locally: never two invoices for one order.
    const again = await createSiigoInvoice(ORDER_ID, "web");
    expect(again).toMatchObject({ success: false, error: expect.stringMatching(/ya tiene factura/) });
    expect(calls("POST /v1/invoices")).toHaveLength(1);
  });

  it("does not call Siigo when data is missing, and says what", async () => {
    db.byId("order_items", "oi1")!.inventory_id = null;
    const res = await createSiigoInvoice(ORDER_ID, "web");
    expect(res).toMatchObject({ success: false, problems: [expect.stringMatching(/Premium 250 g.*inventario/)] });
    expect(h.calls).toHaveLength(0);
  });

  it("a product never linked to Siigo stops the invoice before calling Siigo", async () => {
    db.byId("inventory", "inv1")!.siigo_product_id = null;
    const res = await previewSiigoInvoice(ORDER_ID, "web");
    expect(res).toMatchObject({ success: true, problems: [expect.stringMatching(/no está vinculado a un producto de Siigo/)] });
  });

  it("an order without client is invoiced to the final consumer", async () => {
    db.byId("orders", ORDER_ID)!.client_id = null;
    const res = await previewSiigoInvoice(ORDER_ID, "transfer");
    expect(res).toMatchObject({ success: true, customer: "Consumidor final (222222222222)" });
  });

  it("a Siigo rejection is shown and logged", async () => {
    h.responses["GET /v1/customers"] = { results: [{ id: "cust-1" }] };
    h.responses["POST /v1/invoices"] = new SiigoError("La fecha de la factura no puede ser anterior a hoy", 400);
    const res = await createSiigoInvoice(ORDER_ID, "web");
    expect(res).toMatchObject({ success: false, error: "La fecha de la factura no puede ser anterior a hoy" });
    expect(db.byId("orders", ORDER_ID)).toMatchObject({ siigo_invoice_id: null, siigo_error: "La fecha de la factura no puede ser anterior a hoy" });
    expect(db.rows("siigo_sync_log").at(-1)).toMatchObject({ entity: "invoice", status: "error" });
  });

  it("refresh brings the DIAN status and its errors", async () => {
    db.byId("orders", ORDER_ID)!.siigo_invoice_id = "inv-uuid";
    h.responses["GET /v1/invoices/inv-uuid"] = { id: "inv-uuid", name: "FV-1-55", stamp: { status: "Rejected" } };
    h.responses["GET /v1/invoices/inv-uuid/stamp/errors"] = { errors: [{ message: "NIT del adquiriente inválido" }] };
    const res = await refreshSiigoInvoice(ORDER_ID);
    expect(res).toMatchObject({ success: true, invoice: { siigo_status: "Rejected", siigo_error: "NIT del adquiriente inválido" } });
  });
});

describe("settings", () => {
  it("validates ids and PUC accounts, and cleans the final-consumer identification", async () => {
    expect(await saveSiigoSettings({ seller_id: -1 as never })).toMatchObject({ success: false, error: expect.stringMatching(/seller_id/) });
    expect(await saveSiigoSettings({ expense_accounts: { Diversos: "51-35" } })).toMatchObject({ success: false, error: expect.stringMatching(/Diversos/) });
    const ok = await saveSiigoSettings({ seller_id: 629, final_consumer_identification: "222.222.222.222", expense_accounts: { Diversos: "519595", Vacía: "" } });
    expect(ok).toMatchObject({ success: true, settings: { seller_id: 629, final_consumer_identification: "222222222222", expense_accounts: { Diversos: "519595" } } });
    expect(db.byId("siigo_settings", 1 as never)?.config).toBeDefined();
  });
});

describe("products", () => {
  it("compares by code, remembers links and creates the missing ones", async () => {
    h.responses["LIST /v1/products"] = [{ id: "sp1", code: "CAFT-250", name: "Café 250" }];
    const cmp = await compareSiigoProducts();
    expect(cmp).toMatchObject({ success: true, missingInSiigo: [{ id: "inv2", code: "HON-250" }] });
    expect(db.byId("inventory", "inv1")!.siigo_product_id).toBe("sp1");

    h.responses["POST /v1/products"] = { id: "sp2", code: "HON-250" };
    // The group chosen on screen is used and remembered, even if not saved before.
    db.byId("siigo_settings", 1 as never)!.config = { ...SETTINGS, product_account_group_id: null };
    const res = await createSiigoProducts(["inv2"], 929);
    expect(calls("POST /v1/products")[0].opts?.body).toMatchObject({ account_group: 929 });
    expect(db.byId("siigo_settings", 1 as never)!.config.product_account_group_id).toBe(929);
    expect(res).toMatchObject({ success: true, created: ["HON-250"], failed: [] });
    expect(db.byId("inventory", "inv2")!.siigo_product_id).toBe("sp2");
  });
});

describe("products with Siigo's own codes", () => {
  it("suggests links, saves them, and invoices use the linked code", async () => {
    h.responses["LIST /v1/products"] = [{ id: "sp4", code: "004", name: "C.T - PREMIUM 250gr" }, { id: "sp40", code: "0040", name: "HONEY 250gr" }];
    const cmp = await compareSiigoProducts();
    expect(cmp).toMatchObject({ success: true, missingInSiigo: expect.arrayContaining([expect.objectContaining({ id: "inv1", suggestion: "004" }), expect.objectContaining({ id: "inv2", suggestion: "0040" })]) });

    expect(await linkSiigoProducts([{ inventoryId: "inv1", siigoCode: "999" }])).toMatchObject({ success: false, error: expect.stringMatching(/999 no existe/) });
    expect(await linkSiigoProducts([{ inventoryId: "inv1", siigoCode: "004" }, { inventoryId: "inv2", siigoCode: "004" }])).toMatchObject({ success: false, error: expect.stringMatching(/dos productos/) });
    expect(await linkSiigoProducts([{ inventoryId: "inv1", siigoCode: "004" }])).toMatchObject({ success: true, linked: 1 });
    expect(db.byId("inventory", "inv1")).toMatchObject({ siigo_code: "004", siigo_product_id: "sp4" });

    const preview = await previewSiigoInvoice(ORDER_ID, "web");
    expect(preview).toMatchObject({ success: true, lines: [{ code: "004" }, { code: "ENVIO" }] });

    // Unlinking goes back to the app code.
    await linkSiigoProducts([{ inventoryId: "inv1", siigoCode: null }]);
    expect(db.byId("inventory", "inv1")).toMatchObject({ siigo_code: null, siigo_product_id: null });
  });
});

describe("purchases", () => {
  it("sends an expense as a purchase invoice once", async () => {
    h.responses["POST /v1/purchases"] = { id: "pur-1", name: "FC-1-9" };
    const res = await createSiigoPurchase("e1");
    expect(res).toMatchObject({ success: true, purchase: { id: "pur-1", name: "FC-1-9" } });
    expect(calls("POST /v1/purchases")[0].opts?.body).toMatchObject({ supplier: { identification: "890904996" }, items: [{ type: "Account", code: "51353501" }] });
    expect(db.byId("cashflow_expenses", "e1")).toMatchObject({ siigo_purchase_id: "pur-1", siigo_purchase_name: "FC-1-9" });
    expect(await createSiigoPurchase("e1")).toMatchObject({ success: false, problems: [expect.stringMatching(/Ya está en Siigo/)] });
    expect(calls("POST /v1/purchases")).toHaveLength(1);
  });
});

describe("pulling invoices", () => {
  it("returns importer rows with client data", async () => {
    h.responses["LIST /v1/invoices"] = [{ id: "i1", name: "FV-1-101", date: "2026-10-02", customer: { identification: "900123456" }, items: [{ code: "CAFT-250", quantity: 2, total: 70000 }] }];
    h.responses["GET /v1/customers"] = { results: [{ identification: "900123456", name: ["Okus"] }] };
    const res = await pullSiigoInvoices("2026-10-01", "2026-10-10");
    expect(res).toMatchObject({ success: true, invoiceCount: 1, rows: [{ invoice_number: "FV-1-101", client_name: "Okus", total_price: 70000 }] });
    expect(calls("LIST /v1/invoices")[0].opts?.query).toEqual({ date_start: "2026-10-01", date_end: "2026-10-10" });
    expect(await pullSiigoInvoices("2026-10-10", "2026-10-01")).toMatchObject({ success: false, error: expect.stringMatching(/Rango/) });
  });
});

describe("access", () => {
  it("is admin-only", async () => {
    h.client = createFakeClient(db, null);
    await expect(previewSiigoInvoice(ORDER_ID)).rejects.toThrow("Unauthorized");
  });
});
