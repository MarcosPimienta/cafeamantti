import { describe, it, expect } from "vitest";
import {
  buildCostSheet,
  greenCostPerKg,
  measureYield,
  pergaminoShare,
  averageKgPerOrder,
  salePricePerKg,
  profileOfCoffeeCode,
  materialCode,
  DEFAULT_COST_SETTINGS,
  type CostItem,
  type CostingInput,
  type ProductionBatch,
} from "../costPerKg";

const item = (product_code: string, standard_cost: number | null = null, product_name = product_code): CostItem => ({
  id: product_code,
  product_code,
  product_name,
  standard_cost,
});

const roast = (out: string, inKg: number, outKg: number): ProductionBatch => ({
  process_type: "tostion",
  input_code: out.replace("CAFT", "CAFV"),
  output_code: out,
  input_kg: inKg,
  output_kg: outKg,
});
const trilla = (out: string, inKg: number, outKg: number): ProductionBatch => ({
  process_type: "trilla",
  input_code: out.replace("CAFV", "CAPG"),
  output_code: out,
  input_kg: inKg,
  output_kg: outKg,
});

describe("codes", () => {
  it("knows the profile of pergamino, verde and tostado codes", () => {
    expect(profileOfCoffeeCode("CAPG-HON-001")).toBe("honey");
    expect(profileOfCoffeeCode("CAFV-MIC-001")).toBe("chiroso");
    expect(profileOfCoffeeCode("CAFT-250G")).toBe("premium");
    expect(profileOfCoffeeCode("EMP-BOLSA-HON-250G")).toBeNull();
  });
  it("builds raw material codes per profile", () => {
    expect(materialCode("CAFV", "premium")).toBe("CAFV-001");
    expect(materialCode("CAPG", "honey")).toBe("CAPG-HON-001");
    expect(materialCode("CAFV", "chiroso")).toBe("CAFV-MIC-001");
  });
});

describe("measureYield", () => {
  it("weights by kilos, not by batch", () => {
    const y = measureYield([roast("CAFT-001", 100, 80), roast("CAFT-001", 10, 9)], "tostion", "premium", 0.82);
    expect(y).toEqual({ value: 89 / 110, source: "real", batches: 2 });
  });
  it("uses all profiles when one has no batches, then the default", () => {
    expect(measureYield([roast("CAFT-001", 100, 84)], "tostion", "honey", 0.82)).toMatchObject({ value: 0.84, source: "real" });
    expect(measureYield([], "tostion", "honey", 0.82)).toEqual({ value: 0.82, source: "default", batches: 0 });
  });
  it("ignores empty or broken batches", () => {
    expect(measureYield([roast("CAFT-001", 0, 0), roast("CAFT-001", 50, 0)], "tostion", "premium", 0.8).source).toBe("default");
  });
});

describe("pergaminoShare / greenCostPerKg", () => {
  it("measures how much verde came from pergamino", () => {
    const batches = [trilla("CAFV-001", 125, 100)];
    expect(pergaminoShare(batches, { "CAFV-001": 300 }, "premium")).toBe(0.25);
    expect(pergaminoShare(batches, {}, "honey")).toBeNull();
  });

  it("blends verde bought and verde from pergamino by the measured share", () => {
    // pergamino $20.000/kg at 80 % trilla → $25.000 per kg verde
    expect(greenCostPerKg(28000, 20000, 0.8, 0.25)).toBeCloseTo(0.25 * 25000 + 0.75 * 28000, 6);
  });

  it("uses whichever price exists, and averages when the mix is unknown", () => {
    expect(greenCostPerKg(28000, null, 0.8, 0.9)).toBe(28000);
    expect(greenCostPerKg(null, 20000, 0.8, 0)).toBe(25000);
    expect(greenCostPerKg(28000, 20000, 0.8, null)).toBe(26500);
    expect(greenCostPerKg(null, null, 0.8, 0.5)).toBeNull();
  });
});

describe("orders", () => {
  const lines = [
    { order_id: "a", product_code: "CAFT-250G", quantity: 4, revenue: 180000 }, // 1 kg
    { order_id: "a", product_code: "CAFT-2K5", quantity: 1, revenue: 440000 }, // 2.5 kg
    { order_id: "b", product_code: "CAFT-250G", quantity: 2, revenue: 84000 }, // 0.5 kg
    { order_id: "c", product_code: "CAFC-340ML", quantity: 5, revenue: 50000 }, // not roasted coffee
  ];
  it("average kg per order counts only coffee orders", () => {
    expect(averageKgPerOrder(lines)).toBe((3.5 + 0.5) / 2);
    expect(averageKgPerOrder([])).toBeNull();
  });
  it("sale price per kg is revenue over kilos", () => {
    expect(salePricePerKg(lines, "CAFT-250G")).toBe((180000 + 84000) / 1.5);
    expect(salePricePerKg(lines, "CAFT-500G")).toBeNull();
  });
});

describe("buildCostSheet", () => {
  const base = (over: Partial<CostingInput> = {}): CostingInput => ({
    items: [
      item("CAFT-250G", null, "Premium 250g"),
      item("CAFT-2K5", null, "Premium 2.5kg"),
      item("CAFT-001", null, "Premium KG"),
      item("CAFV-001", 28000),
      item("EMP-BOLSA-FIR-250G", 1200, "Bolsa 250g"),
      item("STK-AMT-FIR", 150, "Sticker"),
      item("EMP-BOLSA-FIR-2K5", 1200, "Bolsa 2.5kg"),
    ],
    settings: { ...DEFAULT_COST_SETTINGS, roasting_fee_per_kg: 4000, roasting_fee_basis: "tostado", dispatch_cost_per_order: 10000, dispatch_kg_per_order: 2 },
    batches: [],
    verdePurchasedKg: {},
    soldLines: [],
    ...over,
  });

  it("reproduces the worked example (Premium 250 g)", () => {
    const sheet = buildCostSheet(base());
    const p250 = sheet.lines.find((l) => l.product_code === "CAFT-250G")!;
    expect(p250.cafe).toBeCloseTo(28000 / 0.82, 4); // 34.146
    expect(p250.tostion).toBe(4000);
    expect(p250.empaque).toBeCloseTo((1200 + 150) / 0.25, 6); // 5.400
    expect(p250.despacho).toBe(5000);
    expect(p250.costPerKg).toBeCloseTo(28000 / 0.82 + 4000 + 5400 + 5000, 4);
    expect(p250.costPerUnit).toBeCloseTo(p250.costPerKg! * 0.25, 6);
    expect(p250.missing).toEqual([]);
  });

  it("packaging weighs less per kilo on big bags, and bulk has none", () => {
    const sheet = buildCostSheet(base());
    const by = Object.fromEntries(sheet.lines.map((l) => [l.product_code, l]));
    expect(by["CAFT-2K5"].empaque).toBeCloseTo((1200 + 150) / 2.5, 6);
    expect(by["CAFT-001"].empaque).toBe(0);
    expect(by["CAFT-2K5"].costPerKg!).toBeLessThan(by["CAFT-250G"].costPerKg!);
  });

  it("maquila charged on verde costs more per kg of tostado (÷ yield)", () => {
    const sheet = buildCostSheet(base({ settings: { ...base().settings, roasting_fee_basis: "verde" } }));
    expect(sheet.lines[0].tostion).toBeCloseTo(4000 / 0.82, 6);
  });

  it("uses the real roast yield of the profile's batches", () => {
    const sheet = buildCostSheet(base({ batches: [roast("CAFT-001", 100, 80)] }));
    expect(sheet.yields.premium.tostion).toMatchObject({ value: 0.8, source: "real" });
    expect(sheet.lines[0].cafe).toBeCloseTo(28000 / 0.8, 6);
  });

  it("measures kg per dispatch from orders when not set by hand", () => {
    const sheet = buildCostSheet(
      base({
        settings: { ...base().settings, dispatch_kg_per_order: null },
        soldLines: [{ order_id: "o1", product_code: "CAFT-2K5", quantity: 2, revenue: 880000 }],
      })
    );
    expect(sheet.dispatch).toEqual({ kgPerOrder: 5, source: "real", costPerKg: 2000 });
  });

  it("no dispatch cost means no dispatch component, even without orders", () => {
    const sheet = buildCostSheet(base({ settings: { ...base().settings, dispatch_cost_per_order: 0, dispatch_kg_per_order: null } }));
    expect(sheet.dispatch.costPerKg).toBe(0);
    expect(sheet.lines[0].missing).toEqual([]);
  });

  it("says exactly which prices are missing instead of showing a wrong cost", () => {
    const items = base().items.map((i) => (i.product_code === "STK-AMT-FIR" || i.product_code === "CAFV-001" ? { ...i, standard_cost: null } : i));
    const p250 = buildCostSheet(base({ items })).lines.find((l) => l.product_code === "CAFT-250G")!;
    expect(p250.costPerKg).toBeNull();
    expect(p250.cafe).toBeNull();
    expect(p250.empaque).toBeNull();
    expect(p250.missing).toEqual([
      "Precio del café verde o pergamino (CAFV-001 / CAPG-001)",
      "Costo de Sticker (STK-AMT-FIR)",
    ]);
  });

  it("computes the margin from the average selling price", () => {
    const sheet = buildCostSheet(base({ soldLines: [{ order_id: "o1", product_code: "CAFT-250G", quantity: 4, revenue: 180000 }] }));
    const p250 = sheet.lines.find((l) => l.product_code === "CAFT-250G")!;
    expect(p250.salePerKg).toBe(180000);
    expect(p250.marginPct).toBeCloseTo(((180000 - p250.costPerKg!) / 180000) * 100, 6);
    expect(sheet.lines.find((l) => l.product_code === "CAFT-2K5")!.marginPct).toBeNull(); // no sales
  });

  it("follows the packaging recipe: a bag without sticker costs only the bag", () => {
    const sheet = buildCostSheet(base({ recipes: { "CAFT-250G": [{ code: "EMP-BOLSA-FIR-250G", qty: 1 }] } }));
    const p250 = sheet.lines.find((l) => l.product_code === "CAFT-250G")!;
    expect(p250.empaque).toBeCloseTo(1200 / 0.25, 6);
    expect(p250.customPackaging).toBe(true);
    // other references keep the default (bag + sticker)
    const p2k5 = sheet.lines.find((l) => l.product_code === "CAFT-2K5")!;
    expect(p2k5.packaging.map((p) => p.code)).toEqual(["EMP-BOLSA-FIR-2K5", "STK-AMT-FIR"]);
    expect(p2k5.customPackaging).toBe(false);
  });

  it("multiplies quantities and flags recipe items that have no price", () => {
    const sheet = buildCostSheet(
      base({ recipes: { "CAFT-250G": [{ code: "EMP-BOLSA-FIR-250G", qty: 1 }, { code: "STK-AMT-FIR", qty: 2 }, { code: "ETQ-CAFE", qty: 1 }] } })
    );
    const p250 = sheet.lines.find((l) => l.product_code === "CAFT-250G")!;
    expect(p250.empaque).toBeNull();
    expect(p250.missing).toEqual(["Costo de ETQ-CAFE (ETQ-CAFE)"]);

    const priced = buildCostSheet(
      base({ items: [...base().items, item("ETQ-CAFE", 80, "Etiqueta")], recipes: { "CAFT-250G": [{ code: "STK-AMT-FIR", qty: 2 }, { code: "ETQ-CAFE", qty: 1 }] } })
    );
    expect(priced.lines.find((l) => l.product_code === "CAFT-250G")!.empaque).toBeCloseTo((2 * 150 + 80) / 0.25, 6);
  });

  it("an empty recipe means no packaging cost", () => {
    const sheet = buildCostSheet(base({ recipes: { "CAFT-250G": [] } }));
    expect(sheet.lines.find((l) => l.product_code === "CAFT-250G")!.empaque).toBe(0);
  });

  it("lists only roasted references, grouped by profile and size", () => {
    const sheet = buildCostSheet(
      base({ items: [...base().items, item("CAFT-HON-250G"), item("CAFT-HON-125G"), item("CAFC-340ML"), item("CAFT-SAMPLE")] })
    );
    expect(sheet.lines.map((l) => l.product_code)).toEqual(["CAFT-250G", "CAFT-001", "CAFT-2K5", "CAFT-HON-125G", "CAFT-HON-250G"]);
  });
});
