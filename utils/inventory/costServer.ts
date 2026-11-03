// Server-side: keeps an item's standard cost equal to the weighted average
// of its costed entradas since the cutover. Not a server-actions module.

import { weightedAverageCost } from "./entryCost";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = any;

/** Recomputes the item's standard cost; quiet before the cost migrations (it is a convenience). */
export async function refreshStandardCost(supabase: DB, inventoryId: string): Promise<void> {
  const { data, error } = await supabase
    .from("inventory_movements")
    .select("quantity, unit_cost")
    .eq("inventory_id", inventoryId)
    .eq("type", "entrada")
    .eq("era", "v2");
  if (error || !data) return;
  const avg = weightedAverageCost(data);
  if (avg === null) return;
  const { error: updErr } = await supabase.from("inventory").update({ standard_cost: avg }).eq("id", inventoryId);
  if (updErr) console.error("refreshStandardCost:", updErr.message);
}
