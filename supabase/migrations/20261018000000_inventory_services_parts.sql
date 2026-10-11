-- ============================================================
-- Inventario — servicios y repuestos, e IVA por producto
-- Date: 2026-10-18
--
-- servicio  mano de obra (mantenimiento, reparaciones, domicilio,
--           alquileres): se vende y se factura, pero NO tiene stock;
--           los pedidos no lo descuentan.
-- repuesto  piezas e insumos para reparar (empaques, duchetas,
--           filtros, mangueras…): tiene stock como cualquier producto.
--
-- sales_tax_id: IVA de Siigo para ese producto (café 5 %, servicios y
-- repuestos 19 %…). NULL = el IVA general de Ajustes → Siigo;
-- 0 = sin IVA (excluido).
-- ============================================================

ALTER TABLE public.inventory DROP CONSTRAINT IF EXISTS inventory_category_check;
ALTER TABLE public.inventory
  ADD CONSTRAINT inventory_category_check
  CHECK (category IN ('cafe', 'empaque', 'accesorio', 'equipo', 'enseres', 'repuesto', 'servicio'));

ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS sales_tax_id INTEGER CHECK (sales_tax_id IS NULL OR sales_tax_id >= 0);
