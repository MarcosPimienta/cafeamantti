import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeClient, seedDB, ADMIN_ID, type FakeDB } from "@/test/fakeSupabase";
import { INVENTORY } from "@/test/fixtures";

const h = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/utils/supabase/server", () => ({ createClient: async () => h.client }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { createRepackBatch, deleteRepackBatch, getKardex, getKardexGeneral } from "../actions";

let db: FakeDB;
const stock = (id: string) => db.byId("inventory", id)!.current_stock;
const snapshot = () => JSON.stringify(db.rows("inventory").map((i) => [i.id, i.current_stock]));

beforeEach(() => {
  db = seedDB({ inventory: INVENTORY() });
  h.client = createFakeClient(db, { id: ADMIN_ID });
});

const split = (over: Partial<Parameters<typeof createRepackBatch>[0]> = {}) =>
  createRepackBatch({
    date: "2026-10-07",
    origins: [{ inventoryId: "inv-2k5", qty: 1, molienda: "grano" }],
    destinations: [{ inventoryId: "inv-250", qty: 8, molienda: "grano" }],
    consumos: [
      { id: "inv-bag", qty: 8 },
      { id: "inv-stk", qty: 8 },
    ],
    ...over,
  });

describe("createRepackBatch", () => {
  it("splits a 2.5 kg bag: opens it, packs 8×250 g, returns 0.5 kg to bulk, consumes packaging", async () => {
    const res = await split();
    expect(res).toMatchObject({ success: true, sobranteKg: 0.5 });
    expect(stock("inv-2k5")).toBe(4);
    expect(stock("inv-250")).toBe(28);
    expect(stock("inv-bulk")).toBe(10.5);
    expect(stock("inv-bag")).toBe(92);
    expect(stock("inv-stk")).toBe(92);

    const [batch] = db.rows("repack_batches");
    expect(batch).toMatchObject({ input_kg: 2.5, output_kg: 2, sobrante_kg: 0.5, sobrante_destino: "granel", movement_date: "2026-10-07" });

    const moves = db.rows("inventory_movements");
    expect(moves.every((m) => m.repack_batch_id === batch.id && m.tab_source === "reempaque")).toBe(true);
    expect(moves.map((m) => [m.inventory_id, m.quantity, m.molienda])).toEqual([
      ["inv-2k5", -1, "grano"],
      ["inv-250", 8, "grano"],
      ["inv-bulk", 0.5, "grano"],
      ["inv-bag", -8, null],
      ["inv-stk", -8, null],
    ]);
    expect(moves.find((m) => m.inventory_id === "inv-bag")!.entry_type).toBe("MAT");
    expect(res.success && res.updates).toEqual(expect.arrayContaining([{ id: "inv-bulk", newStock: 10.5 }]));
  });

  it("merma: the leftover is written off, not added to bulk", async () => {
    await split({ sobranteDestino: "merma", consumos: [] });
    expect(stock("inv-bulk")).toBe(10);
    expect(db.rows("repack_batches")[0].sobrante_destino).toBe("merma");
  });

  it("combining small bags into a big one leaves no leftover", async () => {
    const res = await createRepackBatch({
      date: "2026-10-07",
      origins: [{ inventoryId: "inv-250", qty: 10, molienda: "molido" }],
      destinations: [{ inventoryId: "inv-2k5", qty: 1, molienda: "molido" }],
    });
    expect(res).toMatchObject({ success: true, sobranteKg: 0 });
    expect(db.rows("repack_batches")[0].sobrante_destino).toBeNull();
    expect(db.rows("inventory_movements").some((m) => m.inventory_id === "inv-bulk")).toBe(false);
  });

  it("validation errors write nothing", async () => {
    const before = snapshot();
    const res = await split({ destinations: [{ inventoryId: "inv-250", qty: 11, molienda: "grano" }] });
    expect(res).toMatchObject({ success: false, error: expect.stringMatching(/supera el café abierto/) });
    expect(snapshot()).toBe(before);
    expect(db.rows("repack_batches")).toHaveLength(0);
  });

  it("insufficient stock (origin or packaging) is caught before writing", async () => {
    db.byId("inventory", "inv-bag")!.current_stock = 3;
    const before = snapshot();
    const res = await split();
    expect(res).toMatchObject({ success: false, error: expect.stringMatching(/Stock insuficiente: Bolsa 250g/) });
    expect(snapshot()).toBe(before);
  });

  it("a failure in the middle undoes every movement, stock change and the batch", async () => {
    db.failOn("inventory_movements", "insert", "db hiccup", 3); // 4th movement fails
    const before = snapshot();
    const res = await split();
    expect(res).toMatchObject({ success: false, error: "db hiccup" });
    expect(snapshot()).toBe(before);
    expect(db.rows("inventory_movements")).toHaveLength(0);
    expect(db.rows("repack_batches")).toHaveLength(0);
  });

  it("needs at least one origin", async () => {
    expect(await split({ origins: [] })).toMatchObject({ success: false, error: expect.stringMatching(/origen/) });
  });
});

describe("deleteRepackBatch", () => {
  it("reverts the whole operation", async () => {
    const before = snapshot();
    await split();
    const res = await deleteRepackBatch(db.rows("repack_batches")[0].id);
    expect(res.success).toBe(true);
    expect(snapshot()).toBe(before);
    expect(db.rows("inventory_movements")).toHaveLength(0);
    expect(db.rows("repack_batches")).toHaveLength(0);
  });

  it("refuses when the packed product no longer has the units the repack added", async () => {
    await split();
    db.byId("inventory", "inv-250")!.current_stock = 5; // most 250 g bags were sold since
    await expect(deleteRepackBatch(db.rows("repack_batches")[0].id)).rejects.toThrow(/Ya se usó parte de ese stock/);
    expect(stock("inv-2k5")).toBe(4);
  });
});

describe("kardex actions read the repack as one traceable step", () => {
  it("per product and general views agree with stored stock", async () => {
    // opening balances as movements so the ledger matches current_stock
    for (const it of db.rows("inventory")) {
      db.rows("inventory_movements").push({
        id: `open-${it.id}`, inventory_id: it.id, quantity: it.current_stock, type: "entrada",
        movement_date: "2026-09-01", created_at: "2026-09-01T00:00:00Z", era: "v2", income_id: null, molienda: null,
      });
    }
    await split();

    const card = await getKardex("inv-bulk");
    expect(card.summary).toMatchObject({ opening: 0, entradas: 10.5, salidas: 0, closing: 10.5 });
    expect(card.reconciliation).toMatchObject({ difference: 0 });

    const general = await getKardexGeneral({ from: "2026-10-01" });
    const p2k5 = general.products.find((p) => p.id === "inv-2k5")!;
    expect(p2k5).toMatchObject({ opening: 5, salidas: 1, closing: 4, difference: 0 });
    expect(general.summary.descuadres).toBe(0);
  });

  it("flags a product whose stock changed without a movement", async () => {
    db.byId("inventory", "inv-cold")!.current_stock = 99;
    const general = await getKardexGeneral();
    expect(general.products.find((p) => p.id === "inv-cold")!.difference).toBe(99);
  });
});
