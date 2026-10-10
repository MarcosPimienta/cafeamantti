-- ============================================================
-- Gastos — activos fijos por clase del PUC
-- Date: 2026-10-15
--
-- Las compras de activos fijos (CAPEX) se clasifican por la clase
-- contable del PUC / NIIF para Pymes (sección 17), no por el nombre
-- del equipo:
--   Maquinaria y Equipo (PUC 1520)            máquinas de espresso, molinos, cafeteras, tostadora…
--   Muebles y Enseres (PUC 1524)              mesas, sillas, estanterías…
--   Equipo de Cómputo y Comunicación (PUC 1528) computadores, POS, celulares…
-- Los equipos comprados para revender son inventario (PUC 1435), no
-- activo fijo.
--
-- Cada activo guarda además:
--   asset_kind       qué es (máquina de espresso, molino…), para gestión
--   asset_use        destino: produccion | punto_venta | comodato | administracion
--                    (define si la depreciación es costo o gasto de ventas/administración)
--   in_service_date  fecha de puesta en uso: la depreciación empieza aquí
--   residual_value   valor que se espera recuperar al final de la vida útil
--                    (se deprecia net_amount − residual_value)
-- ============================================================

ALTER TABLE public.cashflow_expenses
  ADD COLUMN IF NOT EXISTS asset_kind      TEXT,
  ADD COLUMN IF NOT EXISTS asset_use       TEXT
    CHECK (asset_use IS NULL OR asset_use IN ('produccion', 'punto_venta', 'comodato', 'administracion')),
  ADD COLUMN IF NOT EXISTS in_service_date DATE,
  ADD COLUMN IF NOT EXISTS residual_value  NUMERIC(14, 2) NOT NULL DEFAULT 0
    CHECK (residual_value >= 0);

-- Los datos de activo solo aplican a CAPEX.
ALTER TABLE public.cashflow_expenses DROP CONSTRAINT IF EXISTS chk_asset_fields_capex_only;
ALTER TABLE public.cashflow_expenses
  ADD CONSTRAINT chk_asset_fields_capex_only CHECK (
    expense_type = 'CAPEX'
    OR (asset_kind IS NULL AND asset_use IS NULL AND in_service_date IS NULL AND residual_value = 0)
  );

-- Categorías por equipo que existieron brevemente → su clase del PUC.
UPDATE public.cashflow_expenses
   SET asset_kind = COALESCE(asset_kind, 'Máquina de espresso'), category = 'Maquinaria y Equipo (PUC 1520)'
 WHERE category = 'Máquinas de Espresso';
UPDATE public.cashflow_expenses
   SET asset_kind = COALESCE(asset_kind, 'Cafetera / molino'), category = 'Maquinaria y Equipo (PUC 1520)'
 WHERE category = 'Cafeteras y Molinos';
UPDATE public.cashflow_expenses
   SET category = 'Muebles y Enseres (PUC 1524)'
 WHERE category = 'Muebles y Enseres';

CREATE INDEX IF NOT EXISTS idx_cashflow_expenses_capex
  ON public.cashflow_expenses (expense_type) WHERE expense_type = 'CAPEX';
