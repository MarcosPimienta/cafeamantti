-- Migration: 20260326000000_add_epayco_refs.sql
-- Description: Adds ePayco reference and transaction ID columns to orders and subscriptions for payment tracking.

ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS epayco_ref_payco TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS epayco_transaction_id TEXT UNIQUE;

ALTER TABLE public.subscriptions
ADD COLUMN IF NOT EXISTS epayco_ref_payco TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS epayco_transaction_id TEXT UNIQUE;
