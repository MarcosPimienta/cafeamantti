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
  expenses: { id?: string; concept: string; category: string; amount: number; image_url?: string | null }[];
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const admin_id = user?.id;

  // Fetch parent record first to check if it exists
  const { data: existingCashflow } = await supabase
    .from('daily_cashflows')
    .select('id')
    .eq('date', data.date)
    .single();

  const { data: cashflow, error: cashflowError } = await supabase
    .from('daily_cashflows')
    .upsert({
      ...(existingCashflow ? { id: existingCashflow.id } : {}),
      date: data.date,
      initial_balance: data.initial_balance,
      daily_income: data.daily_income,
      final_balance: data.final_balance,
      observations: data.observations,
      ...(admin_id ? { created_by: admin_id } : {})
    }, { onConflict: 'date' })
    .select()
    .single();

  if (cashflowError) {
    console.error('Error upserting cashflow:', cashflowError);
    return { error: cashflowError.message };
  }

  // Fetch existing expenses
  const { data: existingExpenses } = await supabase
    .from('cashflow_expenses')
    .select('*')
    .eq('cashflow_id', cashflow.id);

  const existingMap = new Map((existingExpenses || []).map((e: any) => [e.id, e]));
  const incomingIds = new Set<string>();

  for (const exp of data.expenses) {
    // If id is valid UUID, consider it existing, otherwise treat as new
    const isExisting = exp.id && exp.id.length === 36 && existingMap.has(exp.id);

    if (isExisting) {
      incomingIds.add(exp.id!);
      const oldExp = existingMap.get(exp.id!);
      
      // Check if data changed
      const changed = oldExp.concept !== exp.concept || 
                      oldExp.category !== exp.category || 
                      Number(oldExp.amount) !== Number(exp.amount) ||
                      (oldExp.image_url || null) !== (exp.image_url || null);

      if (changed) {
        const { error: updErr } = await supabase
          .from('cashflow_expenses')
          .update({
            concept: exp.concept,
            category: exp.category,
            amount: exp.amount,
            image_url: exp.image_url
          })
          .eq('id', exp.id);
          
        if (!updErr && admin_id) {
          const { error: logErr } = await supabase.from('cashflow_audit_logs').insert({
            admin_id,
            action_type: 'UPDATE_EXPENSE',
            expense_id: exp.id,
            cashflow_id: cashflow.id,
            details: { old: oldExp, new: exp }
          });
          if (logErr) console.error("Error logging UPDATE_EXPENSE:", logErr);
        }
      }
    } else {
      // Insert new expense
      const { data: newExp, error: insErr } = await supabase
        .from('cashflow_expenses')
        .insert({
          cashflow_id: cashflow.id,
          concept: exp.concept,
          category: exp.category,
          amount: exp.amount,
          image_url: exp.image_url,
          ...(admin_id ? { created_by: admin_id } : {})
        })
        .select()
        .single();
        
      if (!insErr && newExp && admin_id) {
        const { error: logErr } = await supabase.from('cashflow_audit_logs').insert({
          admin_id,
          action_type: 'CREATE_EXPENSE',
          expense_id: newExp.id,
          cashflow_id: cashflow.id,
          details: { new: newExp }
        });
        if (logErr) console.error("Error logging CREATE_EXPENSE:", logErr);
      }
    }
  }

  // Handle deletes
  for (const [id, oldExp] of existingMap.entries()) {
    if (!incomingIds.has(id)) {
      const { error: delErr } = await supabase
        .from('cashflow_expenses')
        .delete()
        .eq('id', id);
        
      if (!delErr && admin_id) {
        const { error: logErr } = await supabase.from('cashflow_audit_logs').insert({
          admin_id,
          action_type: 'DELETE_EXPENSE',
          expense_id: id,
          cashflow_id: cashflow.id,
          details: { old: oldExp }
        });
        if (logErr) console.error("Error logging DELETE_EXPENSE:", logErr);
      }
    }
  }

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
        full_name,
        email
      ),
      cashflow:cashflow_id (
        date
      )
    `)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('Error fetching cashflow history:', error);
    return [];
  }
  return data;
}
