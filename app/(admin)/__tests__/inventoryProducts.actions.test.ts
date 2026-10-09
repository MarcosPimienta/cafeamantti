import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeClient, seedDB, ADMIN_ID, type FakeDB } from "@/test/fakeSupabase";
import { INVENTORY } from "@/test/fixtures";

const h = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/utils/supabase/server", () => ({ createClient: async () => h.client }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { createInventoryProduct, getKardex } from "../actions";

let db: FakeDB;
beforeEach(() => {
  db = seedDB({ inventory: INVENTORY() });
  h.client = createFakeClient(db, { id: ADMIN_ID });
});

const machine = {
  product_code: " eqp esp 001 ",
  product_name: "Máquina espresso 2 grupos (comodato)",
  category: "equipo" as const,
  unit: "unidad",
  current_stock: 2,
  min_stock: 0,
  notes: "La Marzocco, serial 123",
  is_sellable: false,
};

describe("createInventoryProduct", () => {
  it("creates equipment like an espresso machine in comodato", async () => {
    const { item } = await createInventoryProduct(machine);
    expect(item).toMatchObject({
      product_code: "EQP-ESP-001", // normalized
      category: "equipo",
      unit: "unidad",
      current_stock: 2,
      is_sellable: false,
      notes: "La Marzocco, serial 123",
    });
  });

  it("creates furniture and fixtures in the enseres category", async () => {
    const { item } = await createInventoryProduct({
      product_code: "ENS-CAF-001",
      product_name: "Cafetera de filtro",
      category: "enseres",
      unit: "unidad",
      current_stock: 3,
      is_sellable: false,
    });
    expect(item).toMatchObject({ category: "enseres", current_stock: 3 });
  });

  it("records opening stock as an entrada so the Kardex reconciles", async () => {
    const { item } = await createInventoryProduct(machine);
    const [m] = db.rows("inventory_movements").filter((x) => x.inventory_id === item.id);
    expect(m).toMatchObject({ type: "entrada", quantity: 2, tab_source: "entrada", reason: "Saldo inicial al crear el producto" });
    const card = await getKardex(item.id);
    expect(card.reconciliation).toMatchObject({ difference: 0 });
  });

  it("no opening stock means no movement", async () => {
    const { item } = await createInventoryProduct({ ...machine, current_stock: 0 });
    expect(db.rows("inventory_movements").filter((x) => x.inventory_id === item.id)).toHaveLength(0);
  });

  it("refuses duplicate codes", async () => {
    await expect(createInventoryProduct({ ...machine, product_code: "caft-250g" })).rejects.toThrow(/Ya existe.*CAFT-250G/);
  });

  it.each([
    [{ product_code: "!!" }, /código/],
    [{ product_name: " " }, /nombre/],
    [{ category: "maquinaria" }, /Categoría/],
    [{ unit: "" }, /unidad/],
    [{ current_stock: -1 }, /negativo/],
  ])("validates %j", async (over, msg) => {
    await expect(createInventoryProduct({ ...machine, ...(over as object) } as typeof machine)).rejects.toThrow(msg);
  });

  it("explains a missing migration for the new category", async () => {
    db.failOn("inventory", "insert", 'new row violates check constraint "inventory_category_check"');
    await expect(createInventoryProduct(machine)).rejects.toThrow(/20261010000000_inventory_category_equipo/);
  });

  it("is admin-only", async () => {
    h.client = createFakeClient(db, null);
    await expect(createInventoryProduct(machine)).rejects.toThrow("Unauthorized");
  });
});

describe("createEntrada with EQP", () => {
  it("registers equipment entradas and explains a missing migration", async () => {
    const { createEntrada } = await import("../actions");
    const { item } = await createInventoryProduct({ ...machine, current_stock: 0 });
    expect(await createEntrada(item.id, 2, "2026-10-10", "EQP")).toMatchObject({ success: true, newStock: 2 });
    expect(db.rows("inventory_movements").at(-1)).toMatchObject({ entry_type: "EQP", quantity: 2 });

    db.failOn("inventory_movements", "insert", 'new row for relation "inventory_movements" violates check constraint "inventory_movements_entry_type_check"');
    expect(await createEntrada(item.id, 1, "2026-10-10", "EQP")).toMatchObject({
      success: false,
      error: expect.stringMatching(/20261010040000_entry_type_enseres/),
    });
  });
});
