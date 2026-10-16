import { describe, it, expect } from "vitest";
import { defaultTaxId, orderTaxTotals, rateOf } from "../tax";

const OPTIONS = [{ id: 1, name: "IVA 0%", rate: 0 }, { id: 9755, name: "IVA 5%", rate: 5 }, { id: 9756, name: "IVA 19%", rate: 19 }];

describe("order IVA", () => {
  it("a line starts with the product's IVA, else the general one; 0 means none", () => {
    expect(defaultTaxId(9756, 9755)).toBe(9756);
    expect(defaultTaxId(null, 9755)).toBe(9755);
    expect(defaultTaxId(0, 9755)).toBe(0);
    expect(defaultTaxId(undefined, null)).toBe(0);
    expect(rateOf(9756, OPTIONS)).toBe(19);
    expect(rateOf(0, OPTIONS)).toBe(0);
  });

  it("IVA on top of prices before IVA, mixing 5% and 19%", () => {
    expect(orderTaxTotals([{ price: 140400, quantity: 6, tax_rate: 5 }, { price: 100000, quantity: 1, tax_rate: 19 }], false)).toEqual({ subtotal: 942400, iva: 61120, total: 1003520 });
  });

  it("IVA inside prices that include it", () => {
    expect(orderTaxTotals([{ price: 140400, quantity: 6, tax_rate: 5 }], true)).toEqual({ subtotal: 802285.71, iva: 40114.29, total: 842400 });
  });
});
