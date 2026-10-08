import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeClient, FakeDB } from "@/test/fakeSupabase";

const h = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/utils/supabase/server", () => ({ createClient: async () => h.client }));

import { createPendingOrder } from "../checkout";

let db: FakeDB;
const cart = [
  { id: "premium", nameKey: "p", price: 45000, quantity: 2, weight: "250g", grind: "whole" },
  { id: "honey", nameKey: "h", price: 52000, quantity: 1, weight: "250g", grind: "ground", grindLevel: "fino" },
];

beforeEach(() => {
  db = new FakeDB({ profiles: [{ id: "ana", phone_number: "3001234567", address: "Cra 1", city: "Medellín", department: "Antioquia" }] });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("createPendingOrder", () => {
  it("prices include $10.000 shipping per unit, replaced by the zone shipping", async () => {
    h.client = createFakeClient(db, null);
    const res = await createPendingOrder(cart, 14000, { address: "Calle 5", city: "Bello", state: "Antioquia" });
    expect(res).toMatchObject({ success: true, totalAmount: 35000 * 2 + 42000 + 14000 });
    const order = db.byId("orders", res.orderId!)!;
    expect(order).toMatchObject({ status: "pending", user_id: null, contact_email: "guest@example.com" });
    expect(db.rows("order_items").map((i) => [i.product_id, i.quantity, i.price_at_time, i.grind_level])).toEqual([
      ["premium", 2, 45000, null],
      ["honey", 1, 52000, "fino"],
    ]);
  });

  it("a signed-in customer's email, phone and saved address are used", async () => {
    h.client = createFakeClient(db, { id: "ana", email: "ana@cafe.co" });
    const res = await createPendingOrder(cart, 10000);
    expect(db.byId("orders", res.orderId!)).toMatchObject({
      user_id: "ana",
      contact_email: "ana@cafe.co",
      contact_phone: "3001234567",
      shipping_info: { address: "Cra 1", city: "Medellín", state: "Antioquia", details: "" },
    });
  });

  it("if the items cannot be saved, the empty order is removed", async () => {
    h.client = createFakeClient(db, null);
    db.failOn("order_items", "insert", "bad item");
    const res = await createPendingOrder(cart, 10000);
    expect(res).toEqual({ success: false, error: "Error guardando los productos del carrito." });
    expect(db.rows("orders")).toHaveLength(0);
  });

  it("reports a database failure creating the order", async () => {
    h.client = createFakeClient(db, null);
    db.failOn("orders", "insert");
    expect(await createPendingOrder(cart, 10000)).toMatchObject({ success: false });
  });
});
