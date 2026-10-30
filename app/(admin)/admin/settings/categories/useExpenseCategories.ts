"use client";

import { useEffect, useState } from "react";
import { getExpenseCategories } from "./actions";
import { BUILT_IN_CATEGORIES, type ExpenseCategory } from "@/utils/expenses/categories";

/** Expense categories for a client form: the built-in ones at once, the team's as soon as they load. */
export function useExpenseCategories(): ExpenseCategory[] {
  const [categories, setCategories] = useState<ExpenseCategory[]>(BUILT_IN_CATEGORIES);
  useEffect(() => {
    let cancelled = false;
    getExpenseCategories().then((res) => {
      if (!cancelled && res.success) setCategories(res.categories);
    });
    return () => { cancelled = true; };
  }, []);
  return categories;
}
