import { describe, it, expect } from "vitest";
import { biggestChanges, buildStatement, byCategory, change, expenseGroup, monthBefore, pctOfSales, perHundred, safetyMargin, waterfall, type MonthInput } from "../incomeStatement";

const item = (concept: string, category: string, amount: number) => ({ date: "2026-10-15", concept, category, amount });

// A month like October: $18,3M in sales, $12,88M of coffee sold.
const october: MonthInput = {
  incomes: [{ ...item("RC-1-256 · Contegral", "Ventas Físicas", 18_300_000), fee: 0, shipping: 0, tax: 0 }],
  cogs: [item("Café verde", "Costo de Ventas (Materia prima, insumos, empaques)", 11_000_000), item("Maquila", "Costos de Producción (Maquila, Servicio de tostión)", 1_880_000)],
  inventoryCost: 0,
  opex: [
    item("Alejandra", "Honorarios Contables (Contador, revisoría)", 2_000_000),
    item("Laura", "Honorarios Administrativos (Consultoría, capacitación)", 500_000),
    item("Transporte", "Gastos de Viaje y Transporte", 1_000_000),
    item("Comisiones", "Comisiones de Ventas (Vendedores, referidos)", 250_000),
    item("Gloria", "Intereses Financieros (Préstamos de terceros)", 1_600_000),
    item("Cuota de manejo", "Comisiones Bancarias (Cuota de manejo, transacciones, pasarelas)", 0),
  ],
  accruedInterest: [item("Diana (se suma al préstamo)", "Intereses causados", 337_000)],
  depreciation: [],
};

describe("estado de resultados", () => {
  it("goes from sales to the month's result, with interest below the operating result", () => {
    const s = buildStatement(october);
    const at = (k: string) => s.lines.find((l) => l.key === k)!.amount;
    expect(at("net_sales")).toBe(18_300_000);
    expect(at("cost")).toBe(-12_880_000);
    expect(at("gross")).toBe(5_420_000);
    expect(at("selling")).toBe(-1_250_000);
    expect(at("admin")).toBe(-2_500_000);
    expect(at("operating")).toBe(1_670_000);
    expect(at("interest")).toBe(-1_937_000);
    expect(at("result")).toBe(-267_000);
    expect(s.grossMarginPct).toBe(29.62);
    // Fixed costs of $5.687.000 over a 29,6% margin.
    expect(s.breakEven).toBeCloseTo(19_201_494.46, 1);
  });

  it("each line keeps the records behind it, biggest first", () => {
    const interest = buildStatement(october).lines.find((l) => l.key === "interest")!;
    expect(interest.items.map((i) => i.concept)).toEqual(["Gloria", "Diana (se suma al préstamo)"]);
  });

  it("IVA, gateway fees and freight come off sales", () => {
    const s = buildStatement({ ...october, incomes: [{ ...item("Venta web", "Ventas Web", 100_000), fee: 3_560, shipping: 0, tax: 15_966 }] });
    expect(s.lines.find((l) => l.key === "deductions")!.amount).toBe(-19_526);
    expect(s.netSales).toBe(80_474);
  });

  it("no margin, no break-even", () => {
    expect(buildStatement({ ...october, incomes: [] }).breakEven).toBeNull();
  });
});

describe("helpers", () => {
  it("groups expense categories", () => {
    expect(expenseGroup("Intereses Financieros (Préstamos de terceros)")).toBe("interest");
    expect(expenseGroup("Comisiones Bancarias (Cuota de manejo, transacciones, pasarelas)")).toBe("bank");
    expect(expenseGroup("Gastos de Viaje y Transporte")).toBe("selling");
    expect(expenseGroup("Comisiones de Ventas (Vendedores, referidos)")).toBe("selling");
    expect(expenseGroup("Honorarios Contables (Contador, revisoría)")).toBe("admin");
    expect(expenseGroup("Enseres Menores")).toBe("admin");
  });

  it("percent of sales, change and previous months", () => {
    expect(pctOfSales(-2_500_000, 18_300_000)).toBe(-13.66);
    expect(pctOfSales(1, 0)).toBeNull();
    expect(change(-267_000, -600_000)).toBe(55.5);
    expect(change(5, 0)).toBeNull();
    expect(monthBefore("2026-01", 1)).toBe("2025-12");
    expect(monthBefore("2026-10", 5)).toBe("2026-05");
  });
});

describe("what the screen draws", () => {
  const s = buildStatement(october);

  it("the waterfall walks from sales to the result, subtotals on zero", () => {
    const w = waterfall(s);
    const at = (k: string) => w.find((x) => x.key === k)!;
    expect(at("sales")).toMatchObject({ kind: "up", range: [0, 18_300_000] });
    expect(at("cost")).toMatchObject({ kind: "down", range: [5_420_000, 18_300_000] });
    expect(at("gross")).toMatchObject({ kind: "subtotal", range: [0, 5_420_000] });
    // Interest takes the month below zero: the bar crosses the axis.
    expect(at("interest").range).toEqual([-267_000, 1_670_000]);
    expect(at("result")).toMatchObject({ kind: "total", range: [-267_000, 0] });
  });

  it("adds a line's records up by category", () => {
    const admin = s.lines.find((l) => l.key === "admin")!;
    expect(byCategory([...admin.items, item("Otro", "Honorarios Contables (Contador, revisoría)", 100_000)])).toEqual([
      { category: "Honorarios Contables (Contador, revisoría)", amount: 2_100_000, count: 2 },
      { category: "Honorarios Administrativos (Consultoría, capacitación)", amount: 500_000, count: 1 },
    ]);
  });

  it("every $100 of sales: what each line took and what was left", () => {
    const h = perHundred(s)!;
    expect(h.slices.find((x) => x.key === "cost")!.per100).toBe(70.38);
    expect(h.slices.some((x) => x.key === "deductions")).toBe(false);
    expect(h.result.per100).toBe(-1.46);
    expect(perHundred(buildStatement({ ...october, incomes: [] }))).toBeNull();
  });

  it("biggest changes: an expense that grew is bad news", () => {
    const before = buildStatement({ ...october, opex: october.opex.map((e) => (e.concept === "Transporte" ? { ...e, amount: 400_000 } : e)) });
    const [first] = biggestChanges(s, before, 1);
    expect(first).toMatchObject({ key: "selling", delta: -600_000, good: false });
  });

  it("safety margin", () => {
    expect(safetyMargin(s)).toBe(-4.93);
    expect(safetyMargin(buildStatement({ ...october, incomes: [] }))).toBeNull();
  });
});
