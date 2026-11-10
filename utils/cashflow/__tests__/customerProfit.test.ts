import { describe, it, expect } from "vitest";
import { customerKey, customerProfit, type CustomerDoc } from "../customerProfit";

const costs = new Map([
  ["bolsa25", { name: "Café Tostado 2.5kg", unit: "unidad", cost: 110_000, kg: 2.5 }],
  ["arom", { name: "Aromáticas Surtidas", unit: "unidad", cost: null }],
]);
const doc = (customerKey: string, customer: string, base: number, lines: CustomerDoc["lines"], kind: CustomerDoc["kind"] = "factura"): CustomerDoc =>
  ({ customerKey, customer, date: "2026-10-15", doc: "FV", kind, base, lines });

describe("rentabilidad por cliente", () => {
  it("sales less notes, less the coffee they took", () => {
    const { rows } = customerProfit([
      doc("nit:900", "Gimnasio", 1_500_000, [{ inventory_id: "bolsa25", description: "2.5kg", quantity: 10, base: 1_500_000 }]),
      doc("nit:900", "Gimnasio", 100_000, [], "nota"),
    ], costs, { machines: [], depreciation: 0 });
    expect(rows[0]).toMatchObject({ netSales: 1_400_000, cost: 1_100_000, gross: 300_000, kg: 25 });
    expect(rows[0].grossPct).toBeCloseTo(21.43, 2);
  });

  it("products without a cost are listed apart, not counted as free", () => {
    const { rows } = customerProfit([
      doc("nit:1", "Oficina", 200_000, [{ inventory_id: "arom", description: "Aromáticas", quantity: 3, base: 60_000 }, { inventory_id: null, description: "Servicio", quantity: 1, base: 140_000 }]),
    ], costs, { machines: [], depreciation: 0 });
    expect(rows[0].cost).toBe(0);
    expect(rows[0].uncosted).toEqual([{ description: "Aromáticas Surtidas", quantity: 3 }, { description: "Servicio", quantity: 1 }]);
  });

  it("comodato depreciation goes to the customers holding machines, by machine", () => {
    const r = customerProfit([
      doc("nit:900", "Profitness", 1_000_000, [{ inventory_id: "bolsa25", description: "2.5kg", quantity: 5, base: 1_000_000 }]),
    ], costs, { depreciation: 300_000, machines: [
      { customerKey: "nit:900", customer: "Profitness", machines: 2, commitmentKg: 7.5 },
      { customerKey: "nit:800", customer: "Elevate", machines: 1, commitmentKg: 3.75 },
    ] });
    const at = (k: string) => r.rows.find((x) => x.key === k)!;
    expect(at("nit:900")).toMatchObject({ comodatoCost: 200_000, contribution: 250_000, commitmentKg: 7.5, kg: 12.5 });
    // A customer with a machine who bought nothing shows up, losing money.
    expect(at("nit:800")).toMatchObject({ netSales: 0, comodatoCost: 100_000, contribution: -100_000 });
    expect(r.unassignedComodato).toBe(0);
  });

  it("without machines assigned, the comodato depreciation stays apart", () => {
    expect(customerProfit([], costs, { machines: [], depreciation: 533_538 }).unassignedComodato).toBe(533_538);
  });

  it("keys a customer by NIT without check digit; 222222222222 is consumidor final", () => {
    expect(customerKey("901752308-8", "x")).toBe("nit:901752308");
    expect(customerKey("901752308", "x")).toBe("nit:901752308");
    expect(customerKey("222222222222", "x")).toBe("consumidor-final");
    expect(customerKey(null, " Sara ")).toBe("otro:sara");
  });
});
