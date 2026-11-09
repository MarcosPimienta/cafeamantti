'use server';

import { PAID_ORDER_STATUSES } from '@/utils/orders/stock';

import { createClient } from '@/utils/supabase/server';
import { checkIsAdmin } from '../../actions';
import { orderCustomer } from '@/utils/orders/pendingDeliveries';
import { accruedInterestInMonth, type Loan, type LoanMove } from '@/utils/loans/ledger';
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
  if (data && data.length > 0) return 'Este ingreso proviene de una salida de inventario. Edítalo o elimínalo desde Inventario → Salidas.';
  // The payment of an invoice: it is removed with the payment, in Facturas.
  if (await _isPaymentIncome(supabase, incomeId)) return 'Este ingreso es el pago de una factura. Para borrarlo, elimina el pago en Facturas.';
  return null;
}

/** The income an invoice payment created: its value and date belong to the payment. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function _isPaymentIncome(supabase: any, incomeId: string): Promise<boolean> {
  const { data, error } = await supabase.from('invoice_payments').select('id').eq('cashflow_income_id', incomeId).eq('income_owned', true).limit(1);
  return !error && !!data && data.length > 0;
}

/** From this day (the v2 cutover) only web orders count by themselves; an invoice's money enters with its payments. */
const PAYMENTS_ENTER_FROM = '2026-09-16';

/**
 * Orders whose money came in by themselves (payment_status = paid), with
 * paid_at — the day they count in Flujo de Caja: web orders paid through
 * ePayco. Orders made by hand count only before the v2 cutover; since then
 * their money enters as the income of each registered payment (or a manual
 * income), so the money is counted the day it arrives, once. An order whose
 * money is already in a manual income (cashflow_income_id) is left out.
 * Before the payment migration: the old rule (paid-like statuses, on their
 * creation date).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function selectPaidOrders(supabase: any, columns: string, scope: (q: any, dateCol: 'paid_at' | 'created_at') => any): Promise<{ data: any[] | null; error: any }> {
  const paid = () => supabase.from('orders').select(`${columns}, paid_at, source`).eq('payment_status', 'paid').neq('status', 'cancelled');
  let res = await scope(paid().is('cashflow_income_id', null), 'paid_at');
  // Before 20261111000000_order_counted_in_income.sql: every paid order counts.
  if (res.error && /cashflow_income_id/.test(res.error.message)) res = await scope(paid(), 'paid_at');
  if (res.error && /payment_status|paid_at/.test(res.error.message)) {
    return scope(supabase.from('orders').select(columns).in('status', PAID_ORDER_STATUSES), 'created_at');
  }
  if (res.error) return res;
  const countsByItself = (o: { source?: string | null; paid_at?: string | null; created_at?: string }) =>
    o.source === 'web' || String(o.paid_at ?? o.created_at ?? '').slice(0, 10) < PAYMENTS_ENTER_FROM;
  return { data: (res.data ?? []).filter(countsByItself), error: null };
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
  const query = (columns: string) => supabase.from('cashflow_expenses').select(columns).eq('era', era).order('created_at', { ascending: false });
  // The supplier's name (for the report's breakdown); before the Siigo migration there is no supplier_id.
  let { data, error } = await query('*, cashflow:cashflow_id(date), supplier:supplier_id(name)');
  if (error && /supplier/.test(error.message)) ({ data, error } = await query('*, cashflow:cashflow_id(date)'));

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
    const { data: orders, error: ordErr } = await selectPaidOrders(supabase, 'id, total_amount, created_at, status', (q) =>
      q.gte('created_at', '2026-09-01T00:00:00Z').order('created_at', { ascending: false })
    );

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
        // Fecha: cuando se pagó (antes de separar el pago, su creación)
        date:          new Date(o.paid_at ?? o.created_at).toISOString().split('T')[0],
        created_at:    o.paid_at ?? o.created_at,
      };
    });
  } else {
    // For v1 era, include orders before Sept 2026
    const { data: orders, error: ordErr } = await selectPaidOrders(supabase, 'id, total_amount, created_at, status', (q) =>
      q.lt('created_at', '2026-09-01T00:00:00Z').order('created_at', { ascending: false })
    );

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
        date:          new Date(o.paid_at ?? o.created_at).toISOString().split('T')[0],
        created_at:    o.paid_at ?? o.created_at,
      };
    });
  }

  // Orders (invoices) whose money each manual income already holds.
  const linked = await ordersByIncome(supabase, (manual || []).map((m: { id: string }) => m.id));

  // ── 4. Fusionar y ordenar por fecha descendente ─────────────────────
  const merged = [
    ...(manual || []).map(({ salidas, ...m }) => ({
      ...m,
      type: 'manual' as const,
      // Ingreso generado por una Salida de inventario: se gestiona desde allá.
      from_salida: (salidas?.length ?? 0) > 0,
      linked_orders: linked.get(m.id) ?? [],
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
    // Proveedor: solo si viene (la columna llega con la migración de Siigo)
    ...(expense.supplier_id ? { supplier_id: expense.supplier_id } : {}),
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

/**
 * One payment split into several categories (e.g. the DIAN payment of
 * several withholdings): one Flujo de Caja row per line, with the same
 * date, concept, supplier and support. All or nothing.
 */
export async function createSplitExpense(
  date: string,
  base: Pick<Partial<CashflowExpense>, 'concept' | 'image_url' | 'supplier_id'>,
  lines: { category: string; amount: number; expense_type: CashflowExpense['expense_type'] }[]
) {
  if (lines.length < 2) return { error: 'Un gasto dividido necesita al menos dos líneas.' };
  if (lines.some((l) => !l.category?.trim() || !(Number(l.amount) > 0))) return { error: 'Cada línea necesita categoría y un valor mayor a cero.' };
  if (lines.some((l) => l.expense_type === 'CAPEX')) return { error: 'Un activo fijo se registra solo, no en un gasto dividido.' };
  const created: string[] = [];
  for (const l of lines) {
    const res = await createExpenseDirect(date, {
      ...base,
      category: l.category.trim(),
      amount: Number(l.amount),
      expense_type: l.expense_type,
      tax_amount: 0,
      depreciation_months: null,
    });
    if ('error' in res && res.error) {
      for (const id of created) await deleteExpenseDirect(id);
      return { error: res.error };
    }
    created.push((res as { data: { id: string } }).data.id);
  }
  return { success: true, ids: created };
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
    ...('supplier_id' in expense || 'supplier_id' in oldData ? { supplier_id: merged.supplier_id || null } : {}),
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

  // An invoice payment's income: its support and concept can change here; its value comes from the payment.
  if (await _isPaymentIncome(supabase, id)) {
    const same = (a: unknown, b: unknown) => Number(a ?? 0) === Number(b ?? 0);
    const moneyChanged =
      (income.gross_amount !== undefined && !same(income.gross_amount, oldData.gross_amount ?? oldData.amount)) ||
      (income.amount !== undefined && !same(income.amount, oldData.amount)) ||
      (income.fee_amount !== undefined && !same(income.fee_amount, oldData.fee_amount)) ||
      (income.shipping_cost !== undefined && !same(income.shipping_cost, oldData.shipping_cost)) ||
      (income.tax_amount !== undefined && !same(income.tax_amount, oldData.tax_amount)) ||
      (income.category !== undefined && income.category !== oldData.category);
    if (moneyChanged) return { error: 'El valor y la categoría de este ingreso vienen del pago de la factura: cámbialos en Facturas (borra el pago y regístralo de nuevo). Aquí puedes adjuntar el soporte o cambiar el concepto.' };
    const fields = { image_url: income.image_url !== undefined ? income.image_url ?? null : oldData.image_url, concept: income.concept ?? oldData.concept };
    const { data: newData, error } = await supabase.from('cashflow_incomes').update(fields).eq('id', id).select().single();
    if (error) return { error: error.message };
    await supabase.from('cashflow_audit_logs').insert({ admin_id: user?.id, action_type: 'UPDATE_INCOME', income_id: id, cashflow_id: oldData.cashflow_id, details: { old: { image_url: oldData.image_url, concept: oldData.concept }, new: fields } });
    revalidatePath('/admin/cashflow');
    return { success: true, data: newData };
  }

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
  const { data: orders } = await selectPaidOrders(supabase, 'created_at', (q) => q);

  (orders || []).forEach((o: any) => {
    const d = new Date(o.paid_at ?? o.created_at).toISOString().split('T')[0];
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
    selectPaidOrders(supabase, 'total_amount, created_at', (q, dateCol) =>
      q.gte(dateCol, `${period_start}T00:00:00Z`).lt(dateCol, `${period_end}T00:00:00Z`)
    ),
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

  // Interest that capitalizes (no money leaves) is still a cost of the month.
  const accruedInterest = await accruedLoanInterest(supabase, period_start.slice(0, 7));

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
    opexExpenses: [...(opexExpenses ?? []), ...(accruedInterest > 0 ? [{ net_amount: accruedInterest }] : [])],
    capexItems: ((capexRows ?? []) as unknown as CapexRow[]).map(({ cashflow, ...a }) => ({
      ...a,
      purchase_date: (Array.isArray(cashflow) ? cashflow[0] : cashflow)?.date ?? null,
    })),
    paidExpenses: paidExpenses ?? [],
  });
}

/** Interest the loans add to their capital in the month (0 before the loans migration). */
async function accruedLoanInterest(supabase: any, month: string): Promise<number> {
  const [{ data: loans, error }, { data: moves }] = await Promise.all([
    supabase.from('loans').select('*').eq('scheme', 'capitaliza'),
    supabase.from('loan_movements').select('loan_id, move_date, kind, amount'),
  ]);
  if (error || !loans) return 0;
  return (loans as Loan[]).reduce((s, l) => s + accruedInterestInMonth(l, (moves ?? []) as LoanMove[], month), 0);
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

// ── Manual income ↔ the orders (invoices) it pays ─────────────────────

/** An order a manual income can hold: its invoice number when it has one. */
export type LinkableOrder = {
  id: string;
  /** "FV-2-770", "Factura por enviar" or null (no invoice). */
  invoice: string | null;
  customer: string;
  total: number;
  date: string;
  paid: boolean;
  /** The manual income that already holds it (null = none). */
  income_id: string | null;
};

const NO_ID = '00000000-0000-0000-0000-000000000000';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function describeOrders(supabase: any, rows: { id: string; total_amount: number; created_at: string; paid_at?: string | null; payment_status?: string | null; cashflow_income_id?: string | null; client_id?: string | null; shipping_info?: unknown; contact_email?: string | null }[]): Promise<LinkableOrder[]> {
  if (!rows.length) return [];
  const clientIds = [...new Set(rows.map((r) => r.client_id).filter(Boolean))] as string[];
  const [{ data: clients }, { data: invoices }] = await Promise.all([
    clientIds.length ? supabase.from('clients').select('id, name').in('id', clientIds) : Promise.resolve({ data: [] }),
    supabase.from('sales_invoices').select('order_id, siigo_name, status').in('order_id', rows.map((r) => r.id)).neq('status', 'anulada'),
  ]);
  const clientName = new Map(((clients ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
  const invoiceOf = new Map(((invoices ?? []) as { order_id: string; siigo_name: string | null }[]).map((i) => [i.order_id, i.siigo_name ?? 'Factura por enviar']));
  return rows.map((r) => ({
    id: r.id,
    invoice: invoiceOf.get(r.id) ?? null,
    customer: orderCustomer({ ...r, client: r.client_id ? { name: clientName.get(r.client_id) ?? null } : null }),
    total: Number(r.total_amount || 0),
    date: String(r.paid_at ?? r.created_at).slice(0, 10),
    paid: r.payment_status === 'paid',
    income_id: r.cashflow_income_id ?? null,
  }));
}

const ORDER_COLUMNS = 'id, total_amount, created_at, paid_at, payment_status, cashflow_income_id, client_id, shipping_info, contact_email';

/** For each manual income, the orders it holds (empty before the link migration). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ordersByIncome(supabase: any, incomeIds: string[]): Promise<Map<string, LinkableOrder[]>> {
  const out = new Map<string, LinkableOrder[]>();
  if (!incomeIds.length) return out;
  const { data, error } = await supabase.from('orders').select(ORDER_COLUMNS).in('cashflow_income_id', incomeIds);
  if (error) return out;
  for (const o of await describeOrders(supabase, data ?? [])) {
    out.set(o.income_id!, [...(out.get(o.income_id!) ?? []), o]);
  }
  return out;
}

/**
 * Orders a manual income of this date could be paying: not cancelled, with a
 * value, made or paid from 60 days before to 30 after (plus those this income
 * already holds), closest to the date first.
 */
export async function getLinkableOrders(date: string, incomeId?: string | null) {
  if (!(await checkIsAdmin())) return { error: 'Unauthorized', orders: [] as LinkableOrder[] };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'Fecha inválida.', orders: [] as LinkableOrder[] };
  const supabase = await createClient();
  const shift = (n: number) => { const t = new Date(`${date}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
  const { data, error } = await supabase
    .from('orders')
    .select(ORDER_COLUMNS)
    .neq('status', 'cancelled')
    .gte('created_at', `${shift(-60)}T00:00:00Z`)
    .lte('created_at', `${shift(30)}T23:59:59Z`);
  if (error) {
    if (/cashflow_income_id/.test(error.message)) return { error: 'Falta aplicar la migración 20261111000000_order_counted_in_income.sql', orders: [] as LinkableOrder[] };
    return { error: error.message, orders: [] as LinkableOrder[] };
  }
  let rows = (data ?? []).filter((o: { total_amount: number }) => Number(o.total_amount) > 0);
  if (incomeId) {
    const { data: mine } = await supabase.from('orders').select(ORDER_COLUMNS).eq('cashflow_income_id', incomeId);
    const seen = new Set(rows.map((r: { id: string }) => r.id));
    rows = [...rows, ...(mine ?? []).filter((m: { id: string }) => !seen.has(m.id))];
  }
  const orders = await describeOrders(supabase, rows);
  const gap = (d: string) => Math.abs(Date.parse(d) - Date.parse(date));
  orders.sort((a, b) => Number(b.income_id === incomeId && !!incomeId) - Number(a.income_id === incomeId && !!incomeId) || gap(a.date) - gap(b.date));
  return { orders };
}

/**
 * The orders (invoices) whose money this manual income holds: Flujo de Caja
 * stops counting them by themselves. Orders left out are released. An order
 * another income already holds is refused.
 */
export async function setIncomeOrders(incomeId: string, orderIds: string[]) {
  if (!(await checkIsAdmin())) return { error: 'Unauthorized' };
  const supabase = await createClient();
  const ids = [...new Set(orderIds)];
  const { data: income, error: incErr } = await supabase.from('cashflow_incomes').select('id').eq('id', incomeId).maybeSingle();
  if (incErr) return { error: incErr.message };
  if (!income) return { error: 'Ese ingreso ya no existe en Flujo de Caja.' };

  const { data: current, error: curErr } = await supabase.from('orders').select('id, cashflow_income_id').in('id', ids.length ? ids : [NO_ID]);
  if (curErr) {
    if (/cashflow_income_id/.test(curErr.message)) return { error: 'Falta aplicar la migración 20261111000000_order_counted_in_income.sql' };
    return { error: curErr.message };
  }
  const taken = ((current ?? []) as { id: string; cashflow_income_id: string | null }[]).filter((o) => o.cashflow_income_id && o.cashflow_income_id !== incomeId);
  if (taken.length) {
    const { data: takenRows } = await supabase.from('orders').select(ORDER_COLUMNS).in('id', taken.map((t) => t.id));
    const described = await describeOrders(supabase, takenRows ?? []);
    return { error: `Ya están ligados a otro ingreso: ${described.map((d) => d.invoice ?? `Pedido #${d.id.slice(0, 8)}`).join(', ')}. Quítalos de ese ingreso primero.` };
  }

  const { data: before } = await supabase.from('orders').select('id').eq('cashflow_income_id', incomeId);
  const release = ((before ?? []) as { id: string }[]).map((o) => o.id).filter((id) => !ids.includes(id));
  if (release.length) {
    const { error } = await supabase.from('orders').update({ cashflow_income_id: null }).in('id', release);
    if (error) return { error: error.message };
  }
  if (ids.length) {
    const { error } = await supabase.from('orders').update({ cashflow_income_id: incomeId }).in('id', ids);
    if (error) return { error: error.message };
  }
  for (const path of ['/admin/cashflow', '/admin/invoices', '/admin/orders']) revalidatePath(path);
  return { success: true as const };
}

