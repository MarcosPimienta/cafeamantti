-- Migration: 20260731020000_allow_custom_subscriptions.sql
-- Description: Allow 'custom' plan_id and add custom_items JSONB column to subscriptions table for Make Your Own subscription plan.

ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_plan_id_check;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_plan_id_check CHECK (plan_id IN ('essential', 'alchemy', 'curator', 'custom'));

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS custom_items JSONB DEFAULT '[]'::jsonb;
