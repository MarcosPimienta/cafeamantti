-- ============================================================
-- DIAN number of sales invoices
-- Date: 2026-10-22
--
-- Siigo names an invoice "FV-2-719" (document type - code - number), but the
-- customer and the DIAN see the resolution prefix plus the number (FEA719).
-- siigo_number keeps that one for display; siigo_name / siigo_invoice stay
-- as Siigo's name, which cash receipts and imports use to find the invoice.
-- Safe to run more than once.
-- ============================================================

ALTER TABLE public.sales_invoices ADD COLUMN IF NOT EXISTS siigo_number TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS siigo_number TEXT;
