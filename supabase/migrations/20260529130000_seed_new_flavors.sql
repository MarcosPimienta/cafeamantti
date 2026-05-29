-- ============================================================
-- Seed inventory items for Honey and Microlote flavors
-- Created: 2026-05-29
-- ============================================================

INSERT INTO public.inventory (product_code, product_name, category, unit, current_stock, min_stock)
VALUES
    -- Honey Process Limitado
    ('CAPG-HON-001',  'Café Pergamino - Honey',      'cafe',      'kg',     0, 10),
    ('CAFV-HON-001',  'Café Verde - Honey',          'cafe',      'kg',     0, 10),
    ('CAFT-HON-125G', 'Café Tostado Honey 125g',     'cafe',      'unidad', 0, 20),
    ('CAFT-HON-250G', 'Café Tostado Honey 250g',     'cafe',      'unidad', 0, 20),
    ('CAFT-HON-500G', 'Café Tostado Honey 500g',     'cafe',      'unidad', 0, 15),
    ('CAFT-HON-001',  'Café Tostado Honey KG',       'cafe',      'kg',     0, 10),

    -- Microlote del Mes
    ('CAPG-MIC-001',  'Café Pergamino - Microlote',  'cafe',      'kg',     0, 10),
    ('CAFV-MIC-001',  'Café Verde - Microlote',      'cafe',      'kg',     0, 10),
    ('CAFT-MIC-125G', 'Café Tostado Microlote 125g', 'cafe',      'unidad', 0, 20),
    ('CAFT-MIC-250G', 'Café Tostado Microlote 250g', 'cafe',      'unidad', 0, 20),
    ('CAFT-MIC-500G', 'Café Tostado Microlote 500g', 'cafe',      'unidad', 0, 15),
    ('CAFT-MIC-001',  'Café Tostado Microlote KG',   'cafe',      'kg',     0, 10)
ON CONFLICT (product_code) DO NOTHING;
