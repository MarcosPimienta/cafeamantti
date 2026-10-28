import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeClient, seedDB, ADMIN_ID, type FakeDB } from "@/test/fakeSupabase";

const h = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/utils/supabase/server", () => ({ createClient: async () => h.client }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { updateClientCRM, deleteClientCRM } from "../actions";

let db: FakeDB;
const FERNEY = { id: "cl-1", name: "Ferney Machado", document_type: "NIT", document_number: "902038087", siigo_customer_id: "siigo-elevate" };

beforeEach(() => {
  db = seedDB({ clients: [{ ...FERNEY }, { id: "cl-2", name: "Con pedido", document_number: "1" }], orders: [{ id: "o-1", client_id: "cl-2" }] });
  h.client = createFakeClient(db, { id: ADMIN_ID });
});

describe("updateClientCRM — Siigo link", () => {
  it("drops the Siigo link when the document changes", async () => {
    await updateClientCRM("cl-1", { name: "Ferney Machado", document_type: "CC", document_number: "713138071" });
    expect(db.byId("clients", "cl-1")).toMatchObject({ document_number: "713138071", siigo_customer_id: null });
  });

  it("keeps it when only other fields change", async () => {
    await updateClientCRM("cl-1", { name: "Ferney M.", document_type: "NIT", document_number: "902038087" });
    expect(db.byId("clients", "cl-1")!.siigo_customer_id).toBe("siigo-elevate");
  });
});

describe("deleteClientCRM", () => {
  it("deletes a client nothing refers to", async () => {
    expect(await deleteClientCRM("cl-1")).toEqual({ success: true });
    expect(db.byId("clients", "cl-1")).toBeUndefined();
  });

  it("refuses a client with orders", async () => {
    const res = await deleteClientCRM("cl-2");
    expect(res.success).toBe(false);
    expect(db.byId("clients", "cl-2")).toBeDefined();
  });
});

describe("sedes of a client", () => {
  it("are saved (DANE code from the city), and a used or Siigo-synced one can't be deleted", async () => {
    const { saveClientSite, deleteClientSite, syncClientSite } = await import("../admin/customers/siteActions");
    const res = await saveClientSite({ client_id: "cl-2", name: " Smart Fit Fabricato ", address: "Carrera 50 # 38 A-185", city: "Bello" });
    expect(res).toMatchObject({ success: true, site: { name: "Smart Fit Fabricato", city_code: "05088" } });
    expect(await saveClientSite({ client_id: "cl-2", name: "" })).toMatchObject({ success: false, error: expect.stringContaining("nombre") });
    const id = (res as { site: { id: string } }).site.id;
    db.rows("orders").push({ id: "o-s", client_id: "cl-2", site_id: id });
    expect(await deleteClientSite(id)).toMatchObject({ success: false, error: expect.stringContaining("desactívala") });
    db.tables.orders = db.rows("orders").filter((o) => o.id !== "o-s");
    db.byId("client_sites", id)!.siigo_branch_office = 1;
    expect(await deleteClientSite(id)).toMatchObject({ success: false, error: expect.stringContaining("Siigo") });
    db.byId("client_sites", id)!.siigo_branch_office = null;
    expect(await deleteClientSite(id)).toMatchObject({ success: true });
    // A client without NIT can't have its sedes in Siigo.
    const other = await saveClientSite({ client_id: "cl-2", name: "Otra" });
    expect(await syncClientSite((other as { site: { id: string } }).site.id)).toMatchObject({ success: false });
  });
});
