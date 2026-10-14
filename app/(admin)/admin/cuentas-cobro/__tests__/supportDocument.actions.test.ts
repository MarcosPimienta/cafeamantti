import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeClient, seedDB, ADMIN_ID, type FakeDB } from "@/test/fakeSupabase";

const h = vi.hoisted(() => ({
  client: null as unknown,
  calls: [] as { method: string; path: string; opts?: { body?: unknown } }[],
  responses: {} as Record<string, unknown>,
}));
vi.mock("@/utils/supabase/server", () => ({ createClient: async () => h.client }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/utils/siigo/api", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/utils/siigo/api")>();
  const siigo = {
    request: async (method: string, path: string, opts?: { body?: unknown }) => {
      h.calls.push({ method, path, opts });
      const r = h.responses[`${method} ${path}`];
      if (r instanceof Error) throw r;
      if (r === undefined) throw new Error(`unexpected Siigo call ${method} ${path}`);
      return r;
    },
  };
  return { ...real, getSiigoClient: () => siigo, siigoConfigFromEnv: () => ({ username: "u", accessKey: "k", partnerId: "CafeAmantti" }) };
});

import { markSupportDocumentManual, previewSupportDocument, sendSupportDocument } from "../siigoActions";

const CC = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const SETTINGS = {
  support_document_id: 25846, support_payment_id: 4183, stamp_dian: true, support_assumed_account: "53152002",
  expense_accounts: { "Mantenimiento y Reparaciones": "52451501" }, fixed_asset_codes: {}, support_retentions: { "Mantenimiento y Reparaciones": 9758 },
};
const TAXES = [{ id: 9758, name: "Retefuente 6%", type: "Retefuente", percentage: 6, active: true }, { id: 13156, name: "IVA 19%", type: "IVA", percentage: 19, active: true }];

let db: FakeDB;
beforeEach(() => {
  h.calls = [];
  h.responses = { "GET /v1/taxes": TAXES };
  db = seedDB({
    siigo_settings: [{ id: 1, config: SETTINGS }],
    daily_cashflows: [{ id: "d1", date: "2026-10-12" }],
    cashflow_expenses: [{ id: "e1", cashflow_id: "d1", category: "Mantenimiento y Reparaciones", amount: 620000 }],
    suppliers: [{ id: "s1", name: "Juan Técnico", document_number: "71.709.773", address: "Cra 1 #2-3", city: "Medellín" }],
    cuentas_cobro: [{
      id: CC, number: 57, type: "gasto", status: "firmada", issuer_name: "Juan Técnico", issuer_document: "71709773", issuer_email: "j@x.co", issuer_phone: "3001234567",
      concept: "Mantenimiento espresso", signed_at: "2026-10-12T20:00:00Z", issue_date: "2026-10-11", expense_id: "e1",
      items: [{ description: "Mantenimiento", quantity: 1, unit_price: 620000, total_price: 620000 }], total_amount: 620000,
      siigo_ds_id: null, siigo_ds_status: null,
    }],
  });
  h.client = createFakeClient(db, { id: ADMIN_ID });
});

const input = { date: "2026-10-12", category: "Mantenimiento y Reparaciones", retentionId: 9758, assumed: false };

describe("signed cuenta de cobro → Siigo support document", () => {
  it("starts from the linked expense's date and category and the category's retention", async () => {
    const res = await previewSupportDocument(CC);
    expect(res).toMatchObject({ success: true, defaults: input, problems: [], totals: { gross: 620000, withheld: 37200, owed: 582800 }, account: "52451501" });
    expect(h.calls.map((c) => c.path)).toEqual(["/v1/taxes"]);
  });

  it("creates the missing supplier, sends the document once and keeps what Siigo returned", async () => {
    h.responses["GET /v1/customers"] = { results: [] };
    h.responses["POST /v1/customers"] = { id: "sup-1" };
    h.responses["POST /v1/purchase-support-documents"] = { id: "ds-uuid", name: "DS-1-45", stamp: { status: "Accepted" } };
    expect(await sendSupportDocument(CC, input)).toMatchObject({ success: true, name: "DS-1-45" });
    const supplier = h.calls.find((c) => c.path === "/v1/customers" && c.method === "POST")!;
    expect(supplier.opts?.body).toMatchObject({ type: "Supplier", identification: "71709773", address: { city: { city_code: "05001" } } });
    const ds = h.calls.find((c) => c.path === "/v1/purchase-support-documents")!;
    expect(ds.opts?.body).toMatchObject({ supplier_receipt_number: { prefix: "CC", number: "57" }, payments: [{ id: 4183, value: 582800 }] });
    expect(db.byId("cuentas_cobro", CC)).toMatchObject({ siigo_ds_id: "ds-uuid", siigo_ds_name: "DS-1-45", siigo_ds_status: "Accepted", siigo_ds_error: null });
    expect(await sendSupportDocument(CC, input)).toMatchObject({ success: false, error: "Ya está en Siigo como DS-1-45." });
  });

  it("keeps Siigo's rejection on the cuenta de cobro", async () => {
    h.responses["GET /v1/customers"] = { results: [{ id: "sup-1" }] };
    h.responses["POST /v1/purchase-support-documents"] = new Error("La cuenta 52451501 no existe");
    expect(await sendSupportDocument(CC, input)).toMatchObject({ success: false, error: "La cuenta 52451501 no existe" });
    expect(db.byId("cuentas_cobro", CC)).toMatchObject({ siigo_ds_status: "error", siigo_ds_error: "La cuenta 52451501 no existe", siigo_ds_id: null });
  });

  it("one already typed into Siigo by hand is never sent", async () => {
    expect(await markSupportDocumentManual(CC, true)).toMatchObject({ success: true });
    expect(await sendSupportDocument(CC, input)).toMatchObject({ success: false, error: "Esta cuenta de cobro está marcada como registrada a mano en Siigo." });
    expect(h.calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("unsigned or income cuentas de cobro don't go", async () => {
    db.byId("cuentas_cobro", CC)!.status = "pendiente";
    expect(await previewSupportDocument(CC)).toMatchObject({ success: false, error: "La cuenta de cobro debe estar firmada." });
  });
});
