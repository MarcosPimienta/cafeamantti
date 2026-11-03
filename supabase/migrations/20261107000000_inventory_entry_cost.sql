-- ============================================================
-- Costo de cada entrada al inventario
-- Date: 2026-11-07
--
-- Every entrada of materia prima (café verde, pergamino…) and material
-- (bolsas, stickers, cajas…) carries what one stock unit cost, before IVA
-- ($/kg or $/unidad). The item's standard_cost (what Inventario → Costos
-- uses) becomes the weighted average of its costed entradas since the
-- September 2026 cutover (era v2). Entradas that came from a purchase
-- invoice (Compras) get their cost from the invoice line: base ÷ quantity.
-- Safe to run more than once.
-- ============================================================

ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS unit_cost NUMERIC CHECK (unit_cost IS NULL OR unit_cost >= 0);

-- Entradas from Compras: the invoice line says what they cost (before IVA).
UPDATE public.inventory_movements m
   SET unit_cost = round((line->>'base')::numeric / (line->>'inventory_qty')::numeric, 2)
  FROM public.purchase_bills b, jsonb_array_elements(b.lines) line
 WHERE m.purchase_bill_id = b.id
   AND m.unit_cost IS NULL
   AND line->>'inventory_id' = m.inventory_id::text
   AND coalesce((line->>'inventory_qty')::numeric, 0) > 0;

-- Standard cost = weighted average of the costed entradas since the cutover.
UPDATE public.inventory i
   SET standard_cost = round(c.avg_cost, 2)
  FROM (
    SELECT inventory_id, sum(quantity * unit_cost) / nullif(sum(quantity), 0) AS avg_cost
      FROM public.inventory_movements
     WHERE type = 'entrada' AND era = 'v2' AND unit_cost IS NOT NULL AND quantity > 0
     GROUP BY inventory_id
  ) c
 WHERE c.inventory_id = i.id AND c.avg_cost IS NOT NULL;
