import { createClient } from "@/utils/supabase/server";
import { getClientsCRM, getCurrentUserProfile } from "../../../actions";

/** Clients, packaging items with their standard cost, and the seller's name. */
export async function loadMaquilaFormData() {
  const supabase = await createClient();
  const [clients, profile, { data: inventory }] = await Promise.all([
    getClientsCRM(),
    getCurrentUserProfile(),
    // '*' so standard_cost comes along once the costing migration is applied.
    supabase.from("inventory").select("*").in("category", ["empaque", "accesorio"]).order("product_name"),
  ]);
  return {
    clients: (clients ?? []).map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })),
    packaging: (inventory ?? []).map((i: { product_code: string; product_name: string; standard_cost?: number | null }) => ({
      product_code: i.product_code,
      product_name: i.product_name,
      standard_cost: i.standard_cost ?? null,
    })),
    sellerName: profile ? `${profile.first_name || ""} ${profile.last_name || ""}`.trim() || undefined : undefined,
  };
}
