-- ============================================================
-- Migration: Hybrid P&L + Cashflow Support
-- Date: 2026-06-04
-- Scope:
--   1. Extend cashflow_expenses  → expense_type, tax_amount, net_amount, depreciation_months
--   2. Extend cashflow_incomes   → gross_amount, fee_amount, shipping_cost, tax_amount, net_revenue
--   3. Create inventory_stock    → snapshot de stock valorado para P&L/CapEx
--   4. Create inventory_logs     → trazabilidad contable de entradas/salidas/ajustes
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- SECTION 1 — Extend cashflow_expenses
-- ────────────────────────────────────────────────────────────

-- 1.1 Clasificación contable del gasto
ALTER TABLE public.cashflow_expenses
  ADD COLUMN IF NOT EXISTS expense_type TEXT
    NOT NULL DEFAULT 'OPEX'
    CHECK (expense_type IN ('OPEX', 'CAPEX', 'COGS'));

-- 1.2 IVA discriminado (puede ser 0 si el gasto no tiene IVA)
ALTER TABLE public.cashflow_expenses
  ADD COLUMN IF NOT EXISTS tax_amount NUMERIC NOT NULL DEFAULT 0;

-- 1.3 Valor neto antes de impuestos (amount - tax_amount)
--     Se calcula en la app, pero se persiste para queries analíticos rápidos
ALTER TABLE public.cashflow_expenses
  ADD COLUMN IF NOT EXISTS net_amount NUMERIC NOT NULL DEFAULT 0;

-- 1.4 Vida útil para depreciación (solo aplica cuando expense_type = 'CAPEX')
--     NULL = no aplica depreciación (gasto corriente)
ALTER TABLE public.cashflow_expenses
  ADD COLUMN IF NOT EXISTS depreciation_months INTEGER
    CHECK (depreciation_months IS NULL OR depreciation_months > 0);

-- Constraint: depreciation_months solo tiene sentido en CAPEX
ALTER TABLE public.cashflow_expenses
  ADD CONSTRAINT chk_depreciation_capex_only
    CHECK (
      (expense_type = 'CAPEX' AND depreciation_months IS NOT NULL)
      OR
      (expense_type <> 'CAPEX' AND depreciation_months IS NULL)
    );

-- Índice para filtrar por tipo contable (reportes P&L)
CREATE INDEX IF NOT EXISTS idx_cashflow_expenses_type
  ON public.cashflow_expenses (expense_type);

-- ────────────────────────────────────────────────────────────
-- SECTION 2 — Extend cashflow_incomes
-- ────────────────────────────────────────────────────────────

-- 2.1 Valor bruto cobrado al cliente (precio de venta sin deducciones)
ALTER TABLE public.cashflow_incomes
  ADD COLUMN IF NOT EXISTS gross_amount NUMERIC NOT NULL DEFAULT 0;

-- 2.2 Comisión de pasarela de pago (ePayco u otras) deducida del bruto
ALTER TABLE public.cashflow_incomes
  ADD COLUMN IF NOT EXISTS fee_amount NUMERIC NOT NULL DEFAULT 0;

-- 2.3 Costo de flete/envío incluido en el cobro al cliente
ALTER TABLE public.cashflow_incomes
  ADD COLUMN IF NOT EXISTS shipping_cost NUMERIC NOT NULL DEFAULT 0;

-- 2.4 IVA contenido en el ingreso bruto (responsabilidad tributaria)
ALTER TABLE public.cashflow_incomes
  ADD COLUMN IF NOT EXISTS tax_amount NUMERIC NOT NULL DEFAULT 0;

-- 2.5 Ingreso neto real = gross_amount - fee_amount - shipping_cost - tax_amount
--     Persistido para queries sin recalcular
ALTER TABLE public.cashflow_incomes
  ADD COLUMN IF NOT EXISTS net_revenue NUMERIC NOT NULL DEFAULT 0;

-- Índice para reportes por categoría de ingreso
CREATE INDEX IF NOT EXISTS idx_cashflow_incomes_category
  ON public.cashflow_incomes (category);

-- ────────────────────────────────────────────────────────────
-- SECTION 3 — inventory_stock
-- Snapshot valorado del stock para el cálculo de COGS y CapEx
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.inventory_stock (
  id                UUID    PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Referencia cruzada con el sistema de inventario operativo existente
  -- Puede ser NULL si el ítem aún no está en la tabla 'inventory'
  inventory_id      UUID    REFERENCES public.inventory(id) ON DELETE SET NULL,

  -- Identificación del SKU
  sku               TEXT    NOT NULL,
  product_name      TEXT    NOT NULL,

  -- Tipo de ítem a efectos contables
  -- 'RAW_MATERIAL'  → Café verde/pergamino
  -- 'WIP'           → Café en proceso de tostión
  -- 'FINISHED_GOOD' → Café tostado listo para venta
  -- 'PACKAGING'     → Bolsas, etiquetas, empaques
  -- 'ASSET'         → Activo fijo (máquina, equipo)
  item_type         TEXT    NOT NULL DEFAULT 'RAW_MATERIAL'
                      CHECK (item_type IN ('RAW_MATERIAL', 'WIP', 'FINISHED_GOOD', 'PACKAGING', 'ASSET')),

  -- Unidad de medida (kg, g, unidad, etc.)
  unit              TEXT    NOT NULL DEFAULT 'kg',

  -- Cantidad actual en stock
  quantity          NUMERIC NOT NULL DEFAULT 0,

  -- Costo promedio ponderado por unidad (para calcular COGS preciso)
  unit_cost         NUMERIC NOT NULL DEFAULT 0,

  -- Valor total = quantity × unit_cost (persistido para P&L rápido)
  total_value       NUMERIC GENERATED ALWAYS AS (quantity * unit_cost) STORED,

  -- Proveedor habitual (referencia libre, no FK)
  supplier          TEXT,

  -- Mes/año de la última valoración (para reportes mensuales de inventario)
  last_valued_at    DATE,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by        UUID    REFERENCES public.profiles(id)
);

-- SKU único por ítem de inventario financiero
ALTER TABLE public.inventory_stock
  ADD CONSTRAINT uq_inventory_stock_sku UNIQUE (sku);

-- Trigger updated_at
CREATE TRIGGER trg_inventory_stock_updated_at
  BEFORE UPDATE ON public.inventory_stock
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- RLS
ALTER TABLE public.inventory_stock ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage inventory_stock"
  ON public.inventory_stock FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ────────────────────────────────────────────────────────────
-- SECTION 4 — inventory_logs
-- Trazabilidad contable de cada movimiento (compra, consumo, ajuste, merma)
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.inventory_logs (
  id                UUID    PRIMARY KEY DEFAULT gen_random_uuid(),

  -- FK al ítem de inventario financiero
  stock_id          UUID    NOT NULL REFERENCES public.inventory_stock(id) ON DELETE CASCADE,

  -- Tipo de movimiento contable
  -- 'PURCHASE'      → Entrada por compra (genera COGS diferido o activo)
  -- 'CONSUMPTION'   → Salida por uso en producción (realiza COGS)
  -- 'SALE'          → Salida por venta directa
  -- 'ADJUSTMENT'    → Ajuste manual (positivo o negativo)
  -- 'WRITE_OFF'     → Baja/merma (gasto extraordinario)
  -- 'TRANSFER'      → Traspaso entre etapas (RAW→WIP, WIP→FINISHED)
  movement_type     TEXT    NOT NULL
                      CHECK (movement_type IN (
                        'PURCHASE', 'CONSUMPTION', 'SALE',
                        'ADJUSTMENT', 'WRITE_OFF', 'TRANSFER'
                      )),

  -- Cantidad movida (siempre positivo; la dirección la da movement_type)
  quantity          NUMERIC NOT NULL CHECK (quantity > 0),

  -- Dirección del movimiento a efectos de stock
  -- +1 = entrada (aumenta stock), -1 = salida (disminuye stock)
  direction         SMALLINT NOT NULL CHECK (direction IN (1, -1)),

  -- Costo unitario en el momento del movimiento (para FIFO/promedio ponderado)
  unit_cost         NUMERIC NOT NULL DEFAULT 0,

  -- Costo total del movimiento = quantity × unit_cost × direction
  total_cost        NUMERIC GENERATED ALWAYS AS (quantity * unit_cost) STORED,

  -- Vinculación opcional con un gasto de cashflow (ej. compra de materia prima)
  expense_id        UUID    REFERENCES public.cashflow_expenses(id) ON DELETE SET NULL,

  -- Vinculación opcional con un ingreso (ej. salida por venta)
  income_id         UUID    REFERENCES public.cashflow_incomes(id) ON DELETE SET NULL,

  -- Vinculación opcional con un batch de producción existente
  production_batch_id UUID  REFERENCES public.production_batches(id) ON DELETE SET NULL,

  -- Notas libres (lote de proveedor, número de factura, motivo de ajuste, etc.)
  notes             TEXT,

  -- Quién registró el movimiento
  created_by        UUID    REFERENCES public.profiles(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para queries contables comunes
CREATE INDEX IF NOT EXISTS idx_inventory_logs_stock_id
  ON public.inventory_logs (stock_id);

CREATE INDEX IF NOT EXISTS idx_inventory_logs_movement_type
  ON public.inventory_logs (movement_type);

CREATE INDEX IF NOT EXISTS idx_inventory_logs_created_at
  ON public.inventory_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inventory_logs_expense_id
  ON public.inventory_logs (expense_id) WHERE expense_id IS NOT NULL;

-- RLS
ALTER TABLE public.inventory_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage inventory_logs"
  ON public.inventory_logs FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ────────────────────────────────────────────────────────────
-- SECTION 5 — Ampliar cashflow_audit_logs para nuevas entidades
-- ────────────────────────────────────────────────────────────

ALTER TABLE public.cashflow_audit_logs
  ADD COLUMN IF NOT EXISTS inventory_log_id UUID REFERENCES public.inventory_logs(id) ON DELETE SET NULL;

-- Ampliar el check de action_type para incluir acciones de inventario
-- (VARCHAR(50) ya soporta los nuevos valores sin cambio de tipo)
-- Valores adicionales de facto:
--   'CREATE_INVENTORY_MOVEMENT', 'ADJUST_INVENTORY', 'WRITE_OFF_INVENTORY'

COMMENT ON COLUMN public.cashflow_audit_logs.action_type IS
  'Valores: CREATE_EXPENSE | UPDATE_EXPENSE | DELETE_EXPENSE |
            CREATE_INCOME  | UPDATE_INCOME  | DELETE_INCOME  |
            CREATE_INVENTORY_MOVEMENT | ADJUST_INVENTORY | WRITE_OFF_INVENTORY';
