import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeClient, seedDB, ADMIN_ID, type FakeDB } from "@/test/fakeSupabase";
import { INVENTORY } from "@/test/fixtures";

const h = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/utils/supabase/server", () => ({ createClient: async () => h.client }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import {
  createManualAdminOrder,
  updateManualAdminOrder,
  deleteManualAdminOrder,
  updateOrderStatus,
  updateOrderDueDate,
  setInventorySellable,
  setOrderPayment,
} from "../actions";

let db: FakeDB;
const stock = (id: string) => db.byId("inventory", id)!.current_stock;
const reasonOf = (orderId: string) => `Orden Manual #${orderId.split("-")[0]}`;
const movementsOf = (orderId: string) => db.rows("inventory_movements").filter((m) => m.reason === reasonOf(orderId));

const baseOrder = (status = "paid", items = [{ inventory_id: "inv-250", product_code: "CAFT-250G", product_name: "Café Tostado 250g", quantity: 2, price: 45000 }]) => ({
  contact_email: "ana@x.co",
  contact_phone: "3001234567",
  shipping_info: { address: "Cra 1", details: "Apto 2", city: "Medellín", state: "Antioquia" },
  status,
  items,
});

beforeEach(() => {
  db = seedDB({ inventory: INVENTORY() });
  h.client = createFakeClient(db, { id: ADMIN_ID });
});

describe("createManualAdminOrder", () => {
  it("a paid order deducts stock right away", async () => {
    const { orderId } = await createManualAdminOrder(baseOrder("paid"));
    expect(stock("inv-250")).toBe(18);
    expect(movementsOf(orderId)).toHaveLength(1);
    // The old "paid" stage = paid, not prepared yet.
    expect(db.byId("orders", orderId)).toMatchObject({ total_amount: 90000, status: "pending", payment_status: "paid" });
    expect(db.rows("order_items")[0]).toMatchObject({ inventory_id: "inv-250", quantity: 2, price_at_time: 45000 });
  });

  it("a pending order does not touch stock until it is paid", async () => {
    const { orderId } = await createManualAdminOrder(baseOrder("pending"));
    expect(stock("inv-250")).toBe(20);
    expect(movementsOf(orderId)).toHaveLength(0);
  });

  it("only sold products can go on an order", async () => {
    const supplyLine = [{ inventory_id: "inv-bag", product_code: "EMP-BOLSA-FIR-250G", product_name: "Bolsa 250g", quantity: 1, price: 1 }];
    await expect(createManualAdminOrder(baseOrder("paid", supplyLine))).rejects.toThrow(/es un insumo/);
    expect(db.rows("orders")).toHaveLength(0);
  });

  it("saves the customer's name and, if asked, creates them in the CRM", async () => {
    const { orderId } = await createManualAdminOrder({
      ...baseOrder("paid"),
      customer_name: "  Café Okus  ",
      new_client: { name: "Café Okus", document_type: "NIT", document_number: " 901 " },
      delivery_due_date: "2026-10-10",
      notes: "Nequi",
    });
    const [client] = db.rows("clients");
    expect(client).toMatchObject({ name: "Café Okus", document_type: "NIT", document_number: "901", email: "ana@x.co", city: "Medellín" });
    expect(db.byId("orders", orderId)).toMatchObject({
      client_id: client.id,
      delivery_due_date: "2026-10-10",
      notes: "Nequi",
      shipping_info: expect.objectContaining({ recipient_name: "Café Okus", details: "Apto 2", department: "Antioquia" }),
    });
  });

  it("does not store placeholder contact data in the CRM", async () => {
    await createManualAdminOrder({ ...baseOrder("pending"), contact_email: "manual@tienda.local", contact_phone: "0000000000", new_client: { name: "Walk-in" } });
    expect(db.rows("clients")[0]).toMatchObject({ email: null, phone: null });
  });

  it("rejects malformed due dates", async () => {
    await expect(createManualAdminOrder({ ...baseOrder("paid"), delivery_due_date: "10/10/2026" })).rejects.toThrow(/Fecha de entrega/);
  });
});

describe("updateOrderStatus — stock follows payment", () => {
  it("pending → paid deducts; paid → shipped does not deduct twice; → cancelled gives it back", async () => {
    const { orderId } = await createManualAdminOrder(baseOrder("pending"));

    await updateOrderStatus(orderId, "paid");
    expect(stock("inv-250")).toBe(18);
    await updateOrderStatus(orderId, "processing");
    await updateOrderStatus(orderId, "shipped");
    expect(stock("inv-250")).toBe(18);
    expect(movementsOf(orderId)).toHaveLength(1);

    await updateOrderStatus(orderId, "cancelled");
    expect(stock("inv-250")).toBe(20);
    expect(movementsOf(orderId)).toHaveLength(0);
  });

  it("tracks when the status changed and when it was delivered", async () => {
    const { orderId } = await createManualAdminOrder(baseOrder("paid"));
    await updateOrderStatus(orderId, "delivered");
    const o = db.byId("orders", orderId)!;
    expect(o.delivered_at).toBeTruthy();
    expect(o.status_changed_at).toBe(o.delivered_at);
    await updateOrderStatus(orderId, "shipped");
    expect(db.byId("orders", orderId)!.delivered_at).toBeNull();
  });

  it("older orders without inventory links are never reverted (they could not be re-applied)", async () => {
    db.rows("orders").push({ id: "legacy-0001", status: "paid", total_amount: 45000, created_at: "2026-08-01T00:00:00Z" });
    db.rows("order_items").push({ id: "oi1", order_id: "legacy-0001", product_id: "Café", inventory_id: null, quantity: 1 });
    db.rows("inventory_movements").push({ id: "mv-legacy", inventory_id: "inv-250", quantity: -1, reason: "Orden Manual #legacy", type: "salida" });
    await updateOrderStatus("legacy-0001", "cancelled");
    expect(db.byId("inventory_movements", "mv-legacy")).toBeDefined();
    expect(stock("inv-250")).toBe(20);
  });

  it("web orders (no inventory link) never create movements", async () => {
    db.rows("orders").push({ id: "web-0001", status: "pending", total_amount: 45000 });
    db.rows("order_items").push({ id: "oi2", order_id: "web-0001", product_id: "premium", quantity: 1 });
    await updateOrderStatus("web-0001", "paid");
    expect(db.rows("inventory_movements")).toHaveLength(0);
  });
});

describe("updateManualAdminOrder", () => {
  it("editing only the customer keeps products, stock history and unknown shipping fields", async () => {
    const { orderId } = await createManualAdminOrder(baseOrder("paid"));
    const order = db.byId("orders", orderId)!;
    order.shipping_info = { ...order.shipping_info, siigo_invoice: "FV-9", source: "siigo" };
    const movementBefore = movementsOf(orderId)[0];

    await updateManualAdminOrder(orderId, {
      customer_name: "Ana María",
      contact_email: "ana@y.co",
      contact_phone: "3110000000",
      shipping_info: { address: "Calle 2", city: "Envigado", state: "Antioquia" },
      status: "paid",
    });

    const after = db.byId("orders", orderId)!;
    expect(after.shipping_info).toMatchObject({ siigo_invoice: "FV-9", source: "siigo", recipient_name: "Ana María", address: "Calle 2", city: "Envigado" });
    expect(after.contact_email).toBe("ana@y.co");
    expect(after.total_amount).toBe(90000);
    expect(movementsOf(orderId)).toEqual([movementBefore]); // same movement, not recreated
    expect(stock("inv-250")).toBe(18);
  });

  it("changing products replaces items, recalculates the total and re-applies stock", async () => {
    const { orderId } = await createManualAdminOrder(baseOrder("paid"));
    await updateManualAdminOrder(orderId, {
      ...baseOrder("paid"),
      items: [{ inventory_id: "inv-cold", product_code: "CAFC-340ML", product_name: "Cold Brew 340ml", quantity: 4, price: 12000 }],
    });
    expect(stock("inv-250")).toBe(20);
    expect(stock("inv-cold")).toBe(8);
    expect(db.byId("orders", orderId)!.total_amount).toBe(48000);
    expect(db.rows("order_items").map((i) => i.inventory_id)).toEqual(["inv-cold"]);
  });

  it("optionally saves the customer's data to their CRM record", async () => {
    db.rows("clients").push({ id: "c1", name: "Okus" });
    const { orderId } = await createManualAdminOrder({ ...baseOrder("pending"), client_id: "c1" });
    await updateManualAdminOrder(orderId, {
      ...baseOrder("pending"),
      client_id: "c1",
      client_update: { name: " Okus SAS ", document_type: "NIT", document_number: "901", email: "o@k.co", city: "Bello" },
    });
    expect(db.byId("clients", "c1")).toMatchObject({ name: "Okus SAS", document_number: "901", email: "o@k.co", city: "Bello" });
  });

  it("refuses to blank the CRM name", async () => {
    db.rows("clients").push({ id: "c1", name: "Okus" });
    const { orderId } = await createManualAdminOrder({ ...baseOrder("pending"), client_id: "c1" });
    expect(await updateManualAdminOrder(orderId, { ...baseOrder("pending"), client_id: "c1", client_update: { name: "  " } })).toMatchObject({ success: false, error: expect.stringMatching(/nombre/) });
    expect(db.byId("clients", "c1")!.name).toBe("Okus");
  });
});

describe("other order actions", () => {
  it("deleting a paid manual order gives the stock back", async () => {
    const { orderId } = await createManualAdminOrder(baseOrder("paid"));
    await deleteManualAdminOrder(orderId);
    expect(stock("inv-250")).toBe(20);
    expect(db.rows("orders")).toHaveLength(0);
  });

  it("updateOrderDueDate validates the format and allows clearing", async () => {
    const { orderId } = await createManualAdminOrder(baseOrder("pending"));
    await updateOrderDueDate(orderId, "2026-10-12");
    expect(db.byId("orders", orderId)!.delivery_due_date).toBe("2026-10-12");
    await updateOrderDueDate(orderId, null);
    expect(db.byId("orders", orderId)!.delivery_due_date).toBeNull();
    await expect(updateOrderDueDate(orderId, "mañana")).rejects.toThrow(/Fecha inválida/);
  });

  it("setInventorySellable flips the flag", async () => {
    await setInventorySellable("inv-cup", true);
    expect(db.byId("inventory", "inv-cup")!.is_sellable).toBe(true);
  });
});

describe("IVA per order line", () => {
  const taxed = [
    { inventory_id: "inv-250", product_code: "CAFT-250G", product_name: "Café Tostado 250g", quantity: 2, price: 45000, tax_id: 9755, tax_rate: 5 },
    { inventory_id: "inv-250", product_code: "CAFT-250G", product_name: "Café Tostado 250g", quantity: 1, price: 10000, tax_id: 0, tax_rate: 19 },
  ];

  it("saves each line's IVA (0 = without IVA) and the order's IVA on top of prices before IVA", async () => {
    db.rows("siigo_settings").push({ id: 1, config: { manual_prices_include_tax: false } });
    const { orderId } = await createManualAdminOrder(baseOrder("pending", taxed));
    expect(db.rows("order_items").map((i) => [i.tax_id, i.tax_rate])).toEqual([[9755, 5], [0, 0]]);
    expect(db.byId("orders", orderId)).toMatchObject({ total_amount: 100000, tax_amount: 4500 });
  });

  it("with prices that include IVA, nothing goes on top (the IVA is inside the total)", async () => {
    const { orderId } = await createManualAdminOrder(baseOrder("pending", taxed.slice(0, 1)));
    expect(db.byId("orders", orderId)).toMatchObject({ total_amount: 90000, tax_amount: 0 });
  });

  it("each order can say its prices include IVA (a final price), whatever Ajustes → Siigo says", async () => {
    db.rows("siigo_settings").push({ id: 1, config: { manual_prices_include_tax: false } });
    const { orderId } = await createManualAdminOrder({ ...baseOrder("pending", taxed.slice(0, 1)), prices_include_tax: true });
    expect(db.byId("orders", orderId)).toMatchObject({ prices_include_tax: true, total_amount: 90000, tax_amount: 0 });
    // Unticking it later puts the IVA back on top, from the saved lines.
    expect(await updateManualAdminOrder(orderId, { ...baseOrder("pending"), items: undefined, prices_include_tax: false })).toMatchObject({ success: true });
    expect(db.byId("orders", orderId)).toMatchObject({ prices_include_tax: false, tax_amount: 4500 });
  });

  it("editing the products keeps their IVA", async () => {
    const { orderId } = await createManualAdminOrder(baseOrder("pending"));
    expect(await updateManualAdminOrder(orderId, { ...baseOrder("pending"), items: [{ ...taxed[0], tax_id: 9756, tax_rate: 19 }] })).toMatchObject({ success: true });
    expect(db.rows("order_items").filter((i) => i.order_id === orderId).map((i) => [i.tax_id, i.tax_rate])).toEqual([[9756, 19]]);
  });
});

describe("delivery and payment apart", () => {
  it("delivered on credit takes the stock out but stays unpaid", async () => {
    const { orderId } = await createManualAdminOrder({ ...baseOrder("pending"), payment_status: "pending" });
    expect(stock("inv-250")).toBe(20);
    expect(await updateOrderStatus(orderId, "delivered")).toMatchObject({ success: true });
    expect(db.byId("orders", orderId)).toMatchObject({ status: "delivered", payment_status: "pending", paid_at: null });
    expect(stock("inv-250")).toBe(18);
  });

  it("the board's last column (paid) = delivered and paid; paying keeps the delivery stage", async () => {
    const { orderId } = await createManualAdminOrder(baseOrder("processing"));
    expect(await setOrderPayment(orderId, true, "2026-10-16T12:00:00-05:00")).toMatchObject({ success: true });
    expect(db.byId("orders", orderId)).toMatchObject({ status: "processing", payment_status: "paid", paid_at: "2026-10-16T12:00:00-05:00" });
    expect(stock("inv-250")).toBe(18);
    expect(await updateOrderStatus(orderId, "paid")).toMatchObject({ success: true });
    expect(db.byId("orders", orderId)).toMatchObject({ status: "delivered", payment_status: "paid", paid_at: "2026-10-16T12:00:00-05:00" });
    // Back to unpaid while still not dispatched gives the stock back.
    const { orderId: other } = await createManualAdminOrder({ ...baseOrder("pending"), payment_status: "paid" });
    expect(stock("inv-250")).toBe(16);
    await setOrderPayment(other, false);
    expect(stock("inv-250")).toBe(18);
  });
});

describe("sede of an order", () => {
  it("is saved with the order; changing it later carries over to its invoice (in the app)", async () => {
    db.rows("client_sites").push({ id: "s1", client_id: "cl1", name: "Fabricato" }, { id: "s2", client_id: "cl1", name: "Mayorca" });
    const { orderId } = await createManualAdminOrder({ ...baseOrder("pending"), client_id: "cl1", site_id: "s1" });
    expect(db.byId("orders", orderId)!.site_id).toBe("s1");
    db.rows("sales_invoices").push({ id: "inv-x", order_id: orderId, status: "emitida", site_id: "s1" });
    expect(await updateManualAdminOrder(orderId, { ...baseOrder("pending"), client_id: "cl1", items: undefined, site_id: "s2" })).toMatchObject({ success: true });
    expect(db.byId("orders", orderId)!.site_id).toBe("s2");
    expect(db.byId("sales_invoices", "inv-x")!.site_id).toBe("s2");
    // Not saying the sede keeps it.
    await updateManualAdminOrder(orderId, { ...baseOrder("pending"), client_id: "cl1", items: undefined });
    expect(db.byId("orders", orderId)!.site_id).toBe("s2");
  });
});
