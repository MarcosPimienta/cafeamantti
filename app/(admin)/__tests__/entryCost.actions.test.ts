import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeClient, seedDB, ADMIN_ID, type FakeDB } from "@/test/fakeSupabase";

const h = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/utils/supabase/server", () => ({ createClient: async () => h.client }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { createEntrada, setEntryCost } from "../actions";

let db: FakeDB;
beforeEach(() => {
  db = seedDB({
    inventory: [
      { id: "verde", product_code: "CAFV-001", product_name: "Café Verde", category: "cafe", unit: "kg", current_stock: 0, standard_cost: null },
      { id: "maq", product_code: "EQP-ESP-S", product_name: "Máquina espresso", category: "equipo", unit: "unidad", current_stock: 0, standard_cost: null },
    ],
  });
  h.client = createFakeClient(db, { id: ADMIN_ID });
});

const moves = () => db.rows("inventory_movements");
const item = (id: string) => db.rows("inventory").find((i) => i.id === id)!;

describe("cost of entradas", () => {
  it("materia prima can't enter without its cost; with it, the item's cost is the weighted average", async () => {
    expect(await createEntrada("verde", 850, "2026-10-15", "MP")).toMatchObject({ success: false, error: "Escribe el costo unitario (sin IVA) de la entrada." });
    expect(moves()).toHaveLength(0);
    expect(await createEntrada("verde", 850, "2026-10-15", "MP", "Laura", undefined, undefined, 31000)).toMatchObject({ success: true, newStock: 850 });
    expect(moves()[0]).toMatchObject({ unit_cost: 31000, quantity: 850 });
    expect(item("verde").standard_cost).toBe(31000);
    await createEntrada("verde", 150, "2026-10-20", "MP", undefined, undefined, undefined, 29000);
    expect(item("verde").standard_cost).toBe(30700);
  });

  it("equipos don't need it", async () => {
    expect(await createEntrada("maq", 1, "2026-10-10", "EQP")).toMatchObject({ success: true });
  });

  it("an entrada registered without cost gets it afterwards, and the average follows", async () => {
    db.rows("inventory_movements").push({ id: "old", inventory_id: "verde", type: "entrada", quantity: 598, entry_type: "MP", era: "v2", unit_cost: null, movement_date: "2026-09-05", created_at: "2026-09-05" });
    expect(await setEntryCost("old", -5)).toMatchObject({ success: false });
    expect(await setEntryCost("old", 30000)).toMatchObject({ success: true });
    expect(moves()[0].unit_cost).toBe(30000);
    expect(item("verde").standard_cost).toBe(30000);
  });
});
