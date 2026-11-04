-- ============================================================
-- Inventario: el saldo lo mueve la base de datos con cada movimiento
-- Date: 2026-11-10
--
-- current_stock was a counter each action updated by hand after writing its
-- movement (read, add, write back). When a step failed in between, the
-- movement and the stock went apart: an order's salida was inserted, the
-- stock check then failed ("no puede ser negativo") and left the movement
-- without its deduction; reverting the order later gave back stock that was
-- never taken. Café Tostado KG ended at 10.030 kg with 74,44 kg in its Kardex.
--
-- Now a trigger moves the stock with every v2 movement (insert, edit,
-- delete) in the same statement, and refuses a movement that leaves a
-- product below zero, so the movement is not written either. An order's
-- salida (order_id set) is still recorded when short, so the Kardex shows
-- the shortfall of a sale that was already paid. v1 movements (before the
-- September 2026 cutover) never touch the stock.
--
-- Then every product's stock is set to its Kardex (sum of its v2
-- movements); the old value is kept in inventory_audit_logs.
-- Safe to run more than once.
-- ============================================================

CREATE OR REPLACE FUNCTION public.inventory_apply_stock(p_item UUID, p_delta NUMERIC, p_allow_negative BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stock NUMERIC;
  v_name  TEXT;
BEGIN
  UPDATE public.inventory
     SET current_stock = COALESCE(current_stock, 0) + p_delta
   WHERE id = p_item
  RETURNING current_stock, product_name INTO v_stock, v_name;

  IF p_delta < 0 AND v_stock < 0 AND NOT p_allow_negative THEN
    RAISE EXCEPTION 'Stock insuficiente de "%": hay %, se necesitan %.',
      v_name, round(v_stock - p_delta, 2), round(-p_delta, 2)
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.inventory_stock_from_movement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old NUMERIC := 0;
  v_new NUMERIC := 0;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    IF OLD.era = 'v2' THEN v_old := -OLD.quantity; END IF;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    IF NEW.era = 'v2' THEN v_new := NEW.quantity; END IF;
  END IF;

  -- Same product: apply only the difference (an edit from -5 to -3 gives back 2).
  IF TG_OP = 'UPDATE' THEN
    IF OLD.inventory_id = NEW.inventory_id THEN
      v_new := v_new + v_old;
      v_old := 0;
    END IF;
  END IF;

  IF v_old <> 0 THEN
    PERFORM public.inventory_apply_stock(OLD.inventory_id, v_old, OLD.order_id IS NOT NULL);
  END IF;
  IF v_new <> 0 THEN
    PERFORM public.inventory_apply_stock(NEW.inventory_id, v_new, NEW.order_id IS NOT NULL);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS inventory_movements_stock ON public.inventory_movements;
CREATE TRIGGER inventory_movements_stock
  AFTER INSERT OR UPDATE OF quantity, inventory_id, era OR DELETE ON public.inventory_movements
  FOR EACH ROW EXECUTE FUNCTION public.inventory_stock_from_movement();

-- ── Every product's stock = its Kardex ──────────────────────
WITH kardex AS (
  SELECT i.id, i.current_stock AS before,
         COALESCE((SELECT sum(m.quantity) FROM public.inventory_movements m
                    WHERE m.inventory_id = i.id AND m.era = 'v2'), 0) AS after
  FROM public.inventory i
), fixed AS (
  UPDATE public.inventory i
     SET current_stock = k.after
    FROM kardex k
   WHERE k.id = i.id AND COALESCE(i.current_stock, 0) <> k.after
  RETURNING i.id, k.before, k.after
)
INSERT INTO public.inventory_audit_logs (action_type, entity_type, entity_id, inventory_id, details)
SELECT 'UPDATE', 'STOCK_RECOUNT', f.id, f.id,
       jsonb_build_object('old_stock', f.before, 'new_stock', f.after,
                          'note', 'Saldo igualado al Kardex (20261110000000_inventory_stock_from_movements.sql)')
FROM fixed f;
