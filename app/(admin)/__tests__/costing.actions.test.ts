import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeClient, seedDB, ADMIN_ID, type FakeDB } from "@/test/fakeSupabase";

const h = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/utils/supabase/server", () => ({ createClient: async () => h.client }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { getCostingData, updateStandardCost, updateCostSettings, savePackagingRecipe, getPackagingRecipes } from "../actions";

let db: FakeDB;
const recent = new Date(Date.now() - 5 * 86400000).toISOString();
const old = new Date(Date.now() - 200 * 86400000).toISOString();

beforeEach(() => {
  db = seedDB({
    inventory: [
      { id: "t250", product_code: "CAFT-250G", product_name: "Premium 250g", standard_cost: null },
      { id: "tkg", product_code: "CAFT-001", product_name: "Premium KG", standard_cost: null },
      { id: "verde", product_code: "CAFV-001", product_name: "Café Verde", standard_cost: 28000 },
      { id: "perg", product_code: "CAPG-001", product_name: "Café Pergamino", standard_cost: 20000 },
      { id: "bag", product_code: "EMP-BOLSA-FIR-250G", product_name: "Bolsa 250g", standard_cost: 1200 },
      { id: "stk", product_code: "STK-AMT-FIR", product_name: "Sticker", standard_cost: 150 },
      { id: "cup", product_code: "POC-001", product_name: "Pocillo", standard_cost: 5000 },
    ],
    cost_settings: [{ id: 1, roasting_fee_per_kg: 4000, roasting_fee_basis: "verde", dispatch_cost_per_order: 10000, dispatch_kg_per_order: null, default_roast_yield: 0.82, default_trilla_yield: 0.8 }],
    production_batches: [
      { id: "b1", era: "v2", process_type: "tostion", input_inventory_id: "verde", output_inventory_id: "tkg", input_quantity_kg: 100, output_quantity_kg: 80 },
      { id: "b2", era: "v2", process_type: "trilla", input_inventory_id: "perg", output_inventory_id: "verde", input_quantity_kg: 50, output_quantity_kg: 40 },
      { id: "b3", era: "v1", process_type: "tostion", input_inventory_id: "verde", output_inventory_id: "tkg", input_quantity_kg: 100, output_quantity_kg: 50 }, // old era ignored
    ],
    inventory_movements: [
      { id: "m1", era: "v2", tab_source: "entrada", inventory_id: "verde", quantity: 120 }, // bought as verde
      { id: "m2", era: "v2", tab_source: "salida", inventory_id: "verde", quantity: -10 },
    ],
    orders: [
      { id: "o1", status: "paid", created_at: recent },
      { id: "o2", status: "delivered", created_at: recent },
      { id: "o3", status: "pending", created_at: recent }, // not paid → ignored
      { id: "o4", status: "paid", created_at: old }, // outside the window
    ],
    order_items: [
      { id: "i1", order_id: "o1", inventory_id: "t250", quantity: 8, price_at_time: 45000 }, // 2 kg
      { id: "i2", order_id: "o2", inventory_id: "t250", quantity: 4, price_at_time: 42000 }, // 1 kg
      { id: "i3", order_id: "o3", inventory_id: "t250", quantity: 100, price_at_time: 1 },
      { id: "i4", order_id: "o4", inventory_id: "t250", quantity: 100, price_at_time: 1 },
      { id: "i5", order_id: "o1", inventory_id: null, quantity: 1, price_at_time: 99999 }, // web line without link
    ],
  });
  h.client = createFakeClient(db, { id: ADMIN_ID });
});

describe("getCostingData", () => {
  it("combines prices, real yields, the verde mix and recent paid sales", async () => {
    const { sheet, pricedItems, migrated } = await getCostingData();
    expect(migrated).toBe(true);

    expect(sheet.yields.premium.tostion).toMatchObject({ value: 0.8, source: "real", batches: 1 });
    expect(sheet.yields.premium.trilla).toMatchObject({ value: 0.8, source: "real" });
    expect(sheet.yields.premium.pergaminoShare).toBeCloseTo(40 / 160, 6); // 40 kg via trilla, 120 kg bought

    expect(sheet.dispatch).toMatchObject({ kgPerOrder: 1.5, source: "real" }); // (2 + 1) / 2 orders

    const p250 = sheet.lines.find((l) => l.product_code === "CAFT-250G")!;
    const green = 0.25 * (20000 / 0.8) + 0.75 * 28000;
    expect(p250.cafe).toBeCloseTo(green / 0.8, 4);
    expect(p250.tostion).toBeCloseTo(4000 / 0.8, 6); // charged on verde
    expect(p250.empaque).toBeCloseTo(1350 / 0.25, 6);
    expect(p250.despacho).toBeCloseTo(10000 / 1.5, 6);
    expect(p250.salePerKg).toBeCloseTo((8 * 45000 + 4 * 42000) / 3, 6);
    expect(p250.marginPct).not.toBeNull();

    // only inputs that feed the sheet are offered for pricing
    expect(pricedItems.map((i) => i.product_code).sort()).toEqual(["CAFV-001", "CAPG-001", "EMP-BOLSA-FIR-250G", "STK-AMT-FIR"]);
  });

  it("works before the migration with defaults and says so", async () => {
    db.tables.cost_settings = [];
    for (const i of db.rows("inventory")) delete i.standard_cost;
    const { sheet, migrated, settings } = await getCostingData();
    expect(migrated).toBe(false);
    expect(settings.roasting_fee_per_kg).toBe(0);
    expect(sheet.lines.every((l) => l.costPerKg === null)).toBe(true); // nothing priced yet
  });

  it("is admin-only", async () => {
    h.client = createFakeClient(db, null);
    await expect(getCostingData()).rejects.toThrow("Unauthorized");
  });
});

describe("updating costs", () => {
  it("saves and clears an item's standard cost, rejecting negatives", async () => {
    await updateStandardCost("bag", 1500);
    expect(db.byId("inventory", "bag")!.standard_cost).toBe(1500);
    await updateStandardCost("bag", null);
    expect(db.byId("inventory", "bag")!.standard_cost).toBeNull();
    await expect(updateStandardCost("bag", -1)).rejects.toThrow(/mayor o igual a cero/);
  });

  it("validates and saves settings", async () => {
    await updateCostSettings({ roasting_fee_per_kg: 4500, roasting_fee_basis: "tostado", dispatch_kg_per_order: 2, default_roast_yield: 0.84 });
    expect(db.byId("cost_settings", 1 as unknown as string)).toMatchObject({
      roasting_fee_per_kg: 4500,
      roasting_fee_basis: "tostado",
      dispatch_kg_per_order: 2,
      default_roast_yield: 0.84,
      updated_by: ADMIN_ID,
    });
    await expect(updateCostSettings({ roasting_fee_basis: "otro" as "verde" })).rejects.toThrow(/Base de maquila/);
    await expect(updateCostSettings({ default_trilla_yield: 1.2 })).rejects.toThrow(/entre 0 y 100/);
    await expect(updateCostSettings({ dispatch_kg_per_order: 0 })).rejects.toThrow(/mayores a cero/);
    await updateCostSettings({ dispatch_kg_per_order: null }); // back to measuring from orders
    expect(db.byId("cost_settings", 1 as unknown as string)!.dispatch_kg_per_order).toBeNull();
  });
});

describe("packaging recipes", () => {
  it("a saved recipe without sticker changes the cost and what gets priced", async () => {
    await savePackagingRecipe("CAFT-250G", [{ code: "EMP-BOLSA-FIR-250G", qty: 1 }]);
    expect(await getPackagingRecipes()).toEqual({ "CAFT-250G": [{ code: "EMP-BOLSA-FIR-250G", qty: 1 }] });

    const { sheet, pricedItems, packagingOptions } = await getCostingData();
    const p250 = sheet.lines.find((l) => l.product_code === "CAFT-250G")!;
    expect(p250.empaque).toBeCloseTo(1200 / 0.25, 6);
    expect(pricedItems.map((i) => i.product_code)).not.toContain("STK-AMT-FIR");
    expect(packagingOptions.map((o) => o.code)).toEqual([]); // fixture items have no category
  });

  it("rejects unknown items and non-roasted references", async () => {
    await expect(savePackagingRecipe("CAFT-250G", [{ code: "NOPE", qty: 1 }])).rejects.toThrow(/No existen en el inventario: NOPE/);
    await expect(savePackagingRecipe("EMP-BOLSA-FIR-250G", [])).rejects.toThrow(/Solo el café tostado/);
  });

  it("null goes back to the default recipe", async () => {
    await savePackagingRecipe("CAFT-250G", []);
    expect((await getPackagingRecipes())["CAFT-250G"]).toEqual([]);
    await savePackagingRecipe("CAFT-250G", null);
    expect(await getPackagingRecipes()).toEqual({});
  });

  it("without the migration everyone uses the default", async () => {
    db.failOn("packaging_recipes", "select", "relation does not exist");
    expect(await getPackagingRecipes()).toEqual({});
  });
});
