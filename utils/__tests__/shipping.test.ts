import { describe, it, expect } from "vitest";
import { calculateMetropolitanShipping, calculateOrderShippingAndTotal } from "../shipping";

describe("calculateMetropolitanShipping", () => {
  it("uses the base metro rate before an address is entered", () => {
    const z = calculateMetropolitanShipping();
    expect(z).toMatchObject({ rate: 10000, isAvailable: true });
    expect(calculateMetropolitanShipping("  ", "Medellín").isAvailable).toBe(true);
  });

  it.each([
    ["Medellín", 10000],
    ["ENVIGADO", 10000],
    ["Itagüí", 10000],
    ["Sabaneta", 10000],
    ["Bello", 14000],
    ["La Estrella", 14000],
    ["Caldas", 14000],
    ["Copacabana", 14000],
    ["Girardota", 18000],
    ["Barbosa", 18000],
  ])("Antioquia / %s costs %i", (city, rate) => {
    const z = calculateMetropolitanShipping("Antioquia", city);
    expect(z.isAvailable).toBe(true);
    expect(z.rate).toBe(rate);
  });

  it("ignores case, spaces and accents in the department and city", () => {
    expect(calculateMetropolitanShipping("  antioquia ", "  MEDELLIN ").rate).toBe(10000);
  });

  it("rejects cities outside the Valle de Aburrá", () => {
    const z = calculateMetropolitanShipping("Antioquia", "Rionegro");
    expect(z.isAvailable).toBe(false);
    expect(z.rate).toBe(0);
    expect(z.message).toMatch(/Valle de Aburrá/);
  });

  it("rejects other departments even for a metro-sounding city", () => {
    const z = calculateMetropolitanShipping("Cundinamarca", "Bogotá");
    expect(z.isAvailable).toBe(false);
    expect(calculateMetropolitanShipping("Caldas", "Manizales").isAvailable).toBe(false);
  });
});

describe("calculateOrderShippingAndTotal", () => {
  it("store prices include $10.000 of shipping per unit, which is taken out of the items total", () => {
    const r = calculateOrderShippingAndTotal(
      [
        { price: 45000, quantity: 2 },
        { price: 30000, quantity: 1 },
      ],
      "Antioquia",
      "Bello"
    );
    expect(r.netItemsTotal).toBe(35000 * 2 + 20000);
    expect(r.shippingCost).toBe(14000);
    expect(r.totalAmount).toBe(90000 + 14000);
  });

  it("never lets a cheap item go negative", () => {
    expect(calculateOrderShippingAndTotal([{ price: 5000, quantity: 3 }], "Antioquia", "Medellín").netItemsTotal).toBe(0);
  });

  it("an empty cart costs nothing", () => {
    expect(calculateOrderShippingAndTotal([], "Antioquia", "Medellín")).toMatchObject({
      netItemsTotal: 0,
      shippingCost: 0,
      totalAmount: 0,
    });
  });

  it("outside coverage still charges the base rate (the zone flags it as unavailable)", () => {
    const r = calculateOrderShippingAndTotal([{ price: 40000, quantity: 1 }], "Valle", "Cali");
    expect(r.shippingZone.isAvailable).toBe(false);
    expect(r.shippingCost).toBe(10000);
  });
});
