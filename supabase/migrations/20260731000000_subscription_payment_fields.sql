-- Migration: 20260731000000_subscription_payment_fields.sql
-- Description: Add payment tokenization, subscription tracking, and renewal flags to subscriptions and orders.

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS epayco_customer_token TEXT,
  ADD COLUMN IF NOT EXISTS epayco_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'active', 'past_due', 'failed', 'cancelled')),
  ADD COLUMN IF NOT EXISTS card_brand TEXT,
  ADD COLUMN IF NOT EXISTS card_last_four TEXT,
  ADD COLUMN IF NOT EXISTS last_payment_date TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS is_subscription_renewal BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL;
