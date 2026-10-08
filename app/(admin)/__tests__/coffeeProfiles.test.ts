import { describe, it, expect } from "vitest";
import {
  isMolienda,
  isGrindTracked,
  isBulkCoffee,
  profileForCode,
  profileLabelForCode,
  unitWeightKg,
  bulkCodeForProfile,
  packagingCodesFor,
  PROFILE_FLAVOR,
} from "../coffeeProfiles";

describe("isMolienda", () => {
  it("accepts only grano and molido", () => {
    expect(isMolienda("grano")).toBe(true);
    expect(isMolienda("molido")).toBe(true);
    for (const v of ["Grano", "whole", "", null, undefined, 1]) expect(isMolienda(v)).toBe(false);
  });
});

describe("isGrindTracked / isBulkCoffee", () => {
  it("tracks grind for every roasted coffee code, packed or bulk", () => {
    for (const c of ["CAFT-001", "CAFT-250G", "CAFT-HON-500G", "CAFT-MIC-001", "CAFT-2K5"]) {
      expect(isGrindTracked(c)).toBe(true);
    }
  });

  it("never tracks grind for non-roasted items", () => {
    for (const c of ["CAPG-001", "CAFV-HON-001", "CAFC-340ML", "EMP-BOLSA-FIR-250G", "STK-AMT", "", null, undefined]) {
      expect(isGrindTracked(c)).toBe(false);
    }
  });

  it("bulk is the -001 roasted code (kg), packed sizes are not", () => {
    expect(isBulkCoffee("CAFT-001")).toBe(true);
    expect(isBulkCoffee("CAFT-HON-001")).toBe(true);
    expect(isBulkCoffee("CAFT-250G")).toBe(false);
    expect(isBulkCoffee("CAPG-001")).toBe(false); // pergamino is not roasted
  });
});

describe("profileForCode", () => {
  it("maps the code marker to the profile", () => {
    expect(profileForCode("CAFT-250G")).toBe("premium");
    expect(profileForCode("CAFT-HON-250G")).toBe("honey");
    expect(profileForCode("CAFT-MIC-001")).toBe("chiroso");
  });

  it("returns null for anything that is not roasted coffee", () => {
    expect(profileForCode("CAFV-HON-001")).toBeNull();
    expect(profileForCode(null)).toBeNull();
  });

  it("labels the profile", () => {
    expect(profileLabelForCode("CAFT-MIC-250G")).toBe("Chiroso");
    expect(profileLabelForCode("EMP-BOLSA")).toBeNull();
  });
});

describe("unitWeightKg", () => {
  it.each([
    ["CAFT-001", 1],
    ["CAFT-HON-001", 1],
    ["CAFT-125G", 0.125],
    ["CAFT-250G", 0.25],
    ["CAFT-MIC-500G", 0.5],
    ["CAFT-2K5", 2.5],
  ])("%s weighs %s kg per stock unit", (code, kg) => {
    expect(unitWeightKg(code)).toBeCloseTo(kg, 6);
  });

  it("refuses to guess for unknown sizes or non-coffee", () => {
    expect(unitWeightKg("CAFT-SAMPLE")).toBeNull();
    expect(unitWeightKg("EMP-BOLSA-FIR-250G")).toBeNull();
    expect(unitWeightKg(undefined)).toBeNull();
  });

  it("supports new sample sizes without code changes", () => {
    expect(unitWeightKg("CAFT-50G")).toBeCloseTo(0.05, 6);
  });
});

describe("bulkCodeForProfile / packagingCodesFor", () => {
  it("finds the bulk item that receives repack leftovers", () => {
    expect(bulkCodeForProfile("premium")).toBe("CAFT-001");
    expect(bulkCodeForProfile("honey")).toBe("CAFT-HON-001");
    expect(bulkCodeForProfile("chiroso")).toBe("CAFT-MIC-001");
  });

  it("suggests the bag of the size plus the profile sticker", () => {
    expect(packagingCodesFor("CAFT-250G")).toEqual(["EMP-BOLSA-FIR-250G", "STK-AMT-FIR"]);
    expect(packagingCodesFor("CAFT-HON-2K5")).toEqual(["EMP-BOLSA-HON-2K5", "STK-AMT-HON"]);
    expect(packagingCodesFor("CAFT-MIC-125G")).toEqual(["EMP-BOLSA-MIC-125G", "STK-AMT-MIC"]);
  });

  it("bulk coffee and non-coffee need no packaging", () => {
    expect(packagingCodesFor("CAFT-001")).toEqual([]);
    expect(packagingCodesFor("CAFC-340ML")).toEqual([]);
  });

  it("flavor codes match the bag/sticker naming", () => {
    expect(PROFILE_FLAVOR).toEqual({ premium: "FIR", honey: "HON", chiroso: "MIC" });
  });
});
