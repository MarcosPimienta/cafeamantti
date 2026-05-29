-- ============================================================
-- Seed inventory items for Honey, Microlote, and packing materials (bags & stickers)
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
    ('CAFT-MIC-001',  'Café Tostado Microlote KG',   'cafe',      'kg',     0, 10),

    -- Selection Amantti (Firma) Bags
    ('EMP-BOLSA-FIR-125G', 'Bolsa Selección Amantti 125g', 'empaque', 'unidad', 0, 50),
    ('EMP-BOLSA-FIR-250G', 'Bolsa Selección Amantti 250g', 'empaque', 'unidad', 0, 50),
    ('EMP-BOLSA-FIR-500G', 'Bolsa Selección Amantti 500g', 'empaque', 'unidad', 0, 50),
    ('EMP-BOLSA-FIR-2K5',  'Bolsa Selección Amantti 2.5kg', 'empaque', 'unidad', 0, 50),

    -- Honey Bags
    ('EMP-BOLSA-HON-125G', 'Bolsa Honey 125g',           'empaque', 'unidad', 0, 50),
    ('EMP-BOLSA-HON-250G', 'Bolsa Honey 250g',           'empaque', 'unidad', 0, 50),
    ('EMP-BOLSA-HON-500G', 'Bolsa Honey 500g',           'empaque', 'unidad', 0, 50),
    ('EMP-BOLSA-HON-2K5',  'Bolsa Honey 2.5kg',          'empaque', 'unidad', 0, 50),

    -- Microlote Bags
    ('EMP-BOLSA-MIC-125G', 'Bolsa Microlote 125g',       'empaque', 'unidad', 0, 50),
    ('EMP-BOLSA-MIC-250G', 'Bolsa Microlote 250g',       'empaque', 'unidad', 0, 50),
    ('EMP-BOLSA-MIC-500G', 'Bolsa Microlote 500g',       'empaque', 'unidad', 0, 50),
    ('EMP-BOLSA-MIC-2K5',  'Bolsa Microlote 2.5kg',      'empaque', 'unidad', 0, 50),

    -- Stickers
    ('STK-AMT-FIR', 'Sticker Selección Amantti', 'empaque', 'unidad', 0, 50),
    ('STK-AMT-HON', 'Sticker Honey Process',     'empaque', 'unidad', 0, 50),
    ('STK-AMT-MIC', 'Sticker Microlote',         'empaque', 'unidad', 0, 50)
ON CONFLICT (product_code) DO NOTHING;
