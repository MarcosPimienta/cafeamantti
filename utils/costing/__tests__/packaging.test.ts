import { describe, it, expect } from "vitest";
import { packagingFor, defaultPackaging, cleanRecipe } from "../packaging";

describe("packaging recipes", () => {
  it("defaults to the bag plus the profile sticker", () => {
    expect(defaultPackaging("CAFT-HON-250G")).toEqual([
      { code: "EMP-BOLSA-HON-250G", qty: 1 },
      { code: "STK-AMT-HON", qty: 1 },
    ]);
    expect(packagingFor("CAFT-250G")).toMatchObject({ custom: false });
    expect(defaultPackaging("CAFT-001")).toEqual([]); // bulk is not packed
  });

  it("a saved recipe wins, including 'no sticker' and 'no packaging at all'", () => {
    const recipes = {
      "CAFT-2K5": [{ code: "EMP-BOLSA-FIR-2K5", qty: 1 }],
      "CAFT-125G": [],
    };
    expect(packagingFor("CAFT-2K5", recipes)).toEqual({ lines: [{ code: "EMP-BOLSA-FIR-2K5", qty: 1 }], custom: true });
    expect(packagingFor("CAFT-125G", recipes)).toEqual({ lines: [], custom: true });
    expect(packagingFor("CAFT-250G", recipes).custom).toBe(false);
  });

  it("cleans user input: drops blanks and zero quantities, merges duplicates", () => {
    expect(
      cleanRecipe([
        { code: " STK-AMT-FIR ", qty: "1" },
        { code: "STK-AMT-FIR", qty: 1 },
        { code: "", qty: 3 },
        { code: "ETQ-CAFE", qty: 0 },
        { code: "EMP-BOLSA", qty: "abc" },
      ])
    ).toEqual([{ code: "STK-AMT-FIR", qty: 2 }]);
  });
});
