import { describe, it, expect } from "vitest";
import { entryCostProblem, lineUnitCost, needsCost, summarizeEntryCosts, weightedAverageCost } from "../entryCost";

describe("entry cost", () => {
  it("materia prima and materiales need their cost; equipos and enseres don't", () => {
    expect(needsCost("MP")).toBe(true);
    expect(needsCost("MAT")).toBe(true);
    expect(needsCost("EQP")).toBe(false);
    expect(entryCostProblem("MP", null)).toBe("Escribe el costo unitario (sin IVA) de la entrada.");
    expect(entryCostProblem("EQP", null)).toBeNull();
    expect(entryCostProblem("MAT", -1)).toBe("El costo debe ser un número mayor o igual a cero.");
    expect(entryCostProblem("MAT", 0)).toBeNull(); // a gift or sample can cost 0
  });

  it("the standard cost is the weighted average of costed entradas", () => {
    // 850 kg at $31.000 and 150 kg at $29.000 → $30.700
    expect(weightedAverageCost([{ quantity: 850, unit_cost: 31000 }, { quantity: 150, unit_cost: 29000 }, { quantity: 40, unit_cost: null }])).toBe(30700);
    expect(weightedAverageCost([{ quantity: 10, unit_cost: null }])).toBeNull();
  });

  it("an invoice line gives the cost per unit", () => {
    expect(lineUnitCost(325000, 500)).toBe(650);
    expect(lineUnitCost(325000, 0)).toBeNull();
  });

  it("per item: average, how many entradas and the last one", () => {
    const sum = summarizeEntryCosts([
      { inventory_id: "verde", quantity: 598, unit_cost: 30000, movement_date: "2026-09-05", created_at: "2026-09-05T10:00:00Z" },
      { inventory_id: "verde", quantity: 850, unit_cost: 31000, movement_date: "2026-10-15", created_at: "2026-10-15T10:00:00Z" },
      { inventory_id: "bolsa", quantity: 500, unit_cost: 650, movement_date: null, created_at: "2026-10-10T10:00:00Z" },
      { inventory_id: "sticker", quantity: 100, unit_cost: null, created_at: "2026-10-10T10:00:00Z" },
    ]);
    expect(sum.verde).toEqual({ average: 30587.02, count: 2, quantity: 1448, lastCost: 31000, lastDate: "2026-10-15" });
    expect(sum.bolsa).toMatchObject({ average: 650, count: 1, lastDate: "2026-10-10" });
    expect(sum.sticker).toBeUndefined();
  });
});
