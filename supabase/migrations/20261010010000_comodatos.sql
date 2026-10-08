-- ============================================================
-- Comodatos: equipment lent to clients
-- Date: 2026-10-10
--
-- An inventory item of category 'equipo' is a MODEL (e.g. espresso
-- machine 2 grupos). Each physical machine is an equipment_unit with
-- its own serial and status:
--
--   disponible ──asignar──▶ en_comodato ──devolver──▶ disponible
--        │  ▲                                   └──▶ mantenimiento
--        ▼  │
--   mantenimiento        baja (retired; from disponible/mantenimiento)
--
-- Lending does NOT move stock (the machine is still ours). Registering
-- a unit beyond the model's stock adds an entrada; retiring one adds a
-- salida, so the Kardex keeps reconciling.
--
-- comodato_assignments keeps who had each machine and when;
-- equipment_events keeps maintenance and notes.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.equipment_units (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id  UUID NOT NULL REFERENCES public.inventory(id) ON DELETE RESTRICT,
  serial        TEXT,
  label         TEXT,
  status        TEXT NOT NULL DEFAULT 'disponible'
                CHECK (status IN ('disponible', 'en_comodato', 'mantenimiento', 'baja')),
  notes         TEXT,
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A serial identifies one machine (case-insensitive); units without
-- serial are allowed.
CREATE UNIQUE INDEX IF NOT EXISTS uq_equipment_units_serial
  ON public.equipment_units (lower(serial))
  WHERE serial IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_equipment_units_inventory ON public.equipment_units (inventory_id);

CREATE TABLE IF NOT EXISTS public.comodato_assignments (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id                  UUID NOT NULL REFERENCES public.equipment_units(id) ON DELETE CASCADE,
  client_id                UUID NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  start_date               DATE NOT NULL,
  end_date                 DATE,
  -- Coffee the client commits to buy per month in exchange for the machine.
  monthly_commitment_kg    NUMERIC CHECK (monthly_commitment_kg IS NULL OR monthly_commitment_kg >= 0),
  delivery_notes           TEXT,
  return_notes             TEXT,
  created_by               UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date IS NULL OR end_date >= start_date)
);

-- One open comodato per machine at a time.
CREATE UNIQUE INDEX IF NOT EXISTS uq_comodato_open_per_unit
  ON public.comodato_assignments (unit_id)
  WHERE end_date IS NULL;

CREATE INDEX IF NOT EXISTS idx_comodato_client ON public.comodato_assignments (client_id);

CREATE TABLE IF NOT EXISTS public.equipment_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id      UUID NOT NULL REFERENCES public.equipment_units(id) ON DELETE CASCADE,
  event_date   DATE NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('alta', 'entrega', 'devolucion', 'mantenimiento', 'reparacion', 'baja', 'nota')),
  description  TEXT,
  cost         NUMERIC CHECK (cost IS NULL OR cost >= 0),
  client_id    UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_equipment_events_unit ON public.equipment_events (unit_id, event_date DESC);

ALTER TABLE public.equipment_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comodato_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage equipment units" ON public.equipment_units;
CREATE POLICY "Admins can manage equipment units" ON public.equipment_units FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can manage comodato assignments" ON public.comodato_assignments;
CREATE POLICY "Admins can manage comodato assignments" ON public.comodato_assignments FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can manage equipment events" ON public.equipment_events;
CREATE POLICY "Admins can manage equipment events" ON public.equipment_events FOR ALL USING (public.is_admin());
