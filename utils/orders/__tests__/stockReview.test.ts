import { describe, it, expect } from "vitest";
import { missingUnits, salidaCandidates } from "../stockReview";

const order = { created_at: "2026-10-09T12:00:00Z", customer: "Inversiones Gastronomicas NK SAS · Niku Medellín", items: [{ inventory_id: "bolsa25", quantity: 3 }] };
const salida = (id: string, quantity: number, movement_date: string, reason: string, inventory_id = "bolsa25") => ({ id, inventory_id, quantity: -quantity, movement_date, reason, income_id: null });

describe("inventario por revisar", () => {
  it("what the order still lacks, after the salidas already linked to it", () => {
    expect([...missingUnits(order, [])]).toEqual([["bolsa25", 3]]);
    expect([...missingUnits(order, [{ inventory_id: "bolsa25", quantity: -2 }])]).toEqual([["bolsa25", 1]]);
    // A salida of 4 for an order of 3 covers it (one bag more went out).
    expect(missingUnits(order, [{ inventory_id: "bolsa25", quantity: -4 }]).size).toBe(0);
  });

  it("offers the salida naming the customer first, even with another quantity", () => {
    const c = salidaCandidates(order, missingUnits(order, []), [
      salida("cartagena", 3, "2026-10-10", "Venta Sebastian Fernandez Cartagena"),
      salida("niku", 4, "2026-10-10", "Venta Niku Medellin Recibe Leandro"),
      salida("otro-producto", 3, "2026-10-09", "Venta Niku", "bolsa500"),
      salida("lejos", 3, "2026-11-20", "Venta Niku Medellin"),
    ]);
    expect(c.map((x) => x.id)).toEqual(["niku", "cartagena"]);
    expect(c[0]).toMatchObject({ named: true, sameQty: false, days: 1 });
  });

  it("a gift is offered only when it names the customer", () => {
    const profitness = { created_at: "2026-10-14T12:00:00Z", customer: "GRUPO PROFITNESS S.A.S · Villagrande", items: [{ inventory_id: "bolsa25", quantity: 1 }] };
    const c = salidaCandidates(profitness, missingUnits(profitness, []), [
      salida("regalo", 1, "2026-10-15", "Regalo Villagrande Profitness"),
      salida("muestra", 1, "2026-10-14", "Muestra cliente nuevo"),
    ]);
    expect(c.map((x) => x.id)).toEqual(["regalo"]);
  });
});
