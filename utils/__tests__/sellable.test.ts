import { describe, it, expect } from "vitest";
import { isSellable, isSellableByDefault } from "../inventory/sellable";

describe("isSellableByDefault", () => {
  it.each(["CAFT-250G", "CAFT-001", "CAFT-HON-2K5", "CAFC-340ML", "CAFS-2.5KG"])("%s is sold", (code) => {
    expect(isSellableByDefault(code)).toBe(true);
  });

  it.each(["CAPG-001", "CAFV-MIC-001", "EMP-BOLSA-FIR-250G", "STK-AMT-FIR", "ETQ-CAFE", "SACF-001", "POC-001", "", null])(
    "%s is a supply",
    (code) => expect(isSellableByDefault(code as string)).toBe(false)
  );
});

describe("isSellable", () => {
  it("the per-product flag wins over the code rule, both ways", () => {
    expect(isSellable({ product_code: "POC-001", is_sellable: true })).toBe(true);
    expect(isSellable({ product_code: "CAFT-250G", is_sellable: false })).toBe(false);
  });

  it("falls back to the code rule when the column is missing (migration not applied)", () => {
    expect(isSellable({ product_code: "CAFT-250G" })).toBe(true);
    expect(isSellable({ product_code: "EMP-BOLSA", is_sellable: null })).toBe(false);
  });
});
