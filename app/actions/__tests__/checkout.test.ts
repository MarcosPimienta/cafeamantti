import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeClient, FakeDB } from "@/test/fakeSupabase";

const h = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/utils/supabase/server", () => ({ createClient: async () => h.client }));

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
