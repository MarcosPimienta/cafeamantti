// Pure money math for Flujo de Caja: expense/income breakdowns and the
// monthly P&L. No database access here, so every rule is unit-testable.

import {
  CashflowExpense,
  CashflowIncome,
  ExpenseType,
  EXPENSE_CATEGORY_TYPE_MAP,
} from './types';

// ─────────────────────────────────────────────────────────────
// BUSINESS LOGIC HELPERS
// ─────────────────────────────────────────────────────────────

/** IVA estándar Colombia (19 %) */
export const CO_VAT_RATE = 0.19;

/**
 * Tasa de comisión de pasarela por defecto para Ventas Web.
 * ePayco cobra ~2.99% + IVA sobre la comisión.
 * Expresado como fracción del bruto (≈ 3.56 % efectivo con IVA).
 */
export const DEFAULT_GATEWAY_FEE_RATE = 0.0356;

/**
 * Redondea a 2 decimales para evitar errores de punto flotante
 * en valores monetarios (COP).
 */
export const round2 = (n: number) => Math.round(n * 100) / 100;

// ── Expense helpers ──────────────────────────────────────────

export interface ResolvedExpense {
  expense_type: ExpenseType;
  tax_amount: number;
  net_amount: number;
  depreciation_months: number | null;
  amount: number;          // total bruto (neto + IVA) que se paga
}

/**
 * Deriva y valida los campos contables de un gasto.
 *
 * Reglas:
 *  - net_amount = amount - tax_amount
 *  - expense_type se infiere de la categoría si no viene explícito
 *  - CAPEX exige depreciation_months > 0
 *  - OPEX/COGS exigen depreciation_months null
 */
export function resolveExpenseFields(
  raw: Partial<CashflowExpense>
): { fields: ResolvedExpense; validationError?: string } {
  const amount       = Number(raw.amount ?? 0);
  const tax_amount   = round2(Number(raw.tax_amount ?? 0));
  const net_amount   = round2(amount - tax_amount);

  // Inferir expense_type desde categoría si no viene
  const category     = raw.category ?? '';
  const inferred     = EXPENSE_CATEGORY_TYPE_MAP[category];
  const expense_type: ExpenseType =
    (raw.expense_type as ExpenseType) ?? inferred ?? 'OPEX';

  let depreciation_months = raw.depreciation_months ?? null;

  // Validación CAPEX
  if (expense_type === 'CAPEX') {
    if (!depreciation_months || depreciation_months <= 0) {
      return {
        fields: { expense_type, tax_amount, net_amount, depreciation_months: null, amount },
        validationError:
          'Un gasto CAPEX debe tener depreciation_months > 0 (vida útil del activo en meses).',
      };
    }
    depreciation_months = Math.floor(depreciation_months);
  } else {
    // OPEX / COGS nunca tienen depreciación
    depreciation_months = null;
  }

  return {
    fields: { expense_type, tax_amount, net_amount, depreciation_months, amount },
  };
}

// ── Income helpers ───────────────────────────────────────────

export interface ResolvedIncome {
  gross_amount:  number;
  fee_amount:    number;
  shipping_cost: number;
  tax_amount:    number;
  net_revenue:   number;
  amount:        number;   // alias de gross_amount (compatibilidad)
}

/**
 * Deriva los campos de desglose de un ingreso.
 *
 * Reglas para categoría 'Ventas Web' (si los campos vienen en 0 / undefined):
 *  - tax_amount   = gross_amount × CO_VAT_RATE  (IVA incluido en el precio)
 *  - fee_amount   = gross_amount × DEFAULT_GATEWAY_FEE_RATE
 *  - shipping_cost: se respeta el valor que venga (puede ser 0)
 *
 * Para cualquier otra categoría se usan los valores tal como vienen
 * (el admin los ingresa manualmente).
 *
 * net_revenue = gross_amount - fee_amount - shipping_cost - tax_amount
 */
export function resolveIncomeFields(
  raw: Partial<CashflowIncome>
): { fields: ResolvedIncome } {
  const gross_amount  = round2(Number(raw.gross_amount ?? raw.amount ?? 0));
  const category      = raw.category ?? '';
  const isWebSale     = category === 'Ventas Web';

  // IVA: para Ventas Web se calcula si no viene explícito
  const tax_amount = round2(
    raw.tax_amount !== undefined && Number(raw.tax_amount) > 0
      ? Number(raw.tax_amount)
      : isWebSale
      ? gross_amount * CO_VAT_RATE
      : 0
  );

  // Comisión pasarela: para Ventas Web se calcula si no viene explícita
  const fee_amount = round2(
    raw.fee_amount !== undefined && Number(raw.fee_amount) > 0
      ? Number(raw.fee_amount)
      : isWebSale
      ? gross_amount * DEFAULT_GATEWAY_FEE_RATE
      : 0
  );

  const shipping_cost = round2(Number(raw.shipping_cost ?? 0));

  const net_revenue = round2(
    gross_amount - fee_amount - shipping_cost - tax_amount
  );

  return {
    fields: {
      gross_amount,
      fee_amount,
      shipping_cost,
      tax_amount,
      net_revenue,
      amount: gross_amount, // mantener columna legacy en sync
    },
  };
}

// ─────────────────────────────────────────────────────────────
// MONTHLY P&L
// ─────────────────────────────────────────────────────────────

/** Shape del resultado de getMonthlyPLReport */
export interface PLReportResult {
  // ── Identificación del período ────────────────────────
  period_start:       string;   // 'YYYY-MM-DD'
  period_end:         string;

  // ── Líneas de ingreso ──────────────────────────────
  /** Suma bruta de todos los ingresos del período (gross_amount) */
  gross_revenue:      number;
  /** Comisiones pasarela (fee_amount acumulado) */
  gateway_fees:       number;
  /** Fletes cobrados (shipping_cost acumulado) */
  shipping_revenue:   number;
  /** IVA de ingresos (tax_amount acumulado) */
  sales_tax:          number;
  /** Ingresos netos operacionales = gross - fees - shipping - tax */
  net_revenue:        number;

  // ── COGS ─────────────────────────────────────────
  /** Gastos marcados COGS en cashflow_expenses */
  explicit_cogs:      number;
  /** Consumos de inventario (inventory_logs type=CONSUMPTION) */
  inventory_cogs:     number;
  /** COGS total = explicit_cogs + inventory_cogs */
  total_cogs:         number;

  // ── Utilidad Bruta ────────────────────────────────
  /** net_revenue - total_cogs */
  gross_profit:       number;
  /** gross_profit / net_revenue × 100 (0 si net_revenue = 0) */
  gross_margin_pct:   number;

  // ── OPEX ─────────────────────────────────────────
  /** Gastos operativos (expense_type=OPEX) del período */
  opex:               number;

  // ── EBITDA ────────────────────────────────────────
  /** gross_profit - opex */
  ebitda:             number;
  /** ebitda / net_revenue × 100 */
  ebitda_margin_pct:  number;

  // ── Depreciación CAPEX ─────────────────────────────
  /**
   * Cuota mensual acumulada de todos los activos CAPEX vigentes.
   * Vigente = creado en o antes del fin del período y cuya vida útil
   * (depreciation_months desde created_at) aún no expiró.
   */
  monthly_depreciation: number;

  // ── Utilidad Operativa y Burn Rate ───────────────────
  /** ebitda - monthly_depreciation */
  operating_income:   number;
  /**
   * Burn rate = total de salidas de caja reales del período.
   * Incluye OPEX + COGS explícito + CAPEX pagado (no depreciación).
   * Representa cuánto dinero salió efectivamente de la caja.
   */
  burn_rate:          number;
}

/** First day of the month and first day of the next one (exclusive end). */
export function monthBounds(month: number, year: number) {
  const pad = (n: number) => String(n).padStart(2, '0');
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return {
    period_start: `${year}-${pad(month)}-01`,
    period_end: `${nextYear}-${pad(nextMonth)}-01`,
  };
}

type Num = number | string | null | undefined;

export interface MonthlyPLInput {
  period_start: string;
  period_end: string;
  manualIncomes: { gross_amount?: Num; amount?: Num; fee_amount?: Num; shipping_cost?: Num; tax_amount?: Num }[];
  webOrders: { total_amount: Num }[];
  cogsExpenses: { net_amount?: Num }[];
  inventoryConsumptions: { total_cost?: Num }[];
  opexExpenses: { net_amount?: Num }[];
  capexItems: { net_amount?: Num; depreciation_months?: Num; created_at: string }[];
  /** Gross amounts actually paid out (OPEX + COGS + CAPEX) in the period. */
  paidExpenses: { amount?: Num }[];
}

/**
 * Builds the P&L from the period's rows.
 *
 * - Web orders get the same derived breakdown as a manual 'Ventas Web' income.
 * - A CAPEX asset depreciates net_amount / months each month until
 *   created_at + months; it counts while that date is after period_start.
 * - Burn rate uses gross amounts (with IVA): that is what left the account.
 */
export function summarizeMonthlyPL(input: MonthlyPLInput): PLReportResult {
  const n = (v: Num) => Number(v ?? 0) || 0;

  let gross_revenue = 0;
  let gateway_fees = 0;
  let shipping_revenue = 0;
  let sales_tax = 0;

  for (const inc of input.manualIncomes) {
    gross_revenue += n(inc.gross_amount ?? inc.amount);
    gateway_fees += n(inc.fee_amount);
    shipping_revenue += n(inc.shipping_cost);
    sales_tax += n(inc.tax_amount);
  }

  for (const o of input.webOrders) {
    const { fields } = resolveIncomeFields({
      gross_amount: n(o.total_amount),
      amount: n(o.total_amount),
      category: 'Ventas Web',
    });
    gross_revenue += fields.gross_amount;
    gateway_fees += fields.fee_amount;
    shipping_revenue += fields.shipping_cost;
    sales_tax += fields.tax_amount;
  }

  const net_revenue = round2(gross_revenue - gateway_fees - shipping_revenue - sales_tax);

  const explicit_cogs = round2(input.cogsExpenses.reduce((s, e) => s + n(e.net_amount), 0));
  const inventory_cogs = round2(input.inventoryConsumptions.reduce((s, r) => s + n(r.total_cost), 0));
  const total_cogs = round2(explicit_cogs + inventory_cogs);
  const gross_profit = round2(net_revenue - total_cogs);
  const gross_margin_pct = net_revenue !== 0 ? round2((gross_profit / net_revenue) * 100) : 0;

  const opex = round2(input.opexExpenses.reduce((s, e) => s + n(e.net_amount), 0));
  const ebitda = round2(gross_profit - opex);
  const ebitda_margin_pct = net_revenue !== 0 ? round2((ebitda / net_revenue) * 100) : 0;

  const periodStartDate = new Date(`${input.period_start}T00:00:00Z`);
  let monthly_depreciation = 0;
  for (const asset of input.capexItems) {
    const months = n(asset.depreciation_months);
    if (months <= 0) continue;
    const expiresAt = new Date(asset.created_at);
    expiresAt.setMonth(expiresAt.getMonth() + months);
    if (expiresAt > periodStartDate) {
      monthly_depreciation += round2(n(asset.net_amount) / months);
    }
  }
  monthly_depreciation = round2(monthly_depreciation);

  const operating_income = round2(ebitda - monthly_depreciation);
  const burn_rate = round2(input.paidExpenses.reduce((s, e) => s + n(e.amount), 0));

  return {
    period_start: input.period_start,
    period_end: input.period_end,
    gross_revenue: round2(gross_revenue),
    gateway_fees: round2(gateway_fees),
    shipping_revenue: round2(shipping_revenue),
    sales_tax: round2(sales_tax),
    net_revenue,
    explicit_cogs,
    inventory_cogs,
    total_cogs,
    gross_profit,
    gross_margin_pct,
    opex,
    ebitda,
    ebitda_margin_pct,
    monthly_depreciation,
    operating_income,
    burn_rate,
  };
}
