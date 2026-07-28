-- Migration: Add issue_date to cuentas_cobro
-- Date: 2026-07-28

ALTER TABLE public.cuentas_cobro 
  ADD COLUMN IF NOT EXISTS issue_date DATE DEFAULT CURRENT_DATE;
