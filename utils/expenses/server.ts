// Loading the expense categories on the server (built-in + the team's).

import type { Supabase } from "@/utils/siigo/server";
import { mergeCategories, type CustomCategoryRow, type ExpenseCategory } from "./categories";

/** Every category; before its migration only the built-in ones. */
export async function loadExpenseCategories(supabase: Supabase, opts: { includeInactive?: boolean } = {}): Promise<ExpenseCategory[]> {
  const { data, error } = await supabase.from("expense_categories").select("id, name, expense_type, depreciation_months, active");
  if (error) console.error("expense_categories:", error.message);
  return mergeCategories(error ? [] : ((data ?? []) as CustomCategoryRow[]), opts);
}
