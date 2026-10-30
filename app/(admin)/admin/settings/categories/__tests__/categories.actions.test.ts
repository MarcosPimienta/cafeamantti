import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeClient, seedDB, ADMIN_ID, type FakeDB } from "@/test/fakeSupabase";

const h = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/utils/supabase/server", () => ({ createClient: async () => h.client }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { createExpenseCategory, getExpenseCategories, setExpenseCategoryActive, updateExpenseCategory } from "../actions";

let db: FakeDB;
beforeEach(() => {
  db = seedDB({ siigo_settings: [{ id: 1, config: { expense_accounts: { "Gastos de Viaje y Transporte": "52355001" } } }] });
  h.client = createFakeClient(db, { id: ADMIN_ID });
});

const names = async () => {
  const res = await getExpenseCategories();
  return res.success ? res.categories.map((c) => c.name) : [];
};

describe("team expense categories", () => {
  it("a new one is saved with its type, keeps the other accounts and shows up in the forms", async () => {
    expect(await createExpenseCategory({ name: "  Publicidad   y Mercadeo ", type: "OPEX", account: "52352501" })).toMatchObject({ success: true });
    expect(db.rows("expense_categories")[0]).toMatchObject({ name: "Publicidad y Mercadeo", expense_type: "OPEX", depreciation_months: null, active: true });
    expect(db.rows("siigo_settings")[0].config.expense_accounts).toEqual({ "Gastos de Viaje y Transporte": "52355001", "Publicidad y Mercadeo": "52352501" });
    expect(await names()).toContain("Publicidad y Mercadeo");
  });

  it("refuses a repeated name, a built-in one, and a fixed asset without useful life", async () => {
    await createExpenseCategory({ name: "Publicidad", type: "OPEX" });
    expect(await createExpenseCategory({ name: "publicidad", type: "COGS" })).toMatchObject({ success: false, error: 'Ya existe una categoría "publicidad".' });
    expect(await createExpenseCategory({ name: "Diversos (Aseo, papelería, caja menor)", type: "OPEX" })).toMatchObject({ success: false });
    expect(await createExpenseCategory({ name: "Bodega", type: "CAPEX" })).toMatchObject({ success: false, error: "Indica la vida útil sugerida en meses." });
    expect(db.rows("expense_categories")).toHaveLength(1);
  });

  it("edits type, useful life and account but never the name; deactivating hides it from the forms", async () => {
    const res = await createExpenseCategory({ name: "Bodega", type: "OPEX", account: "52352501" });
    const id = res.success ? res.id : "";
    expect(await updateExpenseCategory(id, { type: "CAPEX", months: 240, account: "" })).toMatchObject({ success: true });
    expect(db.rows("expense_categories")[0]).toMatchObject({ name: "Bodega", expense_type: "CAPEX", depreciation_months: 240 });
    expect(db.rows("siigo_settings")[0].config.expense_accounts).not.toHaveProperty("Bodega");
    await setExpenseCategoryActive(id, false);
    expect(await names()).not.toContain("Bodega");
  });
});
