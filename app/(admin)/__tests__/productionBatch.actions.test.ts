import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeClient, seedDB, ADMIN_ID, type FakeDB } from "@/test/fakeSupabase";

const h = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/utils/supabase/server", () => ({ createClient: async () => h.client }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { deleteProductionBatch, updateProductionBatch } from "../actions";

let db: FakeDB;
beforeEach(() => {
  db = seedDB({
    inventory: [
      { id: "verde", product_code: "CAFV-001", product_name: "Café Verde", current_stock: 170.43 },
      { id: "tkg", product_code: "CAFT-001", product_name: "Café Tostado KG", current_stock: 152.63 },
    ],
    production_batches: [{ id: "b1", process_type: "tostion", input_inventory_id: "verde", output_inventory_id: "tkg", input_quantity_kg: 200, output_quantity_kg: 184.6, rendimiento_pct: 0.923, movement_date: "2026-10-08", notes: null }],
    inventory_movements: [
      { id: "m-in", inventory_id: "verde", type: "salida", quantity: -200, production_batch_id: "b1", reason: "Tostión → Café Tostado" },
      { id: "m-out", inventory_id: "tkg", type: "entrada", quantity: 184.6, production_batch_id: "b1", reason: "Tostión (rend. 92.3%)" },
    ],
  });
  h.client = createFakeClient(db, { id: ADMIN_ID });
});

describe("deleting a roast batch", () => {
  it("explains (as data, readable in production) when its roasted coffee was already used", async () => {
    expect(await deleteProductionBatch("b1")).toEqual({
      success: false,
      error: "No se puede eliminar el lote: el stock actual de 'Café Tostado KG' (152.63 kg) es menor que la cantidad a restar (184.6 kg).",
    });
    expect(db.rows("production_batches")).toHaveLength(1);
    expect(db.byId("inventory", "verde")!.current_stock).toBe(170.43);
  });

  it("reverses it when the roasted coffee is still there", async () => {
    db.byId("inventory", "tkg")!.current_stock = 200;
    const res = await deleteProductionBatch("b1");
    expect(res).toMatchObject({ success: true });
    expect("newInputStock" in res && res.newInputStock).toBeCloseTo(370.43);
    expect("newOutputStock" in res && res.newOutputStock).toBeCloseTo(15.4);
    expect(db.rows("production_batches")).toHaveLength(0);
  });
});

describe("editing a roast batch", () => {
  it("moves only the difference, even after part of the roast was used", async () => {
    const res = await updateProductionBatch("b1", { inputQtyKg: 200, outputQtyKg: 186.6, date: "2026-10-08", notes: "Corrección báscula" });
    expect(res).toMatchObject({ success: true });
    expect(db.byId("inventory", "tkg")!.current_stock).toBeCloseTo(154.63); // 152.63 + 2
    expect(db.byId("inventory", "verde")!.current_stock).toBeCloseTo(170.43); // input unchanged
    expect(db.byId("production_batches", "b1")).toMatchObject({ output_quantity_kg: 186.6, notes: "Corrección báscula" });
    expect(db.byId("production_batches", "b1")!.rendimiento_pct).toBeCloseTo(0.933);
    expect(db.byId("inventory_movements", "m-out")).toMatchObject({ quantity: 186.6, reason: "Tostión (rend. 93.3%) — Corrección báscula" });
    expect(db.byId("inventory_movements", "m-in")!.quantity).toBe(-200);
  });

  it("more green coffee used comes out of the green stock; it can't go below zero", async () => {
    expect(await updateProductionBatch("b1", { inputQtyKg: 210, outputQtyKg: 184.6, date: "2026-10-09" })).toMatchObject({ success: true });
    expect(db.byId("inventory", "verde")!.current_stock).toBeCloseTo(160.43);
    expect(db.byId("inventory_movements", "m-in")).toMatchObject({ quantity: -210, movement_date: "2026-10-09" });
    const res = await updateProductionBatch("b1", { inputQtyKg: 400, outputQtyKg: 184.6, date: "2026-10-09" });
    expect(res).toMatchObject({ success: false, error: expect.stringContaining("No hay suficiente 'Café Verde'") });
  });

  it("lowering the result can't take more roasted coffee than is left", async () => {
    const res = await updateProductionBatch("b1", { inputQtyKg: 200, outputQtyKg: 20, date: "2026-10-08" });
    expect(res).toMatchObject({ success: false, error: expect.stringContaining("No se puede bajar el resultado") });
    expect(db.byId("production_batches", "b1")!.output_quantity_kg).toBe(184.6);
  });

  it("rejects impossible quantities", async () => {
    expect(await updateProductionBatch("b1", { inputQtyKg: 100, outputQtyKg: 120, date: "2026-10-08" })).toMatchObject({ success: false, error: "El café que sale no puede pesar más que el que entra." });
  });
});
