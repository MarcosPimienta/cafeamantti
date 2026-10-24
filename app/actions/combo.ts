"use server";

import { createAdminClient } from "@/utils/supabase/admin";
import { STORE_COMBOS } from "@/utils/pricing";

/** Machines of a combo left to sell (null when stock can't be read: the store then shows no count). */
export async function getComboUnitsLeft(comboId: string): Promise<number | null> {
  const combo = STORE_COMBOS[comboId];
  const admin = createAdminClient();
  if (!combo || !admin) return null;
  const { data } = await admin.from("inventory").select("current_stock").eq("product_code", combo.units[0].code).maybeSingle();
  return data ? Math.max(0, Math.floor(Number(data.current_stock))) : null;
}
