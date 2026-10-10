'use server';

import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';
import {
  DailyCashflow,
  CashflowExpense,
  CashflowIncome,
} from './types';
import {
  resolveExpenseFields,
  resolveIncomeFields,
  monthBounds,
  summarizeMonthlyPL,
  type PLReportResult,
  type MonthlyPLInput,
  type FixedAssetInput,
} from './calculations';


/**
 * El flujo de caja ya no mueve inventario. Un ingreso que nació de una Salida
 * de inventario (venta pagada) le pertenece a esa salida: se edita o elimina
 * desde Inventario → Salidas para que stock y caja cambien juntos.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function _saleLockError(supabase: any, incomeId: string): Promise<string | null> {
  const { data } = await supabase
    .from('inventory_movements')
    .select('id')
    .eq('income_id', incomeId)
    .limit(1);
  return data && data.length > 0
    ? 'Este ingreso proviene de una salida de inventario. Edítalo o elimínalo desde Inventario → Salidas.'
    : null;
}

export async function ensureCashflowDate(date: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  const { data: existing } = await supabase
    .from('daily_cashflows')
    .select('id, observations')
    .eq('date', date)
    .single();

  if (existing) {
    if (existing.observations === 'no_movements') {
      await supabase
        .from('daily_cashflows')
        .update({ observations: null })
        .eq('id', existing.id);
    }
    return existing.id;
  }

  const { data, error } = await supabase
    .from('daily_cashflows')
    .upsert({ date, created_by: user?.id }, { onConflict: 'date' })
    .select('id')
    .single();

  if (error) throw new Error(error.message);
  return data.id;
}

export async function getAllExpenses(era: 'v1' | 'v2' = 'v2') {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('cashflow_expenses')
    .select('*, cashflow:cashflow_id(date)')
    .eq('era', era)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching expenses:', error);
    return [];
  }
  return data;
}

/**
 * Retorna la unión ordenada de ingresos manuales + órdenes web automáticas.
 *
 * Para las órdenes automáticas ('auto') se aplica `resolveIncomeFields`
 * con categoría 'Ventas Web' para derivar fee_amount, tax_amount y net_revenue
 * usando los mismos parámetros que las escrituras manuales.
 * De este modo el listado siempre expone bruto vs neto de forma coherente.
 */
export async function getAllIncomes(era: 'v1' | 'v2' = 'v2') {
  const supabase = await createClient();

  // ── 1. Ingresos manuales (todos los campos P&L ya persisten en DB) ──
  const { data: manual, error: manErr } = await supabase
    .from('cashflow_incomes')
    .select('*, cashflow:cashflow_id(date), inventory:inventory_id(product_code, product_name, unit), salidas:inventory_movements(id)')
    .eq('era', era)
    .order('created_at', { ascending: false });

  if (manErr) console.error('getAllIncomes: manual incomes error', manErr);

  // ── 2. Órdenes web (ingresos automáticos sin registro en cashflow_incomes) ──
  // Only include web orders for v2 era (orders don't have an era column)
  let autoIncomes: any[] = [];
  if (era === 'v2') {
    const { data: orders, error: ordErr } = await supabase
      .from('orders')
      .select('id, total_amount, created_at, status')
      .in('status', ['paid', 'processing', 'shipped', 'delivered'])
      .gte('created_at', '2026-09-01T00:00:00Z')
      .order('created_at', { ascending: false });

    if (ordErr) console.error('getAllIncomes: orders error', ordErr);

    // ── 3. Proyectar órdenes con desglose P&L derivado ──────────────────
    autoIncomes = (orders || []).map((o) => {
      const rawIncome = {
        gross_amount: o.total_amount,
        amount:       o.total_amount,
        category:     'Ventas Web',
      };
      const { fields } = resolveIncomeFields(rawIncome);
      return {
        id:            o.id,
        concept:       `Venta Orden #${o.id.split('-')[0]}`,
        category:      'Ventas Web',
        type:          'auto' as const,
        // Desglose P&L derivado
        amount:        fields.amount,
        gross_amount:  fields.gross_amount,
        fee_amount:    fields.fee_amount,
        shipping_cost: fields.shipping_cost,
        tax_amount:    fields.tax_amount,
        net_revenue:   fields.net_revenue,
        // Fecha
        date:          new Date(o.created_at).toISOString().split('T')[0],
        created_at:    o.created_at,
      };
    });
  } else {
    // For v1 era, include orders before Sept 2026
    const { data: orders, error: ordErr } = await supabase
      .from('orders')
      .select('id, total_amount, created_at, status')
      .in('status', ['paid', 'processing', 'shipped', 'delivered'])
      .lt('created_at', '2026-09-01T00:00:00Z')
      .order('created_at', { ascending: false });

    if (ordErr) console.error('getAllIncomes: orders error', ordErr);

    autoIncomes = (orders || []).map((o) => {
      const rawIncome = {
        gross_amount: o.total_amount,
        amount:       o.total_amount,
        category:     'Ventas Web',
      };
      const { fields } = resolveIncomeFields(rawIncome);
      return {
        id:            o.id,
        concept:       `Venta Orden #${o.id.split('-')[0]}`,
        category:      'Ventas Web',
        type:          'auto' as const,
        amount:        fields.amount,
        gross_amount:  fields.gross_amount,
        fee_amount:    fields.fee_amount,
        shipping_cost: fields.shipping_cost,
        tax_amount:    fields.tax_amount,
        net_revenue:   fields.net_revenue,
        date:          new Date(o.created_at).toISOString().split('T')[0],
        created_at:    o.created_at,
      };
    });
  }

  // ── 4. Fusionar y ordenar por fecha descendente ─────────────────────
  const merged = [
    ...(manual || []).map(({ salidas, ...m }) => ({
      ...m,
      type: 'manual' as const,
      // Ingreso generado por una Salida de inventario: se gestiona desde allá.
      from_salida: (salidas?.length ?? 0) > 0,
    })),
    ...autoIncomes,
  ].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return merged;
}

export async function getCashflows(era: 'v1' | 'v2' = 'v2') {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('daily_cashflows')
    .select('*')
    .eq('era', era)
    .order('date', { ascending: false });

  if (error) return [];
  return data as DailyCashflow[];
}

/** Saving an asset before its migration fails on the new columns; say which one to apply. */
function assetColumnsHint(message: string) {
  return /asset_kind|asset_use|in_service_date|residual_value/.test(message)
    ? 'Falta aplicar la migración 20261015000000_expense_fixed_assets.sql para registrar activos fijos.'
    : message;
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
    // Datos de activo solo en CAPEX (las demás filas usan los valores por
    // defecto, así un gasto normal no depende de la migración de activos).
    ...(fields.expense_type === 'CAPEX'
      ? {
          asset_kind:      fields.asset_kind,
          asset_use:       fields.asset_use,
          // Sin fecha de puesta en uso, el activo se deprecia desde la compra
          in_service_date: fields.in_service_date ?? date,
          residual_value:  fields.residual_value,
        }
      : {}),
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

  if (error) return { error: assetColumnsHint(error.message) };

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
    // Datos de activo: se escriben en CAPEX, y se limpian si la fila ya
    // tiene esas columnas (migración aplicada) y deja de ser CAPEX.
    ...(fields.expense_type === 'CAPEX' || 'asset_use' in oldData
      ? {
          asset_kind:      fields.asset_kind,
          asset_use:       fields.asset_use,
          in_service_date: fields.in_service_date,
          residual_value:  fields.residual_value,
        }
      : {}),
  };

  // ── 4. Persistir ─────────────────────────────────────────────────
  const { data: newData, error } = await supabase
    .from('cashflow_expenses')
    .update(payload)
    .eq('id', id)
    .select()
    .single();

  if (error) return { error: assetColumnsHint(error.message) };

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

  const lockErr = await _saleLockError(supabase, id);
  if (lockErr) return { error: lockErr };

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

  const lockErr = await _saleLockError(supabase, id);
  if (lockErr) return { error: lockErr };

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
  const START_DATE = '2026-09-01';
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

  // Also fetch daily cashflows marked as "no movements"
  const { data: noMovementsCashflows } = await supabase
    .from('daily_cashflows')
    .select('date')
    .eq('observations', 'no_movements');

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

  // Add the no-movements dates
  (noMovementsCashflows || []).forEach((row: any) => {
    if (row.date) datesWithRecords.add(row.date);
  });

  // Return days that have NO records at all
  return allDays.filter(d => !datesWithRecords.has(d));
}

// ─────────────────────────────────────────────────────────────
// ANALYTICAL READ ACTIONS — P&L + CASHFLOW
// ─────────────────────────────────────────────────────────────


/**
 * Calcula el Estado de Resultados mensual (P&L) vs Flujo de Caja.
 *
 * @param month  Número de mes (1-12)
 * @param year   Año completo (ej. 2026)
 *
 * Todas las queries del período usan filtros >= period_start AND < period_end
 * para garantizar que las horas locales no introduzcan registros del mes adyacente.
 */
/** Every fixed asset (CAPEX expense), for the asset register. */
export async function getFixedAssets(): Promise<FixedAssetInput[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('cashflow_expenses')
    .select('*, cashflow:cashflow_id ( date )')
    .eq('expense_type', 'CAPEX')
    .order('created_at', { ascending: true });
  if (error) {
    console.error('getFixedAssets:', error.message);
    return [];
  }
  return ((data ?? []) as (FixedAssetInput & { cashflow?: { date: string } | { date: string }[] | null })[]).map(({ cashflow, ...a }) => ({
    ...a,
    purchase_date: (Array.isArray(cashflow) ? cashflow[0] : cashflow)?.date ?? null,
  }));
}

type CapexRow = MonthlyPLInput['capexItems'][number] & { cashflow?: { date: string } | { date: string }[] | null };

export async function getMonthlyPLReport(
  month: number,
  year: number
): Promise<PLReportResult> {
  const { period_start, period_end } = monthBounds(month, year);
  const supabase = await createClient();
  const capexQuery = (columns: string) =>
    supabase.from('cashflow_expenses').select(columns).eq('expense_type', 'CAPEX').lt('cashflow.date', period_end);

  // Filters on an embedded row only narrow the parent rows when the embed is
  // !inner; without it PostgREST returns every row (with cashflow = null) and
  // the "monthly" figures become all-time totals.
  const [
    { data: manualIncomes, error: incErr },
    { data: webOrders, error: ordErr },
    { data: cogsExpenses, error: cogsErr },
    { data: inventoryConsumptions, error: invErr },
    { data: opexExpenses, error: opexErr },
    { data: capexItems, error: capexErr },
    { data: paidExpenses, error: burnErr },
  ] = await Promise.all([
    supabase
      .from('cashflow_incomes')
      .select('gross_amount, fee_amount, shipping_cost, tax_amount, net_revenue, amount, cashflow:cashflow_id!inner ( date )')
      .gte('cashflow.date', period_start)
      .lt('cashflow.date', period_end),
    supabase
      .from('orders')
      .select('total_amount, created_at')
      .in('status', ['paid', 'processing', 'shipped', 'delivered'])
      .gte('created_at', `${period_start}T00:00:00Z`)
      .lt('created_at', `${period_end}T00:00:00Z`),
    supabase
      .from('cashflow_expenses')
      .select('net_amount, cashflow:cashflow_id!inner ( date )')
      .eq('expense_type', 'COGS')
      .gte('cashflow.date', period_start)
      .lt('cashflow.date', period_end),
    supabase
      .from('inventory_logs')
      .select('total_cost, created_at')
      .eq('movement_type', 'CONSUMPTION')
      .gte('created_at', `${period_start}T00:00:00Z`)
      .lt('created_at', `${period_end}T00:00:00Z`),
    supabase
      .from('cashflow_expenses')
      .select('net_amount, cashflow:cashflow_id!inner ( date )')
      .eq('expense_type', 'OPEX')
      .gte('cashflow.date', period_start)
      .lt('cashflow.date', period_end),
    // Every CAPEX bought before the period ends; summarizeMonthlyPL keeps the
    // ones still depreciating.
    capexQuery('net_amount, depreciation_months, created_at, in_service_date, residual_value, asset_use, cashflow:cashflow_id!inner ( date )'),
    supabase
      .from('cashflow_expenses')
      .select('amount, cashflow:cashflow_id!inner ( date )')
      .in('expense_type', ['OPEX', 'COGS', 'CAPEX'])
      .gte('cashflow.date', period_start)
      .lt('cashflow.date', period_end),
  ]);

  // Before the fixed-assets migration those columns do not exist yet:
  // depreciate as before (from the purchase, without residual value).
  let capexRows = capexItems;
  let capexError = capexErr;
  if (capexErr && /in_service_date|residual_value|asset_use/.test(capexErr.message)) {
    ({ data: capexRows, error: capexError } = await capexQuery('net_amount, depreciation_months, created_at, cashflow:cashflow_id!inner ( date )'));
  }

  for (const [label, err] of [
    ['manualIncomes', incErr],
    ['webOrders', ordErr],
    ['cogsExpenses', cogsErr],
    ['inventoryConsumptions', invErr],
    ['opexExpenses', opexErr],
    ['capexItems', capexError],
    ['burnRate', burnErr],
  ] as const) {
    if (err) console.error(`getMonthlyPLReport: ${label} error`, err);
  }

  return summarizeMonthlyPL({
    period_start,
    period_end,
    manualIncomes: manualIncomes ?? [],
    webOrders: webOrders ?? [],
    cogsExpenses: cogsExpenses ?? [],
    inventoryConsumptions: inventoryConsumptions ?? [],
    opexExpenses: opexExpenses ?? [],
    capexItems: ((capexRows ?? []) as unknown as CapexRow[]).map(({ cashflow, ...a }) => ({
      ...a,
      purchase_date: (Array.isArray(cashflow) ? cashflow[0] : cashflow)?.date ?? null,
    })),
    paidExpenses: paidExpenses ?? [],
  });
}

export async function markDateAsNoMovements(date: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Find or create the daily cashflow record for this date
  const cashflowId = await ensureCashflowDate(date);

  // Update its observations to 'no_movements'
  const { error } = await supabase
    .from('daily_cashflows')
    .update({ observations: 'no_movements' })
    .eq('id', cashflowId);

  if (error) return { error: error.message };

  // Add audit log
  await supabase.from('cashflow_audit_logs').insert({
    admin_id:    user?.id,
    action_type: 'UPDATE_CASHFLOW',
    cashflow_id: cashflowId,
    details: { message: `Día marcado como sin movimientos: ${date}` },
  });

  revalidatePath('/admin/cashflow');
  return { success: true };
}

export async function getInventory() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('inventory')
    .select('id, product_code, product_name, current_stock, category, unit')
    .order('product_name', { ascending: true });
  if (error) {
    console.error("Error fetching inventory for cashflow:", error);
    return [];
  }
  return data || [];
}
