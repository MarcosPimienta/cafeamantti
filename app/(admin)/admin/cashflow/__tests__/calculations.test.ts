import { describe, it, expect } from "vitest";
import {
  round2,
  resolveExpenseFields,
  resolveIncomeFields,
  monthBounds,
  summarizeMonthlyPL,
  CO_VAT_RATE,
  DEFAULT_GATEWAY_FEE_RATE,
  type MonthlyPLInput,
} from "../calculations";

describe("round2", () => {
  it("rounds money to cents without float noise", () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(1.005 * 1000)).toBe(1005);
  });
});

describe("resolveExpenseFields", () => {
  it("net = amount − IVA", () => {
    const { fields, validationError } = resolveExpenseFields({ amount: 119000, tax_amount: 19000, category: "Servicios Públicos" });
    expect(validationError).toBeUndefined();
    expect(fields).toMatchObject({ amount: 119000, tax_amount: 19000, net_amount: 100000 });
  });

  it("infers the type from the category and keeps an explicit type", () => {
    expect(resolveExpenseFields({ amount: 1, category: "Arriendo" }).fields.expense_type).toBe("OPEX");
    expect(resolveExpenseFields({ amount: 1, category: "Arriendo", expense_type: "COGS" }).fields.expense_type).toBe("COGS");
    expect(resolveExpenseFields({ amount: 1, category: "Algo nuevo" }).fields.expense_type).toBe("OPEX");
  });

  it("CAPEX requires a positive useful life, rounded down to whole months", () => {
    expect(resolveExpenseFields({ amount: 1, expense_type: "CAPEX" }).validationError).toMatch(/depreciation_months > 0/);
    expect(resolveExpenseFields({ amount: 1, expense_type: "CAPEX", depreciation_months: 0 }).validationError).toBeDefined();
    expect(resolveExpenseFields({ amount: 1, expense_type: "CAPEX", depreciation_months: 36.9 }).fields.depreciation_months).toBe(36);
  });

  it("OPEX and COGS never carry depreciation", () => {
    expect(resolveExpenseFields({ amount: 1, expense_type: "OPEX", depreciation_months: 12 }).fields.depreciation_months).toBeNull();
    expect(resolveExpenseFields({ amount: 1, expense_type: "COGS", depreciation_months: 12 }).fields.depreciation_months).toBeNull();
  });
});

describe("fixed assets by PUC class", () => {
  it.each(["Maquinaria y Equipo (PUC 1520)", "Muebles y Enseres (PUC 1524)", "Equipo de Cómputo y Comunicación (PUC 1528)"])(
    "%s is a fixed asset that depreciates",
    (category) => {
      const { fields, validationError } = resolveExpenseFields({ category, amount: 12000000, depreciation_months: 120, asset_use: "comodato" });
      expect(validationError).toBeUndefined();
      expect(fields).toMatchObject({ expense_type: "CAPEX", net_amount: 12000000, depreciation_months: 120, asset_use: "comodato", residual_value: 0 });
      expect(resolveExpenseFields({ category, amount: 12000000 }).validationError).toMatch(/depreciation_months/);
    }
  );

  it("equipment bought to resell is inventory (cost of sales), not a fixed asset", () => {
    const { fields } = resolveExpenseFields({ category: "Mercancía para Reventa (Inventario PUC 1435)", amount: 5000000, depreciation_months: 120, asset_use: "comodato", residual_value: 100 });
    expect(fields).toMatchObject({ expense_type: "COGS", depreciation_months: null, asset_use: null, asset_kind: null, in_service_date: null, residual_value: 0 });
  });

  it("keeps what the asset is, its destination, start of use and residual value", () => {
    const { fields } = resolveExpenseFields({
      category: "Maquinaria y Equipo (PUC 1520)", amount: 11900000, tax_amount: 1900000, depreciation_months: 84,
      asset_kind: "  Máquina de espresso ", asset_use: "produccion", in_service_date: "2026-11-03", residual_value: 1000000,
    });
    expect(fields).toMatchObject({ net_amount: 10000000, asset_kind: "Máquina de espresso", asset_use: "produccion", in_service_date: "2026-11-03", residual_value: 1000000 });
  });

  it("rejects a residual value above the net value, an unknown destination or a bad date", () => {
    const capex = { category: "Muebles y Enseres (PUC 1524)", amount: 1000000, depreciation_months: 120 };
    expect(resolveExpenseFields({ ...capex, residual_value: 1000001 }).validationError).toMatch(/residual/);
    expect(resolveExpenseFields({ ...capex, residual_value: -1 }).validationError).toMatch(/residual/);
    expect(resolveExpenseFields({ ...capex, asset_use: "bodega" as never }).validationError).toMatch(/Destino/);
    expect(resolveExpenseFields({ ...capex, in_service_date: "03/11/2026" }).validationError).toMatch(/puesta en uso/);
  });
});

describe("resolveIncomeFields", () => {
  it("Ventas Web derive IVA (19%) and gateway fee when not given", () => {
    const { fields } = resolveIncomeFields({ gross_amount: 100000, category: "Ventas Web" });
    expect(fields.tax_amount).toBe(round2(100000 * CO_VAT_RATE));
    expect(fields.fee_amount).toBe(round2(100000 * DEFAULT_GATEWAY_FEE_RATE));
    expect(fields.net_revenue).toBe(100000 - 19000 - 3560);
    expect(fields.amount).toBe(fields.gross_amount); // legacy column stays in sync
  });

  it("explicit values win, shipping is always taken out of net", () => {
    const { fields } = resolveIncomeFields({ gross_amount: 100000, category: "Ventas Web", tax_amount: 4762, fee_amount: 1000, shipping_cost: 10000 });
    expect(fields).toMatchObject({ tax_amount: 4762, fee_amount: 1000, shipping_cost: 10000, net_revenue: 84238 });
  });

  it("other categories take values as entered (no derived IVA or fees)", () => {
    const { fields } = resolveIncomeFields({ amount: 45000, category: "Ventas Físicas" });
    expect(fields).toMatchObject({ gross_amount: 45000, tax_amount: 0, fee_amount: 0, net_revenue: 45000 });
  });
});

describe("monthBounds", () => {
  it("returns an exclusive end on the 1st of the next month, across the year", () => {
    expect(monthBounds(9, 2026)).toEqual({ period_start: "2026-09-01", period_end: "2026-10-01" });
    expect(monthBounds(12, 2026)).toEqual({ period_start: "2026-12-01", period_end: "2027-01-01" });
  });
});

describe("summarizeMonthlyPL", () => {
  const base = (over: Partial<MonthlyPLInput> = {}): MonthlyPLInput => ({
    period_start: "2026-09-01",
    period_end: "2026-10-01",
    manualIncomes: [],
    webOrders: [],
    cogsExpenses: [],
    inventoryConsumptions: [],
    opexExpenses: [],
    capexItems: [],
    paidExpenses: [],
    ...over,
  });

  it("an empty month is all zeros, without dividing by zero", () => {
    const r = summarizeMonthlyPL(base());
    expect(r.net_revenue).toBe(0);
    expect(r.gross_margin_pct).toBe(0);
    expect(r.ebitda_margin_pct).toBe(0);
  });

  it("walks the statement from revenue to operating income", () => {
    const r = summarizeMonthlyPL(
      base({
        manualIncomes: [{ gross_amount: 200000, fee_amount: 0, shipping_cost: 0, tax_amount: 0 }, { amount: "50000" }],
        webOrders: [{ total_amount: 100000 }],
        cogsExpenses: [{ net_amount: 60000 }],
        inventoryConsumptions: [{ total_cost: 40000 }],
        opexExpenses: [{ net_amount: 30000 }, { net_amount: null }],
        capexItems: [{ net_amount: 1200000, depreciation_months: 12, created_at: "2026-06-15T00:00:00Z" }],
        paidExpenses: [{ amount: 71400 }, { amount: "35700" }],
      })
    );
    // web order: IVA 19.000 + fee 3.560 out of 100.000
    expect(r.gross_revenue).toBe(350000);
    expect(r.sales_tax).toBe(19000);
    expect(r.gateway_fees).toBe(3560);
    expect(r.net_revenue).toBe(327440);
    expect(r.total_cogs).toBe(100000);
    expect(r.gross_profit).toBe(227440);
    expect(r.gross_margin_pct).toBe(round2((227440 / 327440) * 100));
    expect(r.opex).toBe(30000);
    expect(r.ebitda).toBe(197440);
    expect(r.monthly_depreciation).toBe(100000);
    expect(r.operating_income).toBe(97440);
    expect(r.burn_rate).toBe(107100);
  });

  it("stops depreciating an asset once its useful life is over", () => {
    const capex = (created_at: string, months: number) => ({ net_amount: 600000, depreciation_months: months, created_at });
    const r = summarizeMonthlyPL(
      base({
        capexItems: [
          capex("2026-03-01T00:00:00Z", 6), // ends 2026-09-01: not after period start → done
          capex("2026-03-02T00:00:00Z", 6), // ends 2026-09-02: still one quota
          capex("2026-08-01T00:00:00Z", 0), // invalid life is ignored
        ],
      })
    );
    expect(r.monthly_depreciation).toBe(100000);
  });

  it("depreciates (net − residual) ÷ months from the month the asset is put in service", () => {
    const asset = (over: object) => ({ net_amount: 12000000, residual_value: 2400000, depreciation_months: 120, created_at: "2026-01-10T00:00:00Z", purchase_date: "2026-01-10", ...over });
    const quota = (12000000 - 2400000) / 120; // 80.000
    // Bought in January, in service in October → nothing in September (period), then it counts
    expect(summarizeMonthlyPL(base({ capexItems: [asset({ in_service_date: "2026-10-15" })] })).monthly_depreciation).toBe(0);
    expect(summarizeMonthlyPL(base({ period_start: "2026-10-01", period_end: "2026-11-01", capexItems: [asset({ in_service_date: "2026-10-15" })] })).monthly_depreciation).toBe(quota);
    // Without in-service date it starts with the purchase
    expect(summarizeMonthlyPL(base({ capexItems: [asset({})] })).monthly_depreciation).toBe(quota);
    // Last month of a 12-month life started in Oct 2025 is Sep 2026; Oct 2026 is over
    const short = asset({ depreciation_months: 12, in_service_date: "2025-10-20" });
    expect(summarizeMonthlyPL(base({ capexItems: [short] })).monthly_depreciation).toBe(800000);
    expect(summarizeMonthlyPL(base({ period_start: "2026-10-01", period_end: "2026-11-01", capexItems: [short] })).monthly_depreciation).toBe(0);
  });

  it("splits depreciation by the asset's destination (cost vs. sales vs. admin)", () => {
    const asset = (asset_use: string | null, net: number) => ({ net_amount: net, depreciation_months: 10, created_at: "2026-09-01T00:00:00Z", purchase_date: "2026-09-01", asset_use: asset_use as never });
    const r = summarizeMonthlyPL(base({ capexItems: [asset("produccion", 1000000), asset("comodato", 500000), asset("comodato", 300000), asset("administracion", 200000), asset(null, 100000)] }));
    expect(r.depreciation_by_use).toEqual({ produccion: 100000, punto_venta: 0, comodato: 80000, administracion: 20000, sin_destino: 10000 });
    expect(r.monthly_depreciation).toBe(210000);
    expect(r.operating_income).toBe(r.ebitda - 210000);
  });
});
