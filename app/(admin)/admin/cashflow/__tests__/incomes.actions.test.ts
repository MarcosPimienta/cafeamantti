import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeClient, seedDB, ADMIN_ID, type FakeDB } from "@/test/fakeSupabase";
import { INVENTORY } from "@/test/fixtures";

const h = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/utils/supabase/server", () => ({ createClient: async () => h.client }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { createIncomeDirect, updateIncomeDirect, deleteIncomeDirect, ensureCashflowDate, getAllIncomes } from "../actions";
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

describe("orders in Flujo de Caja", () => {
  it("web orders count by themselves when paid, on the payment date — one still owed doesn't", async () => {
    db.rows("orders").push(
      { id: "a1111111-0000-0000-0000-000000000000", source: "web", status: "delivered", payment_status: "pending", paid_at: null, total_amount: 500000, created_at: "2026-10-01T15:00:00Z" },
      { id: "b2222222-0000-0000-0000-000000000000", source: "web", status: "delivered", payment_status: "paid", paid_at: "2026-10-16T17:00:00Z", total_amount: 300000, created_at: "2026-10-01T15:00:00Z" },
      { id: "c3333333-0000-0000-0000-000000000000", source: "web", status: "cancelled", payment_status: "paid", paid_at: "2026-10-02T17:00:00Z", total_amount: 99, created_at: "2026-10-01T15:00:00Z" },
    );
    const incomes = (await getAllIncomes("v2")).filter((i: { type: string }) => i.type === "auto");
    expect(incomes.map((i: { amount: number; date: string }) => [i.amount, i.date])).toEqual([[300000, "2026-10-16"]]);
  });

  it("an order made by hand doesn't count by itself since the September cutover: its money enters with its payments", async () => {
    db.rows("orders").push(
      { id: "d4444444-0000-0000-0000-000000000000", source: "manual", status: "delivered", payment_status: "paid", paid_at: "2026-11-09T15:00:00Z", total_amount: 70000, created_at: "2026-11-09T15:00:00Z" },
      { id: "e5555555-0000-0000-0000-000000000000", source: "manual", status: "delivered", payment_status: "paid", paid_at: "2026-09-10T15:00:00Z", total_amount: 40000, created_at: "2026-09-10T15:00:00Z" },
    );
    const incomes = (await getAllIncomes("v2")).filter((i: { type: string }) => i.type === "auto");
    expect(incomes.map((i: { amount: number }) => i.amount)).toEqual([40000]);
  });
});

describe("an order already counted by a manual income", () => {
  it("is left out of Flujo de Caja, so one transfer isn't counted twice", async () => {
    db.rows("daily_cashflows").push({ id: "d10", date: "2026-10-10" });
    db.rows("cashflow_incomes").push({ id: "inc220", cashflow_id: "d10", era: "v2", concept: "Pago cafe sin factura", category: "Ventas Físicas", amount: 220000, gross_amount: 220000, created_at: "2026-10-10T15:00:00Z" });
    db.rows("orders").push(
      { id: "o144", source: "web", status: "delivered", payment_status: "paid", paid_at: "2026-10-10T17:00:00Z", total_amount: 144000, created_at: "2026-10-08T15:00:00Z", cashflow_income_id: "inc220" },
      { id: "o300", source: "web", status: "delivered", payment_status: "paid", paid_at: "2026-10-16T17:00:00Z", total_amount: 300000, created_at: "2026-10-01T15:00:00Z", cashflow_income_id: null },
    );
    const all = await getAllIncomes("v2");
    expect(all.filter((i: { type: string }) => i.type === "auto").map((i: { amount: number }) => i.amount)).toEqual([300000]);
    expect(all.filter((i: { type: string }) => i.type === "manual").map((i: { amount: number }) => i.amount)).toEqual([220000]);
  });
});


describe("the income of an invoice payment", () => {
  beforeEach(() => {
    db.rows("daily_cashflows").push({ id: "d4", date: "2026-11-04" });
    db.rows("cashflow_incomes").push({ id: "pay-inc", cashflow_id: "d4", era: "v2", concept: "Pago FV-2-763 · Marcos Pimienta", category: "Ventas Físicas", amount: 84000, gross_amount: 84000, fee_amount: 0, shipping_cost: 0, tax_amount: 0, net_revenue: 84000, image_url: null });
    db.rows("invoice_payments").push({ id: "p1", cashflow_income_id: "pay-inc", income_owned: true });
  });

  it("takes its support and a new concept, but not a new value or category", async () => {
    const res = await updateIncomeDirect("pay-inc", { concept: "Pago FV-2-763 · Marcos Pimienta", category: "Ventas Físicas", amount: 84000, gross_amount: 84000, fee_amount: 0, shipping_cost: 0, tax_amount: 0, image_url: "https://x/comprobante.png" });
    expect(res).toMatchObject({ success: true });
    expect(db.byId("cashflow_incomes", "pay-inc")).toMatchObject({ image_url: "https://x/comprobante.png", amount: 84000 });
    expect(await updateIncomeDirect("pay-inc", { amount: 90000, gross_amount: 90000 })).toMatchObject({ error: expect.stringMatching(/vienen del pago de la factura/) });
    expect(db.byId("cashflow_incomes", "pay-inc")!.amount).toBe(84000);
  });

  it("can't be deleted here: it goes with its payment", async () => {
    expect(await deleteIncomeDirect("pay-inc")).toMatchObject({ error: expect.stringMatching(/elimina el pago en Facturas/) });
  });
});
