-- ============================================================
-- Drop the DIAN display number of sales invoices
-- Date: 2026-10-23
--
-- 20261022000000_invoice_dian_number.sql added siigo_number (FEA719) to show
-- the resolution prefix; the app shows Siigo's name (FV-2-719) instead, so
-- the column is no longer used. Safe to run more than once.
-- ============================================================

ALTER TABLE public.sales_invoices DROP COLUMN IF EXISTS siigo_number;
ALTER TABLE public.orders DROP COLUMN IF EXISTS siigo_number;
