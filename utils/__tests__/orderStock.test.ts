import { describe, it, expect, beforeEach } from "vitest";
import { FakeDB, createFakeClient } from "@/test/fakeSupabase";
import { syncOrderStock, revertOrderStock, orderMovementReason, findOrderMovements } from "../orders/stock";

let db: FakeDB;
let sb: ReturnType<typeof createFakeClient>;
const stock = () => db.byId("inventory", "inv-250")!.current_stock;

beforeEach(() => {
  db = new FakeDB({
    inventory: [{ id: "inv-250", product_code: "CAFT-250G", current_stock: 5 }],
    orders: [{ id: "web-0001", source: "web", status: "pending" }],
    order_items: [{ id: "i1", order_id: "web-0001", inventory_id: "inv-250", quantity: 2 }],
  });
  sb = createFakeClient(db, null);
});

describe("orderMovementReason", () => {
  it("names the movement by order source", () => {
    expect(orderMovementReason("abcd1234-x", "manual")).toBe("Orden Manual #abcd1234");
    expect(orderMovementReason("abcd1234-x", "siigo")).toBe("Orden Siigo #abcd1234");
    expect(orderMovementReason("abcd1234-x", null)).toBe("Orden Web #abcd1234");
  });
});

describe("syncOrderStock", () => {
  it("paid deducts once, linked to the order; staying paid does nothing more", async () => {
    expect(await syncOrderStock(sb, { orderId: "web-0001", status: "paid", userId: null })).toBe("deducted");
    expect(stock()).toBe(3);
    expect(db.rows("inventory_movements")[0]).toMatchObject({ order_id: "web-0001", quantity: -2, reason: "Orden Web #web" });
    expect(await syncOrderStock(sb, { orderId: "web-0001", status: "shipped", userId: null })).toBe("unchanged");
    expect(stock()).toBe(3);
  });

  it("cancelled after paid gives the stock back", async () => {
    await syncOrderStock(sb, { orderId: "web-0001", status: "paid", userId: null });
    expect(await syncOrderStock(sb, { orderId: "web-0001", status: "cancelled", userId: null })).toBe("reverted");
    expect(stock()).toBe(5);
    expect(db.rows("inventory_movements")).toHaveLength(0);
  });

  it("refuses to go negative unless the payment already happened", async () => {
    db.byId("order_items", "i1")!.quantity = 9;
    await expect(syncOrderStock(sb, { orderId: "web-0001", status: "paid", userId: null })).rejects.toThrow(/negativo/);
    db.tables.inventory_movements = [];
    db.byId("inventory", "inv-250")!.current_stock = 5;
    await syncOrderStock(sb, { orderId: "web-0001", status: "paid", userId: null, allowNegative: true });
    expect(stock()).toBe(-4); // the shortfall shows up in the Kardex
  });

  it("orders without inventory links are left alone", async () => {
    db.byId("order_items", "i1")!.inventory_id = null;
    expect(await syncOrderStock(sb, { orderId: "web-0001", status: "paid", userId: null })).toBe("unchanged");
    expect(stock()).toBe(5);
  });

  it("finds movements written before order_id existed (by reason)", async () => {
    db.rows("inventory_movements").push({ id: "old", inventory_id: "inv-250", quantity: -1, reason: "Orden Manual #web", order_id: null });
    expect((await findOrderMovements(sb, "web-0001")).map((m) => m.id)).toEqual(["old"]);
    await revertOrderStock(sb, "web-0001");
    expect(stock()).toBe(6);
  });

  it("reports each movement for auditing", async () => {
    const seen: string[] = [];
    await syncOrderStock(sb, { orderId: "web-0001", status: "paid", userId: "u", onMovement: (m) => void seen.push(`${m.reverted}:${m.quantity}`) });
    await syncOrderStock(sb, { orderId: "web-0001", status: "pending", userId: "u", onMovement: (m) => void seen.push(`${m.reverted}:${m.quantity}`) });
    expect(seen).toEqual(["false:-2", "true:-2"]);
  });
});
