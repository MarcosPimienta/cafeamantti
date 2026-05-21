'use server';

import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';
import { DailyCashflow, CashflowExpense } from './types';

export async function getCashflows() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('daily_cashflows')
    .select('*')
    .order('date', { ascending: false });

  if (error) {
    console.error('Error fetching cashflows:', error);
    return [];
  }
  return data as DailyCashflow[];
}

export async function getCashflowByDate(date: string) {
  const supabase = await createClient();
  
  // Fetch parent record
  const { data: cashflow, error: cashflowError } = await supabase
    .from('daily_cashflows')
    .select('*')
    .eq('date', date)
    .single();

  if (cashflowError && cashflowError.code !== 'PGRST116') {
    console.error('Error fetching cashflow by date:', cashflowError);
    return null;
  }

  if (!cashflow) return null;

  // Fetch expenses
  const { data: expenses, error: expensesError } = await supabase
    .from('cashflow_expenses')
    .select('*')
    .eq('cashflow_id', cashflow.id);

  if (expensesError) {
    console.error('Error fetching cashflow expenses:', expensesError);
  }

  return {
    ...cashflow,
    expenses: expenses || [],
  };
}

export async function getDailySalesTotal(date: string) {
  const supabase = await createClient();
  
  // Date must be formatted as YYYY-MM-DD
  const startOfDay = `${date}T00:00:00Z`;
  const endOfDay = `${date}T23:59:59Z`;

  const { data, error } = await supabase
    .from('orders')
    .select('total_amount')
    .gte('created_at', startOfDay)
    .lte('created_at', endOfDay)
    .in('status', ['paid', 'processing', 'shipped', 'delivered']);

  if (error) {
    console.error('Error fetching daily sales:', error);
    return 0;
  }

  const total = data.reduce((sum: number, order: any) => sum + Number(order.total_amount), 0);
  return total;
}

export async function saveCashflow(data: {
  date: string;
  initial_balance: number;
  daily_income: number;
  final_balance: number;
  observations: string | null;
  expenses: { concept: string; category: string; amount: number }[];
}) {
  const supabase = await createClient();

  // Upsert the parent record (using date as unique)
  // Wait, Supabase upsert requires knowing the PK or having a unique constraint. We added UNIQUE to date.
  const { data: cashflow, error: cashflowError } = await supabase
    .from('daily_cashflows')
    .upsert({
      date: data.date,
      initial_balance: data.initial_balance,
      daily_income: data.daily_income,
      final_balance: data.final_balance,
      observations: data.observations,
    }, { onConflict: 'date' })
    .select()
    .single();

  if (cashflowError) {
    console.error('Error upserting cashflow:', cashflowError);
    return { error: cashflowError.message };
  }

  // Delete existing expenses to replace them (simplest way to handle dynamic rows)
  await supabase
    .from('cashflow_expenses')
    .delete()
    .eq('cashflow_id', cashflow.id);

  // Insert new expenses
  if (data.expenses && data.expenses.length > 0) {
    const expensesToInsert = data.expenses.map(e => ({
      cashflow_id: cashflow.id,
      concept: e.concept,
      category: e.category,
      amount: e.amount,
    }));

    const { error: expensesError } = await supabase
      .from('cashflow_expenses')
      .insert(expensesToInsert);

    if (expensesError) {
      console.error('Error inserting expenses:', expensesError);
      return { error: expensesError.message };
    }
  }

  revalidatePath('/admin/cashflow');
  return { success: true };
}
