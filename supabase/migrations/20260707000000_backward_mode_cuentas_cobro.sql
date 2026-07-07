-- Migration: Add backward mode columns to cuentas_cobro
-- Date: 2026-07-07

-- Alter table to add new columns
ALTER TABLE public.cuentas_cobro 
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'gasto' CHECK (type IN ('gasto', 'ingreso')),
  ADD COLUMN IF NOT EXISTS income_id UUID REFERENCES public.cashflow_incomes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS debtor_name TEXT,
  ADD COLUMN IF NOT EXISTS debtor_document TEXT,
  ADD COLUMN IF NOT EXISTS debtor_email TEXT,
  ADD COLUMN IF NOT EXISTS debtor_phone TEXT;
