'use server';

import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';
import { DailyCashflow, CashflowExpense, CashflowIncome, CashflowAuditLog } from './types';

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

export async function createExpenseDirect(date: string, expense: Partial<CashflowExpense>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const cashflow_id = await ensureCashflowDate(date);

  const { data, error } = await supabase
    .from('cashflow_expenses')
    .insert({
      ...expense,
      cashflow_id,
      created_by: user?.id
    })
    .select()
    .single();

  if (error) return { error: error.message };

  await supabase.from('cashflow_audit_logs').insert({
    admin_id: user?.id,
    action_type: 'CREATE_EXPENSE',
    expense_id: data.id,
    cashflow_id,
    details: { new: data }
  });

  revalidatePath('/admin/cashflow');
  return { success: true, data };
}

export async function updateExpenseDirect(id: string, expense: Partial<CashflowExpense>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: old, error: getErr } = await supabase.from('cashflow_expenses').select('*').eq('id', id).single();
  if (getErr) return { error: getErr.message };

  const { data, error } = await supabase
    .from('cashflow_expenses')
    .update(expense)
    .eq('id', id)
    .select()
    .single();

  if (error) return { error: error.message };

  await supabase.from('cashflow_audit_logs').insert({
    admin_id: user?.id,
    action_type: 'UPDATE_EXPENSE',
    expense_id: id,
    cashflow_id: old.cashflow_id,
    details: { old, new: data }
  });

  revalidatePath('/admin/cashflow');
  return { success: true, data };
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

export async function createIncomeDirect(date: string, income: Partial<CashflowIncome>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const cashflow_id = await ensureCashflowDate(date);

  const { data, error } = await supabase
    .from('cashflow_incomes')
    .insert({
      ...income,
      cashflow_id,
      created_by: user?.id
    })
    .select()
    .single();

  if (error) return { error: error.message };

  await supabase.from('cashflow_audit_logs').insert({
    admin_id: user?.id,
    action_type: 'CREATE_INCOME',
    income_id: data.id,
    cashflow_id,
    details: { new: data }
  });

  revalidatePath('/admin/cashflow');
  return { success: true, data };
}

export async function updateIncomeDirect(id: string, income: Partial<CashflowIncome>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: old, error: getErr } = await supabase.from('cashflow_incomes').select('*').eq('id', id).single();
  if (getErr) return { error: getErr.message };

  const { data, error } = await supabase
    .from('cashflow_incomes')
    .update(income)
    .eq('id', id)
    .select()
    .single();

  if (error) return { error: error.message };

  await supabase.from('cashflow_audit_logs').insert({
    admin_id: user?.id,
    action_type: 'UPDATE_INCOME',
    income_id: id,
    cashflow_id: old.cashflow_id,
    details: { old, new: data }
  });

  revalidatePath('/admin/cashflow');
  return { success: true, data };
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
