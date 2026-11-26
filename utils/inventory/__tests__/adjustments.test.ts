import { describe, it, expect } from "vitest";
import { adjustmentCostItems, adjustmentLabel, adjustmentProblems, adjustmentValue, lineDelta, type DraftLine } from "../adjustments";

const line = (over: Partial<DraftLine> = {}): DraftLine => ({
  inventoryId: "p1",
  name: "Café Tostado KG",
  mode: "salida",
  value: 2,
  systemStock: 10,
  needsGrind: false,
  molienda: null,
  ...over,
});

describe("adjustment lines", () => {
  it("turns each mode into a signed quantity", () => {
    expect(lineDelta("entrada", 3, 10)).toBe(3);
    expect(lineDelta("salida", 3, 10)).toBe(-3);
    expect(lineDelta("conteo", 7.5, 10)).toBe(-2.5);
    expect(lineDelta("conteo", 12, 10)).toBe(2);
    expect(lineDelta("conteo", 0, 4)).toBe(-4);
  });

  it("rejects quantities that say nothing", () => {
    expect(lineDelta("entrada", 0, 10)).toBeNull();
    expect(lineDelta("salida", -2, 10)).toBeNull();
    expect(lineDelta("conteo", -1, 10)).toBeNull();
    expect(lineDelta("entrada", null, 10)).toBeNull();
  });

  it("numbers the vouchers", () => {
    expect(adjustmentLabel(7)).toBe("AJ-0007");
    expect(adjustmentLabel(12345)).toBe("AJ-12345");
  });
});

describe("adjustmentProblems", () => {
  const ok = { date: "2026-11-26", reason: "conteo", notes: "", lines: [line()] };

  it("accepts a complete voucher", () => {
    expect(adjustmentProblems(ok)).toEqual([]);
  });

  it("asks for date, reason and at least one product", () => {
    expect(adjustmentProblems({ date: "", reason: "", notes: "", lines: [] })).toEqual([
      "Escribe la fecha del ajuste.",
      "Elige el motivo del ajuste.",
      "Agrega al menos un producto.",
    ]);
  });

  it("asks to explain «otro motivo»", () => {
    expect(adjustmentProblems({ ...ok, reason: "otro" })).toContain("Con «Otro motivo», explica el ajuste en las observaciones.");
  });

  it("refuses taking out more than there is, an equal count and repeated products", () => {
    expect(adjustmentProblems({ ...ok, lines: [line({ value: 11 })] })[0]).toMatch(/no puede salir más de lo que hay/);
    expect(adjustmentProblems({ ...ok, lines: [line({ mode: "conteo", value: 10 })] })[0]).toMatch(/coincide con el sistema/);
    expect(adjustmentProblems({ ...ok, lines: [line(), line()] })[0]).toMatch(/está dos veces/);
  });

  it("asks for the grind of roasted coffee, and lets each grind be its own line", () => {
    expect(adjustmentProblems({ ...ok, lines: [line({ needsGrind: true })] })[0]).toMatch(/Selecciona la molienda/);
    expect(adjustmentProblems({ ...ok, lines: [line({ needsGrind: true, molienda: "grano" }), line({ needsGrind: true, molienda: "molido" })] })).toEqual([]);
  });
});

describe("value and income statement", () => {
  it("adds what was gained and lost at its cost", () => {
    expect(adjustmentValue([{ quantity: 2, unit_cost: 1000 }, { quantity: -3, unit_cost: 500 }, { quantity: -1, unit_cost: null }])).toEqual({ gained: 2000, lost: 1500, net: 500, withoutCost: 1 });
  });

  it("puts lost stock on the cost of sales and gained stock against it", () => {
    const costs = new Map([["p1", { name: "Café", unit: "kg", cost: 40000 }], ["p2", { name: "Bolsa", unit: "und", cost: null }]]);
    const r = adjustmentCostItems(
      [
        { date: "2026-11-10", inventory_id: "p1", quantity: -0.5, unit_cost: null, label: "AJ-0001" },
        { date: "2026-11-12", inventory_id: "p1", quantity: 1, unit_cost: 38000, label: "AJ-0002" },
        { date: "2026-11-12", inventory_id: "p2", quantity: -4, unit_cost: null, label: "AJ-0002" },
      ],
      costs
    );
    expect(r.items.map((i) => i.amount)).toEqual([20000, -38000]);
    expect(r.items[0]).toMatchObject({ category: "Ajustes de inventario", concept: "AJ-0001 · −0,5 kg Café" });
    expect(r.missing).toEqual([{ name: "Bolsa", quantity: 4 }]);
  });
});
