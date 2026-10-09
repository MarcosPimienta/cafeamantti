import { createClient } from "@/utils/supabase/server";
import { getClientsCRM, getCostingData, getCurrentUserProfile } from "../../../actions";
import type { CoffeeProfileId } from "@/app/(admin)/coffeeProfiles";

/**
 * Clients, packaging items with their standard cost, the seller's name, and
 * the direct cost per kg of each coffee profile (café + tostión, from
 * Inventario → Costos) to prefill each presentation.
 */
export async function loadMaquilaFormData() {
  const supabase = await createClient();
  const [clients, profile, { data: inventory }, costing] = await Promise.all([
    getClientsCRM(),
    getCurrentUserProfile(),
    // '*' so standard_cost comes along once the costing migration is applied.
    supabase.from("inventory").select("*").in("category", ["empaque", "accesorio"]).order("product_name"),
    getCostingData().catch(() => null),
  ]);

  const coffeeCostPerKg: Partial<Record<CoffeeProfileId, number>> = {};
  for (const line of costing?.sheet.lines ?? []) {
    if (line.cafe === null || coffeeCostPerKg[line.profile] !== undefined) continue;
    coffeeCostPerKg[line.profile] = Math.round(line.cafe + line.tostion);
  }

  return {
    clients: (clients ?? []).map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })),
    packaging: (inventory ?? []).map((i: { product_code: string; product_name: string; standard_cost?: number | null }) => ({
      product_code: i.product_code,
      product_name: i.product_name,
      standard_cost: i.standard_cost ?? null,
    })),
    coffeeCostPerKg,
    sellerName: profile ? `${profile.first_name || ""} ${profile.last_name || ""}`.trim() || undefined : undefined,
  };
}
