-- ============================================================
-- Combo KRUPS Coffee Crush Experience (tienda web)
-- Date: 2026-10-31
--
-- The KRUPS Coffee Crush machine as an inventory product (IVA 19 %). It
-- starts with no stock: the 20 machines come in when their purchase
-- invoice is registered in Compras. The web combo sells it with a 500 g
-- bag of Premium in beans, shipping free.
-- Safe to run more than once.
-- ============================================================

INSERT INTO public.inventory (product_code, product_name, category, unit, current_stock, min_stock, is_sellable, sales_tax_id, notes)
VALUES ('EQP-KRUPS-CC', 'Cafetera KRUPS Coffee Crush Experience', 'equipo', 'unidad', 0, 3, true, 9754, 'Ref. 8010001512. Se vende en la web en combo con 500 g de Café Premium en grano.')
ON CONFLICT (product_code) DO NOTHING;
