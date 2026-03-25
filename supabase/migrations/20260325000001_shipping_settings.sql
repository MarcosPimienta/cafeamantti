-- Migration to add shipping configuration fields to store_settings

ALTER TABLE public.store_settings
ADD COLUMN IF NOT EXISTS default_shipping_cost NUMERIC NOT NULL DEFAULT 15000,
ADD COLUMN IF NOT EXISTS free_shipping_threshold NUMERIC NOT NULL DEFAULT 150000;
