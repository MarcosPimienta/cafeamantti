// How many of a combo the store has sold: the offer is limited ("only 20
// units") and the on-demand machine has no stock to count, so paid orders do.

import { STORE_COMBOS } from "@/utils/pricing";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = any;

/** Combos sold on paid, not cancelled orders. */
export async function comboUnitsSold(db: Db, comboId: string): Promise<number> {
  const combo = STORE_COMBOS[comboId];
  if (!combo) return 0;
  // The machine line marks the combo (one per combo sold).
  const marker = combo.units[0];
  const { data: items, error } = await db.from("order_items").select("order_id, quantity").eq("product_id", marker.product_id);
  if (error) throw new Error(error.message);
  const ids = [...new Set(((items ?? []) as { order_id: string }[]).map((i) => i.order_id))];
  if (!ids.length) return 0;
  const { data: orders, error: ordErr } = await db.from("orders").select("id, status, payment_status").in("id", ids);
  if (ordErr) throw new Error(ordErr.message);
  const sold = new Set(((orders ?? []) as { id: string; status: string; payment_status?: string | null }[]).filter((o) => o.payment_status === "paid" && o.status !== "cancelled").map((o) => o.id));
  return ((items ?? []) as { order_id: string; quantity: number }[]).reduce((s, i) => s + (sold.has(i.order_id) ? Number(i.quantity) : 0), 0);
}

/** Combos left to sell under the offer's limit. */
export async function comboUnitsLeft(db: Db, comboId: string): Promise<number> {
  const combo = STORE_COMBOS[comboId];
  if (!combo) return 0;
  return Math.max(0, combo.maxUnits - (await comboUnitsSold(db, comboId)));
}
