import { describe, it, expect } from "vitest";
import { isMissingWarehousesMigration, stockByWarehouse, stockIn, transferProblem } from "../inventory/warehouses";

describe("stock per bodega", () => {
  const rows = [
    { inventory_id: "p250", warehouse_id: "nale", molienda: "grano", quantity: 150 },
    { inventory_id: "p250", warehouse_id: "nale", molienda: "molido", quantity: 64 },
    { inventory_id: "p250", warehouse_id: "mateo", molienda: "grano", quantity: 12 },
    { inventory_id: "verde", warehouse_id: "nale", molienda: null, quantity: 142 },
    { inventory_id: "granel", warehouse_id: "c1111", molienda: null, quantity: 5 },
    { inventory_id: "granel", warehouse_id: "c1111", molienda: null, quantity: -5 },
  ];
  const stock = stockByWarehouse(rows);

  it("adds each product's movements per bodega, split by grind", () => {
    expect(stockIn(stock, "p250", "nale")).toEqual({ total: 214, grano: 150, molido: 64, sinDefinir: 0 });
    expect(stockIn(stock, "p250", "mateo").total).toBe(12);
    expect(stockIn(stock, "verde", "nale")).toEqual({ total: 142, grano: 0, molido: 0, sinDefinir: 142 });
  });

  it("a bodega with nothing of a product holds zero", () => {
    expect(stockIn(stock, "verde", "mateo").total).toBe(0);
    expect(stockIn(stock, "granel", "c1111").total).toBe(0);
  });
});

describe("transferProblem", () => {
  const ok = { inventoryId: "p250", fromId: "nale", toId: "mateo", qty: 10, available: 214, needsGrind: false, molienda: null };

  it("accepts a transfer the origin can cover", () => {
    expect(transferProblem(ok)).toBeNull();
  });

  it("refuses the same bodega, no quantity or more than there is", () => {
    expect(transferProblem({ ...ok, toId: "nale" })).toMatch(/misma/);
    expect(transferProblem({ ...ok, qty: 0 })).toMatch(/mayor que cero/);
    expect(transferProblem({ ...ok, qty: 215 })).toMatch(/No hay suficiente/);
  });

  it("asks for the grind of roasted coffee", () => {
    expect(transferProblem({ ...ok, needsGrind: true })).toMatch(/molienda/);
    expect(transferProblem({ ...ok, needsGrind: true, molienda: "grano" })).toBeNull();
  });
});

describe("isMissingWarehousesMigration", () => {
  it("spots an unknown table or function, and nothing else", () => {
    expect(isMissingWarehousesMigration({ code: "42P01", message: 'relation "public.warehouses" does not exist' })).toBe(true);
    expect(isMissingWarehousesMigration({ code: "PGRST205", message: "Could not find the table 'public.warehouses' in the schema cache" })).toBe(true);
    expect(isMissingWarehousesMigration({ code: "23505", message: "duplicate key" })).toBe(false);
    expect(isMissingWarehousesMigration(null)).toBe(false);
  });
});
