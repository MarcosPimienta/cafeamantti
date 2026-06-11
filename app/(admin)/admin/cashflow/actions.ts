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

/**
 * Retorna la unión ordenada de ingresos manuales + órdenes web automáticas.
 *
 * Para las órdenes automáticas ('auto') se aplica `resolveIncomeFields`
 * con categoría 'Ventas Web' para derivar fee_amount, tax_amount y net_revenue
 * usando los mismos parámetros que las escrituras manuales.
 * De este modo el listado siempre expone bruto vs neto de forma coherente.
 */
export async function getAllIncomes() {
  const supabase = await createClient();

  // ── 1. Ingresos manuales (todos los campos P&L ya persisten en DB) ──
  const { data: manual, error: manErr } = await supabase
    .from('cashflow_incomes')
    .select('*, cashflow:cashflow_id(date), inventory:inventory_id(product_code, product_name, unit)')
    .order('created_at', { ascending: false });

  if (manErr) console.error('getAllIncomes: manual incomes error', manErr);

  // ── 2. Órdenes web (ingresos automáticos sin registro en cashflow_incomes) ──
  const { data: orders, error: ordErr } = await supabase
    .from('orders')
    .select('id, total_amount, created_at, status')
    .in('status', ['paid', 'processing', 'shipped', 'delivered'])
    .order('created_at', { ascending: false });

  if (ordErr) console.error('getAllIncomes: orders error', ordErr);

  // ── 3. Proyectar órdenes con desglose P&L derivado ──────────────────
  const autoIncomes = (orders || []).map((o) => {
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

  // ── 4. Fusionar y ordenar por fecha descendente ─────────────────────
  const merged = [
    ...(manual || []).map(m => ({ ...m, type: 'manual' as const })),
    ...autoIncomes,
  ].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

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
    // Inventario
    inventory_id:  income.inventory_id || null,
    quantity_sold: income.quantity_sold ? Number(income.quantity_sold) : 0,
  };

  // ── 3. Persistir ─────────────────────────────────────────
  const { data, error } = await supabase
    .from('cashflow_incomes')
    .insert(payload)
    .select()
    .single();

  if (error) return { error: error.message };

  // ── 3.1. Deducir inventario operacional si se especificó producto y cantidad ──
  if (payload.inventory_id && payload.quantity_sold > 0) {
    const { data: invItem, error: invErr } = await supabase
      .from('inventory')
      .select('current_stock')
      .eq('id', payload.inventory_id)
      .single();
    if (!invErr && invItem) {
      const newStock = Number(invItem.current_stock) - payload.quantity_sold;
      await supabase.from('inventory').update({ current_stock: newStock }).eq('id', payload.inventory_id);

      await supabase.from('inventory_movements').insert({
        inventory_id: payload.inventory_id,
        type: 'salida',
        quantity: -payload.quantity_sold,
        movement_date: date,
        reason: `Salida por venta física (Ingreso: ${payload.concept})`,
        created_by: user?.id,
        tab_source: 'salida',
        income_id: data.id
      });
    }
  }

  // ── 4. Audit log con snapshot completo ───────────────────
  await supabase.from('cashflow_audit_logs').insert({
    admin_id:    user?.id,
    action_type: 'CREATE_INCOME',
    income_id:   data.id,
    cashflow_id,
    details: { new: data },
  });

  revalidatePath('/admin/cashflow');
  revalidatePath('/admin/inventory');
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
    inventory_id:  income.inventory_id !== undefined ? (income.inventory_id || null) : oldData.inventory_id,
    quantity_sold: income.quantity_sold !== undefined ? Number(income.quantity_sold || 0) : Number(oldData.quantity_sold || 0),
  };

  const oldInvId = oldData.inventory_id;
  const oldQty = Number(oldData.quantity_sold || 0);
  const newInvId = payload.inventory_id;
  const newQty = Number(payload.quantity_sold || 0);
  const isInvChanged = oldInvId !== newInvId || oldQty !== newQty;

  // ── 3.1. Revertir inventario previo si cambió ─────────────
  if (isInvChanged && oldInvId && oldQty > 0) {
    const { data: oldInvItem } = await supabase.from('inventory').select('current_stock').eq('id', oldInvId).single();
    if (oldInvItem) {
      await supabase.from('inventory').update({ current_stock: Number(oldInvItem.current_stock) + oldQty }).eq('id', oldInvId);
    }
    await supabase.from('inventory_movements').delete().eq('income_id', id);
  }

  // ── 4. Persistir ─────────────────────────────────────────
  const { data: newData, error } = await supabase
    .from('cashflow_incomes')
    .update(payload)
    .eq('id', id)
    .select()
    .single();

  if (error) return { error: error.message };

  // ── 4.1. Aplicar nuevo inventario si cambió y hay producto/cantidad ──
  if (isInvChanged && newInvId && newQty > 0) {
    const { data: newInvItem } = await supabase.from('inventory').select('current_stock').eq('id', newInvId).single();
    if (newInvItem) {
      const newStock = Number(newInvItem.current_stock) - newQty;
      await supabase.from('inventory').update({ current_stock: newStock }).eq('id', newInvId);

      await supabase.from('inventory_movements').insert({
        inventory_id: newInvId,
        type: 'salida',
        quantity: -newQty,
        movement_date: oldData.cashflow?.date || new Date().toISOString().split('T')[0],
        reason: `Salida por venta física (Ingreso modificado: ${payload.concept})`,
        created_by: user?.id,
        tab_source: 'salida',
        income_id: id
      });
    }
  } else if (!isInvChanged && newInvId && newQty > 0) {
    // Si no cambió la asociación de inventario pero sí el concepto o fecha, actualizar el movimiento
    await supabase.from('inventory_movements')
      .update({
        reason: `Salida por venta física (Ingreso modificado: ${payload.concept})`,
        movement_date: oldData.cashflow?.date || new Date().toISOString().split('T')[0]
      })
      .eq('income_id', id);
  }

  // ── 5. Audit log con diff completo old→new ───────────────
  await supabase.from('cashflow_audit_logs').insert({
    admin_id:    user?.id,
    action_type: 'UPDATE_INCOME',
    income_id:   id,
    cashflow_id: oldData.cashflow_id,
    details: { old: oldData, new: newData },
  });

  revalidatePath('/admin/cashflow');
  revalidatePath('/admin/inventory');
  return { success: true, data: newData };
}

export async function deleteIncomeDirect(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: old, error: getErr } = await supabase.from('cashflow_incomes').select('*').eq('id', id).single();
  if (getErr) return { error: getErr.message };

  // Revertir inventario previo si existía
  const oldInvId = old.inventory_id;
  const oldQty = Number(old.quantity_sold || 0);
  if (oldInvId && oldQty > 0) {
    const { data: invItem } = await supabase.from('inventory').select('current_stock').eq('id', oldInvId).single();
    if (invItem) {
      await supabase.from('inventory').update({ current_stock: Number(invItem.current_stock) + oldQty }).eq('id', oldInvId);
    }
    await supabase.from('inventory_movements').delete().eq('income_id', id);
  }

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
  revalidatePath('/admin/inventory');
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

/** Shape del resultado de getMonthlyPLReport */
export interface PLReportResult {
  // ── Identificación del período ────────────────────────
  period_start:       string;   // 'YYYY-MM-DD'
  period_end:         string;

  // ── Líneas de ingreso ──────────────────────────────
  /** Suma bruta de todos los ingresos del período (gross_amount) */
  gross_revenue:      number;
  /** Comisiones pasarela (fee_amount acumulado) */
  gateway_fees:       number;
  /** Fletes cobrados (shipping_cost acumulado) */
  shipping_revenue:   number;
  /** IVA de ingresos (tax_amount acumulado) */
  sales_tax:          number;
  /** Ingresos netos operacionales = gross - fees - shipping - tax */
  net_revenue:        number;

  // ── COGS ─────────────────────────────────────────
  /** Gastos marcados COGS en cashflow_expenses */
  explicit_cogs:      number;
  /** Consumos de inventario (inventory_logs type=CONSUMPTION) */
  inventory_cogs:     number;
  /** COGS total = explicit_cogs + inventory_cogs */
  total_cogs:         number;

  // ── Utilidad Bruta ────────────────────────────────
  /** net_revenue - total_cogs */
  gross_profit:       number;
  /** gross_profit / net_revenue × 100 (0 si net_revenue = 0) */
  gross_margin_pct:   number;

  // ── OPEX ─────────────────────────────────────────
  /** Gastos operativos (expense_type=OPEX) del período */
  opex:               number;

  // ── EBITDA ────────────────────────────────────────
  /** gross_profit - opex */
  ebitda:             number;
  /** ebitda / net_revenue × 100 */
  ebitda_margin_pct:  number;

  // ── Depreciación CAPEX ─────────────────────────────
  /**
   * Cuota mensual acumulada de todos los activos CAPEX vigentes.
   * Vigente = creado en o antes del fin del período y cuya vida útil
   * (depreciation_months desde created_at) aún no expiró.
   */
  monthly_depreciation: number;

  // ── Utilidad Operativa y Burn Rate ───────────────────
  /** ebitda - monthly_depreciation */
  operating_income:   number;
  /**
   * Burn rate = total de salidas de caja reales del período.
   * Incluye OPEX + COGS explícito + CAPEX pagado (no depreciación).
   * Representa cuánto dinero salió efectivamente de la caja.
   */
  burn_rate:          number;
}

/**
 * Calcula el Estado de Resultados mensual (P&L) vs Flujo de Caja.
 *
 * @param month  Número de mes (1-12)
 * @param year   Año completo (ej. 2026)
 *
 * Todas las queries del período usan filtros >= period_start AND < period_end
 * para garantizar que las horas locales no introduzcan registros del mes adyacente.
 */
export async function getMonthlyPLReport(
  month: number,
  year: number
): Promise<PLReportResult> {
  // ── 0. Construir límites del período en formato ISO ─────────────────
  const pad       = (n: number) => String(n).padStart(2, '0');
  const period_start = `${year}-${pad(month)}-01`;
  // Primer día del mes siguiente (límite exclusivo)
  const nextMonth    = month === 12 ? 1  : month + 1;
  const nextYear     = month === 12 ? year + 1 : year;
  const period_end   = `${nextYear}-${pad(nextMonth)}-01`;

  const supabase = await createClient();

  // ── 1. Ingresos del período ──────────────────────────────────────────
  // 1a. Ingresos manuales registrados en cashflow_incomes
  //     Filtramos por la fecha del cashflow padre (columna 'date' en daily_cashflows)
  const { data: manualIncomes, error: incErr } = await supabase
    .from('cashflow_incomes')
    .select(`
      gross_amount,
      fee_amount,
      shipping_cost,
      tax_amount,
      net_revenue,
      amount,
      cashflow:cashflow_id ( date )
    `)
    .gte('cashflow.date', period_start)
    .lt('cashflow.date',  period_end);

  if (incErr) console.error('getMonthlyPLReport: manualIncomes error', incErr);

  // 1b. Órdenes web automáticas del período
  const { data: webOrders, error: ordErr } = await supabase
    .from('orders')
    .select('total_amount, created_at')
    .in('status', ['paid', 'processing', 'shipped', 'delivered'])
    .gte('created_at', `${period_start}T00:00:00Z`)
    .lt('created_at',  `${period_end}T00:00:00Z`);

  if (ordErr) console.error('getMonthlyPLReport: webOrders error', ordErr);

  // Acumular ingresos manuales
  let gross_revenue    = 0;
  let gateway_fees     = 0;
  let shipping_revenue = 0;
  let sales_tax        = 0;

  for (const inc of (manualIncomes || [])) {
    gross_revenue    += Number(inc.gross_amount ?? inc.amount ?? 0);
    gateway_fees     += Number(inc.fee_amount    ?? 0);
    shipping_revenue += Number(inc.shipping_cost ?? 0);
    sales_tax        += Number(inc.tax_amount    ?? 0);
  }

  // Proyectar y acumular órdenes web con campos P&L derivados
  for (const o of (webOrders || [])) {
    const { fields } = resolveIncomeFields({
      gross_amount: o.total_amount,
      amount:       o.total_amount,
      category:     'Ventas Web',
    });
    gross_revenue    += fields.gross_amount;
    gateway_fees     += fields.fee_amount;
    shipping_revenue += fields.shipping_cost;
    sales_tax        += fields.tax_amount;
  }

  const net_revenue = round2(gross_revenue - gateway_fees - shipping_revenue - sales_tax);

  // ── 2. COGS ──────────────────────────────────────────────────────────
  // 2a. Gastos explícitamente marcados como COGS en el período
  const { data: cogsExpenses, error: cogsErr } = await supabase
    .from('cashflow_expenses')
    .select(`
      net_amount,
      cashflow:cashflow_id ( date )
    `)
    .eq('expense_type', 'COGS')
    .gte('cashflow.date', period_start)
    .lt('cashflow.date',  period_end);

  if (cogsErr) console.error('getMonthlyPLReport: cogsExpenses error', cogsErr);

  const explicit_cogs = round2(
    (cogsExpenses || []).reduce((s, e) => s + Number(e.net_amount ?? 0), 0)
  );

  // 2b. Consumos de inventario (CONSUMPTION) del período
  //     total_cost es columna GENERATED en la DB (quantity × unit_cost)
  const { data: inventoryConsumptions, error: invErr } = await supabase
    .from('inventory_logs')
    .select('total_cost, created_at')
    .eq('movement_type', 'CONSUMPTION')
    .gte('created_at', `${period_start}T00:00:00Z`)
    .lt('created_at',  `${period_end}T00:00:00Z`);

  if (invErr) console.error('getMonthlyPLReport: inventoryConsumptions error', invErr);

  const inventory_cogs = round2(
    (inventoryConsumptions || []).reduce((s, r) => s + Number(r.total_cost ?? 0), 0)
  );

  const total_cogs   = round2(explicit_cogs + inventory_cogs);
  const gross_profit = round2(net_revenue - total_cogs);
  const gross_margin_pct = net_revenue !== 0
    ? round2((gross_profit / net_revenue) * 100)
    : 0;

  // ── 3. OPEX del período ──────────────────────────────────────────────
  const { data: opexExpenses, error: opexErr } = await supabase
    .from('cashflow_expenses')
    .select(`
      net_amount,
      cashflow:cashflow_id ( date )
    `)
    .eq('expense_type', 'OPEX')
    .gte('cashflow.date', period_start)
    .lt('cashflow.date',  period_end);

  if (opexErr) console.error('getMonthlyPLReport: opexExpenses error', opexErr);

  const opex = round2(
    (opexExpenses || []).reduce((s, e) => s + Number(e.net_amount ?? 0), 0)
  );

  const ebitda           = round2(gross_profit - opex);
  const ebitda_margin_pct = net_revenue !== 0
    ? round2((ebitda / net_revenue) * 100)
    : 0;

  // ── 4. Depreciación CAPEX — cuota mensual de activos vigentes ────────
  //
  // Un activo CAPEX es "vigente" en el período si:
  //   a) Se creó en o antes del último día del mes (period_end exclusivo)
  //   b) Su vida útil no expiró:
  //      created_at + depreciation_months > period_start
  //
  // Traemos TODOS los CAPEX creados hasta period_end y filtramos en memoria
  // (la tabla de activos es pequeña en este contexto).
  const { data: capexItems, error: capexErr } = await supabase
    .from('cashflow_expenses')
    .select('net_amount, depreciation_months, created_at')
    .eq('expense_type', 'CAPEX')
    .lt('cashflow.date', period_end);          // creado antes del fin del período

  if (capexErr) console.error('getMonthlyPLReport: capexItems error', capexErr);

  const periodStartDate = new Date(`${period_start}T00:00:00Z`);

  let monthly_depreciation = 0;

  for (const asset of (capexItems || [])) {
    const months = Number(asset.depreciation_months ?? 0);
    if (months <= 0) continue;

    const createdAt   = new Date(asset.created_at);
    // Fecha en que el activo termina de depreciarse
    const expiresAt   = new Date(createdAt);
    expiresAt.setMonth(expiresAt.getMonth() + months);

    // El activo está vigente si aún no expiró al inicio del período
    if (expiresAt > periodStartDate) {
      const monthlyQuota = round2(Number(asset.net_amount ?? 0) / months);
      monthly_depreciation += monthlyQuota;
    }
  }

  monthly_depreciation = round2(monthly_depreciation);
  const operating_income = round2(ebitda - monthly_depreciation);

  // ── 5. Burn Rate — salidas reales de caja del período ──────────────
  //
  // El burn rate refleja el dinero que SALIÓ efectivamente de la cuenta,
  // independiente de la clasificación contable.
  // = OPEX (bruto pagado) + COGS explícito (bruto pagado) + CAPEX pagado
  //
  // Usamos 'amount' (total bruto con IVA) en lugar de 'net_amount'
  // porque la caja se debitó por el total pagado al proveedor.
  const { data: allExpensesRaw, error: burnErr } = await supabase
    .from('cashflow_expenses')
    .select(`
      amount,
      cashflow:cashflow_id ( date )
    `)
    .in('expense_type', ['OPEX', 'COGS', 'CAPEX'])
    .gte('cashflow.date', period_start)
    .lt('cashflow.date',  period_end);

  if (burnErr) console.error('getMonthlyPLReport: burnRate error', burnErr);

  const burn_rate = round2(
    (allExpensesRaw || []).reduce((s, e) => s + Number(e.amount ?? 0), 0)
  );

  // ── 6. Componer y retornar el resultado ────────────────────────────
  return {
    period_start,
    period_end,
    // Ingresos
    gross_revenue:       round2(gross_revenue),
    gateway_fees:        round2(gateway_fees),
    shipping_revenue:    round2(shipping_revenue),
    sales_tax:           round2(sales_tax),
    net_revenue,
    // COGS
    explicit_cogs,
    inventory_cogs,
    total_cogs,
    // Utilidad Bruta
    gross_profit,
    gross_margin_pct,
    // OPEX
    opex,
    // EBITDA
    ebitda,
    ebitda_margin_pct,
    // Depreciación
    monthly_depreciation,
    // Utilidad Operativa
    operating_income,
    // Burn Rate
    burn_rate,
  };
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
