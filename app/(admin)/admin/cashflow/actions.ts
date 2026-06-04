'use server';

import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';
import {
  DailyCashflow,
  CashflowExpense,
  CashflowIncome,
  ExpenseType,
  EXPENSE_CATEGORY_TYPE_MAP,
} from './types';

// ─────────────────────────────────────────────────────────────
// BUSINESS LOGIC HELPERS
// ─────────────────────────────────────────────────────────────

/** IVA estándar Colombia (19 %) */
const CO_VAT_RATE = 0.19;

/**
 * Tasa de comisión de pasarela por defecto para Ventas Web.
 * ePayco cobra ~2.99% + IVA sobre la comisión.
 * Expresado como fracción del bruto (≈ 3.56 % efectivo con IVA).
 */
const DEFAULT_GATEWAY_FEE_RATE = 0.0356;

/**
 * Redondea a 2 decimales para evitar errores de punto flotante
 * en valores monetarios (COP).
 */
const round2 = (n: number) => Math.round(n * 100) / 100;

// ── Expense helpers ──────────────────────────────────────────

interface ResolvedExpense {
  expense_type: ExpenseType;
  tax_amount: number;
  net_amount: number;
  depreciation_months: number | null;
  amount: number;          // total bruto (neto + IVA) que se paga
}

/**
 * Deriva y valida los campos contables de un gasto.
 *
 * Reglas:
 *  - net_amount = amount - tax_amount
 *  - expense_type se infiere de la categoría si no viene explícito
 *  - CAPEX exige depreciation_months > 0
 *  - OPEX/COGS exigen depreciation_months null
 */
function resolveExpenseFields(
  raw: Partial<CashflowExpense>
): { fields: ResolvedExpense; validationError?: string } {
  const amount       = Number(raw.amount ?? 0);
  const tax_amount   = round2(Number(raw.tax_amount ?? 0));
  const net_amount   = round2(amount - tax_amount);

  // Inferir expense_type desde categoría si no viene
  const category     = raw.category ?? '';
  const inferred     = EXPENSE_CATEGORY_TYPE_MAP[category];
  const expense_type: ExpenseType =
    (raw.expense_type as ExpenseType) ?? inferred ?? 'OPEX';

  let depreciation_months = raw.depreciation_months ?? null;

  // Validación CAPEX
  if (expense_type === 'CAPEX') {
    if (!depreciation_months || depreciation_months <= 0) {
      return {
        fields: { expense_type, tax_amount, net_amount, depreciation_months: null, amount },
        validationError:
          'Un gasto CAPEX debe tener depreciation_months > 0 (vida útil del activo en meses).',
      };
    }
    depreciation_months = Math.floor(depreciation_months);
  } else {
    // OPEX / COGS nunca tienen depreciación
    depreciation_months = null;
  }

  return {
    fields: { expense_type, tax_amount, net_amount, depreciation_months, amount },
  };
}

// ── Income helpers ───────────────────────────────────────────

interface ResolvedIncome {
  gross_amount:  number;
  fee_amount:    number;
  shipping_cost: number;
  tax_amount:    number;
  net_revenue:   number;
  amount:        number;   // alias de gross_amount (compatibilidad)
}

/**
 * Deriva los campos de desglose de un ingreso.
 *
 * Reglas para categoría 'Ventas Web' (si los campos vienen en 0 / undefined):
 *  - tax_amount   = gross_amount × CO_VAT_RATE  (IVA incluido en el precio)
 *  - fee_amount   = gross_amount × DEFAULT_GATEWAY_FEE_RATE
 *  - shipping_cost: se respeta el valor que venga (puede ser 0)
 *
 * Para cualquier otra categoría se usan los valores tal como vienen
 * (el admin los ingresa manualmente).
 *
 * net_revenue = gross_amount - fee_amount - shipping_cost - tax_amount
 */
function resolveIncomeFields(
  raw: Partial<CashflowIncome>
): { fields: ResolvedIncome } {
  const gross_amount  = round2(Number(raw.gross_amount ?? raw.amount ?? 0));
  const category      = raw.category ?? '';
  const isWebSale     = category === 'Ventas Web';

  // IVA: para Ventas Web se calcula si no viene explícito
  const tax_amount = round2(
    raw.tax_amount !== undefined && Number(raw.tax_amount) > 0
      ? Number(raw.tax_amount)
      : isWebSale
      ? gross_amount * CO_VAT_RATE
      : 0
  );

  // Comisión pasarela: para Ventas Web se calcula si no viene explícita
  const fee_amount = round2(
    raw.fee_amount !== undefined && Number(raw.fee_amount) > 0
      ? Number(raw.fee_amount)
      : isWebSale
      ? gross_amount * DEFAULT_GATEWAY_FEE_RATE
      : 0
  );

  const shipping_cost = round2(Number(raw.shipping_cost ?? 0));

  const net_revenue = round2(
    gross_amount - fee_amount - shipping_cost - tax_amount
  );

  return {
    fields: {
      gross_amount,
      fee_amount,
      shipping_cost,
      tax_amount,
      net_revenue,
      amount: gross_amount, // mantener columna legacy en sync
    },
  };
}

export async function ensureCashflowDate(date: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  const { data: existing } = await supabase
    .from('daily_cashflows')
    .select('id')
    .eq('date', date)
    .single();

  if (existing) return existing.id;

  const { data, error } = await supabase
    .from('daily_cashflows')
    .upsert({ date, created_by: user?.id }, { onConflict: 'date' })
    .select('id')
    .single();

  if (error) throw new Error(error.message);
  return data.id;
}

export async function getAllExpenses() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('cashflow_expenses')
    .select('*, cashflow:cashflow_id(date)')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching expenses:', error);
    return [];
  }
  return data;
}

export async function getAllIncomes() {
  const supabase = await createClient();
  
  // Manual incomes
  const { data: manual, error: manErr } = await supabase
    .from('cashflow_incomes')
    .select('*, cashflow:cashflow_id(date)')
    .order('created_at', { ascending: false });

  if (manErr) console.error('Error fetching manual incomes:', manErr);

  // Auto incomes (Sales orders)
  const { data: orders, error: ordErr } = await supabase
    .from('orders')
    .select('id, total_amount, created_at, status')
    .in('status', ['paid', 'processing', 'shipped', 'delivered'])
    .order('created_at', { ascending: false });

  if (ordErr) console.error('Error fetching sales:', ordErr);

  const merged = [
    ...(manual || []).map(m => ({ ...m, type: 'manual' })),
    ...(orders || []).map(o => ({
      id: o.id,
      concept: `Venta Orden #${o.id.split('-')[0]}`,
      category: 'Ventas Web',
      amount: o.total_amount,
      date: new Date(o.created_at).toISOString().split('T')[0],
      created_at: o.created_at,
      type: 'auto'
    }))
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return merged;
}

export async function getCashflows() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('daily_cashflows')
    .select('*')
    .order('date', { ascending: false });

  if (error) return [];
  return data as DailyCashflow[];
}

export async function createExpenseDirect(
  date: string,
  expense: Partial<CashflowExpense>
) {
  // ── 1. Resolver campos P&L ───────────────────────────────
  const { fields, validationError } = resolveExpenseFields(expense);
  if (validationError) return { error: validationError };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const cashflow_id = await ensureCashflowDate(date);

  // ── 2. Construir payload completo ────────────────────────
  const payload = {
    // Campos base (se sobreescriben con los derivados)
    concept:             expense.concept,
    category:            expense.category,
    image_url:           expense.image_url ?? null,
    // Campos derivados P&L
    amount:              fields.amount,
    expense_type:        fields.expense_type,
    tax_amount:          fields.tax_amount,
    net_amount:          fields.net_amount,
    depreciation_months: fields.depreciation_months,
    // Metadatos
    cashflow_id,
    created_by:          user?.id,
  };

  // ── 3. Persistir ─────────────────────────────────────────
  const { data, error } = await supabase
    .from('cashflow_expenses')
    .insert(payload)
    .select()
    .single();

  if (error) return { error: error.message };

  // ── 4. Audit log con snapshot completo ───────────────────
  await supabase.from('cashflow_audit_logs').insert({
    admin_id:    user?.id,
    action_type: 'CREATE_EXPENSE',
    expense_id:  data.id,
    cashflow_id,
    details: { new: data },
  });

  revalidatePath('/admin/cashflow');
  return { success: true, data };
}

export async function updateExpenseDirect(
  id: string,
  expense: Partial<CashflowExpense>
) {
  // ── 1. Leer estado anterior (necesario para diff y cashflow_id) ──
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: oldData, error: getErr } = await supabase
    .from('cashflow_expenses')
    .select('*')
    .eq('id', id)
    .single();
  if (getErr) return { error: getErr.message };

  // ── 2. Resolver campos P&L sobre la combinación old+new ─────────
  // Fusionar con el estado anterior para que campos no enviados
  // hereden sus valores actuales antes de recalcular.
  const merged = { ...oldData, ...expense };
  const { fields, validationError } = resolveExpenseFields(merged);
  if (validationError) return { error: validationError };

  // ── 3. Construir payload de actualización ────────────────────────
  const payload = {
    concept:             merged.concept,
    category:            merged.category,
    image_url:           merged.image_url ?? null,
    amount:              fields.amount,
    expense_type:        fields.expense_type,
    tax_amount:          fields.tax_amount,
    net_amount:          fields.net_amount,
    depreciation_months: fields.depreciation_months,
  };

  // ── 4. Persistir ─────────────────────────────────────────────────
  const { data: newData, error } = await supabase
    .from('cashflow_expenses')
    .update(payload)
    .eq('id', id)
    .select()
    .single();

  if (error) return { error: error.message };

  // ── 5. Audit log con diff completo old→new ───────────────────────
  await supabase.from('cashflow_audit_logs').insert({
    admin_id:    user?.id,
    action_type: 'UPDATE_EXPENSE',
    expense_id:  id,
    cashflow_id: oldData.cashflow_id,
    details: { old: oldData, new: newData },
  });

  revalidatePath('/admin/cashflow');
  return { success: true, data: newData };
}

export async function deleteExpenseDirect(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: old, error: getErr } = await supabase.from('cashflow_expenses').select('*').eq('id', id).single();
  if (getErr) return { error: getErr.message };

  const { error } = await supabase.from('cashflow_expenses').delete().eq('id', id);
  if (error) return { error: error.message };

  await supabase.from('cashflow_audit_logs').insert({
    admin_id: user?.id,
    action_type: 'DELETE_EXPENSE',
    expense_id: id,
    cashflow_id: old.cashflow_id,
    details: { old }
  });

  revalidatePath('/admin/cashflow');
  return { success: true };
}

export async function createIncomeDirect(
  date: string,
  income: Partial<CashflowIncome>
) {
  // ── 1. Resolver campos P&L ───────────────────────────────
  const { fields } = resolveIncomeFields(income);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const cashflow_id = await ensureCashflowDate(date);

  // ── 2. Construir payload completo ────────────────────────
  const payload = {
    concept:       income.concept,
    category:      income.category,
    image_url:     income.image_url ?? null,
    // Campos derivados P&L
    amount:        fields.amount,        // gross (alias legacy)
    gross_amount:  fields.gross_amount,
    fee_amount:    fields.fee_amount,
    shipping_cost: fields.shipping_cost,
    tax_amount:    fields.tax_amount,
    net_revenue:   fields.net_revenue,
    // Metadatos
    cashflow_id,
    created_by:    user?.id,
  };

  // ── 3. Persistir ─────────────────────────────────────────
  const { data, error } = await supabase
    .from('cashflow_incomes')
    .insert(payload)
    .select()
    .single();

  if (error) return { error: error.message };

  // ── 4. Audit log con snapshot completo ───────────────────
  await supabase.from('cashflow_audit_logs').insert({
    admin_id:    user?.id,
    action_type: 'CREATE_INCOME',
    income_id:   data.id,
    cashflow_id,
    details: { new: data },
  });

  revalidatePath('/admin/cashflow');
  return { success: true, data };
}

export async function updateIncomeDirect(
  id: string,
  income: Partial<CashflowIncome>
) {
  // ── 1. Leer estado anterior ──────────────────────────────
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: oldData, error: getErr } = await supabase
    .from('cashflow_incomes')
    .select('*')
    .eq('id', id)
    .single();
  if (getErr) return { error: getErr.message };

  // ── 2. Fusionar y recalcular campos P&L ─────────────────
  const merged = { ...oldData, ...income };
  const { fields } = resolveIncomeFields(merged);

  // ── 3. Construir payload de actualización ────────────────
  const payload = {
    concept:       merged.concept,
    category:      merged.category,
    image_url:     merged.image_url ?? null,
    amount:        fields.amount,
    gross_amount:  fields.gross_amount,
    fee_amount:    fields.fee_amount,
    shipping_cost: fields.shipping_cost,
    tax_amount:    fields.tax_amount,
    net_revenue:   fields.net_revenue,
  };

  // ── 4. Persistir ─────────────────────────────────────────
  const { data: newData, error } = await supabase
    .from('cashflow_incomes')
    .update(payload)
    .eq('id', id)
    .select()
    .single();

  if (error) return { error: error.message };

  // ── 5. Audit log con diff completo old→new ───────────────
  await supabase.from('cashflow_audit_logs').insert({
    admin_id:    user?.id,
    action_type: 'UPDATE_INCOME',
    income_id:   id,
    cashflow_id: oldData.cashflow_id,
    details: { old: oldData, new: newData },
  });

  revalidatePath('/admin/cashflow');
  return { success: true, data: newData };
}

export async function deleteIncomeDirect(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: old, error: getErr } = await supabase.from('cashflow_incomes').select('*').eq('id', id).single();
  if (getErr) return { error: getErr.message };

  const { error } = await supabase.from('cashflow_incomes').delete().eq('id', id);
  if (error) return { error: error.message };

  await supabase.from('cashflow_audit_logs').insert({
    admin_id: user?.id,
    action_type: 'DELETE_INCOME',
    income_id: id,
    cashflow_id: old.cashflow_id,
    details: { old }
  });

  revalidatePath('/admin/cashflow');
  return { success: true };
}

export async function getCashflowHistory() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('cashflow_audit_logs')
    .select(`
      *,
      profiles:admin_id (
        first_name,
        last_name
      ),
      cashflow:cashflow_id (
        date
      )
    `)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    console.error('Error fetching cashflow history:', error);
    return [];
  }
  return data;
}

export async function getCashflowReportData() {
  const expenses = await getAllExpenses();
  const incomes = await getAllIncomes();
  
  return { expenses, incomes };
}

/**
 * Returns a list of calendar dates (YYYY-MM-DD) starting from START_DATE
 * up to (but not including) today that have NO recorded expenses AND NO recorded incomes.
 */
export async function getMissingCashflowDays(): Promise<string[]> {
  const START_DATE = '2026-05-01';
  const supabase = await createClient();

  // Build the range: from START_DATE to yesterday (inclusive)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const start = new Date(START_DATE);
  start.setHours(0, 0, 0, 0);

  if (yesterday < start) return [];

  // Generate all calendar days in range
  const allDays: string[] = [];
  const cursor = new Date(start);
  while (cursor <= yesterday) {
    allDays.push(cursor.toISOString().split('T')[0]);
    cursor.setDate(cursor.getDate() + 1);
  }

  // Fetch all daily_cashflow dates that have at least one expense OR income
  const { data: expenseDates } = await supabase
    .from('cashflow_expenses')
    .select('cashflow:cashflow_id(date)');

  const { data: incomeDates } = await supabase
    .from('cashflow_incomes')
    .select('cashflow:cashflow_id(date)');

  // Build a Set of dates that DO have records
  const datesWithRecords = new Set<string>();

  (expenseDates || []).forEach((row: any) => {
    if (row.cashflow?.date) datesWithRecords.add(row.cashflow.date);
  });
  (incomeDates || []).forEach((row: any) => {
    if (row.cashflow?.date) datesWithRecords.add(row.cashflow.date);
  });

  // Also consider orders (auto incomes) as "covered" days
  const { data: orders } = await supabase
    .from('orders')
    .select('created_at')
    .in('status', ['paid', 'processing', 'shipped', 'delivered']);

  (orders || []).forEach((o: any) => {
    const d = new Date(o.created_at).toISOString().split('T')[0];
    datesWithRecords.add(d);
  });

  // Return days that have NO records at all
  return allDays.filter(d => !datesWithRecords.has(d));
}
