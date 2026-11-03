import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeClient, seedDB, ADMIN_ID, type FakeDB } from "@/test/fakeSupabase";

const h = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/utils/supabase/server", () => ({ createClient: async () => h.client }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { createExpenseDirect, createSplitExpense, updateExpenseDirect } from "../actions";

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

describe("balance movements in Gastos", () => {
  it("the monthly autorretención payment leaves cash as BALANCE, with no IVA or asset data", async () => {
    const res = await createExpenseDirect("2026-11-10", { concept: "Autorretención octubre (F350)", category: "Pago de autorretención a la DIAN", expense_type: "BALANCE", amount: 412000, tax_amount: 0 });
    expect(res.error).toBeUndefined();
    expect(db.rows("cashflow_expenses")[0]).toMatchObject({ expense_type: "BALANCE", amount: 412000, net_amount: 412000, depreciation_months: null });
    expect(db.rows("cashflow_expenses")[0]).not.toHaveProperty("asset_kind");
  });
});

describe("one payment split into several categories", () => {
  const RETE = "Retención en la fuente por pagar";
  const RETEICA = "ReteICA por pagar";

  it("makes one row per line with the same date, concept and support, none with IVA", async () => {
    const res = await createSplitExpense("2026-10-21", { concept: "Pago DIAN retenciones septiembre", image_url: "https://x/soporte.png" }, [
      { category: RETE, amount: 180000, expense_type: "BALANCE" },
      { category: RETEICA, amount: 80000, expense_type: "BALANCE" },
    ]);
    expect(res).toMatchObject({ success: true });
    expect(db.rows("cashflow_expenses").map((e) => [e.concept, e.category, e.amount, e.expense_type, e.tax_amount, e.image_url])).toEqual([
      ["Pago DIAN retenciones septiembre", RETE, 180000, "BALANCE", 0, "https://x/soporte.png"],
      ["Pago DIAN retenciones septiembre", RETEICA, 80000, "BALANCE", 0, "https://x/soporte.png"],
    ]);
    expect(new Set(db.rows("cashflow_expenses").map((e) => e.cashflow_id)).size).toBe(1);
  });

  it("is all or nothing, and refuses fixed assets and empty lines", async () => {
    db.failOn("cashflow_expenses", "insert", "forced failure", 1); // the second line fails
    expect(await createSplitExpense("2026-10-21", { concept: "Pago" }, [
      { category: RETE, amount: 1, expense_type: "BALANCE" },
      { category: RETEICA, amount: 2, expense_type: "BALANCE" },
    ])).toMatchObject({ error: "forced failure" });
    expect(db.rows("cashflow_expenses")).toHaveLength(0);
    expect(await createSplitExpense("2026-10-21", { concept: "Pago" }, [{ category: RETE, amount: 1, expense_type: "BALANCE" }, { category: "", amount: 2, expense_type: "OPEX" }])).toMatchObject({ error: "Cada línea necesita categoría y un valor mayor a cero." });
    expect(await createSplitExpense("2026-10-21", { concept: "Pago" }, [{ category: "Maquinaria y Equipo (PUC 1520)", amount: 1, expense_type: "CAPEX" }, { category: RETE, amount: 2, expense_type: "BALANCE" }])).toMatchObject({ error: "Un activo fijo se registra solo, no en un gasto dividido." });
  });
});
