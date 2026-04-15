-- ============================================================
-- Seed: Historical Data from Google Sheets
-- Created: 2026-04-14
-- Tabs covered:
--   1. Maestro de Inventario  → UPDATE inventory min_stock / product_name
--   2. Trilla                 → production_batches + paired inventory_movements
--   3. Entrada                → inventory_movements (type=entrada, tab_source=entrada)
--   4. Prod_Consumo           → inventory_movements (type=salida,  tab_source=prod_consumo)
--   5. Prod_Alta              → inventory_movements (type=entrada, tab_source=prod_alta)
--   6. Salida                 → inventory_movements (type=salida,  tab_source=salida)
-- ============================================================

-- ============================================================
-- 0. Helper: ensure all product codes exist with correct names
--    (uses ON CONFLICT to upsert only name / min_stock)
-- ============================================================
INSERT INTO public.inventory (product_code, product_name, category, unit, current_stock, min_stock)
VALUES
    ('CAPG-001',  'Café Pergamino',                      'cafe',      'kg',     0, 100),
    ('CAFV-001',  'Café Verde',                          'cafe',      'kg',     0, 100),
    ('CAFT-125G', 'Café Tostado 125g (Grano/Molido)',   'cafe',      'unidad', 0,   0),
    ('CAFT-250G', 'Café Tostado 250g (Grano/Molido)',   'cafe',      'unidad', 0,  20),
    ('CAFT-500G', 'Café Tostado 500g (Grano/Molido)',   'cafe',      'unidad', 0,  15),
    ('CAFT-2K5',  'Café Tostado 2.5kg (Grano/Molido)',  'cafe',      'unidad', 0,   5),
    ('CAFT-001',  'Café Tostado KG',                    'cafe',      'kg',     0, 100),
    ('EMP-BOLSA', 'Bolsa Empaque',                      'empaque',   'unidad', 0,  50),
    ('ETQ-CAFE',  'Etiqueta Café',                      'empaque',   'unidad', 0,  50),
    ('STK-AMT',   'Stickers Amantti',                   'empaque',   'unidad', 0,  30),
    ('POC-001',   'Pocillo',                            'accesorio', 'unidad', 0,  10),
    ('SACF-001',  'Sacos de fique',                     'empaque',   'unidad', 0,   0)
ON CONFLICT (product_code) DO UPDATE
    SET product_name = EXCLUDED.product_name,
        min_stock    = EXCLUDED.min_stock;

-- ============================================================
-- 1. Trilla (Milling batches)
--    Each row → 1 production_batch + 2 inventory_movements
--    (salida de CAPG-001  +  entrada de CAFV-001)
-- ============================================================
DO $$
DECLARE
    v_capg UUID;
    v_cafv UUID;
    v_batch_id UUID;
BEGIN
    SELECT id INTO v_capg FROM public.inventory WHERE product_code = 'CAPG-001';
    SELECT id INTO v_cafv FROM public.inventory WHERE product_code = 'CAFV-001';

    -- Row 1 — 2025-01-22
    INSERT INTO public.production_batches
        (process_type, input_inventory_id, input_quantity_kg, output_inventory_id, output_quantity_kg, weight_loss_pct, movement_date, rendimiento_pct)
    VALUES ('trilla', v_capg, 287.9, v_cafv, 211.6065, 0.265, '2025-01-22', 0.735)
    RETURNING id INTO v_batch_id;
    INSERT INTO public.inventory_movements (inventory_id, type, quantity, reason, movement_date, tab_source)
    VALUES (v_capg, 'salida',  287,    'Trilla 2025-01-22', '2025-01-22', 'trilla'),
           (v_cafv, 'entrada', 212,    'Trilla 2025-01-22 – rendimiento 73.5%', '2025-01-22', 'trilla');

    -- Row 2 — 2025-02-04
    INSERT INTO public.production_batches
        (process_type, input_inventory_id, input_quantity_kg, output_inventory_id, output_quantity_kg, weight_loss_pct, movement_date, rendimiento_pct)
    VALUES ('trilla', v_capg, 103.8, v_cafv, 76.293, 0.265, '2025-02-04', 0.735)
    RETURNING id INTO v_batch_id;
    INSERT INTO public.inventory_movements (inventory_id, type, quantity, reason, movement_date, tab_source)
    VALUES (v_capg, 'salida',  104, 'Trilla 2025-02-04', '2025-02-04', 'trilla'),
           (v_cafv, 'entrada',  76, 'Trilla 2025-02-04 – rendimiento 73.5%', '2025-02-04', 'trilla');

    -- Row 3 — 2025-03-14
    INSERT INTO public.production_batches
        (process_type, input_inventory_id, input_quantity_kg, output_inventory_id, output_quantity_kg, weight_loss_pct, movement_date, rendimiento_pct)
    VALUES ('trilla', v_capg, 89.5, v_cafv, 65.7825, 0.265, '2025-03-14', 0.735)
    RETURNING id INTO v_batch_id;
    INSERT INTO public.inventory_movements (inventory_id, type, quantity, reason, movement_date, tab_source)
    VALUES (v_capg, 'salida',  90, 'Trilla 2025-03-14', '2025-03-14', 'trilla'),
           (v_cafv, 'entrada',  66, 'Trilla 2025-03-14 – rendimiento 73.5%', '2025-03-14', 'trilla');

    -- Row 4 — 2025-05-09
    INSERT INTO public.production_batches
        (process_type, input_inventory_id, input_quantity_kg, output_inventory_id, output_quantity_kg, weight_loss_pct, movement_date, rendimiento_pct)
    VALUES ('trilla', v_capg, 84.6, v_cafv, 62.181, 0.265, '2025-05-09', 0.735)
    RETURNING id INTO v_batch_id;
    INSERT INTO public.inventory_movements (inventory_id, type, quantity, reason, movement_date, tab_source)
    VALUES (v_capg, 'salida',  85, 'Trilla 2025-05-09', '2025-05-09', 'trilla'),
           (v_cafv, 'entrada',  62, 'Trilla 2025-05-09 – rendimiento 73.5%', '2025-05-09', 'trilla');

    -- Row 5 — 2025-05-14
    INSERT INTO public.production_batches
        (process_type, input_inventory_id, input_quantity_kg, output_inventory_id, output_quantity_kg, weight_loss_pct, movement_date, rendimiento_pct)
    VALUES ('trilla', v_capg, 52, v_cafv, 38.22, 0.265, '2025-05-14', 0.735)
    RETURNING id INTO v_batch_id;
    INSERT INTO public.inventory_movements (inventory_id, type, quantity, reason, movement_date, tab_source)
    VALUES (v_capg, 'salida',  52, 'Trilla 2025-05-14', '2025-05-14', 'trilla'),
           (v_cafv, 'entrada',  38, 'Trilla 2025-05-14 – rendimiento 73.5%', '2025-05-14', 'trilla');

    -- Row 6 — 2025-05-28
    INSERT INTO public.production_batches
        (process_type, input_inventory_id, input_quantity_kg, output_inventory_id, output_quantity_kg, weight_loss_pct, movement_date, rendimiento_pct)
    VALUES ('trilla', v_capg, 69, v_cafv, 50.715, 0.265, '2025-05-28', 0.735)
    RETURNING id INTO v_batch_id;
    INSERT INTO public.inventory_movements (inventory_id, type, quantity, reason, movement_date, tab_source)
    VALUES (v_capg, 'salida',  69, 'Trilla 2025-05-28', '2025-05-28', 'trilla'),
           (v_cafv, 'entrada',  51, 'Trilla 2025-05-28 – rendimiento 73.5%', '2025-05-28', 'trilla');

    -- Row 7 — 2025-06-06
    INSERT INTO public.production_batches
        (process_type, input_inventory_id, input_quantity_kg, output_inventory_id, output_quantity_kg, weight_loss_pct, movement_date, rendimiento_pct)
    VALUES ('trilla', v_capg, 390.9, v_cafv, 287.3115, 0.265, '2025-06-06', 0.735)
    RETURNING id INTO v_batch_id;
    INSERT INTO public.inventory_movements (inventory_id, type, quantity, reason, movement_date, tab_source)
    VALUES (v_capg, 'salida',  391, 'Trilla 2025-06-06', '2025-06-06', 'trilla'),
           (v_cafv, 'entrada',  287, 'Trilla 2025-06-06 – rendimiento 73.5%', '2025-06-06', 'trilla');

    -- Row 8 — 2025-07-17
    INSERT INTO public.production_batches
        (process_type, input_inventory_id, input_quantity_kg, output_inventory_id, output_quantity_kg, weight_loss_pct, movement_date, rendimiento_pct)
    VALUES ('trilla', v_capg, 215.9, v_cafv, 158.6865, 0.265, '2025-07-17', 0.735)
    RETURNING id INTO v_batch_id;
    INSERT INTO public.inventory_movements (inventory_id, type, quantity, reason, movement_date, tab_source)
    VALUES (v_capg, 'salida',  216, 'Trilla 2025-07-17', '2025-07-17', 'trilla'),
           (v_cafv, 'entrada',  159, 'Trilla 2025-07-17 – rendimiento 73.5%', '2025-07-17', 'trilla');

    -- Row 9 — 2025-07-25
    INSERT INTO public.production_batches
        (process_type, input_inventory_id, input_quantity_kg, output_inventory_id, output_quantity_kg, weight_loss_pct, movement_date, rendimiento_pct)
    VALUES ('trilla', v_capg, 251.3, v_cafv, 184.7055, 0.265, '2025-07-25', 0.735)
    RETURNING id INTO v_batch_id;
    INSERT INTO public.inventory_movements (inventory_id, type, quantity, reason, movement_date, tab_source)
    VALUES (v_capg, 'salida',  251, 'Trilla 2025-07-25', '2025-07-25', 'trilla'),
           (v_cafv, 'entrada',  185, 'Trilla 2025-07-25 – rendimiento 73.5%', '2025-07-25', 'trilla');

    -- Row 10 — 2025-08-14
    INSERT INTO public.production_batches
        (process_type, input_inventory_id, input_quantity_kg, output_inventory_id, output_quantity_kg, weight_loss_pct, movement_date, rendimiento_pct)
    VALUES ('trilla', v_capg, 322, v_cafv, 236.67, 0.265, '2025-08-14', 0.735)
    RETURNING id INTO v_batch_id;
    INSERT INTO public.inventory_movements (inventory_id, type, quantity, reason, movement_date, tab_source)
    VALUES (v_capg, 'salida',  322, 'Trilla 2025-08-14', '2025-08-14', 'trilla'),
           (v_cafv, 'entrada',  237, 'Trilla 2025-08-14 – rendimiento 73.5%', '2025-08-14', 'trilla');

    -- Row 11 — 2025-08-20
    INSERT INTO public.production_batches
        (process_type, input_inventory_id, input_quantity_kg, output_inventory_id, output_quantity_kg, weight_loss_pct, movement_date, rendimiento_pct)
    VALUES ('trilla', v_capg, 280.4, v_cafv, 206.094, 0.265, '2025-08-20', 0.735)
    RETURNING id INTO v_batch_id;
    INSERT INTO public.inventory_movements (inventory_id, type, quantity, reason, movement_date, tab_source)
    VALUES (v_capg, 'salida',  280, 'Trilla 2025-08-20', '2025-08-20', 'trilla'),
           (v_cafv, 'entrada',  206, 'Trilla 2025-08-20 – rendimiento 73.5%', '2025-08-20', 'trilla');

    -- Row 12 — 2025-09-10 (a)
    INSERT INTO public.production_batches
        (process_type, input_inventory_id, input_quantity_kg, output_inventory_id, output_quantity_kg, weight_loss_pct, movement_date, rendimiento_pct)
    VALUES ('trilla', v_capg, 98, v_cafv, 72.03, 0.265, '2025-09-10', 0.735)
    RETURNING id INTO v_batch_id;
    INSERT INTO public.inventory_movements (inventory_id, type, quantity, reason, movement_date, tab_source)
    VALUES (v_capg, 'salida',  98, 'Trilla 2025-09-10 (a)', '2025-09-10', 'trilla'),
           (v_cafv, 'entrada',  72, 'Trilla 2025-09-10 (a) – rendimiento 73.5%', '2025-09-10', 'trilla');

    -- Row 13 — 2025-09-10 (b)
    INSERT INTO public.production_batches
        (process_type, input_inventory_id, input_quantity_kg, output_inventory_id, output_quantity_kg, weight_loss_pct, movement_date, rendimiento_pct)
    VALUES ('trilla', v_capg, 285, v_cafv, 209.475, 0.265, '2025-09-10', 0.735)
    RETURNING id INTO v_batch_id;
    INSERT INTO public.inventory_movements (inventory_id, type, quantity, reason, movement_date, tab_source)
    VALUES (v_capg, 'salida',  285, 'Trilla 2025-09-10 (b)', '2025-09-10', 'trilla'),
           (v_cafv, 'entrada',  209, 'Trilla 2025-09-10 (b) – rendimiento 73.5%', '2025-09-10', 'trilla');

    -- Row 14 — 2025-10-10
    INSERT INTO public.production_batches
        (process_type, input_inventory_id, input_quantity_kg, output_inventory_id, output_quantity_kg, weight_loss_pct, movement_date, rendimiento_pct)
    VALUES ('trilla', v_capg, 374, v_cafv, 274.89, 0.265, '2025-10-10', 0.735)
    RETURNING id INTO v_batch_id;
    INSERT INTO public.inventory_movements (inventory_id, type, quantity, reason, movement_date, tab_source)
    VALUES (v_capg, 'salida',  374, 'Trilla 2025-10-10', '2025-10-10', 'trilla'),
           (v_cafv, 'entrada',  275, 'Trilla 2025-10-10 – rendimiento 73.5%', '2025-10-10', 'trilla');

    -- Row 15 — 2025-11-13
    INSERT INTO public.production_batches
        (process_type, input_inventory_id, input_quantity_kg, output_inventory_id, output_quantity_kg, weight_loss_pct, movement_date, rendimiento_pct)
    VALUES ('trilla', v_capg, 250.8, v_cafv, 184.338, 0.265, '2025-11-13', 0.735)
    RETURNING id INTO v_batch_id;
    INSERT INTO public.inventory_movements (inventory_id, type, quantity, reason, movement_date, tab_source)
    VALUES (v_capg, 'salida',  251, 'Trilla 2025-11-13', '2025-11-13', 'trilla'),
           (v_cafv, 'entrada',  184, 'Trilla 2025-11-13 – rendimiento 73.5%', '2025-11-13', 'trilla');
END $$;

-- ============================================================
-- 2. Entrada de Materia Prima / Materiales
-- ============================================================
INSERT INTO public.inventory_movements
    (inventory_id, type, quantity, reason, lote, movement_date, responsable, tab_source)
SELECT
    inv.id,
    'entrada',
    src.qty,
    'Compra' || CASE WHEN src.proveedor IS NOT NULL THEN ' – ' || src.proveedor ELSE '' END,
    src.lote,
    src.mov_date,
    src.responsable,
    'entrada'
FROM (VALUES
    -- date           product_code   qty     lote               proveedor              responsable
    ('2025-01-24'::date,'CAPG-001', 287.9, 'L2025-01-P00', NULL,                    'Daniel'),
    ('2025-01-07'::date,'CAFV-001',  70,   'L2025-01-V00', NULL,                    'Daniel'),
    ('2025-02-03'::date,'CAPG-001', 103.8, 'L2025-02-P00', NULL,                    'Daniel'),
    ('2025-02-24'::date,'CAFV-001',  56.8, 'L2025-02-V00', NULL,                    'Daniel'),
    ('2025-02-26'::date,'CAFV-001', 418.4, 'L2025-02-V01', NULL,                    'Daniel'),
    ('2025-03-07'::date,'CAPG-001',  89.5, 'L2025-03-P00', NULL,                    'Daniel'),
    ('2025-05-02'::date,'CAPG-001', 124,   'L2025-05-P00', NULL,                    'Daniel'),
    ('2025-05-08'::date,'CAPG-001',  70,   'L2025-05-P01', NULL,                    'Daniel'),
    ('2025-07-03'::date,'CAPG-001', 395.3, 'L2025-07-P00', NULL,                    'Daniel'),
    ('2025-07-10'::date,'CAPG-001', 215,   'L2025-07-P01', NULL,                    'Daniel'),
    ('2025-07-18'::date,'CAPG-001', 251.3, 'L2025-07-P02', NULL,                    'Daniel'),
    ('2025-08-08'::date,'CAPG-001', 322,   'L2025-08-P00', NULL,                    'Daniel'),
    ('2025-08-12'::date,'EMP-BOLSA',500,    NULL,           'Proveedor XYZ',         'Laura'),
    ('2025-08-12'::date,'ETQ-CAFE', 500,    NULL,           'Proveedor XYZ',         'Laura'),
    ('2025-08-13'::date,'STK-AMT',  200,    NULL,           'Proveedor XYZ',         'Laura'),
    ('2025-08-13'::date,'POC-001',   63,    NULL,           'IKEA',                  'Laura'),
    ('2025-08-19'::date,'CAPG-001', 280.4, 'L2025-08-P00', 'Amarella',              'Laura'),
    ('2025-09-10'::date,'CAPG-001',  98,   'L2025-09-P00', 'Daniel Ospina',         'Daniel Ospina'),
    ('2025-09-10'::date,'CAPG-001', 285,   'L2025-09-P01', 'Daniel Ospina',         'Daniel Ospina'),
    ('2025-10-10'::date,'CAPG-001', 374,   'L2025-10-P01', 'Daniel Ospina',         'Daniel Ospina'),
    ('2025-11-11'::date,'CAPG-001', 250.8, 'L2025-11-P00', 'Daniel Ospina',         'Daniel Ospina')
) AS src(mov_date, product_code, qty, lote, proveedor, responsable)
JOIN public.inventory inv ON inv.product_code = src.product_code;
-- Note: the 0-qty CAFV-001/Amarella row from Aug 11 is excluded (no real stock movement)

-- ============================================================
-- 3. Prod_Consumo (Raw material consumed during production)
-- ============================================================
INSERT INTO public.inventory_movements
    (inventory_id, type, quantity, reason, movement_date, entry_type, responsable, tab_source)
SELECT
    inv.id,
    'salida',
    src.qty,
    'Consumo producción',
    src.mov_date,
    src.entry_type,
    src.responsable,
    'prod_consumo'
FROM (VALUES
    -- Jan
    ('2025-01-10'::date,'CAFV-001',  12,'MP',  NULL),
    ('2025-01-10'::date,'EMP-BOLSA',  4,'MAT', NULL),
    ('2025-01-10'::date,'ETQ-CAFE',   4,'MAT', NULL),
    ('2025-01-20'::date,'CAFV-001',  24,'MP',  'Daniel'),
    ('2025-01-20'::date,'EMP-BOLSA', 10,'MAT', 'Daniel'),
    ('2025-01-20'::date,'ETQ-CAFE',  10,'MAT', 'Daniel'),
    ('2025-01-24'::date,'CAFV-001',  60,'MP',  NULL),
    ('2025-01-24'::date,'EMP-BOLSA', 24,'MAT', NULL),
    ('2025-01-24'::date,'ETQ-CAFE',  24,'MAT', NULL),
    ('2025-01-31'::date,'CAFV-001',  48,'MP',  NULL),
    ('2025-01-31'::date,'EMP-BOLSA', 19,'MAT', NULL),
    ('2025-01-31'::date,'ETQ-CAFE',  19,'MAT', NULL),
    -- Feb
    ('2025-02-12'::date,'CAFV-001',  60,'MP',  NULL),
    ('2025-02-12'::date,'EMP-BOLSA', 24,'MAT', NULL),
    ('2025-02-12'::date,'ETQ-CAFE',  24,'MAT', NULL),
    ('2025-02-28'::date,'CAFV-001',  60,'MP',  NULL),
    ('2025-02-28'::date,'EMP-BOLSA', 24,'MAT', NULL),
    ('2025-02-28'::date,'ETQ-CAFE',  24,'MAT', NULL),
    -- Mar
    ('2025-03-05'::date,'CAFV-001',  60,'MP',  NULL),
    ('2025-03-05'::date,'EMP-BOLSA', 24,'MAT', NULL),
    ('2025-03-05'::date,'ETQ-CAFE',  24,'MAT', NULL),
    ('2025-03-14'::date,'CAFV-001',  96,'MP',  NULL),
    ('2025-03-14'::date,'EMP-BOLSA', 38,'MAT', NULL),
    ('2025-03-14'::date,'ETQ-CAFE',  38,'MAT', NULL),
    ('2025-03-20'::date,'CAFV-001',  90,'MP',  NULL),
    ('2025-03-20'::date,'EMP-BOLSA', 36,'MAT', NULL),
    ('2025-03-20'::date,'ETQ-CAFE',  36,'MAT', NULL),
    ('2025-03-28'::date,'CAFV-001',  72,'MP',  NULL),
    ('2025-03-28'::date,'EMP-BOLSA', 29,'MAT', NULL),
    ('2025-03-28'::date,'ETQ-CAFE',  29,'MAT', NULL),
    -- Apr
    ('2025-04-04'::date,'CAFV-001',  96,'MP',  NULL),
    ('2025-04-04'::date,'EMP-BOLSA', 38,'MAT', NULL),
    ('2025-04-04'::date,'ETQ-CAFE',  38,'MAT', NULL),
    ('2025-04-16'::date,'CAFV-001',  72,'MP',  NULL),
    ('2025-04-16'::date,'EMP-BOLSA', 29,'MAT', NULL),
    ('2025-04-16'::date,'ETQ-CAFE',  29,'MAT', NULL),
    -- May
    ('2025-05-07'::date,'CAFV-001',  36,'MP',  NULL),
    ('2025-05-07'::date,'EMP-BOLSA', 14,'MAT', NULL),
    ('2025-05-07'::date,'ETQ-CAFE',  14,'MAT', NULL),
    ('2025-05-09'::date,'CAFV-001',  48,'MP',  NULL),
    ('2025-05-09'::date,'EMP-BOLSA', 19,'MAT', NULL),
    ('2025-05-09'::date,'ETQ-CAFE',  19,'MAT', NULL),
    ('2025-05-14'::date,'CAFV-001',   4,'MP',  NULL),
    ('2025-05-14'::date,'EMP-BOLSA',  2,'MAT', NULL),
    ('2025-05-14'::date,'ETQ-CAFE',   2,'MAT', NULL),
    ('2025-05-15'::date,'CAFV-001',  60,'MP',  NULL),
    ('2025-05-15'::date,'EMP-BOLSA', 24,'MAT', NULL),
    ('2025-05-15'::date,'ETQ-CAFE',  24,'MAT', NULL),
    ('2025-05-28'::date,'CAFV-001',  18,'MP',  NULL),
    ('2025-05-28'::date,'EMP-BOLSA',  7,'MAT', NULL),
    ('2025-05-28'::date,'ETQ-CAFE',   7,'MAT', NULL),
    -- Jun
    ('2025-06-06'::date,'CAFV-001',  49,'MP',  NULL),
    ('2025-06-06'::date,'EMP-BOLSA', 19,'MAT', NULL),
    ('2025-06-06'::date,'ETQ-CAFE',  19,'MAT', NULL),
    ('2025-06-16'::date,'CAFV-001',  72,'MP',  NULL),
    ('2025-06-16'::date,'EMP-BOLSA', 28,'MAT', NULL),
    ('2025-06-16'::date,'ETQ-CAFE',  28,'MAT', NULL),
    ('2025-06-24'::date,'CAFV-001',  48,'MP',  NULL),
    ('2025-06-24'::date,'EMP-BOLSA', 19,'MP',  NULL),
    ('2025-06-24'::date,'ETQ-CAFE',  19,'MP',  NULL),
    ('2025-06-26'::date,'CAFV-001',  72,'MP',  NULL),
    ('2025-06-26'::date,'EMP-BOLSA', 29,'MP',  NULL),
    ('2025-06-26'::date,'ETQ-CAFE',  29,'MP',  NULL),
    -- Jul
    ('2025-07-04'::date,'CAFV-001',  60,'MP',  NULL),
    ('2025-07-04'::date,'EMP-BOLSA', 24,'MAT', NULL),
    ('2025-07-04'::date,'ETQ-CAFE',  24,'MAT', NULL),
    ('2025-07-14'::date,'CAFV-001',  24,'MP',  NULL),
    ('2025-07-14'::date,'EMP-BOLSA',  9,'MAT', NULL),
    ('2025-07-14'::date,'ETQ-CAFE',   9,'MAT', NULL),
    ('2025-07-17'::date,'CAFV-001',  72,'MP',  NULL),
    ('2025-07-17'::date,'EMP-BOLSA', 29,'MAT', NULL),
    ('2025-07-17'::date,'ETQ-CAFE',  29,'MAT', NULL),
    ('2025-07-25'::date,'CAFV-001',  84,'MP',  NULL),
    ('2025-07-25'::date,'EMP-BOLSA', 33,'MAT', NULL),
    ('2025-07-25'::date,'ETQ-CAFE',  33,'MAT', NULL),
    -- Aug
    ('2025-08-06'::date,'CAFV-001',  84,'MP',  NULL),
    ('2025-08-06'::date,'EMP-BOLSA', 33,'MAT', NULL),
    ('2025-08-06'::date,'ETQ-CAFE',  33,'MAT', NULL),
    ('2025-08-14'::date,'CAFV-001',  84,'MP',  NULL),
    ('2025-08-14'::date,'EMP-BOLSA', 33,'MAT', NULL),
    ('2025-08-14'::date,'ETQ-CAFE',  33,'MAT', NULL),
    ('2025-08-20'::date,'CAFV-001',  72,'MP',  'Daniel'),
    ('2025-08-20'::date,'EMP-BOLSA', 28,'MAT', 'Daniel'),
    ('2025-08-20'::date,'ETQ-CAFE',  28,'MAT', 'Daniel'),
    ('2025-08-27'::date,'CAFV-001',  96,'MP',  'Daniel'),
    ('2025-08-27'::date,'EMP-BOLSA', 36,'MP',  NULL),
    ('2025-08-27'::date,'ETQ-CAFE',  36,'MAT', NULL),
    -- Sep
    ('2025-09-04'::date,'CAFV-001',  72,'MP',  NULL),
    ('2025-09-04'::date,'EMP-BOLSA', 22,'MAT', NULL),
    ('2025-09-04'::date,'ETQ-CAFE',  22,'MAT', NULL),
    ('2025-09-11'::date,'CAFV-001',  84,'MP',  NULL),
    ('2025-09-11'::date,'EMP-BOLSA', 34,'MAT', NULL),
    ('2025-09-11'::date,'ETQ-CAFE',  34,'MAT', NULL),
    ('2025-09-17'::date,'CAFV-001',  96,'MP',  NULL),
    ('2025-09-17'::date,'EMP-BOLSA', 38,'MAT', NULL),
    ('2025-09-17'::date,'ETQ-CAFE',  38,'MAT', NULL),
    ('2025-09-25'::date,'CAFV-001',  96,'MP',  NULL),
    ('2025-09-25'::date,'EMP-BOLSA', 38,'MAT', NULL),
    ('2025-09-25'::date,'ETQ-CAFE',  38,'MAT', NULL),
    -- Oct
    ('2025-10-06'::date,'CAFV-001',  32,'MP',  NULL),
    ('2025-10-06'::date,'EMP-BOLSA', 12,'MAT', NULL),
    ('2025-10-06'::date,'EMP-BOLSA', 12,'MAT', NULL),   -- duplicate row from sheet
    ('2025-10-16'::date,'CAFV-001',  96,'MP',  NULL),
    ('2025-10-16'::date,'EMP-BOLSA', 38,'MP',  NULL),
    ('2025-10-16'::date,'ETQ-CAFE',  38,'MP',  NULL),
    ('2025-10-24'::date,'CAFV-001',  84,'MAT', NULL),
    ('2025-10-24'::date,'EMP-BOLSA', 33,'MAT', NULL),
    ('2025-10-24'::date,'ETQ-CAFE',  33,'MAT', NULL),
    ('2025-10-31'::date,'CAFV-001',  96,'MP',  NULL),
    ('2025-10-31'::date,'EMP-BOLSA', 38,'MAT', NULL),
    ('2025-10-31'::date,'ETQ-CAFE',  38,'MAT', NULL),
    -- Nov
    ('2025-11-07'::date,'CAFV-001',  24,'MP',  NULL),
    ('2025-11-07'::date,'EMP-BOLSA',  9,'MAT', NULL),
    ('2025-11-07'::date,'ETQ-CAFE',   9,'MAT', NULL)
) AS src(mov_date, product_code, qty, entry_type, responsable)
JOIN public.inventory inv ON inv.product_code = src.product_code;

-- ============================================================
-- 4. Prod_Alta (Finished goods produced)
-- ============================================================
INSERT INTO public.inventory_movements
    (inventory_id, type, quantity, reason, movement_date, responsable, tab_source)
SELECT
    inv.id,
    'entrada',
    src.qty,
    COALESCE('Producción – Lote ' || src.lote, 'Alta de producción'),
    src.mov_date,
    src.responsable,
    'prod_alta'
FROM (VALUES
    ('2025-01-20'::date,'CAFT-2K5',  10,'L2025-01-T0','Amarella'),
    ('2025-01-20'::date,'EMP-BOLSA', 10, NULL,         NULL),
    ('2025-01-24'::date,'CAFT-2K5',  24,'L2025-01-T1','Amarella'),
    ('2025-01-24'::date,'EMP-BOLSA', 24, NULL,         NULL),
    ('2025-01-31'::date,'CAFT-2K5',  19,'L2025-01-T2','Amarella'),
    ('2025-01-31'::date,'EMP-BOLSA', 19, NULL,         NULL),
    ('2025-02-12'::date,'CAFT-2K5',  24,'L2025-02-T0','Amarella'),
    ('2025-02-12'::date,'EMP-BOLSA', 24, NULL,         NULL),
    ('2025-02-28'::date,'CAFT-2K5',  24,'L2025-02-T1','Amarella'),
    ('2025-02-28'::date,'EMP-BOLSA', 24, NULL,         NULL),
    ('2025-03-05'::date,'CAFT-2K5',  24,'L2025-03-T0','Amarella'),
    ('2025-03-05'::date,'EMP-BOLSA', 24, NULL,         NULL),
    ('2025-03-14'::date,'CAFT-2K5',  38,'L2025-03-T1','Amarella'),
    ('2025-03-14'::date,'EMP-BOLSA', 38, NULL,         NULL),
    ('2025-04-04'::date,'CAFT-2K5',  38,'L2025-04-T0','Amarella'),
    ('2025-04-04'::date,'EMP-BOLSA', 38, NULL,         NULL),
    ('2025-04-16'::date,'CAFT-2K5',  28,'L2025-04-T1','Amarella'),
    ('2025-04-16'::date,'EMP-BOLSA', 28, NULL,         NULL),
    ('2025-05-07'::date,'CAFT-2K5',  14,'L2025-05-T0','Amarella'),
    ('2025-05-07'::date,'EMP-BOLSA', 14, NULL,         NULL),
    ('2025-05-09'::date,'CAFT-2K5',  19,'L2025-05-T1','Amarella'),
    ('2025-05-09'::date,'EMP-BOLSA', 19, NULL,         NULL),
    ('2025-05-14'::date,'CAFT-2K5',   4,'L2025-05-T1','Luces del cielo'),
    ('2025-05-14'::date,'EMP-BOLSA',  1, NULL,         NULL),
    ('2025-05-15'::date,'CAFT-2K5',  24,'L2025-05-T2','Amarella'),
    ('2025-05-15'::date,'EMP-BOLSA', 24, NULL,         NULL),
    ('2025-05-28'::date,'CAFT-2K5',  18,'L2025-05-T3','Luces del cielo'),
    ('2025-05-28'::date,'EMP-BOLSA',  7, NULL,         NULL),
    ('2025-06-06'::date,'CAFT-2K5',  19,'L2025-06-T0','Amarella'),
    ('2025-06-06'::date,'EMP-BOLSA', 19, NULL,         NULL),
    ('2025-06-16'::date,'CAFT-2K5',  28,'L2025-06-T1','Amarella'),
    ('2025-06-16'::date,'EMP-BOLSA', 28, NULL,         NULL),
    ('2025-06-24'::date,'CAFT-2K5',  19,'L2025-06-T2','Amarella'),
    ('2025-06-24'::date,'EMP-BOLSA', 19, NULL,         NULL),
    ('2025-07-04'::date,'CAFT-2K5',  24,'L2025-07-T0','Amarella'),
    ('2025-07-04'::date,'EMP-BOLSA', 24, NULL,         NULL),
    ('2025-07-14'::date,'CAFT-2K5',   9,'L2025-07-T1','Amarella'),
    ('2025-07-14'::date,'EMP-BOLSA',  9, NULL,         NULL),
    ('2025-07-17'::date,'CAFT-2K5',  28,'L2025-07-T2','Amarella'),
    ('2025-07-17'::date,'EMP-BOLSA', 28, NULL,         NULL),
    ('2025-07-25'::date,'CAFT-2K5',  33,'L2025-07-T3','Amarella'),
    ('2025-07-25'::date,'EMP-BOLSA', 33, NULL,         NULL),
    ('2025-08-06'::date,'CAFT-2K5',  33,'L2025-08-T0','Amarella'),
    ('2025-08-06'::date,'EMP-BOLSA', 33, NULL,         NULL),
    ('2025-08-14'::date,'CAFT-2K5',  33,'L2025-08-T1','Amarella'),
    ('2025-08-14'::date,'EMP-BOLSA', 33, NULL,         NULL),
    ('2025-08-20'::date,'CAFT-2K5',  28,'L2025-08-T2','Amarella'),
    ('2025-08-20'::date,'EMP-BOLSA', 28, NULL,         NULL),
    ('2025-08-27'::date,'CAFT-2K5',  36,'L2025-08-T3','Amarella'),
    ('2025-08-20'::date,'EMP-BOLSA', 36, NULL,         NULL),   -- date from sheet
    ('2025-09-04'::date,'CAFT-2K5',  22,'L2025-09-T0','Amarella'),
    ('2025-09-04'::date,'EMP-BOLSA', 22, NULL,         NULL),
    ('2025-09-17'::date,'CAFT-2K5',  38, NULL,         NULL),
    ('2025-09-17'::date,'EMP-BOLSA', 38, NULL,         NULL),
    ('2025-09-25'::date,'CAFT-2K5',  38,'L2025-09-T1', NULL),
    ('2025-09-25'::date,'EMP-BOLSA', 38, NULL,         NULL),
    ('2025-10-06'::date,'CAFT-2K5',  12,'L2025-09-T2', NULL),
    ('2025-10-06'::date,'EMP-BOLSA', 12, NULL,         NULL),
    ('2025-10-16'::date,'CAFT-2K5',  38,'L2025-10-T0', NULL),
    ('2025-10-16'::date,'EMP-BOLSA', 38, NULL,         NULL),
    ('2025-10-16'::date,'CAFT-2K5',  33,'L2025-10-T1', NULL),
    ('2025-10-16'::date,'EMP-BOLSA', 33, NULL,         NULL),
    ('2025-10-31'::date,'CAFT-2K5',  38,'L2025-10-T2', NULL),
    ('2025-10-31'::date,'EMP-BOLSA', 38, NULL,         NULL),
    ('2025-11-07'::date,'CAFT-2K5',   9,'L2025-11-T0', NULL),
    ('2025-11-07'::date,'EMP-BOLSA',  9, NULL,         NULL)
) AS src(mov_date, product_code, qty, lote, responsable)
JOIN public.inventory inv ON inv.product_code = src.product_code;

-- ============================================================
-- 5. Salida (Sales / exits)
--    Note: one row has qty='Mantenimiento*' — skipped (non-numeric)
-- ============================================================
INSERT INTO public.inventory_movements
    (inventory_id, type, quantity, reason, movement_date, responsable, tab_source)
SELECT
    inv.id,
    'salida',
    src.qty,
    'Venta – ' || src.cliente,
    src.mov_date,
    src.responsable,
    'salida'
FROM (VALUES
    ('2025-01-02'::date,'CAFT-2K5',  2,'Danilo Quintana Triviño',NULL),
    ('2025-01-02'::date,'CAFT-2K5',  4,'Niku Cartagena',         'Daniel'),
    ('2025-01-03'::date,'CAFT-2K5',  2,'Hojaldreria',            NULL),
    ('2025-01-04'::date,'CAFT-2K5',  1,'Steven Herrera',         NULL),
    ('2025-01-08'::date,'CAFT-2K5',  2,'Eleven two',             NULL),
    ('2025-01-10'::date,'CAFT-2K5',  4,'Niku Medellín',          NULL),
    ('2025-01-11'::date,'CAFT-2K5',  5,'Johana Bolivar',         NULL),
    ('2025-01-14'::date,'CAFT-2K5',  1,'Café Ferrocarril',       NULL),
    ('2025-01-14'::date,'CAFT-2K5',  4,'Enigma scape room',      NULL),
    ('2025-01-15'::date,'CAFT-2K5',  1,'Café Ferrocarril',       NULL),
    ('2025-01-15'::date,'CAFT-2K5',  1,'Danilo Quintana Triviño',NULL),
    ('2025-01-15'::date,'CAFT-2K5',  4,'Enigma scape room',      NULL),
    ('2025-01-16'::date,'CAFT-2K5',  2,'Café Ferrocarril',       NULL),
    ('2025-01-16'::date,'CAFT-2K5',  2,'Hojaldreria',            NULL),
    ('2025-01-17'::date,'CAFT-2K5',  2,'Corante/selvario',       NULL),
    ('2025-01-18'::date,'CAFT-2K5',  2,'Corante/selvario',       NULL),
    ('2025-01-18'::date,'CAFT-500G',20,'Sergio Velez',           NULL),
    ('2025-01-18'::date,'CAFT-250G',10,'Sergio Velez',           NULL),
    ('2025-01-20'::date,'CAFT-2K5',  1,'Café Ferrocarril',       NULL),
    ('2025-01-21'::date,'CAFT-2K5',  3,'Café Ferrocarril',       NULL),
    ('2025-01-23'::date,'CAFT-2K5',  3,'Profitness',             NULL),
    ('2025-01-25'::date,'CAFT-2K5',  4,'Iris Maria Estrada',     NULL),
    ('2025-01-25'::date,'CAFT-2K5',  1,'Las Cañitas',            NULL),
    ('2025-01-25'::date,'CAFT-2K5',  1,'Profitness',             NULL),
    ('2025-01-27'::date,'CAFT-2K5',  4,'Restaurante Maximo',     NULL),
    ('2025-01-28'::date,'CAFT-2K5',  6,'Cazuelitas',             NULL),
    ('2025-01-28'::date,'CAFT-2K5',  4,'Niku Cartagena',         NULL),
    ('2025-01-29'::date,'CAFT-250G',10,'Daniel Cuartas',         NULL),
    ('2025-01-29'::date,'CAFV-001',175,'Ferney Machado',          NULL),
    ('2025-01-30'::date,'SACF-001',11000,'Agricola Internacional Athena',NULL),
    ('2025-01-30'::date,'CAFT-2K5',  4,'Cazuelitas',             NULL),
    -- Feb
    ('2025-02-03'::date,'CAFT-2K5',  2,'Corante/selvario',       NULL),
    ('2025-02-03'::date,'CAFT-2K5',  2,'Hojaldreria',            NULL),
    ('2025-02-03'::date,'CAFT-2K5',  4,'Niku Medellín',          NULL),
    ('2025-02-04'::date,'CAFT-2K5',  3,'Café Ferrocarril',       NULL),
    ('2025-02-04'::date,'CAFT-2K5',  2,'Corante/selvario',       NULL),
    ('2025-02-04'::date,'CAFT-2K5',  2,'Hojaldreria',            NULL),
    ('2025-02-06'::date,'CAFT-2K5',  3,'Niku Medellín',          NULL),
    ('2025-02-07'::date,'CAFT-2K5',  1,'Daniel Ospina',          NULL),
    ('2025-02-10'::date,'CAFT-2K5',  3,'Profitness',             NULL),
    ('2025-02-12'::date,'CAFT-2K5',  9,'Nexus',                  NULL),
    ('2025-02-13'::date,'CAFT-2K5',  3,'Café Ferrocarril',       NULL),
    ('2025-02-14'::date,'CAFT-2K5',  3,'Danilo Quintana Triviño',NULL),
    ('2025-02-14'::date,'CAFT-2K5',  3,'Iris Maria Estrada',     NULL),
    ('2025-02-17'::date,'CAFT-2K5',  3,'Johana Bolivar',         NULL),
    ('2025-02-17'::date,'CAFT-2K5',  3,'Maximo',                 NULL),
    ('2025-02-19'::date,'CAFT-2K5',  1,'Eleven two',             NULL),
    ('2025-02-19'::date,'CAFT-2K5',  1,'Eleven two',             NULL),
    ('2025-02-24'::date,'CAFT-2K5',  2,'Hojaldreria',            NULL),
    ('2025-02-25'::date,'CAFT-2K5',  3,'Profitness',             NULL),
    ('2025-02-28'::date,'CAFT-2K5',  4,'Niku Cartagena',         NULL),
    -- Mar
    ('2025-03-01'::date,'CAFT-2K5',  3,'Maximo',                 NULL),
    ('2025-03-05'::date,'CAFT-2K5',  9,'Nexus',                  NULL),
    ('2025-03-10'::date,'CAFT-2K5',  1,'Corante/selvario',       NULL),
    ('2025-03-10'::date,'CAFT-2K5',  2,'Eleven two',             NULL),
    ('2025-03-11'::date,'CAFT-2K5',  3,'Café Ferrocarril',       NULL),
    ('2025-03-11'::date,'CAFT-2K5',  1,'Corante/selvario',       NULL),
    ('2025-03-12'::date,'CAFT-2K5',  2,'Hojaldreria',            NULL),
    ('2025-03-14'::date,'CAFT-2K5',  1,'Café Ferrocarril',       NULL),
    ('2025-03-18'::date,'CAFT-2K5',  3,'Cazuelitas',             NULL),
    ('2025-03-18'::date,'CAFT-2K5',  2,'Corante/selvario',       NULL),
    ('2025-03-18'::date,'CAFT-2K5',  5,'Nexus',                  NULL),
    ('2025-03-21'::date,'CAFT-2K5',  5,'Andres Ramirez',         NULL),
    ('2025-03-21'::date,'CAFT-250G',32,'Andres Ramirez',         NULL),
    ('2025-03-21'::date,'CAFT-500G', 8,'Andres Ramirez',         NULL),
    ('2025-03-21'::date,'CAFT-2K5',  1,'Las Cañitas',            NULL),
    ('2025-03-21'::date,'CAFT-2K5',  1,'Profitness',             NULL),
    ('2025-03-25'::date,'CAFT-2K5',  3,'Danilo Quintana Triviño',NULL),
    ('2025-03-25'::date,'CAFT-2K5',  4,'Nexus',                  NULL),
    ('2025-03-27'::date,'CAFT-2K5',  2,'Daniel Ospina',          NULL),
    ('2025-03-27'::date,'CAFT-2K5',  3,'Maximo',                 NULL),
    ('2025-03-27'::date,'CAFT-2K5',  6,'Nexus',                  NULL),
    ('2025-03-27'::date,'CAFT-2K5',  2,'Niku Medellín',          NULL),
    ('2025-03-27'::date,'CAFT-2K5',  2,'Profitness',             NULL),
    -- Apr
    ('2025-04-02'::date,'CAFT-2K5',  2,'Hojaldreria',            NULL),
    ('2025-04-02'::date,'CAFT-2K5',  3,'Johana Bolivar',         NULL),
    ('2025-04-02'::date,'CAFT-2K5',  3,'Nexus',                  NULL),
    ('2025-04-02'::date,'CAFT-2K5',  4,'Niku Cartagena',         NULL),
    ('2025-04-08'::date,'CAFT-2K5',  2,'Eleven two',             NULL),
    ('2025-04-08'::date,'CAFT-2K5',  6,'Nexus',                  NULL),
    ('2025-04-10'::date,'CAFT-2K5',  2,'Corante/selvario',       NULL),
    ('2025-04-10'::date,'CAFT-2K5',  1,'Daniel Cuartas',         NULL),
    ('2025-04-10'::date,'CAFT-2K5',  1,'Daniel Ospina',          NULL),
    ('2025-04-10'::date,'CAFT-2K5',  4,'Nexus',                  NULL),
    ('2025-04-10'::date,'CAFT-2K5',  3,'Profitness',             NULL),
    ('2025-04-14'::date,'CAFT-2K5',  3,'Café Ferrocarril',       NULL),
    ('2025-04-21'::date,'CAFT-2K5',  2,'Daniel Ospina',          NULL),
    ('2025-04-21'::date,'CAFT-2K5',  3,'Maximo',                 NULL),
    ('2025-04-21'::date,'CAFT-2K5',  4,'Maximo',                 NULL),
    ('2025-04-21'::date,'CAFT-2K5',  6,'Nexus',                  NULL),
    ('2025-04-21'::date,'CAFT-2K5',  6,'Niku Cartagena',         NULL),
    ('2025-04-21'::date,'CAFT-2K5',  2,'Niku Medellín',          NULL),
    ('2025-04-21'::date,'CAFT-2K5',  3,'Profitness',             NULL),
    ('2025-04-25'::date,'CAFT-2K5',  1,'Corante/selvario',       NULL),
    ('2025-04-25'::date,'CAFT-2K5',  1,'Felipe Gonzalez',        NULL),
    ('2025-04-25'::date,'CAFT-2K5',  5,'Nexus',                  NULL),
    ('2025-04-28'::date,'CAFT-2K5',  2,'Hojaldreria',            NULL),
    ('2025-04-28'::date,'CAFT-2K5',  4,'Nexus',                  NULL),
    -- May
    ('2025-05-01'::date,'CAFT-2K5',  3,'Café Ferrocarril',       NULL),
    ('2025-05-01'::date,'CAFT-2K5',  3,'Danilo Quintana Triviño',NULL),
    ('2025-05-06'::date,'CAFT-2K5',  1,'Las Cañitas',            NULL),
    ('2025-05-06'::date,'CAFT-2K5',  3,'Maximo',                 NULL),
    ('2025-05-06'::date,'CAFT-2K5',  6,'Nexus',                  NULL),
    ('2025-05-10'::date,'CAFT-2K5',  3,'Andres Ramirez',         NULL),
    ('2025-05-10'::date,'CAFT-2K5',  1,'Daniel Ospina',          NULL),
    ('2025-05-10'::date,'CAFT-2K5',  3,'Niku Medellín',          NULL),
    ('2025-05-10'::date,'CAFT-2K5',  3,'Profitness',             NULL),
    ('2025-05-12'::date,'CAFT-2K5',  3,'Café Ferrocarril',       NULL),
    ('2025-05-12'::date,'CAFT-2K5',  3,'Eleven two',             NULL),
    ('2025-05-14'::date,'CAFT-2K5',  2,'Nidia Arango',           NULL),
    ('2025-05-14'::date,'CAFT-2K5',  1,'Nidia Arango',           NULL),
    ('2025-05-15'::date,'CAFT-2K5',  2,'Hojaldreria',            NULL),
    ('2025-05-16'::date,'CAFT-2K5',  4,'Nexus',                  NULL),
    ('2025-05-16'::date,'CAFT-2K5',  5,'Nexus',                  NULL),
    ('2025-05-19'::date,'CAFT-250G', 6,'Edgar Perez',            NULL),
    ('2025-05-19'::date,'CAFT-250G',20,'Sergio Velez',           NULL),
    ('2025-05-23'::date,'CAFT-2K5',  2,'Cazuelitas',             NULL),
    ('2025-05-23'::date,'CAFT-2K5',  3,'Profitness',             NULL),
    ('2025-05-26'::date,'CAFT-2K5',  3,'Café Ferrocarril',       NULL),
    ('2025-05-26'::date,'CAFT-2K5',  3,'Danilo Quintana Triviño',NULL),
    ('2025-05-30'::date,'CAFT-250G', 4,'Andres Ramirez',         NULL),
    ('2025-05-30'::date,'CAFT-500G', 3,'Andres Ramirez',         NULL),
    ('2025-05-30'::date,'CAFT-2K5',  3,'Andres Ramirez',         NULL),
    ('2025-05-30'::date,'CAFT-2K5',  1,'Corante/selvario',       NULL),
    ('2025-05-30'::date,'CAFT-2K5',  5,'Nexus',                  NULL),
    ('2025-05-31'::date,'CAFT-2K5',  1,'Daniel Ospina',          NULL),
    ('2025-05-31'::date,'CAFT-2K5',  2,'Maximo',                 NULL),
    -- Jun
    ('2025-06-03'::date,'CAFT-2K5',  3,'Nexus',                  NULL),
    ('2025-06-03'::date,'CAFT-2K5',  1,'Niku Medellín',          NULL),
    ('2025-06-03'::date,'CAFT-2K5',  3,'Niku Medellín',          NULL),
    ('2025-06-04'::date,'CAFT-2K5',  5,'Andres Ramirez',         NULL),
    ('2025-06-04'::date,'CAFT-2K5',  7,'Grupo NONNA',            NULL),
    ('2025-06-04'::date,'CAFT-2K5',  4,'Niku Cartagena',         NULL),
    ('2025-06-05'::date,'CAFT-2K5',  2,'Maximo',                 NULL),
    ('2025-06-09'::date,'CAFT-2K5',  1,'Corante/selvario',       NULL),
    ('2025-06-09'::date,'CAFT-250G',47,'Disroblan',              NULL),
    ('2025-06-09'::date,'CAFT-2K5',  6,'Grupo NONNA',            NULL),
    ('2025-06-09'::date,'CAFT-2K5',  1,'Las Cañitas',            NULL),
    ('2025-06-10'::date,'CAFT-250G',50,'Disroblan',              NULL),
    ('2025-06-10'::date,'CAFT-2K5',  2,'Hojaldreria',            NULL),
    ('2025-06-10'::date,'CAFT-250G', 4,'Nidia Arango',           NULL),
    ('2025-06-10'::date,'CAFT-2K5',  1,'Nidia Arango',           NULL),
    ('2025-06-12'::date,'CAFT-2K5',  9,'Nexus',                  NULL),
    ('2025-06-12'::date,'CAFT-2K5',  4,'Nexus',                  NULL),
    ('2025-06-17'::date,'CAFT-2K5',  2,'Corante/selvario',       NULL),
    ('2025-06-17'::date,'CAFT-2K5',  4,'Johana Bolivar',         NULL),
    ('2025-06-24'::date,'CAFT-2K5',  3,'Danilo Quintana Triviño',NULL),
    ('2025-06-24'::date,'CAFT-2K5',  4,'Nexus',                  NULL),
    ('2025-06-26'::date,'CAFT-2K5',  2,'Eleven two',             NULL),
    ('2025-06-26'::date,'CAFT-2K5',  2,'Grupo NONNA',            NULL),
    ('2025-06-26'::date,'CAFT-2K5',  9,'Nexus',                  NULL),
    ('2025-06-26'::date,'CAFT-2K5',  3,'Profitness',             NULL),
    ('2025-06-27'::date,'CAFT-2K5',  3,'Andres Ramirez',         NULL),
    ('2025-06-27'::date,'CAFT-2K5',  1,'Daniel Ospina',          NULL),
    ('2025-06-27'::date,'CAFT-2K5',  3,'Niku Medellín',          NULL),
    -- Jul
    ('2025-07-02'::date,'CAFT-2K5',  6,'Grupo NONNA',            NULL),
    ('2025-07-04'::date,'CAFT-2K5',  1,'Café Ferrocarril',       NULL),
    ('2025-07-04'::date,'CAFT-2K5',  1,'Cazuelitas',             NULL),
    ('2025-07-04'::date,'CAFT-2K5',  2,'Corante/selvario',       NULL),
    ('2025-07-04'::date,'CAFT-2K5',  1,'Daniel Ospina',          NULL),
    ('2025-07-04'::date,'CAFT-2K5',  2,'Hojaldreria',            NULL),
    ('2025-07-04'::date,'CAFT-2K5',  2,'Maximo',                 NULL),
    ('2025-07-04'::date,'CAFT-2K5',  4,'Niku Cartagena',         NULL),
    ('2025-07-08'::date,'CAFT-125G',50,'Disroblan',              NULL),
    ('2025-07-08'::date,'CAFT-2K5',  6,'Grupo NONNA',            NULL),
    ('2025-07-09'::date,'CAFT-2K5',  2,'Cazuelitas',             NULL),
    ('2025-07-09'::date,'CAFT-2K5',  3,'Domenico',               NULL),
    ('2025-07-09'::date,'CAFT-2K5',  4,'Nexus',                  NULL),
    ('2025-07-10'::date,'CAFT-2K5',  5,'Nexus',                  NULL),
    ('2025-07-10'::date,'CAFT-2K5',  3,'Profitness',             NULL),
    ('2025-07-12'::date,'CAFT-2K5',  3,'Domenico',               NULL),
    ('2025-07-16'::date,'CAFT-2K5',  4,'Domenico',               NULL),
    ('2025-07-19'::date,'CAFT-2K5',  3,'Daniel Cuartas',         NULL),
    ('2025-07-19'::date,'CAFT-2K5',  2,'Daniel Ospina',          NULL),
    ('2025-07-19'::date,'CAFT-2K5',  5,'Nexus',                  NULL),
    ('2025-07-19'::date,'CAFT-2K5',  1,'Niku Medellín',          NULL),
    ('2025-07-24'::date,'CAFT-2K5',  1,'Domenico',               NULL),
    ('2025-07-24'::date,'CAFT-2K5',  3,'Maximo',                 NULL),
    ('2025-07-24'::date,'CAFT-2K5',  1,'Niku Medellín',          NULL),
    ('2025-07-28'::date,'CAFT-2K5',  2,'Hojaldreria',            NULL),
    ('2025-07-28'::date,'CAFT-2K5',  1,'Las Cañitas',            NULL),
    ('2025-07-28'::date,'CAFT-2K5',  1,'Profitness',             NULL),
    ('2025-07-29'::date,'CAFT-2K5',  3,'Daniel Cuartas',         NULL),
    ('2025-07-29'::date,'CAFT-2K5',  3,'Daniel Cuartas',         NULL),
    ('2025-07-29'::date,'CAFT-2K5',  1,'Daniel Cuartas',         NULL),
    ('2025-07-29'::date,'CAFT-2K5',  3,'Domenico',               NULL),
    ('2025-07-30'::date,'CAFT-2K5',  1,'Las Cañitas',            NULL),
    ('2025-07-31'::date,'CAFT-2K5',  4,'Danilo Quintana Triviño',NULL),
    -- Aug
    ('2025-08-01'::date,'CAFT-2K5',  8,'Grupo NONNA',            NULL),
    ('2025-08-02'::date,'CAFT-2K5', 10,'Nexus',                  NULL),
    ('2025-08-04'::date,'CAFT-2K5',  1,'Daniel Cuartas',         NULL),
    ('2025-08-04'::date,'CAFT-250G', 1,'Daniel Cuartas',         NULL),
    ('2025-08-05'::date,'CAFT-2K5',  2,'Corante/selvario',       NULL),
    ('2025-08-05'::date,'CAFT-2K5',  4,'Domenico',               NULL),
    ('2025-08-06'::date,'CAFT-2K5',  1,'Corante/selvario',       NULL),
    ('2025-08-06'::date,'CAFT-2K5',  2,'Daniel Cuartas',         NULL),
    ('2025-08-06'::date,'CAFT-500G', 1,'Melborp',                NULL),
    ('2025-08-12'::date,'CAFT-2K5',  3,'Café Ferrocarril',       'Laura'),
    ('2025-08-12'::date,'CAFT-2K5',  2,'Domenico',               'Laura'),
    ('2025-08-12'::date,'CAFT-2K5',  2,'Melborp',                'Laura'),
    ('2025-08-12'::date,'CAFT-2K5',  3,'Profitness',             NULL),
    ('2025-08-13'::date,'CAFT-2K5',  4,'Nexus',                  NULL),
    ('2025-08-14'::date,'CAFT-2K5',  3,'Daniel Cuartas',         'Laura'),
    ('2025-08-14'::date,'CAFT-2K5',  6,'Grupo NONNA',            'Laura'),
    ('2025-08-14'::date,'CAFT-2K5',  2,'Hojaldreria',            'Laura'),
    ('2025-08-15'::date,'CAFT-2K5',  2,'Daniel Ospina',          NULL),
    ('2025-08-15'::date,'CAFT-2K5',  2,'Niku Medellín',          'Laura'),
    ('2025-08-17'::date,'CAFT-2K5',  2,'Cazuelitas',             'Laura'),
    ('2025-08-21'::date,'CAFT-2K5',  3,'Domenico',               NULL),
    ('2025-08-21'::date,'CAFT-2K5',  3,'Profitness',             NULL),
    ('2025-08-24'::date,'CAFT-2K5',  3,'Andres Ramirez',         NULL),
    ('2025-08-24'::date,'CAFT-2K5',  2,'Corante/selvario',       NULL),
    ('2025-08-25'::date,'CAFT-2K5',  1,'Café Ferrocarril',       NULL),
    ('2025-08-25'::date,'CAFT-2K5',  2,'Domenico',               NULL),
    ('2025-08-25'::date,'CAFT-2K5',  3,'Maximo',                 NULL),
    ('2025-08-25'::date,'CAFT-2K5',  6,'Nexus',                  NULL),
    ('2025-08-27'::date,'CAFT-2K5',  3,'Daniel Cuartas',         NULL),
    ('2025-08-27'::date,'CAFT-2K5',  4,'Grupo NONNA',            NULL),
    ('2025-08-27'::date,'CAFT-2K5',  3,'Nexus',                  NULL),
    ('2025-08-29'::date,'CAFT-2K5',  1,'Daniel Cuartas',         NULL),
    -- Sep
    ('2025-09-02'::date,'CAFT-2K5',  3,'Danilo Quintana Triviño',NULL),
    ('2025-09-02'::date,'CAFT-2K5',  4,'Domenico',               NULL),
    ('2025-09-02'::date,'CAFT-2K5',  2,'Hojaldreria',            NULL),
    ('2025-09-03'::date,'CAFT-2K5',  2,'Cazuelitas',             NULL),
    ('2025-09-03'::date,'CAFT-2K5',  3,'Daniel Cuartas',         NULL),
    ('2025-09-04'::date,'CAFT-2K5',  2,'Niku Medellín',          NULL),
    ('2025-09-05'::date,'CAFT-2K5',  1,'Alex',                   NULL),
    ('2025-09-05'::date,'CAFT-2K5',  6,'Grupo NONNA',            NULL),
    ('2025-09-05'::date,'CAFT-2K5',  1,'Okus',                   NULL),
    ('2025-09-06'::date,'CAFT-2K5',  3,'Profitness',             NULL),
    ('2025-09-08'::date,'CAFT-2K5',  2,'Melborp',                NULL),
    ('2025-09-09'::date,'CAFT-2K5',  2,'Café Ferrocarril',       NULL),
    ('2025-09-09'::date,'CAFT-2K5',  3,'Domenico',               NULL),
    ('2025-09-12'::date,'CAFT-2K5',  3,'Danilo Quintana Triviño',NULL),
    ('2025-09-12'::date,'CAFT-2K5',  2,'Maximo',                 NULL),
    ('2025-09-12'::date,'CAFT-2K5',  8,'Nexus',                  NULL),
    ('2025-09-13'::date,'CAFT-2K5',  4,'Grupo NONNA',            NULL),
    ('2025-09-17'::date,'CAFT-2K5',  3,'Daniel Cuartas',         NULL),
    ('2025-09-18'::date,'CAFT-2K5',  2,'Corante/selvario',       NULL),
    ('2025-09-18'::date,'CAFT-2K5',  3,'Domenico',               NULL),
    ('2025-09-19'::date,'CAFT-500G',10,'Ana Maria Velez',        NULL),
    ('2025-09-19'::date,'CAFT-2K5',  1,'Daniel Ospina',          NULL),
    ('2025-09-19'::date,'CAFT-2K5',  2,'Hojaldreria',            NULL),
    ('2025-09-19'::date,'CAFT-2K5',  6,'Niku Cartagena',         NULL),
    ('2025-09-19'::date,'CAFT-2K5',  3,'Niku Medellín',          NULL),
    ('2025-09-19'::date,'CAFT-2K5',  3,'Profitness',             NULL),
    ('2025-09-19'::date,'CAFT-500G',10,'Sergio Velez',           NULL),
    ('2025-09-19'::date,'CAFT-250G',10,'Sergio Velez',           NULL),
    ('2025-09-22'::date,'CAFT-2K5',  1,'Alex Mora',              NULL),
    ('2025-09-22'::date,'CAFT-2K5',  1,'Daniel Cuartas',         NULL),
    ('2025-09-22'::date,'CAFT-2K5',  4,'Johana Bolivar',         NULL),
    ('2025-09-23'::date,'CAFT-2K5',  4,'Grupo NONNA',            NULL),
    ('2025-09-24'::date,'CAFT-2K5',  6,'Nexus',                  NULL),
    ('2025-09-29'::date,'CAFT-2K5',  1,'OKus',                   NULL),
    ('2025-09-29'::date,'CAFT-2K5',  1,'Daniel Ospina',          NULL),
    ('2025-09-29'::date,'CAFT-2K5',  4,'Nexus',                  NULL),
    ('2025-09-29'::date,'CAFT-2K5',  1,'Daniel Ospina',          NULL),
    ('2025-09-29'::date,'CAFT-500G', 3,'Daniel Ospina',          NULL),
    ('2025-09-29'::date,'CAFT-250G', 7,'Daniel Ospina',          NULL),
    ('2025-09-30'::date,'CAFT-2K5',  4,'Magicka',                NULL),
    ('2025-09-30'::date,'CAFT-2K5',  2,'Melborp',                NULL),
    ('2025-09-30'::date,'CAFT-2K5',  3,'Daniel Cuartas',         NULL),
    -- Oct (skip row with qty='Mantenimiento*')
    ('2025-10-06'::date,'CAFT-2K5',  3,'Profitness',             NULL),
    ('2025-10-07'::date,'CAFT-2K5',  6,'Nexus',                  NULL),
    ('2025-10-07'::date,'CAFT-2K5',  7,'Grupo Nonna',            NULL),
    ('2025-10-09'::date,'CAFT-2K5',  2,'Cazuelitas',             NULL),
    ('2025-10-09'::date,'CAFT-2K5',  3,'Daniel Cuartas',         NULL),
    ('2025-10-15'::date,'CAFT-2K5',  2,'Grupo Nonna',            NULL),
    ('2025-10-15'::date,'CAFT-2K5',  2,'Niku Medellin',          NULL),
    ('2025-10-15'::date,'CAFT-2K5',  2,'Daniel Ospina',          NULL),
    ('2025-10-15'::date,'CAFT-2K5',  2,'Hojaldreria',            NULL),
    ('2025-10-15'::date,'CAFT-2K5',  2,'Selvario',               NULL),
    ('2025-10-20'::date,'CAFT-2K5',  5,'Grupo Nonna',            NULL),
    ('2025-10-20'::date,'CAFT-2K5',  3,'Daniel Cuartas',         NULL),
    ('2025-10-21'::date,'CAFT-2K5',  7,'Andres Ramirez',         NULL),
    ('2025-10-21'::date,'CAFT-500G', 4,'Andres Ramirez',         NULL),
    ('2025-10-21'::date,'CAFT-2K5',  1,'Alex Mora',              NULL),
    ('2025-10-21'::date,'CAFT-2K5',  2,'Maximo',                 NULL),
    ('2025-10-21'::date,'CAFT-2K5',  4,'Nexus',                  NULL),
    ('2025-10-24'::date,'CAFT-2K5',  3,'Profitness',             NULL),
    ('2025-10-24'::date,'CAFT-2K5',  4,'Grupo Nonna',            NULL),
    ('2025-10-27'::date,'CAFT-2K5',  4,'Magicka',                NULL),
    ('2025-10-27'::date,'CAFT-500G', 2,'Magicka',                NULL),
    ('2025-10-27'::date,'CAFT-2K5',  5,'Nexus',                  NULL),
    ('2025-10-27'::date,'CAFT-2K5',  1,'Daniel Ospina',          NULL),
    ('2025-10-27'::date,'CAFT-2K5',  2,'Andres Ramirez',         NULL),
    ('2025-10-27'::date,'CAFT-2K5',  3,'Daniel Cuartas',         NULL),
    ('2025-10-27'::date,'CAFT-2K5',  1,'Niku Medellin',          NULL),
    ('2025-10-27'::date,'CAFT-2K5',  1,'Daniel Ospina',          NULL),
    ('2025-10-27'::date,'CAFT-2K5',  1,'Daniel Cuartas',         NULL),
    ('2025-10-31'::date,'CAFT-2K5',  3,'Daniel Cuartas',         NULL),
    ('2025-10-31'::date,'CAFT-2K5',  1,'Niku Medellin',          NULL),
    ('2025-10-31'::date,'CAFT-2K5',  4,'Niku cartagena',         NULL),
    ('2025-10-31'::date,'CAFT-2K5',  1,'Daniel Ospina',          NULL),
    -- Nov
    ('2025-11-04'::date,'CAFT-2K5',  2,'Andres Ramirez',         NULL),
    ('2025-11-05'::date,'CAFT-2K5',  1,'Coffee group SAS',       NULL),
    ('2025-11-05'::date,'CAFT-2K5',  3,'Profitness',             NULL),
    ('2025-11-05'::date,'CAFT-2K5',  5,'Nexus',                  NULL),
    ('2025-11-05'::date,'CAFT-2K5',  2,'Hojaldreria',            NULL),
    ('2025-11-06'::date,'CAFT-2K5',  2,'Daniel Ospina',          NULL),
    ('2025-11-06'::date,'CAFT-2K5',  1,'Daniel Ospina',          NULL),
    ('2025-11-07'::date,'CAFT-2K5',  2,'Cazuelitas',             NULL),
    ('2025-11-10'::date,'CAFT-2K5',  1,'Alex Mora',              NULL),
    ('2025-11-10'::date,'CAFT-2K5',  4,'Nexus',                  NULL),
    ('2025-11-10'::date,'CAFT-2K5',  1,'OKUS',                   NULL),
    ('2025-11-11'::date,'CAFT-2K5',  1,'Maximo',                 NULL),
    ('2025-11-12'::date,'CAFT-2K5',  1,'SIERPE',                 NULL)
) AS src(mov_date, product_code, qty, cliente, responsable)
JOIN public.inventory inv ON inv.product_code = src.product_code;

-- ============================================================
-- 6. Recalculate current_stock for all products
--    (sum of all entradas minus sum of all salidas)
-- ============================================================
UPDATE public.inventory inv
SET current_stock = COALESCE(
    (SELECT SUM(CASE WHEN type = 'entrada' THEN quantity
                     WHEN type = 'salida'  THEN -quantity
                     ELSE 0 END)
     FROM public.inventory_movements
     WHERE inventory_id = inv.id),
    0
);
