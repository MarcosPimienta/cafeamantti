-- ============================================================
-- Seed additional packaging inventory items
-- Date: 2026-09-21
-- ============================================================

INSERT INTO public.inventory (product_code, product_name, category, unit, current_stock, min_stock, notes)
VALUES
    ('EMP-BOLSA-65', 'Bolsa-65', 'empaque', 'unidad', 0, 50, 'Bolsa de empaque adicional'),
    ('EMP-BOLSA-BOUTIQUE-5', 'Bolsa-Boutique-5', 'empaque', 'unidad', 0, 50, 'Bolsa boutique 5'),
    ('EMP-BOLSA-BOUTIQUE-2', 'Bolsa-Boutique-2', 'empaque', 'unidad', 0, 50, 'Bolsa boutique 2')
ON CONFLICT (product_code) DO UPDATE SET
    product_name = EXCLUDED.product_name,
    category = EXCLUDED.category,
    unit = EXCLUDED.unit,
    min_stock = EXCLUDED.min_stock,
    notes = EXCLUDED.notes;
