import { describe, it, expect } from "vitest";
import { weightUnitOf, convertWeight, parseQtyInput, formatQty, describeIn, roundQty } from "../units";

describe("weightUnitOf", () => {
  it.each([
    ["kg", "kg"],
    ["KG", "kg"],
    [" Kilos ", "kg"],
    ["kilogramos", "kg"],
    ["g", "g"],
    ["gr", "g"],
    ["Gramos", "g"],
    ["unidad", null],
    ["litro", null],
    ["", null],
    [null, null],
  ])("%j → %j", (unit, expected) => {
    expect(weightUnitOf(unit as string)).toBe(expected);
  });
});

describe("convertWeight", () => {
  it("kg ↔ g without float noise", () => {
    expect(convertWeight(250, "g", "kg")).toBe(0.25);
    expect(convertWeight(0.25, "kg", "g")).toBe(250);
    expect(convertWeight(1, "g", "kg")).toBe(0.001);
    expect(convertWeight(0.1 + 0.2, "kg", "g")).toBe(300);
    expect(convertWeight(2.5, "kg", "kg")).toBe(2.5);
    expect(convertWeight(-500, "g", "kg")).toBe(-0.5); // adjustments
  });
});

describe("parseQtyInput", () => {
  it.each([
    ["250", "g", 250],
    ["0,25", "kg", 0.25],
    ["0.25", "kg", 0.25],
    ["1.500", "g", 1500], // grams are whole: thousands dot
    ["1.5", "kg", 1.5],
    ["1.500", "kg", 1.5], // in kg a dot is a decimal
    ["1.234,5", "g", 1234.5],
    ["-5", "kg", -5],
    [" 12 ", null, 12],
  ])("%j in %s → %d", (text, unit, n) => {
    expect(parseQtyInput(text, unit as "kg" | "g" | null)).toBe(n);
  });

  it.each(["", "-", ",", "abc", "1,2,3", "2kg"])("rejects %j", (text) => {
    expect(parseQtyInput(text, "kg")).toBeNull();
  });
});

describe("formatting", () => {
  it("prints clean numbers and hints", () => {
    expect(formatQty(0.1 + 0.2)).toBe("0.3");
    expect(describeIn(0.25, "kg")).toBe("0,25 kg");
    expect(describeIn(1500, "g")).toBe("1.500 g");
    expect(roundQty(1.0000004)).toBe(1);
  });
});
