import { describe, it, expect } from "vitest";
import { storePrice, calculateCoffeePrice, inventoryCodeFor, storeProfileOf, STORE_PRICES } from "../pricing";

describe("store price list", () => {
  it.each([
    ["firma", "250g", 35000],
    ["firma", "2.5kg", 165000],
    ["honey", "500g", 86400],
    ["microlot", "250g", 65000],
    ["essential", "500g", 63000], // subscription plan ids share the list
    ["curator", "500g", 117000],
  ])("%s %s costs %i", (id, w, price) => {
    expect(storePrice(id, w)).toBe(price);
  });

  it("refuses what the store does not sell instead of guessing", () => {
    expect(storePrice("honey", "2.5kg")).toBeNull(); // not offered in the shop
    expect(storePrice("premium", "250g")).toBeNull(); // unknown id
    expect(storePrice("firma", "1kg")).toBeNull();
    expect(storePrice(undefined, "250g")).toBeNull();
  });

  it("the display price keeps the builder's old behaviour (all sizes, fallback)", () => {
    expect(calculateCoffeePrice("alchemy", "2.5kg")).toBe(STORE_PRICES.honey["2.5kg"]);
    expect(calculateCoffeePrice("unknown", "250g")).toBe(35000);
  });

  it("maps a store line to its inventory product", () => {
    expect(inventoryCodeFor("firma", "250g")).toBe("CAFT-250G");
    expect(inventoryCodeFor("honey", "500g")).toBe("CAFT-HON-500G");
    expect(inventoryCodeFor("curator", "2.5kg")).toBe("CAFT-MIC-2K5");
    expect(inventoryCodeFor("x", "250g")).toBeNull();
    expect(storeProfileOf("traditional")).toBe("premium");
  });
});
