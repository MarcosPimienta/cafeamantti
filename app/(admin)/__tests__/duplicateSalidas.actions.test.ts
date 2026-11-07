import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeClient, seedDB, ADMIN_ID, type FakeDB } from "@/test/fakeSupabase";

const h = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/utils/supabase/server", () => ({ createClient: async () => h.client }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { ordersRepeatedBySalida, removeDuplicateSalida } from "../actions";

let db: FakeDB;
const stock = (id: string) => db.byId("inventory", id)!.current_stock;

beforeEach(() => {
  db = seedDB({
    inventory: [
      { id: "chiroso", product_name: "Café Tostado Chiroso 250g", product_code: "CAFT-CH-250G", category: "cafe", unit: "unidad", current_stock: 17 },
      { id: "instant", product_name: "Café Instantáneo 500g", product_code: "SOL-500G", category: "cafe", unit: "unidad", current_stock: 34 },
    ],
  });
  h.client = createFakeClient(db, { id: ADMIN_ID });
  db.rows("clients").push({ id: "c1", name: "Marcos Pimienta" });
  db.rows("orders").push({ id: "5d8da452-0000-0000-0000-000000000000", status: "delivered", payment_status: "paid", created_at: "2026-10-07T20:44:00Z", client_id: "c1", total_amount: 144000, cashflow_income_id: null });
  db.rows("sales_invoices").push({ id: "fv770", order_id: "5d8da452-0000-0000-0000-000000000000", siigo_name: "FV-2-770", status: "emitida" });
  db.rows("inventory_movements").push(
    { id: "ord-ch", inventory_id: "chiroso", type: "salida", quantity: -2, era: "v2", tab_source: "salida", order_id: "5d8da452-0000-0000-0000-000000000000", movement_date: "2026-10-10", reason: "Orden Web #5d8da452" },
    { id: "ord-in", inventory_id: "instant", type: "salida", quantity: -1, era: "v2", tab_source: "salida", order_id: "5d8da452-0000-0000-0000-000000000000", movement_date: "2026-10-10", reason: "Orden Web #5d8da452" },
    { id: "man-ch", inventory_id: "chiroso", type: "salida", quantity: -2, era: "v2", tab_source: "salida", order_id: null, movement_date: "2026-10-07", reason: "Venta Marcos", income_id: null },
  );
});

describe("a manual salida that repeats an order", () => {
  it("before saving 'Venta Marcos' for 2 Chiroso, the order that already took them is named", async () => {
    const res = await ordersRepeatedBySalida("chiroso", 2, "2026-10-07", "Venta Marcos");
    expect(res.orders).toEqual([{ id: "5d8da452-0000-0000-0000-000000000000", customer: "Marcos Pimienta", invoice: "FV-2-770", date: "2026-10-07" }]);
    expect((await ordersRepeatedBySalida("chiroso", 2, "2026-10-07", "Venta Julio Toro")).orders).toEqual([]);
    expect((await ordersRepeatedBySalida("chiroso", 1, "2026-10-07", "Venta Marcos")).orders).toEqual([]);
    expect((await ordersRepeatedBySalida("chiroso", 2, "2026-10-07")).orders).toEqual([]);
  });

  it("removing the repeated salida gives its stock back; the order keeps its own", async () => {
    const res = await removeDuplicateSalida("5d8da452-0000-0000-0000-000000000000", "man-ch");
    expect(res).toMatchObject({ success: true, newStock: 19 });
    expect(stock("chiroso")).toBe(19);
    expect(db.byId("inventory_movements", "man-ch")).toBeUndefined();
    expect(db.byId("inventory_movements", "ord-ch")).toBeDefined();
  });

  it("a paid manual salida: its income stays and now holds the order's money", async () => {
    db.byId("inventory_movements", "man-ch")!.income_id = "inc1";
    db.rows("cashflow_incomes").push({ id: "inc1", amount: 60000 });
    await removeDuplicateSalida("5d8da452-0000-0000-0000-000000000000", "man-ch");
    expect(db.byId("cashflow_incomes", "inc1")).toBeDefined();
    expect(db.byId("orders", "5d8da452-0000-0000-0000-000000000000")!.cashflow_income_id).toBe("inc1");
  });

  it("refuses an order's own salida, or a product the order never deducted", async () => {
    expect(await removeDuplicateSalida("5d8da452-0000-0000-0000-000000000000", "ord-ch")).toMatchObject({ success: false, error: expect.stringMatching(/salida manual/) });
    db.rows("inventory_movements").push({ id: "man-other", inventory_id: "otro", type: "salida", quantity: -1, era: "v2", tab_source: "salida", order_id: null, movement_date: "2026-10-07", reason: "Venta Marcos" });
    expect(await removeDuplicateSalida("5d8da452-0000-0000-0000-000000000000", "man-other")).toMatchObject({ success: false, error: expect.stringMatching(/no ha descontado/) });
    expect(stock("chiroso")).toBe(17);
  });
});
