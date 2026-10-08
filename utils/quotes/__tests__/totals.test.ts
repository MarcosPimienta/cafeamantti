import { describe, it, expect } from "vitest";
import { computeQuoteTotals } from "../totals";

describe("computeQuoteTotals", () => {
  it("no IVA, no discount", () => {
    expect(computeQuoteTotals([{ total_price: 100000 }, { total_price: "50000" }])).toMatchObject({
      subtotal: 150000,
      baseAmount: 150000,
      taxAmount: 0,
      applyIva: false,
      ivaRate: 0,
      totalAmount: 150000,
    });
  });

  it("coffee at 5% and merch at 19% are taxed per line", () => {
    const t = computeQuoteTotals([
      { total_price: 200000, iva_rate: 5 },
      { total_price: 100000, iva_rate: 19 },
      { total_price: 50000, iva_rate: 0 },
    ]);
    expect(t.tax5).toBeCloseTo(10000, 6);
    expect(t.tax19).toBeCloseTo(19000, 6);
    expect(t.totalAmount).toBeCloseTo(350000 + 29000, 6);
    expect(t.ivaRate).toBe(19); // header shows the highest rate present
    expect(t.applyIva).toBe(true);
  });

  it("a discount lowers every line's taxable base in proportion", () => {
    // 10% discount on 300.000 → each base is 90% of its line
    const t = computeQuoteTotals(
      [
        { total_price: 200000, iva_rate: 5 },
        { total_price: 100000, iva_rate: 19 },
      ],
      30000
    );
    expect(t.baseAmount).toBe(270000);
    expect(t.tax5).toBeCloseTo(180000 * 0.05, 6);
    expect(t.tax19).toBeCloseTo(90000 * 0.19, 6);
    expect(t.totalAmount).toBeCloseTo(270000 + 9000 + 17100, 6);
  });

  it("a discount bigger than the subtotal floors at zero, with no tax", () => {
    const t = computeQuoteTotals([{ total_price: 10000, iva_rate: 19 }], 50000);
    expect(t).toMatchObject({ baseAmount: 0, taxAmount: 0, totalAmount: 0 });
  });

  it("ignores rates other than 5 and 19, and garbage amounts", () => {
    const t = computeQuoteTotals([{ total_price: 100000, iva_rate: 8 }, { total_price: "x", iva_rate: 19 }], "abc");
    expect(t).toMatchObject({ subtotal: 100000, taxAmount: 0, discount: 0, totalAmount: 100000 });
  });

  it("an empty quote is zero", () => {
    expect(computeQuoteTotals([]).totalAmount).toBe(0);
  });
});
