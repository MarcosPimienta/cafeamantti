-- Migration: 20260731010000_seed_instant_coffee_inventory.sql
-- Description: Add Instant Coffee 2.5kg (Soluble / Liofilizado) product, packaging bag, label, and sticker to inventory.

INSERT INTO public.inventory (product_code, product_name, category, unit, current_stock, min_stock, notes)
VALUES
    -- Instant Coffee Product 2.5kg
    ('CAFS-2.5KG',          'Café Soluble Instantáneo 2.5kg',          'cafe',      'unidad', 0, 10, 'Café soluble liofilizado bulto 2.5kg'),

    -- Instant Coffee Packaging Bag 2.5kg
    ('EMP-BOLSA-SOL-2K5',  'Bolsa Café Instantáneo 2.5kg',            'empaque',   'unidad', 0, 50, 'Empaque doypack/bolsa para café instantáneo 2.5kg'),

    -- Instant Coffee Label & Sticker
    ('ETQ-SOL-2K5',        'Etiqueta Café Instantáneo 2.5kg',          'empaque',   'unidad', 0, 50, 'Etiqueta para café instantáneo 2.5kg'),
    ('STK-AMT-SOL',         'Sticker Café Instantáneo',                 'empaque',   'unidad', 0, 50, 'Sticker distintivo Café Soluble Instantáneo')
ON CONFLICT (product_code) DO UPDATE SET
    product_name = EXCLUDED.product_name,
    category = EXCLUDED.category,
    unit = EXCLUDED.unit,
    notes = EXCLUDED.notes;
