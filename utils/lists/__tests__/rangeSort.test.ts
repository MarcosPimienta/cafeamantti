import { describe, it, expect } from "vitest";
import { inRange, isRangeSet, parseAmount, sortRows } from "../rangeSort";

describe("date and amount limits", () => {
  it("reads amounts typed with dots, commas or a peso sign", () => {
    expect(parseAmount("1.500.000")).toBe(1500000);
    expect(parseAmount("$ 150,000")).toBe(150000);
    expect(parseAmount("")).toBeNull();
  });

  it("limits are inclusive, optional and combinable", () => {
    expect(inRange("2026-10-01", 100, { from: "2026-10-01", to: "2026-10-01", min: 100, max: 100 })).toBe(true);
    expect(inRange("2026-09-30", 100, { from: "2026-10-01" })).toBe(false);
    expect(inRange("2026-10-02", 100, { to: "2026-10-01" })).toBe(false);
    expect(inRange("2026-10-01", 99, { min: 100 })).toBe(false);
    expect(inRange("2026-10-01", 101, { max: 100 })).toBe(false);
    expect(inRange("2026-10-01", 5, {})).toBe(true);
  });

  it("knows when any limit is set", () => {
    expect(isRangeSet({})).toBe(false);
    expect(isRangeSet({ from: "", to: "", min: null, max: null })).toBe(false);
    expect(isRangeSet({ min: 0 })).toBe(true);
  });
});

describe("sorting", () => {
  const rows = [
    { id: "a", date: "2026-10-01", amount: 500, balance: 0, due: "2026-10-31" },
    { id: "b", date: "2026-10-05", amount: 100, balance: 100, due: "2026-10-20" },
    { id: "c", date: "2026-10-03", amount: 500, balance: 300, due: "2026-11-05" },
  ];
  const ids = (sort: Parameters<typeof sortRows>[1]) => sortRows(rows, sort, (r) => r).map((r) => r.id);

  it("by date, amount, balance and due date; ties newest first; the input is untouched", () => {
    expect(ids("fecha-desc")).toEqual(["b", "c", "a"]);
    expect(ids("fecha-asc")).toEqual(["a", "c", "b"]);
    expect(ids("valor-desc")).toEqual(["c", "a", "b"]);
    expect(ids("valor-asc")).toEqual(["b", "c", "a"]);
    expect(ids("saldo-desc")).toEqual(["c", "b", "a"]);
    expect(ids("vence-asc")).toEqual(["b", "a", "c"]);
    expect(rows.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });
});
