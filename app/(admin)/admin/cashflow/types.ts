// ============================================================
// types.ts — Cashflow + P&L Hybrid Domain Types
// Updated: 2026-06-04
// ============================================================

// ─────────────────────────────────────────────────────────────
// ENUMS / UNION TYPES
// ─────────────────────────────────────────────────────────────

/**
 * Clasificación contable de un gasto.
 * - OPEX  → Gasto operativo corriente (se registra íntegramente en P&L del período)
 * - CAPEX → Gasto de capital (activo fijo; se amortiza vía depreciation_months)
 * - COGS  → Costo directo de ventas (va a la línea Gross Profit del P&L)
 *
 * Mapeo de las categorías predefinidas:
 *  COGS → "Costo de Ventas (Materia prima, insumos, empaques)"
 *          "Costos de Producción (Maquila, Servicio de tostión)"
 *  CAPEX→ "Adecuación e Instalaciones"  (cuando depreciation_months > 0)
 *          "Mantenimiento y Reparaciones" (según criterio contable)
 *  OPEX → Todo lo demás
 */
export type ExpenseType = 'OPEX' | 'CAPEX' | 'COGS';

/**
 * Tipo de movimiento de inventario financiero.
 * Controla cómo fluye el costo en el P&L.
 */
export type InventoryMovementType =
  | 'PURCHASE'     // Compra → activa inventario (no impacta P&L hasta consumo)
  | 'CONSUMPTION'  // Uso en producción → realiza COGS
  | 'SALE'         // Salida por venta directa
  | 'ADJUSTMENT'   // Ajuste manual (±)
  | 'WRITE_OFF'    // Baja/merma → gasto extraordinario en P&L
  | 'TRANSFER';    // Traspaso entre etapas (RAW→WIP→FINISHED)

/**
 * Clasificación del ítem de inventario a efectos contables.
 */
export type InventoryItemType =
  | 'RAW_MATERIAL'   // Café verde / pergamino
  | 'WIP'            // En proceso de tostión
  | 'FINISHED_GOOD'  // Café tostado listo para venta
  | 'PACKAGING'      // Bolsas, etiquetas, empaques
  | 'ASSET';         // Activo fijo (máquina, equipo)

/**
 * Dirección de un movimiento de inventario:
 * +1 = entrada (aumenta stock), -1 = salida (disminuye stock)
 */
export type MovementDirection = 1 | -1;

/**
 * Tipos de acción registrables en el log de auditoría.
 */
export type AuditActionType =
  | 'CREATE_EXPENSE'
  | 'UPDATE_EXPENSE'
  | 'DELETE_EXPENSE'
  | 'CREATE_INCOME'
  | 'UPDATE_INCOME'
  | 'DELETE_INCOME'
  | 'CREATE_INVENTORY_MOVEMENT'
  | 'ADJUST_INVENTORY'
  | 'WRITE_OFF_INVENTORY';

// ─────────────────────────────────────────────────────────────
// CATEGORY CONSTANTS (mantienen compatibilidad con UI existente)
// ─────────────────────────────────────────────────────────────

/** Categorías predefinidas de gasto y su naturaleza contable por defecto */
export const EXPENSE_CATEGORY_TYPE_MAP: Record<string, ExpenseType> = {
  'Costo de Ventas (Materia prima, insumos, empaques)': 'COGS',
  'Costos de Producción (Maquila, Servicio de tostión)':  'COGS',
  'Gastos de Personal (Nómina, salud, pensión)':          'OPEX',
  'Honorarios (Servicios profesionales)':                 'OPEX',
  'Impuestos (ICA, predial, etc.)':                       'OPEX',
  'Arrendamientos (Local, equipos)':                      'OPEX',
  'Servicios Públicos (Agua, luz, internet)':             'OPEX',
  'Software y Suscripciones (Hosting, licencias)':        'OPEX',
  'Gastos Legales (Cámara de comercio, notarías)':        'OPEX',
  'Mantenimiento y Reparaciones':                         'OPEX',  // puede ser CAPEX si el usuario lo indica
  'Adecuación e Instalaciones':                           'CAPEX',
  'Gastos de Viaje y Transporte':                         'OPEX',
  'Diversos (Aseo, papelería, caja menor)':               'OPEX',
  'Gastos Financieros (Comisiones, intereses)':           'OPEX',
} as const;

export type ExpenseCategory = keyof typeof EXPENSE_CATEGORY_TYPE_MAP;

export const INCOME_CATEGORIES = [
  'Ventas Físicas',
  'Ventas Web',
  'Servicios',
  'Otros Ingresos',
] as const;

export type IncomeCategory = typeof INCOME_CATEGORIES[number];

// ─────────────────────────────────────────────────────────────
// CORE DOMAIN INTERFACES
// ─────────────────────────────────────────────────────────────

/** Registro padre diario — ancla temporal de todos los movimientos del día */
export interface DailyCashflow {
  id:              string;
  date:            string;            // 'YYYY-MM-DD'
  initial_balance: number;
  daily_income:    number;
  final_balance:   number;
  observations:    string | null;
  created_at:      string;
  created_by?:     string;            // UUID de profiles
}

/**
 * Gasto del flujo de caja con soporte completo de P&L.
 *
 * Invariante: amount === net_amount + tax_amount
 *
 * Para CAPEX: depreciation_months es obligatorio (NOT NULL en DB).
 * Para OPEX/COGS: depreciation_months es null.
 */
export interface CashflowExpense {
  id:                  string;
  cashflow_id:         string;
  concept:             string;
  category:            string;         // valor libre o de EXPENSE_CATEGORY_TYPE_MAP
  amount:              number;         // total pagado (neto + IVA)

  // ── Campos P&L ──────────────────────────────────────────
  expense_type:        ExpenseType;    // 'OPEX' | 'CAPEX' | 'COGS'
  tax_amount:          number;         // IVA discriminado (0 si exento)
  net_amount:          number;         // amount - tax_amount
  depreciation_months: number | null;  // solo para CAPEX

  // ── Soporte documental ───────────────────────────────────
  image_url?:          string | null;

  // ── Metadatos ────────────────────────────────────────────
  created_at:          string;
  created_by?:         string;
  cashflow?:           DailyCashflow;  // join opcional
}

/**
 * Ingreso del flujo de caja con desglose de comisiones, flete e IVA.
 *
 * Invariante: net_revenue === gross_amount - fee_amount - shipping_cost - tax_amount
 *
 * El campo `amount` (heredado) debe ser igual a `gross_amount`
 * para mantener compatibilidad con el código existente.
 */
export interface CashflowIncome {
  id:            string;
  cashflow_id:   string;
  concept:       string;
  category:      string;              // de INCOME_CATEGORIES o valor libre

  /** @deprecated Usar gross_amount. Mantenido por compatibilidad. */
  amount:        number;

  // ── Desglose de ingresos (modelo híbrido) ────────────────
  gross_amount:  number;              // valor bruto cobrado al cliente
  fee_amount:    number;              // comisión pasarela (ePayco, etc.)
  shipping_cost: number;              // flete incluido en el cobro
  tax_amount:    number;              // IVA sobre el ingreso
  net_revenue:   number;              // gross - fee - shipping - tax

  // ── Soporte documental ───────────────────────────────────
  image_url?:    string | null;

  // ── Metadatos ────────────────────────────────────────────
  created_at:    string;
  created_by?:   string;
  cashflow?:     DailyCashflow;
}

/** Vista agregada de un día con sus movimientos */
export interface CashflowWithExpenses extends DailyCashflow {
  expenses: CashflowExpense[];
  incomes:  CashflowIncome[];
}

/** Log de auditoría de cada mutación sobre el módulo financiero */
export interface CashflowAuditLog {
  id:                 string;
  created_at:         string;
  admin_id:           string;
  action_type:        AuditActionType;
  expense_id?:        string;
  income_id?:         string;
  cashflow_id?:       string;
  inventory_log_id?:  string;         // nuevo: vinculación con movimientos de inventario
  details:            {
    old?: Partial<CashflowExpense | CashflowIncome | InventoryLog>;
    new?: Partial<CashflowExpense | CashflowIncome | InventoryLog>;
  };
  profiles?: {
    first_name: string;
    last_name:  string;
  };
  cashflow?: DailyCashflow;
}

// ─────────────────────────────────────────────────────────────
// INVENTORY FINANCIAL INTERFACES
// ─────────────────────────────────────────────────────────────

/**
 * Snapshot valorado del stock para P&L y CapEx.
 * `total_value` es una columna GENERATED en la DB (quantity × unit_cost).
 */
export interface InventoryStock {
  id:              string;
  inventory_id?:   string | null;     // FK a public.inventory (sistema operativo)
  sku:             string;            // único por ítem financiero
  product_name:    string;
  item_type:       InventoryItemType;
  unit:            string;            // 'kg' | 'g' | 'unidad' | ...
  quantity:        number;
  unit_cost:       number;            // costo promedio ponderado por unidad (COP)
  total_value:     number;            // GENERATED: quantity × unit_cost
  supplier?:       string | null;
  last_valued_at?: string | null;     // 'YYYY-MM-DD'
  created_at:      string;
  updated_at:      string;
  created_by?:     string;
}

/**
 * Movimiento contable individual sobre un ítem de inventario financiero.
 * `total_cost` es GENERATED en la DB (quantity × unit_cost).
 */
export interface InventoryLog {
  id:                    string;
  stock_id:              string;              // FK a inventory_stock
  movement_type:         InventoryMovementType;
  quantity:              number;              // siempre positivo
  direction:             MovementDirection;   // 1 = entrada, -1 = salida
  unit_cost:             number;
  total_cost:            number;              // GENERATED: quantity × unit_cost
  expense_id?:           string | null;       // vinculado a cashflow_expenses (compra)
  income_id?:            string | null;       // vinculado a cashflow_incomes (venta)
  production_batch_id?:  string | null;       // vinculado a production_batches
  notes?:                string | null;
  created_by?:           string;
  created_at:            string;

  // Joins opcionales para vistas
  stock?:    InventoryStock;
  expense?:  CashflowExpense;
  income?:   CashflowIncome;
}

// ─────────────────────────────────────────────────────────────
// COMPUTED / REPORT TYPES
// ─────────────────────────────────────────────────────────────

/** Resumen de P&L para un período (mes, trimestre, año) */
export interface PLSummary {
  period_start:        string;    // 'YYYY-MM-DD'
  period_end:          string;
  gross_revenue:       number;    // suma de gross_amount de ingresos
  gateway_fees:        number;    // suma de fee_amount
  shipping_revenue:    number;    // suma de shipping_cost
  sales_tax:           number;    // suma de tax_amount de ingresos
  net_revenue:         number;    // gross - fees - shipping - tax
  cogs:                number;    // suma de net_amount donde expense_type = 'COGS'
  gross_profit:        number;    // net_revenue - cogs
  gross_margin_pct:    number;    // gross_profit / net_revenue × 100
  opex:                number;    // suma de net_amount donde expense_type = 'OPEX'
  ebitda:              number;    // gross_profit - opex
  capex:               number;    // suma de net_amount donde expense_type = 'CAPEX'
  depreciation:        number;    // capex amortizado en el período
  net_income:          number;    // ebitda - depreciation
}

/** Dato de serie temporal para gráficas de P&L vs Cashflow */
export interface PLTimeSeriesPoint {
  date:          string;
  net_revenue:   number;
  cogs:          number;
  gross_profit:  number;
  opex:          number;
  net_income:    number;
  cash_in:       number;    // gross_amount (entradas reales de caja)
  cash_out:      number;    // amount (salidas reales de caja, incluye IVA)
  cash_balance:  number;    // cash_in - cash_out
}
