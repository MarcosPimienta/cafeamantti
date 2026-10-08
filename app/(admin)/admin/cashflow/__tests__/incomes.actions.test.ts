import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeClient, seedDB, ADMIN_ID, type FakeDB } from "@/test/fakeSupabase";
import { INVENTORY } from "@/test/fixtures";

const h = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/utils/supabase/server", () => ({ createClient: async () => h.client }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { createIncomeDirect, updateIncomeDirect, deleteIncomeDirect, ensureCashflowDate } from "../actions";
import { createSalida } from "../../../actions";

let db: FakeDB;

beforeEach(() => {
  db = seedDB({ inventory: INVENTORY() });
  h.client = createFakeClient(db, { id: ADMIN_ID });
});

describe("ensureCashflowDate", () => {
  it("creates the day once and reuses it", async () => {
    const a = await ensureCashflowDate("2026-10-05");
    const b = await ensureCashflowDate("2026-10-05");
    expect(a).toBe(b);
    expect(db.rows("daily_cashflows")).toHaveLength(1);
  });

  it("a day marked 'sin movimientos' is reopened when something is registered", async () => {
    db.rows("daily_cashflows").push({ id: "d1", date: "2026-10-04", observations: "no_movements" });
    expect(await ensureCashflowDate("2026-10-04")).toBe("d1");
    expect(db.byId("daily_cashflows", "d1")!.observations).toBeNull();
  });
});

describe("Flujo de Caja no longer moves inventory", () => {
  it("creating an income ignores product/quantity fields", async () => {
    const res = await createIncomeDirect("2026-10-05", {
      concept: "Venta",
      category: "Ventas Físicas",
      gross_amount: 50000,
      inventory_id: "inv-cold",
      quantity_sold: 3,
    });
    expect(res.success).toBe(true);
    expect(db.byId("inventory", "inv-cold")!.current_stock).toBe(12);
    expect(db.rows("inventory_movements")).toHaveLength(0);
    expect(db.rows("cashflow_incomes")[0]).toMatchObject({ gross_amount: 50000, net_revenue: 50000 });
  });

  it("Ventas Web incomes get the derived IVA and gateway fee", async () => {
    await createIncomeDirect("2026-10-05", { concept: "Web", category: "Ventas Web", gross_amount: 100000 });
    expect(db.rows("cashflow_incomes")[0]).toMatchObject({ tax_amount: 19000, fee_amount: 3560, net_revenue: 77440 });
  });

  it("an unlinked income can be edited and deleted freely", async () => {
    const { data } = (await createIncomeDirect("2026-10-05", { concept: "Servicio", category: "Servicios", gross_amount: 80000 })) as {
      data: { id: string };
    };
    expect(await updateIncomeDirect(data.id, { gross_amount: 90000 })).toMatchObject({ success: true });
    expect(db.byId("cashflow_incomes", data.id)!.gross_amount).toBe(90000);
    expect(await deleteIncomeDirect(data.id)).toEqual({ success: true });
    expect(db.rows("cashflow_incomes")).toHaveLength(0);
    expect(db.rows("cashflow_audit_logs").map((l) => l.action_type)).toEqual(["CREATE_INCOME", "UPDATE_INCOME", "DELETE_INCOME"]);
  });

  it("an income born from a paid salida is read-only here (managed from Inventario)", async () => {
    await createSalida("inv-cold", 2, "2026-10-05", undefined, undefined, undefined, { amount: 24000 });
    const income = db.rows("cashflow_incomes")[0];

    expect(await updateIncomeDirect(income.id, { gross_amount: 1 })).toEqual({ error: expect.stringMatching(/Inventario → Salidas/) });
    expect(await deleteIncomeDirect(income.id)).toEqual({ error: expect.stringMatching(/Inventario → Salidas/) });

    expect(db.byId("cashflow_incomes", income.id)!.gross_amount).toBe(24000);
    expect(db.rows("inventory_movements")).toHaveLength(1);
    expect(db.byId("inventory", "inv-cold")!.current_stock).toBe(10);
  });

  it("errors from the database are returned, not thrown", async () => {
    db.failOn("cashflow_incomes", "insert", "constraint");
    expect(await createIncomeDirect("2026-10-05", { concept: "x", category: "Otros Ingresos", amount: 1 })).toEqual({ error: "constraint" });
  });
});
