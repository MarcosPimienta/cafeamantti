import { describe, it, expect } from "vitest";
import { planRepack, type RepackItem, type RepackLine } from "../inventory/repack";

const ITEMS: RepackItem[] = [
  { id: "p2k5", product_code: "CAFT-2K5", product_name: "Café 2.5kg" },
  { id: "p500", product_code: "CAFT-500G", product_name: "Café 500g" },
  { id: "p250", product_code: "CAFT-250G", product_name: "Café 250g" },
  { id: "p125", product_code: "CAFT-125G", product_name: "Café 125g" },
  { id: "bulk", product_code: "CAFT-001", product_name: "Café KG" },
  { id: "h250", product_code: "CAFT-HON-250G", product_name: "Honey 250g" },
  { id: "bag", product_code: "EMP-BOLSA-FIR-250G", product_name: "Bolsa 250g" },
];
const byId = new Map(ITEMS.map((i) => [i.id, i]));
const L = (inventoryId: string, qty: number, molienda: string | null = "grano"): RepackLine => ({ inventoryId, qty, molienda });

describe("planRepack — splitting a big bag", () => {
  it("2.5 kg grano → 8×250 g grano leaves 0.5 kg of grano", () => {
    expect(planRepack([L("p2k5", 1)], [L("p250", 8)], byId)).toEqual({
      profile: "premium",
      inKg: 2.5,
      outKg: 2,
      sobranteKg: 0.5,
      sobranteGrano: 0.5,
      sobranteMolido: 0,
    });
  });

  it("grinding part of the beans: the ground output comes from the grano", () => {
    const p = planRepack([L("p2k5", 1)], [L("p500", 2, "molido"), L("p250", 4, "grano")], byId);
    // 2×500 g molido + 4×250 g grano = 2 kg out
    expect(p).toMatchObject({ inKg: 2.5, outKg: 2, sobranteGrano: 0.5, sobranteMolido: 0 });
  });

  it("molido origin leaves molido leftover", () => {
    expect(planRepack([L("p2k5", 1, "molido")], [L("p250", 6, "molido")], byId)).toMatchObject({
      sobranteKg: 1,
      sobranteGrano: 0,
      sobranteMolido: 1,
    });
  });

  it("works with bulk kilos as origin (1 unit = 1 kg)", () => {
    expect(planRepack([L("bulk", 1.3)], [L("p125", 10)], byId)).toMatchObject({ inKg: 1.3, outKg: 1.25, sobranteKg: 0.05 });
  });
});

describe("planRepack — combining small bags", () => {
  it("10×250 g → 1×2.5 kg leaves nothing", () => {
    expect(planRepack([L("p250", 10)], [L("p2k5", 1)], byId)).toMatchObject({ inKg: 2.5, outKg: 2.5, sobranteKg: 0 });
  });

  it("mixed-grind origins: grano can become molido, the rest is reported by grind", () => {
    // 2.5 kg molido + 2×500 g grano (1 kg) → 3 kg molido out
    expect(planRepack([L("p2k5", 1, "molido"), L("p500", 2, "grano")], [L("p250", 12, "molido")], byId)).toMatchObject({
      inKg: 3.5,
      outKg: 3,
      sobranteGrano: 0.5,
      sobranteMolido: 0,
    });
  });

  it("avoids float drift: 3×125 g + 1×125 g is exactly 0.5 kg", () => {
    expect(planRepack([L("p125", 3), L("p125", 1)], [L("p500", 1)], byId).sobranteKg).toBe(0);
  });
});

describe("planRepack — rejections", () => {
  it.each([
    ["more out than in", [L("p250", 1)], [L("p125", 3)], /supera el café abierto/],
    ["molido back to grano", [L("p2k5", 1, "molido")], [L("p250", 1, "grano")], /no puede volver a grano/],
    ["mixed profiles", [L("p2k5", 1)], [L("h250", 1)], /mismo perfil/],
    ["same product both sides", [L("p250", 4)], [L("p250", 2)], /origen y destino a la vez/],
    ["missing grind", [L("p2k5", 1, null)], [L("p250", 1)], /Selecciona la molienda.*Café 2\.5kg/],
    ["non-coffee item", [L("bag", 1)], [L("p250", 1)], /no es café tostado/],
    ["unknown product", [L("nope", 1)], [L("p250", 1)], /Producto no encontrado/],
  ])("%s", (_label, origins, destinations, message) => {
    expect(() => planRepack(origins, destinations, byId)).toThrow(message);
  });
});
