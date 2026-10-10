import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeClient, seedDB, ADMIN_ID, type FakeDB } from "@/test/fakeSupabase";

const h = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/utils/supabase/server", () => ({ createClient: async () => h.client }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { createExpenseDirect, updateExpenseDirect } from "../actions";

let db: FakeDB;
beforeEach(() => {
  db = seedDB();
  h.client = createFakeClient(db, { id: ADMIN_ID });
});

const machine = {
  concept: "Máquina La Marzocco para cliente Okus",
  category: "Maquinaria y Equipo (PUC 1520)",
  amount: 11900000,
  tax_amount: 1900000,
  depreciation_months: 84,
  asset_kind: "Máquina de espresso",
  asset_use: "comodato" as const,
  residual_value: 1000000,
};

describe("fixed assets in Gastos", () => {
  it("stores the asset data; without a start-of-use date it depreciates from the purchase", async () => {
    const res = await createExpenseDirect("2026-10-10", machine);
    expect(res.error).toBeUndefined();
    expect(db.rows("cashflow_expenses")[0]).toMatchObject({
      expense_type: "CAPEX",
      net_amount: 10000000,
      asset_kind: "Máquina de espresso",
      asset_use: "comodato",
      in_service_date: "2026-10-10",
      residual_value: 1000000,
    });
  });

  it("an ordinary expense does not send the asset columns (works before the migration)", async () => {
    await createExpenseDirect("2026-10-10", { concept: "Internet", category: "Servicios Públicos (Agua, luz, internet)", amount: 100000 });
    const row = db.rows("cashflow_expenses")[0];
    expect(row.expense_type).toBe("OPEX");
    for (const col of ["asset_kind", "asset_use", "in_service_date", "residual_value"]) expect(row).not.toHaveProperty(col);
  });

  it("turning an asset into an ordinary expense clears its asset data", async () => {
    const { data } = (await createExpenseDirect("2026-10-10", machine)) as { data: { id: string } };
    await updateExpenseDirect(data.id, { category: "Mantenimiento y Reparaciones", expense_type: "OPEX" });
    expect(db.byId("cashflow_expenses", data.id)).toMatchObject({
      expense_type: "OPEX", depreciation_months: null, asset_kind: null, asset_use: null, in_service_date: null, residual_value: 0,
    });
  });

  it("explains a missing migration when saving an asset", async () => {
    db.failOn("cashflow_expenses", "insert", 'column "asset_kind" of relation "cashflow_expenses" does not exist');
    const res = await createExpenseDirect("2026-10-10", machine);
    expect(res.error).toMatch(/20261015000000_expense_fixed_assets/);
  });
});
