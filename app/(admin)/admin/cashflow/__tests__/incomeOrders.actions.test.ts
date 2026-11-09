import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeClient, seedDB, ADMIN_ID, type FakeDB } from "@/test/fakeSupabase";

const h = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/utils/supabase/server", () => ({ createClient: async () => h.client }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { getAllIncomes, getLinkableOrders, setIncomeOrders } from "../actions";

let db: FakeDB;
beforeEach(() => {
  db = seedDB({});
  h.client = createFakeClient(db, { id: ADMIN_ID });
  db.rows("daily_cashflows").push({ id: "d10", date: "2026-10-10" });
  db.rows("cashflow_incomes").push(
    { id: "inc220", cashflow_id: "d10", era: "v2", concept: "Pago cafe sin factura", category: "Ventas Físicas", amount: 220000, gross_amount: 220000, created_at: "2026-10-10T15:00:00Z" },
    { id: "other", cashflow_id: "d10", era: "v2", concept: "Otro", category: "Ventas Físicas", amount: 84000, gross_amount: 84000, created_at: "2026-10-10T16:00:00Z" },
  );
  db.rows("clients").push({ id: "c1", name: "Marcos Pimienta" });
  db.rows("orders").push(
    { id: "o144", source: "web", status: "delivered", payment_status: "paid", paid_at: "2026-10-10T17:00:00Z", total_amount: 144000, created_at: "2026-10-08T15:00:00Z", client_id: "c1", cashflow_income_id: null },
    { id: "o87", source: "web", status: "delivered", payment_status: "pending", paid_at: null, total_amount: 87000, created_at: "2026-10-08T16:00:00Z", client_id: "c1", cashflow_income_id: null },
    { id: "o84", source: "web", status: "delivered", payment_status: "paid", paid_at: "2026-10-16T17:00:00Z", total_amount: 84000, created_at: "2026-10-16T15:00:00Z", shipping_info: { recipient_name: "Margarita Uribe" }, cashflow_income_id: null },
    { id: "gone", status: "cancelled", payment_status: "pending", total_amount: 50000, created_at: "2026-10-09T15:00:00Z", cashflow_income_id: null },
    { id: "gift", status: "delivered", payment_status: "paid", total_amount: 0, created_at: "2026-10-09T15:00:00Z", cashflow_income_id: null },
    { id: "may", status: "delivered", payment_status: "paid", total_amount: 99000, created_at: "2026-05-01T15:00:00Z", cashflow_income_id: null },
  );
  db.rows("sales_invoices").push({ id: "fv770", order_id: "o144", siigo_name: "FV-2-770", status: "emitida" }, { id: "draft", order_id: "o87", siigo_name: null, status: "borrador" });
});
const autoAmounts = async () => (await getAllIncomes("v2")).filter((i: { type: string }) => i.type === "auto").map((i: { amount: number }) => Number(i.amount)).filter((a: number) => a > 0).sort();

describe("linking a manual income to the orders it pays", () => {
  it("offers live orders with a value near the date, with their invoice or 'sin factura'", async () => {
    const { orders } = await getLinkableOrders("2026-10-10");
    expect(orders.map((o) => [o.id, o.invoice, o.customer])).toEqual([
      ["o144", "FV-2-770", "Marcos Pimienta"],
      ["o87", "Factura por enviar", "Marcos Pimienta"],
      ["o84", null, "Margarita Uribe"],
    ]);
  });

  it("one transfer pays two invoices: neither counts again in Flujo de Caja, and the income lists them", async () => {
    expect(await autoAmounts()).toEqual([144000, 84000].sort());
    expect(await setIncomeOrders("inc220", ["o144", "o87"])).toEqual({ success: true });
    expect(await autoAmounts()).toEqual([84000]);
    const income = (await getAllIncomes("v2")).find((i: { id: string }) => i.id === "inc220");
    expect(income.linked_orders.map((o: { invoice: string | null }) => o.invoice).sort()).toEqual(["FV-2-770", "Factura por enviar"]);
  });

  it("orders left out are released, and an order held by another income is refused", async () => {
    await setIncomeOrders("inc220", ["o144", "o87"]);
    await setIncomeOrders("inc220", ["o144"]);
    expect(db.byId("orders", "o87")!.cashflow_income_id).toBeNull();
    const res = await setIncomeOrders("other", ["o144"]);
    expect(res.error).toMatch(/Ya están ligados a otro ingreso: FV-2-770/);
    expect(db.byId("orders", "o144")!.cashflow_income_id).toBe("inc220");
  });

  it("when editing, the orders it already holds stay in the list and come first", async () => {
    await setIncomeOrders("inc220", ["o144"]);
    const { orders } = await getLinkableOrders("2026-10-10", "inc220");
    expect(orders[0]).toMatchObject({ id: "o144", income_id: "inc220" });
  });
});
