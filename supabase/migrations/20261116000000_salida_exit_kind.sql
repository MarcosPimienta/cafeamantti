-- What each salida was for: a sale, a sample, a gift, coffee the team drank,
-- waste or a count adjustment. The income statement puts its cost where the
-- kind says (cost of sales, selling or admin expenses). exit_to is who got it.
-- NULL = not classified (salidas from before this column, production consumos).
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS exit_kind TEXT;
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS exit_to TEXT;

ALTER TABLE inventory_movements DROP CONSTRAINT IF EXISTS inventory_movements_exit_kind_check;
ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_exit_kind_check
  CHECK (exit_kind IS NULL OR exit_kind IN ('venta', 'muestra', 'regalo', 'consumo_interno', 'perdida', 'ajuste'));

COMMENT ON COLUMN inventory_movements.exit_kind IS 'Salida kind: venta (pedidos e históricas) | muestra | regalo | consumo_interno | perdida | ajuste (NULL = sin clasificar)';
COMMENT ON COLUMN inventory_movements.exit_to IS 'Who the salida went to (customer, prospect, event, person)';

-- Orders always leave as sales.
UPDATE inventory_movements SET exit_kind = 'venta'
WHERE type = 'salida' AND order_id IS NOT NULL AND exit_kind IS NULL;

CREATE INDEX IF NOT EXISTS inventory_movements_exit_kind_idx
  ON inventory_movements (exit_kind, movement_date) WHERE type = 'salida' AND tab_source = 'salida';
