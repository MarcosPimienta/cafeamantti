import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeClient, seedDB, ADMIN_ID, type FakeDB } from "@/test/fakeSupabase";

const h = vi.hoisted(() => ({ client: null as unknown, invoices: [] as unknown[] }));
vi.mock("@/utils/supabase/server", () => ({ createClient: async () => h.client }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/utils/siigo/api", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/utils/siigo/api")>();
  return { ...real, getSiigoClient: () => ({ listAll: async () => h.invoices }), siigoConfigFromEnv: () => ({ username: "u", accessKey: "k", partnerId: "p" }) };
});

import { getReceivables, setReceivableSite } from "../actions";

let db: FakeDB;
const fv = (o: Record<string, unknown>) => ({ id: "sg", name: "FV-2-1", date: "2026-10-06", total: 157500, balance: 157500, customer: { identification: "901656887", branch_office: 0 }, payments: [{ due_date: "2026-10-21" }], observations: "", ...o });

beforeEach(() => {
  db = seedDB({
    clients: [{ id: "pf", name: "GRUPO PROFITNESS S.A.S", document_number: "901656887-1" }],
    client_sites: [
      { id: "fab", client_id: "pf", name: "SMART FIT FABRICATO", siigo_branch_office: null, created_at: "2026-11-01" },
      { id: "may", client_id: "pf", name: "SMART FIT MAYORCA", siigo_branch_office: 2, created_at: "2026-11-02" },
      { id: "sd", client_id: "pf", name: "SMART FIT SAN DIEGO", siigo_branch_office: null, created_at: "2026-11-03" },
    ],
    sales_invoices: [{ id: "app-1", siigo_invoice_id: "sg-app", site_id: "sd" }],
    siigo_invoice_sites: [{ siigo_invoice_id: "sg-man", site_id: "fab" }],
  });
  h.client = createFakeClient(db, { id: ADMIN_ID });
  h.invoices = [
    fv({ id: "sg-app", name: "FV-2-734" }), // sede saved on the app invoice
    fv({ id: "sg-br", name: "FV-2-760", customer: { identification: "901656887", branch_office: 2 } }), // Siigo branch
    fv({ id: "sg-obs", name: "FV-2-731", observations: "Pedido Café Amantti #bbe3a454 · FABRICATO" }), // observations
    fv({ id: "sg-man", name: "FV-2-701" }), // assigned by hand
    fv({ id: "sg-none", name: "FV-2-687", observations: "Favor Consignar en la cuenta 108900463473" }), // unknown
    fv({ id: "sg-paid", balance: 0 }),
    fv({ id: "sg-null", annulled: true }),
    fv({ id: "sg-other", name: "FV-2-900", customer: { identification: "123456789" } }), // client not in the app
  ];
});

describe("cuentas por cobrar", () => {
  it("reads balances from Siigo and finds each invoice's client and sede", async () => {
    const { invoices, error } = await getReceivables();
    expect(error).toBeNull();
    expect(invoices.map((i) => [i.name, i.client_id, i.site_id, i.site_source, i.due_date])).toEqual([
      ["FV-2-734", "pf", "sd", "app", "2026-10-21"],
      ["FV-2-760", "pf", "may", "branch", "2026-10-21"],
      ["FV-2-731", "pf", "fab", "notes", "2026-10-21"],
      ["FV-2-701", "pf", "fab", "manual", "2026-10-21"],
      ["FV-2-687", "pf", null, null, "2026-10-21"],
      ["FV-2-900", null, null, null, "2026-10-21"],
    ]);
    expect(invoices.at(-1)!.customer_name).toBe("NIT 123456789");
  });

  it("a sede assigned by hand sticks: on the app invoice, or in the table for invoices made in Siigo", async () => {
    expect(await setReceivableSite("sg-none", "may")).toEqual({ success: true });
    expect(db.rows("siigo_invoice_sites").find((r) => r.siigo_invoice_id === "sg-none")).toMatchObject({ site_id: "may" });
    expect(await setReceivableSite("sg-app", "fab")).toEqual({ success: true });
    expect(db.byId("sales_invoices", "app-1")!.site_id).toBe("fab");
    const { invoices } = await getReceivables();
    expect(invoices.find((i) => i.id === "sg-none")).toMatchObject({ site_id: "may", site_source: "manual" });
    expect(await setReceivableSite("sg-none", null)).toEqual({ success: true });
    expect(db.rows("siigo_invoice_sites").some((r) => r.siigo_invoice_id === "sg-none")).toBe(false);
  });
});
