-- ============================================================
-- Logística: envíos nacionales e internacionales
-- Date: 2026-11-21
--
-- A shipment is one guía with one carrier. National carriers are
-- Servientrega and Coordinadora; international ones DHL and FedEx
-- ('otro' covers anything else, e.g. a messenger). It can go out to a
-- client (optionally for one order) or come in (samples, supplies).
--
--   preparando ─▶ en_transito ─▶ en_aduana ─▶ en_reparto ─▶ entregado
--                      │              │             │
--                      └──────────────┴─────────────┴──▶ novedad ─▶ (any of the above)
--                                                       devuelto / cancelado
--
-- shipment_events keeps every status change and note, newest first.
-- Shipping does NOT move stock or cash: the order and the purchase do.
--
-- Automatic tracking (every 8 h, open shipments with a guía): the carrier's
-- scans land in shipment_events with source 'transportadora' and an
-- external_key, so a scan is never stored twice. carrier_status keeps the
-- carrier's last mapped status: ours only follows the carrier when that
-- changes, so a manual change isn't undone on the next check.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.shipments (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier              TEXT NOT NULL CHECK (carrier IN ('servientrega', 'coordinadora', 'dhl', 'fedex', 'otro')),
  scope                TEXT NOT NULL DEFAULT 'nacional' CHECK (scope IN ('nacional', 'internacional')),
  direction            TEXT NOT NULL DEFAULT 'salida' CHECK (direction IN ('salida', 'entrada')),
  tracking_number      TEXT,
  status               TEXT NOT NULL DEFAULT 'preparando'
                       CHECK (status IN ('preparando', 'en_transito', 'en_aduana', 'en_reparto', 'entregado', 'novedad', 'devuelto', 'cancelado')),
  client_id            UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  order_id             UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  recipient_name       TEXT,
  recipient_phone      TEXT,
  address              TEXT,
  origin_city          TEXT,
  destination_city     TEXT,
  destination_country  TEXT NOT NULL DEFAULT 'Colombia',
  contents             TEXT,
  packages             INTEGER CHECK (packages IS NULL OR packages > 0),
  weight_kg            NUMERIC CHECK (weight_kg IS NULL OR weight_kg >= 0),
  declared_value       NUMERIC CHECK (declared_value IS NULL OR declared_value >= 0),
  cost                 NUMERIC CHECK (cost IS NULL OR cost >= 0),
  currency             TEXT NOT NULL DEFAULT 'COP' CHECK (currency IN ('COP', 'USD', 'EUR')),
  -- Who pays the freight: us, or the client on delivery (contra entrega / al cobro).
  paid_by              TEXT NOT NULL DEFAULT 'nosotros' CHECK (paid_by IN ('nosotros', 'cliente')),
  ship_date            DATE,
  estimated_date       DATE,
  delivered_date       DATE,
  notes                TEXT,
  carrier_status       TEXT,
  carrier_status_text  TEXT,
  last_checked_at      TIMESTAMPTZ,
  last_check_error     TEXT,
  created_by           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (estimated_date IS NULL OR ship_date IS NULL OR estimated_date >= ship_date),
  CHECK (delivered_date IS NULL OR ship_date IS NULL OR delivered_date >= ship_date)
);

-- A guía identifies one shipment per carrier (case-insensitive).
CREATE UNIQUE INDEX IF NOT EXISTS uq_shipments_carrier_tracking
  ON public.shipments (carrier, lower(tracking_number))
  WHERE tracking_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_shipments_status ON public.shipments (status);
CREATE INDEX IF NOT EXISTS idx_shipments_client ON public.shipments (client_id);
CREATE INDEX IF NOT EXISTS idx_shipments_order ON public.shipments (order_id);

CREATE TABLE IF NOT EXISTS public.shipment_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id  UUID NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
  event_date   DATE NOT NULL,
  status       TEXT CHECK (status IS NULL OR status IN ('preparando', 'en_transito', 'en_aduana', 'en_reparto', 'entregado', 'novedad', 'devuelto', 'cancelado')),
  description  TEXT,
  location     TEXT,
  source       TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'transportadora')),
  external_key TEXT,
  created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_shipment_events_external
  ON public.shipment_events (shipment_id, external_key)
  WHERE external_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_shipment_events_shipment ON public.shipment_events (shipment_id, event_date DESC);

ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipment_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage shipments" ON public.shipments;
CREATE POLICY "Admins can manage shipments" ON public.shipments FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can manage shipment events" ON public.shipment_events;
CREATE POLICY "Admins can manage shipment events" ON public.shipment_events FOR ALL USING (public.is_admin());
