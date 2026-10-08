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
