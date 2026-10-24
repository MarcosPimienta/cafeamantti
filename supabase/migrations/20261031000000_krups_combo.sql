-- ============================================================
-- Combo KRUPS Coffee Crush Experience (tienda web)
-- Date: 2026-10-31
--
-- The KRUPS Coffee Crush machine as a catalog product (IVA 19 %), so web
-- orders and their invoices carry it. It is sold on demand: IMUSA ships
-- each machine sold, so it has no stock and orders never move it (the app
-- knows it by its code, EQP-KRUPS-CC). The web combo sells it with a 500 g
-- bag of Premium in beans, shipping free, up to 20 combos.
-- Safe to run more than once.
-- ============================================================

INSERT INTO public.inventory (product_code, product_name, category, unit, current_stock, min_stock, is_sellable, sales_tax_id, notes)
VALUES ('EQP-KRUPS-CC', 'Cafetera KRUPS Coffee Crush Experience', 'equipo', 'unidad', 0, 0, true, 9754, 'Ref. 8010001512. Venta por pedido: IMUSA despacha cada máquina vendida (no lleva inventario). Se vende en la web en combo con 500 g de Café Premium en grano.')
ON CONFLICT (product_code) DO NOTHING;
