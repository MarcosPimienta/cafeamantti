import { describe, it, expect } from "vitest";
import { roundPrice, unitCost, suggestedPrice, calculateLine, calculateProposal, linesBelowCost, type MaquilaLine } from "../maquila";

const line = (over: Partial<MaquilaLine> = {}): MaquilaLine => ({
  id: "l1",
  presentation: "Bolsa 250 g con válvula",
  grams: 250,
  monthly_units: 400,
  materials: [
    { code: "EMP-BOLSA-FIR-250G", name: "Bolsa 250 g", unit_cost: 1200, qty: 1, supplied_by: "amantti" },
    { code: null, name: "Etiqueta del cliente", unit_cost: 300, qty: 1, supplied_by: "cliente" },
    { code: "STK-AMT", name: "Sticker lote", unit_cost: 50, qty: 2, supplied_by: "amantti" },
  ],
  labor_per_unit: 400,
  target_margin_pct: 40,
  price_per_unit: null,
  ...over,
});

describe("roundPrice", () => {
  it("rounds up to the next $50", () => {
    expect(roundPrice(2501)).toBe(2550);
    expect(roundPrice(2550)).toBe(2550);
    expect(roundPrice(0)).toBe(0);
    expect(roundPrice(-10)).toBe(0);
  });
});

describe("costs", () => {
  it("only what Amantti provides counts, plus labor", () => {
    expect(unitCost(line())).toEqual({ materials: 1200 + 100, labor: 400, total: 1700 });
  });

  it("suggested price leaves the target margin of the price", () => {
    // 1700 ÷ 0.6 = 2833.3 → 2850
    expect(suggestedPrice(line())).toBe(2850);
    expect(suggestedPrice(line({ target_margin_pct: 0 }))).toBe(1700);
    expect(suggestedPrice(line({ target_margin_pct: 500 }))).toBe(roundPrice(1700 / 0.05)); // capped at 95 %
  });
});

describe("calculateLine", () => {
  it("monthly figures, coffee the client must bring (with merma) and their materials", () => {
    const r = calculateLine(line(), { merma_pct: 2, apply_iva: true, iva_pct: 19 });
    expect(r).toMatchObject({ price: 2850, cost: 1700, revenue: 2850 * 400, totalCost: 1700 * 400, profit: 1150 * 400 });
    expect(r.marginPct).toBeCloseTo((1150 / 2850) * 100, 6);
    expect(r.coffeeKg).toBeCloseTo(400 * 0.25 * 1.02, 6); // 102 kg
    expect(r.clientMaterials).toEqual([{ name: "Etiqueta del cliente", qty: 400 }]);
  });

  it("an agreed price overrides the suggestion", () => {
    expect(calculateLine(line({ price_per_unit: 3000 })).price).toBe(3000);
    expect(calculateLine(line({ price_per_unit: 0 })).price).toBe(2850); // 0 = not set
  });
});

describe("calculateProposal", () => {
  it("adds up lines and IVA on the service", () => {
    const p = calculateProposal(
      [line(), line({ id: "l2", presentation: "Bolsa 2.5 kg", grams: 2500, monthly_units: 20, price_per_unit: 9000 })],
      { merma_pct: 0, apply_iva: true, iva_pct: 19 }
    );
    expect(p.totals.subtotal).toBe(2850 * 400 + 9000 * 20);
    expect(p.totals.iva).toBeCloseTo(p.totals.subtotal * 0.19, 6);
    expect(p.totals.total).toBeCloseTo(p.totals.subtotal * 1.19, 6);
    expect(p.totals.units).toBe(420);
    expect(p.totals.coffeeKg).toBe(100 + 50);
  });

  it("no IVA when the proposal does not charge it", () => {
    const p = calculateProposal([line()], { merma_pct: 0, apply_iva: false, iva_pct: 19 });
    expect(p.totals.iva).toBe(0);
    expect(p.totals.total).toBe(p.totals.subtotal);
  });

  it("an empty proposal is zero, without dividing by zero", () => {
    expect(calculateProposal([]).totals).toMatchObject({ subtotal: 0, total: 0, marginPct: null });
  });

  it("warns about lines priced below cost", () => {
    expect(linesBelowCost([line({ price_per_unit: 1000 }), line({ id: "ok" })])).toEqual(["Bolsa 250 g con válvula"]);
  });
});
