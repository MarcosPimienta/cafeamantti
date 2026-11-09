import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeClient, seedDB, ADMIN_ID, type FakeDB } from "@/test/fakeSupabase";

const h = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/utils/supabase/server", () => ({ createClient: async () => h.client }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { createCuentaCobro, deleteCuentaCobro, getStockProducts, updateCuentaCobro } from "../actions";

let db: FakeDB;
const stock = () => db.byId("inventory", "verde")!.current_stock;
const daniel = { issuer_name: "Daniel Ospina", issuer_document: "1037", issuer_email: "d@x.co", issuer_phone: "300", concept: "Café verde" };
// Daniel bills 598 kg of green coffee at $31.000/kg.
const verde = (over: Record<string, unknown> = {}) => ({ description: "Café verde Carmelita", quantity: 598, unit_price: 31000, total_price: 18538000, inventory_id: "verde", inventory_qty: 598, ...over });

beforeEach(() => {
  db = seedDB({
    inventory: [
      { id: "verde", product_code: "CAF-VERDE", product_name: "Café Verde", category: "cafe", unit: "kg", current_stock: 0 },
      { id: "maquila", product_code: "SRV-MAQ", product_name: "Maquila", category: "servicio", unit: "kg", current_stock: 0 },
    ],
  });
  h.client = createFakeClient(db, { id: ADMIN_ID });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("a supplier's cuenta de cobro that brings coffee", () => {
  it("only products that keep stock can be picked", async () => {
    expect((await getStockProducts()).map((p) => p.id)).toEqual(["verde"]);
  });

  it("the coffee enters the inventory when it is saved, at the unit cost of the item", async () => {
    const res = await createCuentaCobro("gasto", daniel, [verde()], undefined, "2026-09-18");
    expect(res).toMatchObject({ success: true });
    expect(stock()).toBe(598);
    const [mov] = db.rows("inventory_movements");
    expect(mov).toMatchObject({ inventory_id: "verde", type: "entrada", quantity: 598, unit_cost: 31000, movement_date: "2026-09-18", cuenta_cobro_id: res.id, responsable: "Daniel Ospina" });
  });

  it("an item with a product but no quantity is refused before anything is saved", async () => {
    expect(await createCuentaCobro("gasto", daniel, [verde({ inventory_qty: null })])).toMatchObject({ success: false, error: expect.stringMatching(/cuánto entra/) });
    expect(db.rows("cuentas_cobro")).toHaveLength(0);
    expect(stock()).toBe(0);
  });

  it("a service can't bring stock, and nothing is kept", async () => {
    expect(await createCuentaCobro("gasto", daniel, [verde({ inventory_id: "maquila" })])).toMatchObject({ success: false, error: expect.stringMatching(/no lleva inventario/) });
    expect(db.rows("cuentas_cobro")).toHaveLength(0);
  });

  it("a cuenta de cobro to a client (ingreso) never moves inventory", async () => {
    await createCuentaCobro("ingreso", daniel, [verde()], { debtor_name: "X", debtor_document: "1", debtor_email: "x@x.co", debtor_phone: "3" });
    expect(stock()).toBe(0);
    expect(db.rows("cuentas_cobro")[0].items[0].inventory_id).toBeUndefined();
  });

  it("editing it moves the stock by the new quantity", async () => {
    const { id } = await createCuentaCobro("gasto", daniel, [verde()]);
    expect(await updateCuentaCobro(id!, "gasto", daniel, [verde({ inventory_qty: 600, quantity: 600, total_price: 18600000 })])).toMatchObject({ success: true });
    expect(stock()).toBe(600);
    expect(db.rows("inventory_movements")).toHaveLength(1);
  });

  it("deleting it takes the coffee out; refused if it was already roasted", async () => {
    const { id } = await createCuentaCobro("gasto", daniel, [verde()]);
    db.rows("inventory_movements").push({ id: "tostion", inventory_id: "verde", type: "salida", quantity: -100, era: "v2" });
    db.byId("inventory", "verde")!.current_stock = 498;
    expect(await deleteCuentaCobro(id!)).toMatchObject({ success: false, error: expect.stringMatching(/ya se usó/) });
    expect(db.rows("cuentas_cobro")).toHaveLength(1);
    expect(stock()).toBe(498);

    db.rows("inventory_movements").splice(db.rows("inventory_movements").findIndex((m) => m.id === "tostion"), 1);
    db.byId("inventory", "verde")!.current_stock = 598;
    expect(await deleteCuentaCobro(id!)).toMatchObject({ success: true });
    expect(stock()).toBe(0);
    expect(db.rows("cuentas_cobro")).toHaveLength(0);
  });
});
