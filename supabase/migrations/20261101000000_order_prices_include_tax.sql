-- ============================================================
-- Precio con IVA incluido, por orden manual
-- Date: 2026-11-01
--
-- Each manual order says whether its prices already include IVA (the
-- customer was quoted a final price) or IVA goes on top. null = what
-- Ajustes → Siigo says for manual orders (orders made before this).
-- orders.tax_amount keeps the IVA added on top of total_amount (0 when the
-- prices include it).
-- Safe to run more than once.
-- ============================================================

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS prices_include_tax BOOLEAN;
