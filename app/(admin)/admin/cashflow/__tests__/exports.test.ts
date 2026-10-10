import { describe, it, expect } from "vitest";
import { expenseLedger, incomeLedger, fixedAssetSheets } from "../exports";
import { fixedAssetRegister } from "../calculations";

const expenses = [
  { id: "e2", concept: "Compra máquina de espresso", category: "Maquinaria y Equipo (PUC 1520)", expense_type: "CAPEX", amount: 1340000, tax_amount: 0, net_amount: 1340000, depreciation_months: 60, asset_kind: "Máquina de espresso", asset_use: "comodato", in_service_date: "2026-09-30", residual_value: 0, image_url: null, cashflow: { date: "2026-09-30" } },
  { id: "e1", concept: "Internet", category: "Servicios Públicos (Agua, luz, internet)", expense_type: "OPEX", amount: 119000, tax_amount: 19000, net_amount: 100000, image_url: "https://x/y.jpg", cashflow: { date: "2026-09-02" } },
  { id: "e3", concept: "Café verde", category: "Costo de Ventas (Materia prima, insumos, empaques)", expense_type: "COGS", amount: 760000, tax_amount: 0, net_amount: 760000, cashflow: { date: "2026-09-30" } },
];

describe("libro de gastos", () => {
  const [ledger, summary] = expenseLedger(expenses, { from: "2026-09-01", to: "2026-09-30" }, "10/10/2026");

  it("lists every expense by date with net, IVA, total, support and asset data", () => {
    expect(ledger.rows.map((r) => r[0])).toEqual(["2026-09-02", "2026-09-30", "2026-09-30"]);
    const internet = ledger.rows[0];
    expect(internet.slice(0, 7)).toEqual(["2026-09-02", "Internet", "Servicios Públicos (Agua, luz, internet)", "OPEX · gasto operativo", 100000, 19000, 119000]);
    expect(internet[12]).toBe("Sí");
    expect(internet.slice(7, 12)).toEqual(["", "", "", null, null]); // no asset data for OPEX
    const machine = ledger.rows.find((r) => r[13] === "e2")!;
    expect(machine.slice(7, 12)).toEqual(["Máquina de espresso", "Comodato", "2026-09-30", 60, 0]);
    expect(ledger.totals).toEqual(["Total", "3 gastos", "", "", 2200000, 19000, 2219000]);
    expect(ledger.title).toContainEqual(["Periodo", "2026-09-01 a 2026-09-30"]);
  });

  it("sums by category, largest first", () => {
    expect(summary.rows[0]).toEqual(["Maquinaria y Equipo (PUC 1520)", "CAPEX · activo fijo", 1, 1340000, 0, 1340000]);
    expect(summary.rows).toHaveLength(3);
    expect(summary.totals).toEqual(["Total", "", 3, 2200000, 19000, 2219000]);
  });
});

describe("libro de ingresos", () => {
  const incomes = [
    { id: "o1", type: "auto", concept: "Venta Orden #abc", category: "Ventas Web", gross_amount: 100000, fee_amount: 3560, shipping_cost: 0, tax_amount: 0, net_revenue: 96440, date: "2026-09-10", created_at: "2026-09-10T15:00:00Z" },
    { id: "i1", type: "manual", from_salida: true, concept: "Venta tienda", category: "Ventas Físicas", gross_amount: 35000, fee_amount: 0, shipping_cost: 0, tax_amount: 0, net_revenue: 35000, quantity_sold: 1, inventory: { product_code: "CAFT-250", product_name: "Premium 250 g", unit: "unidad" }, cashflow: { date: "2026-09-05" } },
  ];
  const [ledger, summary] = incomeLedger(incomes, {}, "10/10/2026");

  it("shows origin, product and the gross-to-net breakdown", () => {
    expect(ledger.rows[0]).toEqual(["2026-09-05", "Venta tienda", "Ventas Físicas", "Salida de inventario", "Premium 250 g (CAFT-250)", "1 unidad", 35000, 0, 0, 0, 35000, "i1"]);
    expect(ledger.rows[1][3]).toBe("Venta web (automática)");
    expect(ledger.totals).toEqual(["Total", "2 ingresos", "", "", "", "", 135000, 3560, 0, 0, 131440]);
    expect(ledger.title).toContainEqual(["Periodo", "Inicio a hoy"]);
    expect(summary.rows[0]).toEqual(["Ventas Web", "Venta web (automática)", 1, 100000, 3560, 0, 0, 96440]);
  });
});

describe("registro de activos fijos", () => {
  const register = fixedAssetRegister(
    [{ id: "m1", concept: "Compra máquina", category: "Maquinaria y Equipo (PUC 1520)", net_amount: 1340000, depreciation_months: 60, residual_value: 0, asset_kind: "Máquina de espresso", asset_use: "comodato", in_service_date: "2026-09-30", purchase_date: "2026-09-30", created_at: "2026-10-10T00:00:00Z" }],
    "2026-10-31"
  );
  const [detail, summary] = fixedAssetSheets(register, "2026-10-31", "10/10/2026");

  it("one row per asset with cost, quota, accumulated and book value", () => {
    expect(detail.rows[0]).toEqual([
      "Maquinaria y Equipo (PUC 1520)", "Máquina de espresso", "Compra máquina", "Comodato", "2026-09-30", "2026-09-30", "2031-08",
      1340000, 0, 60, 22333.33, 2, 44666.66, 1295333.34, "Depreciando", "m1",
    ]);
    expect(detail.title).toContainEqual(["Fecha de corte", "2026-10-31"]);
  });

  it("summary by class with the month's depreciation", () => {
    expect(summary.rows).toEqual([["Maquinaria y Equipo (PUC 1520)", 1, 1340000, 44666.66, 1295333.34, 22333.33]]);
  });
});
