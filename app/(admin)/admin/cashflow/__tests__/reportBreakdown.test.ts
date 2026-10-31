import { describe, it, expect } from "vitest";
import { expenseBreakdown, expenseDetail, incomeBreakdown, incomeDetail, incomeSource, previousPeriod, shortLabel, MAX_BARS } from "../reportBreakdown";

// October 2026 as it was in the app.
const OCT = [
  { category: "Maquinaria y Equipo (PUC 1520)", amount: 7300000, expense_type: "CAPEX" },
  { category: "Intereses Financieros (Préstamos de terceros)", amount: 1937183, expense_type: "OPEX" },
  { category: "Costos de Producción (Maquila, Servicio de tostión)", amount: 1294044, expense_type: "COGS" },
  { category: "Costo de Ventas (Materia prima, insumos, empaques)", amount: 769247, expense_type: "COGS" },
  { category: "Gastos de Viaje y Transporte", amount: 553410, expense_type: "OPEX" },
  { category: "Honorarios Contables (Contador, revisoría)", amount: 500000, expense_type: "OPEX" },
  { category: "Anticipos a proveedores", amount: 345406, expense_type: "ANTICIPO" },
  { category: "Comisiones de Ventas (Vendedores, referidos)", amount: 301460, expense_type: "OPEX" },
];

describe("Flujo de Caja report breakdown", () => {
  it("separates the month's expense from investments and money that is not an expense", () => {
    const r = expenseBreakdown(OCT);
    expect(r).toMatchObject({ gasto: 5355344, costos: 2063291, operativos: 3292053, inversion: 7300000, noGasto: 345406, previousGasto: null });
    expect(r.bars.map((b) => [b.label, b.kind])).toEqual([
      ["Intereses Financieros", "OPEX"],
      ["Costos de Producción", "COGS"],
      ["Costo de Ventas", "COGS"],
      ["Gastos de Viaje y Transporte", "OPEX"],
      ["Honorarios Contables", "OPEX"],
      ["Comisiones de Ventas", "OPEX"],
    ]);
    expect(r.bars[0].share).toBeCloseTo(1937183 / 5355344);
  });

  it("compares each category with the previous period and folds the tail into Otros", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ category: `Cat ${i}`, amount: 900 - i * 100, expense_type: "OPEX" }));
    const r = expenseBreakdown(many, [{ category: "Cat 0", amount: 450, expense_type: "OPEX" }]);
    expect(r.bars).toHaveLength(MAX_BARS);
    expect(r.bars[0]).toMatchObject({ label: "Cat 0", value: 900, previous: 450 });
    expect(r.bars.at(-1)).toMatchObject({ label: "Otros (3)", kind: "OTROS", value: 600, previous: 0 });
    expect(r.previousGasto).toBe(450);
  });

  it("incomes by where the money came from", () => {
    expect(incomeSource({ concept: "RC-1-250 · MXM HOSPITALITY S.A.S · FV-2-681", category: "Ventas Físicas", amount: 1 })).toBe("Cobros de facturas con RC");
    expect(incomeSource({ type: "auto", amount: 1 })).toBe("Órdenes pagadas en la app");
    expect(incomeSource({ concept: "Pago cafe sin factura", category: "Ventas Web", amount: 1 })).toBe("Ventas Web");
    const r = incomeBreakdown([{ concept: "RC-1-251 · ELEVATE", category: "Ventas Físicas", amount: 300 }, { type: "auto", amount: 100 }, { concept: "x", category: "Ventas Web", amount: 100 }]);
    expect(r.total).toBe(500);
    expect(r.bars.map((b) => [b.name, b.kind, b.share])).toEqual([["Cobros de facturas con RC", "INGRESO", 0.6], ["Órdenes pagadas en la app", "INGRESO", 0.2], ["Ventas Web", "INGRESO", 0.2]]);
  });

  it("the previous period: last month for a whole month, else the same length before", () => {
    expect(previousPeriod("2026-10-01", "2026-10-31")).toEqual({ start: "2026-09-01", end: "2026-09-30" });
    expect(previousPeriod("2026-03-01", "2026-03-31")).toEqual({ start: "2026-02-01", end: "2026-02-28" });
    expect(previousPeriod("2026-10-11", "2026-10-20")).toEqual({ start: "2026-10-01", end: "2026-10-10" });
    expect(shortLabel("Gastos de Viaje y Transporte")).toBe("Gastos de Viaje y Transporte");
  });

  it("a bar opens into what adds up to it: supplier or concept for expenses, client for RC collections", () => {
    const rows = [
      { category: "Intereses Financieros (Préstamos de terceros)", amount: 1500000, expense_type: "OPEX", concept: "Intereses Gloria" },
      { category: "Intereses Financieros (Préstamos de terceros)", amount: 337183, expense_type: "OPEX", concept: "Intereses Diana Patricia Rueda" },
      { category: "Intereses Financieros (Préstamos de terceros)", amount: 100000, expense_type: "OPEX", concept: "Interes vanessa" },
      { category: "Costo de Ventas (Materia prima, insumos, empaques)", amount: 375624, expense_type: "COGS", concept: "Pago factura FC3339 (FC-1-238) · TODO EMPAQUES RESTREPO SAS", supplier: { name: "TODO EMPAQUES RESTREPO SAS" } },
      { category: "Costo de Ventas (Materia prima, insumos, empaques)", amount: 375623, expense_type: "COGS", concept: "Pago factura FC3339 (FC-1-238) · TODO EMPAQUES RESTREPO SAS", supplier: [{ name: "TODO EMPAQUES RESTREPO SAS" }] },
    ];
    const prev = [{ category: "Intereses Financieros (Préstamos de terceros)", amount: 1500000, expense_type: "OPEX", concept: "Intereses Gloria" }];
    const [intereses, costo] = expenseBreakdown(rows, prev).bars;
    expect(intereses.children!.map((c) => [c.label, c.value, Math.round(c.share * 100), c.kind, c.previous])).toEqual([
      ["Intereses Gloria", 1500000, 77, "OPEX", 1500000],
      ["Intereses Diana Patricia Rueda", 337183, 17, "OPEX", 0],
      ["Interes vanessa", 100000, 5, "OPEX", 0],
    ]);
    expect(intereses.children!.reduce((s, c) => s + c.value, 0)).toBe(intereses.value);
    expect(costo.children).toEqual([expect.objectContaining({ name: "TODO EMPAQUES RESTREPO SAS", value: 751247, share: 1, kind: "COGS" })]);
    expect(expenseDetail({ category: "x", amount: 1, concept: "Pago cuenta de cobro No. 32 (DS-1-45) · HECTOR GONZALEZ PEREZ" })).toBe("HECTOR GONZALEZ PEREZ");

    expect(incomeDetail({ concept: "RC-1-252 · GRUPO PROFITNESS S.A.S · FV-2-687, FV-2-694", amount: 1 })).toBe("GRUPO PROFITNESS S.A.S");
    const inc = incomeBreakdown([{ concept: "RC-1-251 · ELEVATE NUTRITION S.A.S · FV-2-702", amount: 300 }, { concept: "RC-1-253 · ELEVATE NUTRITION S.A.S · FV-2-729", amount: 100 }, { concept: "RC-1-250 · MXM · FV-2-709", amount: 100 }]);
    expect(inc.bars[0].children!.map((c) => [c.name, c.value])).toEqual([["ELEVATE NUTRITION S.A.S", 400], ["MXM", 100]]);
  });

  it("«Otros» opens into the categories it folds", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ category: `Cat ${i}`, amount: 900 - i * 100, expense_type: "OPEX", concept: "c" }));
    const otros = expenseBreakdown(many).bars.at(-1)!;
    expect(otros.children!.map((c) => [c.label, c.value])).toEqual([["Cat 6", 300], ["Cat 7", 200], ["Cat 8", 100]]);
  });
});
