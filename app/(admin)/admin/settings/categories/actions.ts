'use server';

// Expense categories the team adds (Ajustes → Categorías de gasto). They
// show up in Compras, Flujo de Caja and cuentas de cobro next to the
// built-in ones. Mutations return { success, error }: production hides
// thrown messages.

import { revalidatePath } from 'next/cache';
import { createClient } from '@/utils/supabase/server';
import { checkIsAdmin } from '../../../actions';
import { errorText, loadSiigoSettings, type Supabase } from '@/utils/siigo/server';
import { categoryProblems, type CategoryType } from '@/utils/expenses/categories';
import { loadExpenseCategories } from '@/utils/expenses/server';

const MIGRATION_HINT = 'Falta aplicar la migración 20261103000000_expense_categories.sql';

async function requireAdmin() {
  if (!(await checkIsAdmin())) throw new Error('Unauthorized');
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, userId: user?.id ?? null };
}

function message(err: unknown) {
  const m = errorText(err);
  if (/expense_categories/.test(m) && /exist|relation|schema/i.test(m)) return MIGRATION_HINT;
  if (/expense_categories_name_key/.test(m)) return 'Ya existe una categoría con ese nombre.';
  return m;
}

async function guard<T extends object>(run: () => Promise<T>): Promise<({ success: true } & T) | { success: false; error: string }> {
  try {
    return { success: true, ...(await run()) };
  } catch (err) {
    return { success: false, error: message(err) };
  }
}

function refresh() {
  for (const path of ['/admin/settings/categories', '/admin/settings/siigo', '/admin/purchases', '/admin/cashflow', '/admin/cuentas-cobro']) revalidatePath(path);
}

/** Every category, for the forms (client components). */
export async function getExpenseCategories() {
  const { supabase } = await requireAdmin();
  return guard(async () => ({ categories: await loadExpenseCategories(supabase) }));
}

/** The category's default ledger account, with the other category accounts in the Siigo settings. */
async function saveDefaultAccount(supabase: Supabase, userId: string | null, name: string, account: string | null | undefined) {
  if (account === undefined) return;
  const settings = await loadSiigoSettings(supabase);
  const accounts = { ...(settings.expense_accounts ?? {}) };
  if (account?.trim()) accounts[name] = account.trim();
  else delete accounts[name];
  const { error } = await supabase.from('siigo_settings').upsert({ id: 1, config: { ...settings, expense_accounts: accounts }, updated_at: new Date().toISOString(), updated_by: userId });
  if (error) throw error;
}

type CategoryInput = { name: string; type: CategoryType; months?: number | null; account?: string | null };

export async function createExpenseCategory(input: CategoryInput) {
  const { supabase, userId } = await requireAdmin();
  return guard(async () => {
    const name = input.name.trim().replace(/\s+/g, ' ');
    const all = await loadExpenseCategories(supabase, { includeInactive: true });
    const problems = categoryProblems({ ...input, name }, all.map((c) => c.name));
    if (problems.length) throw new Error(problems.join(' · '));
    const { data, error } = await supabase
      .from('expense_categories')
      .insert({ name, expense_type: input.type, depreciation_months: input.type === 'CAPEX' ? Math.floor(Number(input.months)) : null, active: true, created_by: userId })
      .select('id')
      .single();
    if (error) throw error;
    await saveDefaultAccount(supabase, userId, name, input.account);
    refresh();
    return { id: data.id as string };
  });
}

/**
 * Changes a team category's nature, useful life or default account. The
 * name stays: expenses keep their category by name.
 */
export async function updateExpenseCategory(id: string, input: Omit<CategoryInput, 'name'>) {
  const { supabase, userId } = await requireAdmin();
  return guard(async () => {
    const { data: current, error: curErr } = await supabase.from('expense_categories').select('id, name').eq('id', id).single();
    if (curErr || !current) throw curErr ?? new Error('Categoría no encontrada.');
    const problems = categoryProblems({ ...input, name: current.name });
    if (problems.length) throw new Error(problems.join(' · '));
    const { error } = await supabase
      .from('expense_categories')
      .update({ expense_type: input.type, depreciation_months: input.type === 'CAPEX' ? Math.floor(Number(input.months)) : null, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
    await saveDefaultAccount(supabase, userId, current.name, input.account);
    refresh();
    return {};
  });
}

/** Hides a category from the forms (or shows it again). Expenses that use it keep it. */
export async function setExpenseCategoryActive(id: string, active: boolean) {
  const { supabase } = await requireAdmin();
  return guard(async () => {
    const { error } = await supabase.from('expense_categories').update({ active, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
    refresh();
    return {};
  });
}
