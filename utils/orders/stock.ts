// Stock follows payment: an order deducts its products when it is paid and
// gives them back if it returns to pending or is cancelled. Shared by the
// admin actions (session client) and the ePayco webhook (service role).

/** Statuses in which an order counts as paid (same set Flujo de Caja uses). */
export const PAID_ORDER_STATUSES = ["paid", "processing", "shipped", "delivered"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = any;

type Movement = { id: string; inventory_id: string; quantity: number };

/** "Orden Manual #abcd1234" / "Orden Web #…" / "Orden Siigo #…" */
export function orderMovementReason(orderId: string, source: string | null | undefined): string {
  const label = source === "manual" ? "Manual" : source === "siigo" ? "Siigo" : "Web";
  return `Orden ${label} #${orderId.split("-")[0]}`;
}

/** Movements already applied for an order: linked by id, or (older ones) by reason. */
export async function findOrderMovements(supabase: DB, orderId: string): Promise<Movement[]> {
  const [{ data: linked }, { data: legacy }] = await Promise.all([
    supabase.from("inventory_movements").select("id, inventory_id, quantity").eq("order_id", orderId),
    supabase
      .from("inventory_movements")
      .select("id, inventory_id, quantity, order_id")
      .eq("reason", `Orden Manual #${orderId.split("-")[0]}`),
  ]);
  const seen = new Set<string>();
  const out: Movement[] = [];
  for (const m of [...(linked ?? []), ...((legacy ?? []) as (Movement & { order_id: string | null })[]).filter((m) => !m.order_id)]) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    out.push(m);
  }
  return out;
}

async function changeStock(supabase: DB, inventoryId: string, delta: number, allowNegative: boolean): Promise<number> {
  const { data, error } = await supabase.from("inventory").select("current_stock").eq("id", inventoryId).single();
  if (error || !data) throw new Error("Producto no encontrado");
  const next = Number(data.current_stock) + delta;
  if (next < 0 && !allowNegative) throw new Error("El stock no puede ser negativo");
  const { error: updErr } = await supabase.from("inventory").update({ current_stock: next }).eq("id", inventoryId);
  if (updErr) throw new Error(updErr.message);
  return next;
}

/** Gives back every unit an order took and deletes its movements. */
export async function revertOrderStock(supabase: DB, orderId: string): Promise<Movement[]> {
  const movements = await findOrderMovements(supabase, orderId);
  for (const m of movements) await changeStock(supabase, m.inventory_id, -Number(m.quantity), true);
  if (movements.length) {
    await supabase.from("inventory_movements").delete().in("id", movements.map((m) => m.id));
  }
  return movements;
}

export type SyncOptions = {
  orderId: string;
  status: string;
  userId: string | null;
  /**
   * The payment already happened (webhook): record the sale even if stock
   * goes negative, so the Kardex shows the shortfall instead of losing it.
   */
  allowNegative?: boolean;
  /** Called per movement written or reverted (e.g. for the audit log). */
  onMovement?: (m: { id: string; inventory_id: string; quantity: number; reason: string; reverted: boolean }) => Promise<void> | void;
};

/**
 * Makes an order's stock match its payment state: salidas exist while it is
 * paid and are reverted when it is not. Items without an inventory link
 * (old orders) are left as they were, since they could not be re-applied.
 */
export async function syncOrderStock(supabase: DB, opts: SyncOptions): Promise<"deducted" | "reverted" | "unchanged"> {
  const { orderId, status, userId, allowNegative = false, onMovement } = opts;
  const existing = await findOrderMovements(supabase, orderId);
  const shouldDeduct = PAID_ORDER_STATUSES.includes(status);
  if ((existing.length > 0) === shouldDeduct) return "unchanged";

  const { data: items, error: itemsErr } = await supabase
    .from("order_items")
    .select("inventory_id, quantity")
    .eq("order_id", orderId)
    .not("inventory_id", "is", null);
  if (itemsErr) throw new Error(itemsErr.message);
  const linked = (items ?? []) as { inventory_id: string; quantity: number }[];

  if (!shouldDeduct) {
    if (!linked.length) return "unchanged"; // legacy order: could not re-apply later
    const reverted = await revertOrderStock(supabase, orderId);
    for (const m of reverted) await onMovement?.({ ...m, reason: `Orden no pagada (${status})`, reverted: true });
    return "reverted";
  }

  if (!linked.length) return "unchanged";
  const { data: order } = await supabase.from("orders").select("source").eq("id", orderId).maybeSingle();
  const reason = orderMovementReason(orderId, order?.source);
  const movementDate = new Date().toISOString();

  for (const item of linked) {
    const qty = Number(item.quantity);
    if (!(qty > 0)) continue;
    const { data: mov, error } = await supabase
      .from("inventory_movements")
      .insert({
        inventory_id: item.inventory_id,
        type: "salida",
        quantity: -qty,
        reason,
        created_by: userId,
        movement_date: movementDate,
        tab_source: "salida",
        order_id: orderId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await changeStock(supabase, item.inventory_id, -qty, allowNegative);
    await onMovement?.({ id: mov.id, inventory_id: item.inventory_id, quantity: -qty, reason, reverted: false });
  }
  return "deducted";
}
