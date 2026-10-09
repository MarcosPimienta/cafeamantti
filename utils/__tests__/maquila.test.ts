import { describe, it, expect } from "vitest";
import {
  roundPrice,
  unitCost,
  suggestedPrice,
  coffeeKgPerUnit,
  calculateLine,
  calculateProposal,
  linesBelowCost,
  linesBelowMinimum,
  normalizeLine,
  normalizeSettings,
  MIN_UNITS_PER_PRESENTATION,
  DEFAULT_SETTINGS,
  type MaquilaLine,
  type MaquilaSettings,
} from "../maquila";

const S = (over: Partial<MaquilaSettings> = {}): MaquilaSettings => ({ ...DEFAULT_SETTINGS, merma_pct: 0, ...over });

const line = (over: Partial<MaquilaLine> = {}): MaquilaLine => ({
  id: "l1",
  presentation: "Bolsa 250 g con válvula",
  profile: "premium",
  coffee_cost_per_kg: 40000,
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
  });
});

describe("unit cost (Amantti supplies the coffee)", () => {
  it("coffee by weight + what Amantti buys + labor; client supplies cost nothing", () => {
    // 0.25 kg × 40.000 = 10.000 coffee; 1.200 + 2 × 50 materials; 400 labor
    expect(unitCost(line(), S())).toEqual({ coffee: 10000, materials: 1300, labor: 400, total: 11700 });
  });

  it("packing merma adds coffee cost", () => {
    expect(coffeeKgPerUnit(line(), S({ merma_pct: 2 }))).toBeCloseTo(0.255, 9);
    expect(unitCost(line(), S({ merma_pct: 2 })).coffee).toBeCloseTo(10200, 6);
  });

  it("suggested price leaves the target margin of the price", () => {
    expect(suggestedPrice(line(), S())).toBe(roundPrice(11700 / 0.6)); // 19.500
    expect(suggestedPrice(line({ target_margin_pct: 0 }), S())).toBe(11700);
  });
});

describe("calculateLine", () => {
  it("monthly figures, coffee to roast per profile and client supplies", () => {
    const r = calculateLine(line({ profile: "honey" }), S({ merma_pct: 2 }));
    expect(r.profileLabel).toBe("Honey");
    expect(r.coffeeKg).toBeCloseTo(400 * 0.255, 6);
    expect(r.revenue).toBe(r.price * 400);
    expect(r.profit).toBeCloseTo((r.price - r.cost) * 400, 6);
    expect(r.clientMaterials).toEqual([{ name: "Etiqueta del cliente", qty: 400 }]);
  });

  it("flags presentations under the 200-unit minimum (but not empty ones)", () => {
    expect(MIN_UNITS_PER_PRESENTATION).toBe(200);
    expect(calculateLine(line({ monthly_units: 150 })).belowMinimum).toBe(true);
    expect(calculateLine(line({ monthly_units: 200 })).belowMinimum).toBe(false);
    expect(calculateLine(line({ monthly_units: 0 })).belowMinimum).toBe(false);
    expect(linesBelowMinimum([line({ monthly_units: 50 }), line({ id: "b", presentation: "500 g" })])).toEqual(["Bolsa 250 g con válvula"]);
  });

  it("an agreed price overrides the suggestion", () => {
    expect(calculateLine(line({ price_per_unit: 22000 })).price).toBe(22000);
    expect(calculateLine(line({ price_per_unit: 0 }), S()).price).toBe(19500);
  });
});

describe("calculateProposal", () => {
  it("monthly service and the one-time design fee are totalled separately, each with IVA", () => {
    const p = calculateProposal(
      [line({ price_per_unit: 20000 }), line({ id: "l2", presentation: "Bolsa 2.5 kg", profile: "chiroso", grams: 2500, monthly_units: 200, price_per_unit: 150000 })],
      S({ design_fee: 1500000, design_cost: 600000 })
    );
    expect(p.totals.subtotal).toBe(20000 * 400 + 150000 * 200);
    expect(p.totals.total).toBeCloseTo(p.totals.subtotal * 1.19, 6);
    expect(p.totals.design).toEqual({ fee: 1500000, iva: 285000, total: 1785000, cost: 600000, profit: 900000 });
    expect(p.totals.coffeeKgByProfile).toEqual({ premium: 100, chiroso: 500 });
  });

  it("no IVA and no design when not used", () => {
    const p = calculateProposal([line()], S({ apply_iva: false }));
    expect(p.totals.iva).toBe(0);
    expect(p.totals.design.total).toBe(0);
  });

  it("an empty proposal is zero, without dividing by zero", () => {
    expect(calculateProposal([]).totals).toMatchObject({ subtotal: 0, total: 0, marginPct: null });
  });

  it("warns about lines priced below cost", () => {
    expect(linesBelowCost([line({ price_per_unit: 5000 }), line({ id: "ok" })])).toEqual(["Bolsa 250 g con válvula"]);
  });
});

describe("older proposals", () => {
  it("lines without profile or coffee cost become Premium at $0/kg", () => {
    const l = normalizeLine({ id: "x", presentation: "Vieja", grams: 250 });
    expect(l).toMatchObject({ profile: "premium", coffee_cost_per_kg: 0, materials: [], price_per_unit: null });
    expect(normalizeLine({ id: "y", profile: "otro" as never }).profile).toBe("premium");
  });

  it("settings without design or look get the defaults (Amantti background at 50 %)", () => {
    expect(normalizeSettings({ merma_pct: 3 })).toMatchObject({
      merma_pct: 3,
      design_fee: 0,
      design_cost: 0,
      apply_iva: true,
      background_path: null,
      background_opacity: 0.5,
      ally_logo_path: null,
    });
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
  });
});
