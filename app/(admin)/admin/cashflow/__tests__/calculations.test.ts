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
});
