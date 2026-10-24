"use server";

import { createAdminClient } from "@/utils/supabase/admin";
import { comboUnitsLeft } from "@/utils/orders/comboSales";

/** Combos left under the offer's limit (null when it can't be read: the store then shows no count). */
export async function getComboUnitsLeft(comboId: string): Promise<number | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  try {
    return await comboUnitsLeft(admin, comboId);
  } catch {
    return null;
  }
}
