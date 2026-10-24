import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeClient, FakeDB } from "@/test/fakeSupabase";

const h = vi.hoisted(() => ({ client: null as unknown, admin: null as unknown }));
vi.mock("@/utils/supabase/server", () => ({ createClient: async () => h.client }));
vi.mock("@/utils/supabase/admin", () => ({ createAdminClient: () => h.admin }));

import { createPendingOrder } from "../checkout";

let db: FakeDB;
const bello = { address: "Calle 5", city: "Bello", state: "Antioquia" };
const cart = [
  { id: "firma", nameKey: "p", price: 35000, quantity: 2, weight: "250g", grind: "whole" },
  { id: "honey", nameKey: "h", price: 48000, quantity: 1, weight: "500g", grind: "ground", grindLevel: "fino" },
];

beforeEach(() => {
  db = new FakeDB({
    profiles: [{ id: "ana", phone_number: "3001234567", address: "Cra 1", city: "Medellín", department: "Antioquia" }],
    inventory: [
      { id: "inv-250", product_code: "CAFT-250G" },
      { id: "inv-hon500", product_code: "CAFT-HON-500G" },
    ],
  });
  h.client = createFakeClient(db, null);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("createPendingOrder — the server sets the price", () => {
  it("charges the price list, minus the $10.000 bundled shipping, plus the zone's shipping", async () => {
    const res = await createPendingOrder(cart, 0, bello);
    // (35.000 − 10.000) × 2 + (86.400 − 10.000) + 14.000 Bello
    expect(res).toMatchObject({ success: true, totalAmount: 50000 + 76400 + 14000, shippingCost: 14000 });
    const order = db.byId("orders", res.orderId!)!;
    expect(order).toMatchObject({ status: "pending", source: "web", total_amount: 140400 });
  });

  it("ignores tampered prices and shipping coming from the browser", async () => {
    const tampered = cart.map((c) => ({ ...c, price: 1 }));
    const res = await createPendingOrder(tampered, 0, bello);
    expect(res.totalAmount).toBe(140400);
    expect(db.rows("order_items").map((i) => i.price_at_time)).toEqual([35000, 86400]);
  });

  it("links each line to its inventory product so the payment deducts stock", async () => {
    await createPendingOrder(cart, 0, bello);
    expect(db.rows("order_items").map((i) => [i.product_id, i.inventory_id, i.grind_level])).toEqual([
      ["firma", "inv-250", null],
      ["honey", "inv-hon500", "fino"],
    ]);
  });

  it.each([
    ["an unknown product", [{ ...cart[0], id: "premium" }], /ya no está disponible/],
    ["a size the shop does not sell", [{ ...cart[0], id: "honey", weight: "2.5kg" }], /ya no está disponible/],
    ["a fractional quantity", [{ ...cart[0], quantity: 1.5 }], /Cantidad inválida/],
    ["zero units", [{ ...cart[0], quantity: 0 }], /Cantidad inválida/],
    ["an absurd quantity", [{ ...cart[0], quantity: 999 }], /Cantidad inválida/],
    ["an empty cart", [], /vacío/],
  ])("rejects %s", async (_label, items, msg) => {
    expect(await createPendingOrder(items, 0, bello)).toMatchObject({ success: false, error: expect.stringMatching(msg) });
    expect(db.rows("orders")).toHaveLength(0);
  });

  it("refuses addresses outside delivery coverage", async () => {
    const res = await createPendingOrder(cart, 0, { address: "x", city: "Cali", state: "Valle" });
    expect(res).toMatchObject({ success: false, error: expect.stringMatching(/Área Metropolitana/) });
  });

  it("a signed-in customer's saved address is used when none is given", async () => {
    h.client = createFakeClient(db, { id: "ana", email: "ana@cafe.co" });
    const res = await createPendingOrder(cart, 0);
    expect(res.shippingCost).toBe(10000); // Medellín
    expect(db.byId("orders", res.orderId!)).toMatchObject({ user_id: "ana", contact_email: "ana@cafe.co", contact_phone: "3001234567" });
  });

  it("still sells if the database has no orders.source column", async () => {
    db.failOn("orders", "insert", 'column "source" of relation "orders" does not exist');
    expect(await createPendingOrder(cart, 0, bello)).toMatchObject({ success: true });
  });

  it("if the items cannot be saved, the empty order is removed", async () => {
    db.failOn("order_items", "insert", "bad item");
    expect(await createPendingOrder(cart, 0, bello)).toEqual({ success: false, error: "Error guardando los productos del carrito." });
    expect(db.rows("orders")).toHaveLength(0);
  });
});

describe("createPendingOrder — the KRUPS combo", () => {
  const combo = { id: "krups-coffee-crush", nameKey: "krups.comboName", price: 1, quantity: 1, weight: "combo", grind: "whole" };
  // Machines are sold on demand (IMUSA ships them): no stock, only the 20-combo limit.
  const sell = (n: number, paid = true) => {
    for (let i = 0; i < n; i++) {
      db.rows("orders").push({ id: `sold-${db.rows("orders").length}`, status: "pending", payment_status: paid ? "paid" : "pending" });
      db.rows("order_items").push({ id: `si-${db.rows("order_items").length}`, order_id: db.rows("orders").at(-1)!.id, product_id: "krups-coffee-crush", quantity: 1 });
    }
  };
  beforeEach(() => {
    db.rows("inventory").push({ id: "inv-krups", product_code: "EQP-KRUPS-CC", current_stock: 0 }, { id: "inv-500", product_code: "CAFT-500G", current_stock: 30 });
    h.admin = createFakeClient(db, null);
  });

  it("charges $1.588.000 with free shipping and goes into the order as the machine and the 500 g bag", async () => {
    const res = await createPendingOrder([combo], 0, bello);
    expect(res).toMatchObject({ success: true, totalAmount: 1588000, shippingCost: 0 });
    const order = res.orderId!;
    expect(db.rows("order_items").filter((i) => i.order_id === order).map((i) => [i.product_id, i.inventory_id, i.weight, i.grind, i.price_at_time])).toEqual([
      ["krups-coffee-crush", "inv-krups", "unidad", null, 1535000],
      ["firma", "inv-500", "500g", "whole", 53000],
    ]);
  });

  it("with coffee in the same order, the whole order ships free", async () => {
    const res = await createPendingOrder([combo, cart[0]], 0, bello);
    expect(res).toMatchObject({ success: true, totalAmount: 1588000 + 2 * 25000, shippingCost: 0 });
  });

  it("sells with no machines in stock, up to 20 paid combos", async () => {
    sell(18);
    sell(5, false); // unpaid orders don't use up the limit
    expect(await createPendingOrder([{ ...combo, quantity: 2 }], 0, bello)).toMatchObject({ success: true });
    sell(1);
    expect(await createPendingOrder([{ ...combo, quantity: 2 }], 0, bello)).toMatchObject({ success: false, error: expect.stringContaining("solo quedan 1") });
    sell(1);
    expect(await createPendingOrder([combo], 0, bello)).toMatchObject({ success: false, error: expect.stringContaining("agotado") });
  });

  it("a combo line with a bag size is not sold", async () => {
    expect(await createPendingOrder([{ ...combo, weight: "500g" }], 0, bello)).toMatchObject({ success: false, error: expect.stringMatching(/ya no está disponible/) });
  });
});
