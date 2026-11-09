import { describe, it, expect } from "vitest";
import { costOfSalidas, lineBase, linesBase, unexplainedSale } from "../accrual";

describe("sales before IVA", () => {
  it("takes the IVA out of IVA-inclusive lines and leaves before-IVA ones", () => {
    expect(lineBase({ quantity: 1, unit_price: 157500, tax_rate: 5 })).toBe(150000);
    expect(lineBase({ quantity: 2, unit_price: 150000, tax_rate: 5, tax_included: false })).toBe(300000);
    expect(lineBase({ quantity: 1, unit_price: 27000, tax_rate: 0 })).toBe(27000);
    expect(linesBase([{ quantity: 1, unit_price: 157500, tax_rate: 5 }], 10000)).toBe(160000);
  });

  it("a manual income counts once, without what pays app invoices and without its IVA", () => {
    expect(unexplainedSale({ amount: 444000, tax: 0 }, 0)).toBe(444000);
    expect(unexplainedSale({ amount: 352250, tax: 0 }, 200000)).toBe(152250);
    expect(unexplainedSale({ amount: 200000, tax: 0 }, 200000)).toBe(0);
    expect(unexplainedSale({ amount: 105000, tax: 5000 }, 0)).toBe(100000);
  });
});

describe("cost of the coffee that left", () => {
  it("units × unit cost per product; products without a cost are listed apart", () => {
    const costs = new Map([
      ["bolsa25", { name: "Café Tostado 2.5kg", unit: "unidad", cost: 112700 }],
      ["chiroso", { name: "Café Tostado Chiroso 250g", unit: "unidad", cost: null }],
    ]);
    const { items, missing } = costOfSalidas([
      { date: "2026-10-16", inventory_id: "bolsa25", quantity: -1, reason: "Orden" },
      { date: "2026-10-20", inventory_id: "bolsa25", quantity: -2, reason: "Orden" },
      { date: "2026-10-20", inventory_id: "chiroso", quantity: -2, reason: "Venta" },
    ], costs);
    expect(items).toEqual([expect.objectContaining({ amount: 338100, concept: expect.stringContaining("Café Tostado 2.5kg") })]);
    expect(missing).toEqual([{ name: "Café Tostado Chiroso 250g", quantity: 2 }]);
  });
});
