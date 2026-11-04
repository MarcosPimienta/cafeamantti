import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeClient, seedDB, ADMIN_ID, type FakeDB } from "@/test/fakeSupabase";
import { INVENTORY } from "@/test/fixtures";

const h = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/utils/supabase/server", () => ({ createClient: async () => h.client }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { createSalida, updateMovement, deleteMovement } from "../actions";

let db: FakeDB;
const stock = (id: string) => db.byId("inventory", id)!.current_stock;

beforeEach(() => {
  db = seedDB({ inventory: INVENTORY() });
  h.client = createFakeClient(db, { id: ADMIN_ID });
});

describe("createSalida — plain salida (muestra, merma)", () => {
  it("only moves inventory", async () => {
    const res = await createSalida("inv-cold", 3, "2026-10-05", "Muestra feria");
    expect(res).toEqual({ success: true, newStock: 9 });
    const [m] = db.rows("inventory_movements");
    expect(m).toMatchObject({ inventory_id: "inv-cold", type: "salida", quantity: -3, tab_source: "salida", income_id: null, movement_date: "2026-10-05" });
    expect(db.rows("cashflow_incomes")).toHaveLength(0);
  });

  it("roasted coffee must say Grano or Molido before anything is written", async () => {
    const res = await createSalida("inv-250", 2, "2026-10-05");
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/molienda/i);
    expect(stock("inv-250")).toBe(20);
    expect(db.rows("inventory_movements")).toHaveLength(0);
  });

  it("stamps the grind on roasted coffee and refuses it on anything else", async () => {
    await createSalida("inv-250", 2, "2026-10-05", undefined, undefined, "molido");
    await createSalida("inv-cold", 1, "2026-10-05", undefined, undefined, "molido");
    expect(db.rows("inventory_movements").map((m) => m.molienda)).toEqual(["molido", null]);
  });
});

describe("createSalida — paid sale (stock and cash together)", () => {
  it("creates the cashflow income on the payment date and links it to the movement", async () => {
    const res = await createSalida("inv-250", 2, "2026-10-05", undefined, "Ana", "grano", { amount: 90000 });
    expect(res.success).toBe(true);
    expect(stock("inv-250")).toBe(18);

    const [income] = db.rows("cashflow_incomes");
    const day = db.byId("daily_cashflows", income.cashflow_id)!;
    expect(day.date).toBe("2026-10-05");
    expect(income).toMatchObject({
      category: "Ventas Físicas",
      amount: 90000,
      gross_amount: 90000,
      net_revenue: 90000,
      fee_amount: 0,
      tax_amount: 0,
      inventory_id: "inv-250",
      quantity_sold: 2,
      concept: "Venta Café Tostado 250g × 2 unidad",
    });
    expect(db.rows("inventory_movements")[0].income_id).toBe(income.id);
    expect(db.rows("cashflow_audit_logs").map((l) => l.action_type)).toEqual(["CREATE_INCOME"]);
  });

  it("uses the motivo as the income concept when given", async () => {
    await createSalida("inv-cold", 1, "2026-10-05", "Venta mostrador Okus", undefined, undefined, { amount: 12000 });
    expect(db.rows("cashflow_incomes")[0].concept).toBe("Venta mostrador Okus");
  });

  it("rejects a sale without a positive amount and writes nothing", async () => {
    const res = await createSalida("inv-cold", 1, "2026-10-05", undefined, undefined, undefined, { amount: 0 });
    expect(res).toMatchObject({ success: false, error: expect.stringMatching(/valor cobrado/) });
    expect(db.rows("cashflow_incomes")).toHaveLength(0);
    expect(db.rows("inventory_movements")).toHaveLength(0);
  });

  it("if stock would go negative, neither the movement nor the income survive", async () => {
    const res = await createSalida("inv-cold", 50, "2026-10-05", undefined, undefined, undefined, { amount: 600000 });
    expect(res).toMatchObject({ success: false, error: expect.stringMatching(/Stock insuficiente/) });
    expect(stock("inv-cold")).toBe(12);
    expect(db.rows("inventory_movements")).toHaveLength(0);
    expect(db.rows("cashflow_incomes")).toHaveLength(0);
  });

  it("if the movement insert fails, the income just created is removed", async () => {
    db.failOn("inventory_movements", "insert", "db down");
    const res = await createSalida("inv-cold", 1, "2026-10-05", undefined, undefined, undefined, { amount: 12000 });
    expect(res).toMatchObject({ success: false, error: "db down" });
    expect(db.rows("cashflow_incomes")).toHaveLength(0);
    expect(stock("inv-cold")).toBe(12);
  });
});

describe("editing and deleting a paid sale keeps cash in sync", () => {
  async function sell() {
    await createSalida("inv-250", 2, "2026-10-05", undefined, undefined, "grano", { amount: 90000 });
    return db.rows("inventory_movements")[0];
  }

  it("updateMovement moves date, quantity and amount on the income too", async () => {
    const m = await sell();
    const res = await updateMovement(m.id, -3, "2026-10-06", undefined, undefined, undefined, "grano", 135000);
    expect(res.newStock).toBe(17);
    const income = db.rows("cashflow_incomes")[0];
    expect(income).toMatchObject({ quantity_sold: 3, gross_amount: 135000, amount: 135000, net_revenue: 135000 });
    expect(db.byId("daily_cashflows", income.cashflow_id)!.date).toBe("2026-10-06");
  });

  it("without a new amount, only date and quantity change on the income", async () => {
    const m = await sell();
    await updateMovement(m.id, -1, "2026-10-05", undefined, undefined, undefined, "grano");
    expect(db.rows("cashflow_incomes")[0]).toMatchObject({ quantity_sold: 1, gross_amount: 90000 });
  });

  it("a zero amount is rejected before stock changes", async () => {
    const m = await sell();
    await expect(updateMovement(m.id, -1, "2026-10-05", undefined, undefined, undefined, "grano", 0)).rejects.toThrow(/mayor a cero/);
    expect(stock("inv-250")).toBe(18);
  });

  it("deleteMovement restores stock and removes the income", async () => {
    const m = await sell();
    const res = await deleteMovement(m.id);
    expect(res).toMatchObject({ success: true, newStock: 20 });
    expect(db.rows("inventory_movements")).toHaveLength(0);
    expect(db.rows("cashflow_incomes")).toHaveLength(0);
    expect(db.rows("cashflow_audit_logs").map((l) => l.action_type)).toEqual(["CREATE_INCOME", "DELETE_INCOME"]);
  });
});

describe("stock always matches the Kardex", () => {
  const kardex = (id: string) => db.rows("inventory_movements").filter((m) => m.inventory_id === id && m.era === "v2").reduce((s, m) => s + Number(m.quantity), 0);

  it("an entrada typed in grams and fixed later leaves stock equal to its movements", async () => {
    db.rows("inventory_movements").push({ id: "e1", inventory_id: "inv-cold", type: "entrada", quantity: 4663, era: "v2" });
    db.byId("inventory", "inv-cold")!.current_stock = 4663;
    await updateMovement("e1", 4.66, "2026-10-01");
    expect(stock("inv-cold")).toBeCloseTo(4.66);
    expect(stock("inv-cold")).toBeCloseTo(kardex("inv-cold"));
  });

  it("an edit that would leave the product below zero is refused whole", async () => {
    await createSalida("inv-cold", 10, "2026-10-05");
    const [m] = db.rows("inventory_movements");
    await expect(updateMovement(m.id, -20, "2026-10-05")).rejects.toThrow(/Stock insuficiente de "Cold Brew 340ml"/);
    expect(db.byId("inventory_movements", m.id)!.quantity).toBe(-10);
    expect(stock("inv-cold")).toBe(2);
  });

  it("deleting an entrada whose stock was already used is refused, and the entrada stays", async () => {
    db.byId("inventory", "inv-cold")!.current_stock = 0;
    db.rows("inventory_movements").push({ id: "e1", inventory_id: "inv-cold", type: "entrada", quantity: 5, era: "v2" });
    db.byId("inventory", "inv-cold")!.current_stock = 5;
    await createSalida("inv-cold", 4, "2026-10-05");
    expect(await deleteMovement("e1")).toMatchObject({ success: false, error: expect.stringMatching(/Stock insuficiente/) });
    expect(db.byId("inventory_movements", "e1")).toBeDefined();
    expect(stock("inv-cold")).toBe(1);
  });

  it("editing or deleting a movement from before the September 2026 cutover (v1) does not touch today's stock", async () => {
    db.rows("inventory_movements").push({ id: "old", inventory_id: "inv-cold", type: "entrada", quantity: 845, era: "v1" });
    await updateMovement("old", 8.45, "2026-05-03");
    expect(stock("inv-cold")).toBe(12);
    await deleteMovement("old");
    expect(stock("inv-cold")).toBe(12);
  });
});

describe("authorization", () => {
  it("non-admins cannot register salidas", async () => {
    db.rows("profiles").push({ id: "customer", role: "customer" });
    h.client = createFakeClient(db, { id: "customer" });
    await expect(createSalida("inv-cold", 1, "2026-10-05")).rejects.toThrow("Unauthorized");
    h.client = createFakeClient(db, null);
    await expect(createSalida("inv-cold", 1, "2026-10-05")).rejects.toThrow("Unauthorized");
    expect(db.rows("inventory_movements")).toHaveLength(0);
  });
});
