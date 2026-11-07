import { describe, it, expect } from "vitest";
import { assignDuplicateSalidas, duplicateSalidasFor, ordersRepeatedBy, reasonNames, type ManualSalida } from "../duplicateSalidas";

const sal = (over: Partial<ManualSalida>): ManualSalida => ({ id: "s", inventory_id: "chiroso", quantity: -2, movement_date: "2026-10-07", reason: "Venta Marcos", income_id: null, ...over });
// FV-2-770: 1 instantáneo + 2 Chiroso, created 7-oct, deducted 10-oct.
const order = { created_at: "2026-10-07T20:44:40Z", customer: "Marcos Pimienta", moved: [{ inventory_id: "chiroso", quantity: -2 }, { inventory_id: "instant", quantity: -1 }] };

describe("a sale typed as a manual salida and again as an order", () => {
  it("is found when product, quantity, dates and the customer's name match (the FV-2-770 case)", () => {
    const found = duplicateSalidasFor(order, [
      sal({ id: "a", reason: "Venta Marcos" }),
      sal({ id: "b", inventory_id: "instant", quantity: -1, reason: "Venta Marco" }),
    ]);
    expect(found.map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("another customer's sale of the same product is not a duplicate", () => {
    expect(duplicateSalidasFor(order, [sal({ reason: "Venta Alvaro Bolivar" }), sal({ reason: "Venta Julio Toro", quantity: -1 })])).toEqual([]);
  });

  it("a different quantity, a product the order didn't deduct, or a date far away are not either", () => {
    expect(duplicateSalidasFor(order, [sal({ quantity: -1 })])).toEqual([]);
    expect(duplicateSalidasFor(order, [sal({ inventory_id: "otro" })])).toEqual([]);
    expect(duplicateSalidasFor(order, [sal({ movement_date: "2026-10-03" })])).toEqual([]);
    expect(duplicateSalidasFor(order, [sal({ movement_date: "2026-10-11" })])).toEqual([]);
    expect(duplicateSalidasFor(order, [sal({ movement_date: "2026-10-10" })])).toHaveLength(1);
    expect(duplicateSalidasFor({ ...order, moved: [] }, [sal({})])).toEqual([]);
  });

  it("names: accents, case and a missing final letter still match; generic words don't", () => {
    expect(reasonNames("venta MARCO", "Marcos Pimienta")).toBe(true);
    expect(reasonNames("Pago Pimiénta", "Marcos Pimienta")).toBe(true);
    expect(reasonNames("Venta feria", "CONSUMIDOR FINAL")).toBe(false);
    expect(reasonNames("Venta consumidor final", "CONSUMIDOR FINAL")).toBe(false);
    expect(reasonNames(null, "Marcos Pimienta")).toBe(false);
    expect(reasonNames("Venta Mar", "Marcos Pimienta")).toBe(false);
  });
});

describe("before saving a manual salida", () => {
  it("finds the order that already took that product for that customer", () => {
    const orders = [{ id: "fv770", ...order }, { id: "otra", created_at: "2026-10-07T10:00:00Z", customer: "Julio Toro", moved: [{ inventory_id: "chiroso", quantity: -2 }] }];
    expect(ordersRepeatedBy(sal({ reason: "Venta Marcos", movement_date: "2026-10-09" }), orders).map((o) => o.id)).toEqual(["fv770"]);
    expect(ordersRepeatedBy(sal({ reason: "Muestra feria" }), orders)).toEqual([]);
  });
});

describe("a customer who buys often", () => {
  const prof = (id: string, day: string) => ({ id, created_at: `${day}T15:00:00Z`, customer: "GRUPO PROFITNESS S.A.S", moved: [{ inventory_id: "bolsa25", quantity: -1 }] });
  const s25 = (id: string, day: string, reason: string) => sal({ id, inventory_id: "bolsa25", quantity: -1, movement_date: day, reason });

  it("each salida goes to one order only, the closest, and samples or gifts never count", () => {
    const orders = [prof("o16", "2026-10-16"), prof("o20a", "2026-10-20"), prof("o20b", "2026-10-20")];
    const out = assignDuplicateSalidas(orders, [
      s25("v15", "2026-10-15", "Venta Profitness Calazans"),
      s25("r15", "2026-10-15", "Regalo Villagrande Profitness"),
      s25("v09", "2026-10-09", "Venta Milla de oro profitness"),
    ]);
    expect([...out.entries()].map(([k, v]) => [k, v.map((x) => x.id)])).toEqual([["o16", ["v15"]]]);
  });
});

