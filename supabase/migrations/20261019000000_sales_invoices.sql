-- ============================================================
-- Facturas de venta (crédito) y sus pagos
-- Date: 2026-10-19
--
-- Flujo: pedido → factura en la app (borrador) → envío en lote a
-- Siigo (la emite ante la DIAN y se la envía al cliente) → el
-- cliente paga después → el pago se registra aquí y viaja a Siigo
-- como recibo de caja en el siguiente lote.
--
-- sales_invoices    una por pedido (salvo anuladas). Guarda una copia
--                   de las líneas al crearla. status:
--                     borrador  creada en la app, aún no existe para la DIAN
--                     emitida   creada en Siigo (siigo_* con número, CUFE…)
--                     error     el último envío falló (siigo_error)
--                     anulada   borrador descartado (nunca llegó a Siigo)
--                   El stock del pedido se descuenta al facturar.
-- invoice_payments  abonos del cliente. siigo_status:
--                     pendiente → enviado (recibo de caja RC-…) | error
-- ============================================================

CREATE TABLE IF NOT EXISTS public.sales_invoices (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id                UUID NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  client_id               UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  customer_name           TEXT NOT NULL,
  customer_identification TEXT,
  payment_terms           TEXT NOT NULL CHECK (payment_terms IN ('credito', 'contado')),
  term_days               INTEGER NOT NULL DEFAULT 0 CHECK (term_days >= 0 AND term_days <= 365),
  payment_method          TEXT CHECK (payment_method IS NULL OR payment_method IN ('web', 'transfer', 'cash')),
  lines                   JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(lines) = 'array'),
  shipping                NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (shipping >= 0),
  total                   NUMERIC(14, 2) NOT NULL CHECK (total >= 0),
  notes                   TEXT,
  status                  TEXT NOT NULL DEFAULT 'borrador' CHECK (status IN ('borrador', 'emitida', 'error', 'anulada')),
  issue_date              DATE,
  due_date                DATE,
  siigo_invoice_id        TEXT,
  siigo_name              TEXT,
  siigo_status            TEXT,
  siigo_cufe              TEXT,
  siigo_public_url        TEXT,
  siigo_error             TEXT,
  created_by              UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One live invoice per order; annulled drafts do not count.
CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_invoices_order_live
  ON public.sales_invoices (order_id) WHERE status <> 'anulada';
CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_invoices_siigo_id
  ON public.sales_invoices (siigo_invoice_id) WHERE siigo_invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_invoices_status ON public.sales_invoices (status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.invoice_payments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id         UUID NOT NULL REFERENCES public.sales_invoices(id) ON DELETE CASCADE,
  payment_date       DATE NOT NULL,
  amount             NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  method             TEXT NOT NULL CHECK (method IN ('web', 'transfer', 'cash')),
  notes              TEXT,
  siigo_status       TEXT NOT NULL DEFAULT 'pendiente' CHECK (siigo_status IN ('pendiente', 'enviado', 'error')),
  siigo_voucher_id   TEXT,
  siigo_voucher_name TEXT,
  siigo_error        TEXT,
  created_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice ON public.invoice_payments (invoice_id);

ALTER TABLE public.sales_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can manage sales invoices" ON public.sales_invoices;
CREATE POLICY "Admins can manage sales invoices" ON public.sales_invoices
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "Admins can manage invoice payments" ON public.invoice_payments;
CREATE POLICY "Admins can manage invoice payments" ON public.invoice_payments
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

ALTER TABLE public.siigo_sync_log DROP CONSTRAINT IF EXISTS siigo_sync_log_entity_check;
ALTER TABLE public.siigo_sync_log ADD CONSTRAINT siigo_sync_log_entity_check
  CHECK (entity IN ('invoice', 'customer', 'product', 'purchase', 'connection', 'voucher'));
