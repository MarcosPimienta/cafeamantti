-- ============================================================
-- Order follow-up board + WhatsApp reminders
-- Date: 2026-10-07
--
-- The orders screen is now a board (one column per status) used
-- to follow orders until they are delivered. Three fields make
-- that follow-up possible:
--   delivery_due_date  promised delivery day, set by the admin;
--                      past it and not delivered = atrasada
--   delivered_at       when the order reached 'delivered'
--   status_changed_at  last time the status moved (days in column)
--
-- notification_logs keeps every WhatsApp summary sent (manual or
-- scheduled), so the board can show the last one and failures
-- are visible instead of silent.
-- ============================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_due_date DATE,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ;

-- Existing orders: best guess is that their status last changed
-- when they were last updated (or created).
UPDATE public.orders
  SET status_changed_at = COALESCE(updated_at, created_at)
  WHERE status_changed_at IS NULL;

UPDATE public.orders
  SET delivered_at = COALESCE(updated_at, created_at)
  WHERE status = 'delivered' AND delivered_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders (status);

CREATE TABLE IF NOT EXISTS public.notification_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel     TEXT NOT NULL DEFAULT 'whatsapp',
  kind        TEXT NOT NULL,              -- e.g. 'pending_deliveries'
  trigger     TEXT NOT NULL,              -- 'manual' | 'cron'
  recipients  TEXT[] NOT NULL DEFAULT '{}',
  message     TEXT NOT NULL,
  success     BOOLEAN NOT NULL,
  error       TEXT,
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage notification logs" ON public.notification_logs;
CREATE POLICY "Admins can manage notification logs"
  ON public.notification_logs FOR ALL
  USING (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_notification_logs_kind_created
  ON public.notification_logs (kind, created_at DESC);
