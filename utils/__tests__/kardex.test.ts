import { describe, it, expect } from "vitest";
import {
  movementDay,
  compareMovements,
  buildProductKardex,
  buildGeneralKardex,
  type GeneralKardexMovement,
} from "../inventory/kardex";

let seq = 0;
const mv = (quantity: number, movement_date: string | null, created_at = `${movement_date ?? "2026-09-01"}T12:00:00Z`, extra = {}) => ({
  id: `m${++seq}`,
  quantity,
  movement_date,
  created_at,
  ...extra,
});

describe("movementDay / compareMovements", () => {
  it("uses movement_date, falling back to the creation day for old rows", () => {
    expect(movementDay({ movement_date: "2026-09-05", created_at: "2026-09-30T10:00:00Z" })).toBe("2026-09-05");
    expect(movementDay({ movement_date: null, created_at: "2026-09-30T10:00:00Z" })).toBe("2026-09-30");
  });

  it("orders by effective day, then by creation time inside a day", () => {
    const a = mv(1, "2026-09-02", "2026-09-02T08:00:00Z");
    const b = mv(1, null, "2026-09-01T23:00:00Z"); // undated, belongs to the 1st
    const c = mv(1, "2026-09-02", "2026-09-02T07:00:00Z");
    expect([a, b, c].sort(compareMovements).map((m) => m.id)).toEqual([b.id, c.id, a.id]);
  });
});

describe("buildProductKardex", () => {
  const movements = [
    mv(+100, "2026-09-01"), // apertura
    mv(-20, "2026-09-10", undefined, { income: { gross_amount: 300000, concept: "Venta Okus" } }),
    mv(+50, "2026-09-15"),
    mv(-5, "2026-09-20", undefined, { income: [{ gross_amount: "75000", concept: null }] }), // embed as array
    mv(-30, "2026-10-02"),
  ];

  it("without a period lists everything with a running balance", () => {
    const k = buildProductKardex(movements);
    expect(k.rows.map((r) => r.saldo)).toEqual([100, 80, 130, 125, 95]);
    expect(k.summary).toEqual({ opening: 0, entradas: 150, salidas: 55, closing: 95, ventasCobradas: 375000, count: 5 });
    expect(k.ledgerTotal).toBe(95);
  });

  it("folds what happened before `from` into the opening balance and stops after `to`", () => {
    const k = buildProductKardex(movements, { from: "2026-09-10", to: "2026-09-30" });
    expect(k.summary).toMatchObject({ opening: 100, entradas: 50, salidas: 25, closing: 125, count: 3 });
    expect(k.rows[0]).toMatchObject({ date: "2026-09-10", salida: 20, entrada: 0, saldo: 80, sale_amount: 300000, sale_concept: "Venta Okus" });
    // closing = opening + entradas − salidas
    expect(k.summary.closing).toBe(k.summary.opening + k.summary.entradas - k.summary.salidas);
    // the ledger for reconciliation ignores the period
    expect(k.ledgerTotal).toBe(95);
  });

  it("is order-independent (sorts internally) and does not mutate its input", () => {
    const shuffled = [...movements].reverse();
    const before = JSON.stringify(shuffled);
    expect(buildProductKardex(shuffled).rows.map((r) => r.saldo)).toEqual([100, 80, 130, 125, 95]);
    expect(JSON.stringify(shuffled)).toBe(before);
  });

  it("does not leak the raw income embed into the rows", () => {
    expect(buildProductKardex(movements).rows[1]).not.toHaveProperty("income");
  });

  it("treats garbage quantities as zero instead of NaN", () => {
    const k = buildProductKardex([mv(Number.NaN, "2026-09-01"), { ...mv(0, "2026-09-02"), quantity: "abc" }]);
    expect(k.summary.closing).toBe(0);
    expect(Number.isNaN(k.ledgerTotal)).toBe(false);
  });
});

describe("buildGeneralKardex", () => {
  const items = [
    { id: "kg", product_code: "CAFT-001", product_name: "Café Tostado KG", category: "cafe", unit: "kg", systemStock: 7.5 },
    { id: "u250", product_code: "CAFT-250G", product_name: "Café 250g", category: "cafe", unit: "unidad", systemStock: 9 },
    { id: "bag", product_code: "EMP-BOLSA", product_name: "Bolsa", category: "empaque", unit: "unidad", systemStock: 0 },
  ];
  const g = (inventory_id: string, quantity: number, date: string, extra: Partial<GeneralKardexMovement> = {}): GeneralKardexMovement => ({
    ...mv(quantity, date),
    inventory_id,
    type: quantity >= 0 ? "entrada" : "salida",
    tab_source: null,
    reason: null,
    lote: null,
    molienda: null,
    responsable: null,
    income_id: null,
    ...extra,
  });
  const movements = [
    g("kg", 10, "2026-09-01"),
    g("u250", 12, "2026-09-01"),
    g("kg", -2.5, "2026-09-12"),
    g("u250", -3, "2026-09-14", { income_id: "i1", income: { gross_amount: 90000 } }),
    g("kg", 1, "2026-10-03"),
  ];

  it("computes inicial / entradas / salidas / final per product for the period", () => {
    const r = buildGeneralKardex(items, movements, { from: "2026-09-10", to: "2026-09-30" });
    const byId = Object.fromEntries(r.products.map((p) => [p.id, p]));
    expect(byId.kg).toMatchObject({ opening: 10, entradas: 0, salidas: 2.5, closing: 7.5, movimientos: 1 });
    expect(byId.u250).toMatchObject({ opening: 12, salidas: 3, closing: 9, ventasCobradas: 90000 });
    expect(byId.bag).toMatchObject({ opening: 0, closing: 0, movimientos: 0 }); // listed even without movements
  });

  it("the history carries each product's own running balance, never mixed units", () => {
    const r = buildGeneralKardex(items, movements, { from: "2026-09-10", to: "2026-09-30" });
    expect(r.history.map((h) => [h.inventory_id, h.saldo])).toEqual([
      ["kg", 7.5],
      ["u250", 9],
    ]);
  });

  it("reconciles stored stock against the whole ledger, not the period", () => {
    const r = buildGeneralKardex(items, movements, { from: "2026-09-10", to: "2026-09-30" });
    const kg = r.products.find((p) => p.id === "kg")!;
    expect(kg.difference).toBeCloseTo(7.5 - 8.5, 6); // a 1 kg movement after `to` still counts
    expect(r.summary).toMatchObject({ productos: 3, productosConMovimiento: 2, movimientos: 2, ventasCobradas: 90000, descuadres: 1 });
  });
});
