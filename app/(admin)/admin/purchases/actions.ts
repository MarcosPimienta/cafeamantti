'use server';

// Compras: invoices received from companies, sent to Siigo as purchase
// invoices owed to the supplier, and the payments of those invoices and of
// signed cuentas de cobro. A payment becomes a Siigo payment receipt
// (recibo de pago/egreso) against the document, and expenses in Flujo de
// Caja on the payment date for what actually left (net of withholdings).
// Mutations return { success, error }: production hides thrown messages.

import { revalidatePath } from 'next/cache';
import { createClient } from '@/utils/supabase/server';
import { checkIsAdmin } from '../../actions';
import { createExpenseDirect } from '../cashflow/actions';
import { ADVANCE_CATEGORY } from '../cashflow/types';
import { categoryMonths, categoryTypes, namesOf } from '@/utils/expenses/categories';
import { loadExpenseCategories } from '@/utils/expenses/server';
import { getSiigoClient, idempotencyKey, siigoConfigFromEnv } from '@/utils/siigo/api';
import { buildAdvanceCrossPayload, buildAdvancePaymentPayload, buildAdvanceRefundPayload, buildPaymentReceiptPayload, buildPurchaseBillPayload, cleanIdentification, splitDocumentName } from '@/utils/siigo/mapping';
import { daneCodeFor } from '@/utils/siigo/daneCities';
import { ensureSiigoSupplier, errorText, loadSiigoSettings, siigoLog, todayBogota, type Supabase } from '@/utils/siigo/server';
import { entryTypeFor, tracksStock } from '@/utils/inventory/categories';
import { isGrindTracked } from '@/app/(admin)/coffeeProfiles';
import { advanceBalance, advanceUseProblems, allocateAdvances, allocatePayment, billProblems, billTotals, payableBalance, payablePaymentProblems, splitPayment, type BillLine, type PayableMethod } from '@/utils/payables/ledger';

const MIGRATION_HINT = 'Falta aplicar la migración 20261025000000_purchases_payables.sql';
/** Siigo requires the supplier invoice's prefix; without one the accountant uses "FC". */
const NO_PREFIX = 'FC';
const providerPrefix = (raw: string | null | undefined) => (raw ?? '').trim().toUpperCase() || NO_PREFIX;

const MIGRATION_INVENTORY_HINT = 'Falta aplicar la migración 20261028000000_purchase_bill_inventory.sql';
const MIGRATION_ADVANCES_HINT = 'Falta aplicar la migración 20261029000000_supplier_advances.sql';
const MIGRATION_JOURNALS_HINT = 'Falta aplicar la migración 20261030000000_supplier_advance_journals.sql';
/** Fixed asset categories (built-in and the team's, active or not): their lines carry a useful life. */
async function assetCategoryNames(supabase: Supabase) {
  return namesOf(await loadExpenseCategories(supabase, { includeInactive: true }), (c) => c.type === 'CAPEX');
}

async function requireAdmin() {
  if (!(await checkIsAdmin())) throw new Error('Unauthorized');
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, userId: user?.id ?? null };
}

function message(err: unknown) {
  const m = errorText(err);
  if (/applied/.test(m) && /column|schema/i.test(m)) return MIGRATION_JOURNALS_HINT;
  if (/supplier_advances|ANTICIPO|payable_payments_method_check|cashflow_expenses_expense_type_check/.test(m)) return MIGRATION_ADVANCES_HINT;
  if (/purchase_bills|payable_payments|siigo_ds_owed/.test(m) && /exist|relation|schema|column/i.test(m)) return MIGRATION_HINT;
  if (/purchase_bills_provider_invoice_key/.test(m)) return 'Esa factura del proveedor ya está registrada.';
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
  revalidatePath('/admin/purchases');
  revalidatePath('/admin/cuentas-cobro');
  revalidatePath('/admin/cashflow');
}

// ── Reading ─────────────────────────────────────────────────

export async function getPurchases() {
  const { supabase } = await requireAdmin();
  const settings = await loadSiigoSettings(supabase);
  const [{ data: bills, error }, { data: suppliers }, { data: ccs }, { data: inventory }] = await Promise.all([
    supabase.from('purchase_bills').select('*, payments:payable_payments ( * )').order('issue_date', { ascending: false }),
    supabase.from('suppliers').select('id, name, document_type, document_number').order('name'),
    supabase.from('cuentas_cobro').select('*, payments:payable_payments ( * )').eq('type', 'gasto').eq('status', 'firmada'),
    supabase.from('inventory').select('id, product_code, product_name, unit, category').order('product_name'),
  ]);
  const { data: advances, error: advErr } = await supabase.from('supplier_advances').select('*').order('move_date', { ascending: false }).order('created_at', { ascending: false });
  const allCategories = await loadExpenseCategories(supabase);
  const categories = namesOf(allCategories);
  return {
    migrationApplied: !error,
    bills: bills ?? [],
    suppliers: suppliers ?? [],
    // Signed cuentas de cobro still owed (registered the old way = already paid).
    cuentasCobro: (ccs ?? [])
      .filter((c) => !c.expense_id)
      .map((c) => ({ id: c.id, number: c.number, issuer_name: c.issuer_name, total: Number(c.siigo_ds_owed ?? c.total_amount), paid: (c.payments ?? []).reduce((s: number, p: { amount: number }) => s + Number(p.amount), 0), date: c.siigo_ds_date ?? c.issue_date })),
    categories,
    // Fixed asset classes: their lines ask for a useful life.
    assetCategories: namesOf(allCategories, (c) => c.type === 'CAPEX'),
    assetMonths: categoryMonths(allCategories),
    // Saldo a favor: every movement (null before its migration).
    advances: advErr ? null : advances ?? [],
    // Products a purchase can bring in (services have no stock).
    inventory: (inventory ?? []).filter((p) => tracksStock(p.category, p.product_code)),
    accounts: settings.siigo_accounts ?? [],
    defaultAccounts: settings.expense_accounts ?? {},
    configured: !!siigoConfigFromEnv(),
    today: todayBogota(),
  };
}

/** IVA and Retefuente taxes in Siigo, for the purchase invoice form. */
export async function getPurchaseTaxes() {
  await requireAdmin();
  return guard(async () => {
    const taxes = await getSiigoClient().request<{ id: number; name: string; type?: string; percentage?: number; active?: boolean }[]>('GET', '/v1/taxes');
    const pick = (type: string) =>
      (taxes ?? []).filter((t) => t.type === type && t.active !== false).map((t) => ({ id: t.id, name: t.name, rate: Number(t.percentage ?? 0) })).sort((a, b) => a.rate - b.rate);
    return { iva: pick('IVA'), retentions: pick('Retefuente') };
  });
}

// ── Purchase invoices ───────────────────────────────────────

export type BillInput = {
  supplierId: string;
  providerPrefix: string;
  providerNumber: string;
  issueDate: string;
  dueDate: string;
  notes?: string | null;
  lines: BillLine[];
};

/** Saves a supplier's invoice and sends it to Siigo as a purchase invoice owed to them. */
export async function createBill(input: BillInput) {
  const { supabase, userId } = await requireAdmin();
  return guard(async () => {
    const { data: supplier, error: supErr } = await supabase.from('suppliers').select('*').eq('id', input.supplierId).single();
    if (supErr || !supplier) throw supErr ?? new Error('Proveedor no encontrado.');
    const identification = cleanIdentification(supplier.document_number).identification;
    const capex = await assetCategoryNames(supabase);
    const lines = normalizeLines(input.lines, input.issueDate, capex);
    const bill = { supplier_identification: identification, provider_number: input.providerNumber.trim(), issue_date: input.issueDate, due_date: input.dueDate, lines };
    const problems = billProblems(bill, capex);
    if (problems.length) throw new Error(problems.join(' · '));
    const totals = billTotals(lines);
    const { data: created, error } = await supabase
      .from('purchase_bills')
      .insert({
        supplier_id: supplier.id,
        supplier_name: supplier.name,
        supplier_identification: identification,
        provider_prefix: providerPrefix(input.providerPrefix),
        provider_number: bill.provider_number,
        issue_date: input.issueDate,
        due_date: input.dueDate,
        lines,
        subtotal: totals.subtotal,
        iva: totals.iva,
        withheld: totals.withheld,
        total: totals.total,
        notes: input.notes?.trim() || null,
        status: 'borrador',
        created_by: userId,
      })
      .select('id')
      .single();
    if (error) throw error;
    // What the invoice brought in goes into stock now (the purchase happened,
    // whether or not Siigo accepts it right away).
    let stocked: string[];
    try {
      stocked = await stockBillLines(supabase, userId, created.id, {
        lines,
        date: input.issueDate,
        label: `Compra · ${supplier.name} ${providerPrefix(input.providerPrefix)}${bill.provider_number}`,
        supplier: supplier.name,
      });
    } catch (err) {
      await supabase.from('purchase_bills').delete().eq('id', created.id);
      throw err;
    }
    const sent = await sendBillToSiigo(supabase, userId, created.id);
    refresh();
    revalidatePath('/admin/inventory');
    return { id: created.id, stocked, ...sent };
  });
}

/**
 * Corrects a purchase invoice that hasn't reached Siigo (saved, or failed),
 * then sends it. Its stock follows the new lines: only the difference
 * moves, and it can't take out what was already used.
 */
export async function updateBill(billId: string, input: BillInput) {
  const { supabase, userId } = await requireAdmin();
  return guard(async () => {
    const { data: current, error: curErr } = await supabase.from('purchase_bills').select('*, payments:payable_payments ( amount )').eq('id', billId).single();
    if (curErr || !current) throw curErr ?? new Error('Factura de compra no encontrada.');
    if (current.siigo_id) throw new Error('La factura ya está en Siigo: corrígela o anúlala allá.');
    if (current.status === 'anulada') throw new Error('La factura está anulada.');

    const { data: supplier, error: supErr } = await supabase.from('suppliers').select('*').eq('id', input.supplierId).single();
    if (supErr || !supplier) throw supErr ?? new Error('Proveedor no encontrado.');
    const identification = cleanIdentification(supplier.document_number).identification;
    const capex = await assetCategoryNames(supabase);
    const lines = normalizeLines(input.lines, input.issueDate, capex);
    const bill = { supplier_identification: identification, provider_number: input.providerNumber.trim(), issue_date: input.issueDate, due_date: input.dueDate, lines };
    const problems = billProblems(bill, capex);
    if (problems.length) throw new Error(problems.join(' · '));
    const totals = billTotals(lines);
    const paid = ((current.payments ?? []) as { amount: number }[]).reduce((sum, p) => sum + Number(p.amount), 0);
    if (totals.total + 0.5 < paid) throw new Error('El nuevo total queda por debajo de lo que ya se pagó.');

    // Stock: check what would leave before touching anything.
    const { data: oldMovs } = await supabase.from('inventory_movements').select('id, inventory_id, quantity').eq('purchase_bill_id', billId);
    const delta = new Map<string, number>();
    for (const m of oldMovs ?? []) delta.set(m.inventory_id, (delta.get(m.inventory_id) ?? 0) - Number(m.quantity));
    for (const l of lines) if (l.inventory_id && Number(l.inventory_qty) > 0) delta.set(l.inventory_id, (delta.get(l.inventory_id) ?? 0) + Number(l.inventory_qty));
    if (delta.size) {
      const { data: products } = await supabase.from('inventory').select('id, product_code, product_name, category, current_stock').in('id', [...delta.keys()]);
      for (const [id, d] of delta) {
        const p = (products ?? []).find((x) => x.id === id);
        if (!p) throw new Error('Producto del inventario no encontrado.');
        if (d > 0 && !tracksStock(p.category, p.product_code)) throw new Error(`"${p.product_name}" no lleva inventario (servicio o venta por pedido).`);
        if (d < 0 && Number(p.current_stock) + d < -1e-9) throw new Error(`No se puede bajar la cantidad: ya se usó parte de lo que entró de "${p.product_name}" (quedan ${Number(p.current_stock)}).`);
      }
    }

    const prefix = providerPrefix(input.providerPrefix);
    const { error: upErr } = await supabase
      .from('purchase_bills')
      .update({
        supplier_id: supplier.id,
        supplier_name: supplier.name,
        supplier_identification: identification,
        provider_prefix: prefix,
        provider_number: bill.provider_number,
        issue_date: input.issueDate,
        due_date: input.dueDate,
        lines,
        subtotal: totals.subtotal,
        iva: totals.iva,
        withheld: totals.withheld,
        total: totals.total,
        notes: input.notes?.trim() || null,
        status: 'borrador',
        siigo_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', billId);
    if (upErr) throw upErr;

    // Old entradas out, new ones in: the net change is the difference checked above.
    for (const m of oldMovs ?? []) {
      const { data: cur } = await supabase.from('inventory').select('current_stock').eq('id', m.inventory_id).single();
      await supabase.from('inventory').update({ current_stock: Number(cur?.current_stock ?? 0) - Number(m.quantity) }).eq('id', m.inventory_id);
      await supabase.from('inventory_movements').delete().eq('id', m.id);
    }
    const stocked = await stockBillLines(supabase, userId, billId, {
      lines,
      date: input.issueDate,
      label: `Compra · ${supplier.name} ${prefix}${bill.provider_number}`,
      supplier: supplier.name,
    });
    const sent = await sendBillToSiigo(supabase, userId, billId);
    refresh();
    revalidatePath('/admin/inventory');
    return { id: billId, stocked, ...sent };
  });
}

/** Clean lines; a fixed asset starts being used on the invoice date unless told otherwise. */
const normalizeLines = (lines: BillLine[], issueDate: string, capex: string[]): BillLine[] =>
  lines.map((l) => ({
    ...l,
    base: Number(l.base),
    tax_rate: Number(l.tax_rate) || 0,
    retention_rate: Number(l.retention_rate) || 0,
    description: (l.description || l.category).trim(),
    inventory_id: l.inventory_id || null,
    inventory_qty: l.inventory_id ? Number(l.inventory_qty) || 0 : null,
    depreciation_months: capex.includes(l.category) ? Math.floor(Number(l.depreciation_months)) || null : null,
    in_service_date: capex.includes(l.category) ? l.in_service_date || issueDate : null,
  }));

/**
 * Inventory 'entradas' for the lines that bring stock in, linked to the
 * invoice. All or nothing: a failure undoes the ones already written.
 * Returns "598 kg Café Verde"-style descriptions.
 */
async function stockBillLines(
  supabase: Supabase,
  userId: string | null,
  billId: string,
  opts: { lines: BillLine[]; date: string; label: string; supplier: string }
): Promise<string[]> {
  const wanted = opts.lines.filter((l) => l.inventory_id && Number(l.inventory_qty) > 0);
  if (!wanted.length) return [];
  const { data: products, error } = await supabase
    .from('inventory')
    .select('id, product_code, product_name, category, unit, current_stock')
    .in('id', wanted.map((l) => l.inventory_id as string));
  if (error) throw error;
  const done: { movementId: string; inventoryId: string; qty: number }[] = [];
  const stocked: string[] = [];
  try {
    for (const l of wanted) {
      const p = (products ?? []).find((x) => x.id === l.inventory_id);
      if (!p) throw new Error('Producto del inventario no encontrado.');
      if (!tracksStock(p.category, p.product_code)) throw new Error(`"${p.product_name}" no lleva inventario (servicio o venta por pedido).`);
      const qty = Number(l.inventory_qty);
      const row = {
        inventory_id: p.id,
        type: 'entrada',
        quantity: qty,
        reason: opts.label,
        responsable: opts.supplier,
        entry_type: entryTypeFor(p.category ?? ''),
        tab_source: 'entrada',
        movement_date: opts.date,
        molienda: isGrindTracked(p.product_code) ? 'grano' : null,
        created_by: userId,
        purchase_bill_id: billId,
      };
      const { data: mov, error: movErr } = await supabase.from('inventory_movements').insert(row).select('id').single();
      if (movErr && /purchase_bill_id/.test(movErr.message)) throw new Error(MIGRATION_INVENTORY_HINT);
      if (movErr || !mov) throw movErr ?? new Error('No se pudo registrar la entrada.');
      const { data: cur } = await supabase.from('inventory').select('current_stock').eq('id', p.id).single();
      const { error: stockErr } = await supabase.from('inventory').update({ current_stock: Number(cur?.current_stock ?? 0) + qty }).eq('id', p.id);
      if (stockErr) throw stockErr;
      done.push({ movementId: mov.id, inventoryId: p.id, qty });
      stocked.push(`${qty} ${p.unit ?? ''} ${p.product_name}`.replace(/\s+/g, ' ').trim());
    }
  } catch (err) {
    for (const d of done.reverse()) {
      await supabase.from('inventory_movements').delete().eq('id', d.movementId);
      const { data: cur } = await supabase.from('inventory').select('current_stock').eq('id', d.inventoryId).single();
      await supabase.from('inventory').update({ current_stock: Number(cur?.current_stock ?? 0) - d.qty }).eq('id', d.inventoryId);
    }
    throw err;
  }
  return stocked;
}

/** Takes back out the stock an invoice brought in (on annulment), if it is still there. */
async function unstockBill(supabase: Supabase, billId: string) {
  const { data: movs, error } = await supabase.from('inventory_movements').select('id, inventory_id, quantity').eq('purchase_bill_id', billId);
  if (error || !movs?.length) return;
  const { data: products } = await supabase.from('inventory').select('id, product_name, current_stock').in('id', movs.map((m) => m.inventory_id));
  for (const m of movs) {
    const p = (products ?? []).find((x) => x.id === m.inventory_id);
    if (p && Number(p.current_stock) < Number(m.quantity) - 1e-9) {
      throw new Error(`No se puede anular: ya se usó parte de lo que entró de "${p.product_name}" (quedan ${Number(p.current_stock)}).`);
    }
  }
  for (const m of movs) {
    const p = (products ?? []).find((x) => x.id === m.inventory_id);
    await supabase.from('inventory').update({ current_stock: Number(p?.current_stock ?? 0) - Number(m.quantity) }).eq('id', m.inventory_id);
    await supabase.from('inventory_movements').delete().eq('id', m.id);
  }
}

/** Sends (or retries) a purchase invoice; a failure stays on the invoice. */
async function sendBillToSiigo(supabase: Supabase, userId: string | null, billId: string): Promise<{ sent: boolean; siigoName: string | null; siigoError: string | null }> {
  const { data: bill, error } = await supabase.from('purchase_bills').select('*').eq('id', billId).single();
  if (error || !bill) throw error ?? new Error('Factura de compra no encontrada.');
  if (bill.siigo_id) return { sent: true, siigoName: bill.siigo_name, siigoError: null };
  // Saved before the prefix was required: the same "FC" here, so payments find it.
  if (!bill.provider_prefix?.trim()) {
    bill.provider_prefix = NO_PREFIX;
    await supabase.from('purchase_bills').update({ provider_prefix: NO_PREFIX }).eq('id', billId);
  }
  try {
    if (!siigoConfigFromEnv()) throw new Error('Siigo no está configurado en el servidor.');
    const settings = await loadSiigoSettings(supabase);
    const { payload, problems } = buildPurchaseBillPayload(bill, settings);
    if (problems.length) throw new Error(problems.join(' · '));
    const { data: supplier } = bill.supplier_id ? await supabase.from('suppliers').select('*').eq('id', bill.supplier_id).maybeSingle() : { data: null };
    await ensureSiigoSupplier(supabase, userId, {
      name: bill.supplier_name,
      document_number: supplier?.document_number ?? bill.supplier_identification,
      email: supplier?.email,
      phone: supplier?.phone,
      address: supplier?.address,
      city_code: daneCodeFor(supplier?.city),
    });
    const out = await getSiigoClient().request<{ id: string; name?: string }>('POST', '/v1/purchases', { body: payload });
    await supabase.from('purchase_bills').update({ status: 'registrada', siigo_id: out.id, siigo_name: out.name ?? null, siigo_error: null, updated_at: new Date().toISOString() }).eq('id', billId);
    await siigoLog(supabase, userId, { entity: 'purchase', local_id: billId, siigo_id: out.id, siigo_name: out.name ?? null, status: 'ok', message: `${bill.supplier_name} ${bill.provider_prefix}${bill.provider_number}` });
    // Payments registered before it reached Siigo go now.
    const { data: waiting } = await supabase.from('payable_payments').select('id').eq('bill_id', billId).in('siigo_status', ['pendiente', 'error']);
    for (const p of waiting ?? []) await sendPaymentReceipt(supabase, userId, p.id);
    return { sent: true, siigoName: out.name ?? null, siigoError: null };
  } catch (err) {
    const msg = message(err);
    await supabase.from('purchase_bills').update({ status: 'error', siigo_error: msg, updated_at: new Date().toISOString() }).eq('id', billId);
    await siigoLog(supabase, userId, { entity: 'purchase', local_id: billId, status: 'error', message: msg });
    return { sent: false, siigoName: null, siigoError: msg };
  }
}

export async function retryBill(billId: string) {
  const { supabase, userId } = await requireAdmin();
  return guard(async () => {
    const res = await sendBillToSiigo(supabase, userId, billId);
    refresh();
    if (!res.sent) throw new Error(res.siigoError ?? 'No se pudo enviar a Siigo.');
    return res;
  });
}

/** A purchase invoice that never reached Siigo and has no payments is discarded. */
export async function annulBill(billId: string) {
  const { supabase } = await requireAdmin();
  return guard(async () => {
    const { data: bill, error } = await supabase.from('purchase_bills').select('id, siigo_id').eq('id', billId).single();
    if (error || !bill) throw error ?? new Error('Factura de compra no encontrada.');
    if (bill.siigo_id) throw new Error('La factura ya está en Siigo: anúlala allá.');
    const { count } = await supabase.from('payable_payments').select('id', { count: 'exact', head: true }).eq('bill_id', billId);
    if (count) throw new Error('La factura tiene pagos registrados: elimínalos primero.');
    await unstockBill(supabase, billId);
    const { error: upErr } = await supabase.from('purchase_bills').update({ status: 'anulada', updated_at: new Date().toISOString() }).eq('id', billId);
    if (upErr) throw upErr;
    refresh();
    revalidatePath('/admin/inventory');
    return {};
  });
}

// ── Payments to suppliers ───────────────────────────────────

export type PayableTarget = { billId: string } | { cuentaCobroId: string };
export type PayableInput = {
  date: string;
  amount: number;
  method: PayableMethod;
  notes?: string | null;
  category?: string | null;
  /** The transfer was more than the balance: the rest stays as the supplier's saldo a favor. */
  keepExcess?: boolean;
};

type Document = {
  supplierId: string | null;
  supplierName: string;
  supplierIdentification: string;
  label: string;
  /** What is owed in total and what was paid. */
  total: number;
  payments: { amount: number }[];
  /** Expense lines to split the payment by. */
  lines: BillLine[];
  /** Where Siigo can find the debt (null = not in Siigo: the payment can't cross it yet). */
  due: { prefix: string; consecutive: string | number; date: string } | null;
  /** Registered by hand in Siigo: the egreso is made there too. */
  manual: boolean;
};

async function loadDocument(supabase: Supabase, target: PayableTarget, category?: string | null): Promise<Document> {
  if ('billId' in target) {
    const { data: bill, error } = await supabase.from('purchase_bills').select('*, payments:payable_payments ( amount )').eq('id', target.billId).single();
    if (error || !bill) throw error ?? new Error('Factura de compra no encontrada.');
    if (bill.status === 'anulada') throw new Error('La factura está anulada.');
    return {
      supplierId: bill.supplier_id,
      supplierName: bill.supplier_name,
      supplierIdentification: bill.supplier_identification,
      label: `factura ${bill.provider_prefix}${bill.provider_number}${bill.siigo_name ? ` (${bill.siigo_name})` : ''}`,
      total: Number(bill.total),
      payments: bill.payments ?? [],
      lines: bill.lines as BillLine[],
      due: bill.siigo_id ? { prefix: bill.provider_prefix, consecutive: bill.provider_number, date: bill.due_date } : null,
      manual: false,
    };
  }
  const { data: cc, error } = await supabase.from('cuentas_cobro').select('*, payments:payable_payments ( amount )').eq('id', target.cuentaCobroId).single();
  if (error || !cc) throw error ?? new Error('Cuenta de cobro no encontrada.');
  if (cc.type !== 'gasto' || cc.status !== 'firmada') throw new Error('Solo se pagan cuentas de cobro de gasto firmadas.');
  if (cc.expense_id) throw new Error('Esta cuenta de cobro ya se registró como gasto (pagada).');
  const cat = category || cc.siigo_ds_category;
  if (!cat) throw new Error('Elige la categoría del gasto.');
  const ident = cleanIdentification(cc.issuer_document).identification;
  const { data: suppliers } = await supabase.from('suppliers').select('id, document_number');
  const supplier = (suppliers ?? []).find((s) => cleanIdentification(s.document_number).identification === ident);
  const total = Number(cc.siigo_ds_owed ?? cc.total_amount);
  return {
    supplierId: supplier?.id ?? null,
    supplierName: cc.issuer_name,
    supplierIdentification: ident,
    label: `cuenta de cobro No. ${cc.number}${cc.siigo_ds_name ? ` (${cc.siigo_ds_name})` : ''}`,
    total,
    payments: cc.payments ?? [],
    lines: [{ category: cat, account: '', description: cc.concept ?? '', base: total, tax_id: null, tax_rate: 0, retention_id: null, retention_rate: 0 }],
    // The support document goes with prefix CC + the cuenta de cobro number.
    due: cc.siigo_ds_id ? { prefix: 'CC', consecutive: cc.number, date: cc.siigo_ds_date ?? cc.issue_date } : null,
    manual: cc.siigo_ds_status === 'manual',
  };
}

/**
 * Registers a payment: Flujo de Caja expenses on its date (split by
 * category, IVA inside), then the Siigo egreso against the document. If
 * the document isn't in Siigo yet, the egreso waits for it. A transfer
 * above the balance (keepExcess) leaves the rest as an advance; method
 * "advance" pays with the supplier's saldo a favor instead.
 */
export async function registerPayablePayment(target: PayableTarget, input: PayableInput) {
  const { supabase, userId } = await requireAdmin();
  return guard(async () => {
    if (!['bank', 'cash', 'advance'].includes(input.method)) throw new Error('Medio de pago inválido.');
    const doc = await loadDocument(supabase, target, input.category);
    const amount = Number(input.amount);
    const balance = payableBalance(doc.total, doc.payments);
    if (input.method === 'advance') return payWithAdvance(supabase, userId, target, doc, balance, input);

    const { toDocument, excess } = splitPayment(balance, amount);
    const keepsExcess = excess > 0.5 && !!input.keepExcess;
    // With the excess kept, only what pays the document is checked (a paid document only takes the advance).
    const problems = keepsExcess
      ? payablePaymentProblems(Infinity, amount, input.date)
      : payablePaymentProblems(balance, amount, input.date);
    if (problems.length) throw new Error(problems.join(' · '));

    let payment: { id: string } | null = null;
    const expenseIds: string[] = [];
    if (toDocument > 0.5) {
      const paid = keepsExcess ? toDocument : amount;
      try {
        expenseIds.push(...(await paymentExpenses(doc, input.date, paid)));
        const { data, error } = await supabase
          .from('payable_payments')
          .insert({
            ...documentRef(target),
            payment_date: input.date,
            amount: paid,
            method: input.method,
            notes: input.notes?.trim() || null,
            expense_ids: expenseIds,
            siigo_status: doc.manual ? 'no_aplica' : 'pendiente',
            created_by: userId,
          })
          .select('id')
          .single();
        if (error) throw error;
        payment = data;
      } catch (err) {
        if (expenseIds.length) await supabase.from('cashflow_expenses').delete().in('id', expenseIds);
        throw err;
      }
    }

    let advance: AdvanceResult | null = null;
    if (keepsExcess) {
      try {
        advance = await createAdvance(supabase, userId, {
          supplierId: doc.supplierId, supplierName: doc.supplierName, supplierIdentification: doc.supplierIdentification,
          date: input.date, amount: excess, method: input.method as 'bank' | 'cash',
          notes: [`Excedente del pago de ${doc.label}`, input.notes?.trim()].filter(Boolean).join(' · '),
          paymentId: payment?.id ?? null, manual: doc.manual,
        });
      } catch (err) {
        if (payment) await supabase.from('payable_payments').delete().eq('id', payment.id);
        if (expenseIds.length) await supabase.from('cashflow_expenses').delete().in('id', expenseIds);
        throw err;
      }
    }

    const siigo = !payment || doc.manual || !doc.due ? null : await sendPaymentReceipt(supabase, userId, payment.id);
    refresh();
    return { paymentId: payment?.id ?? null, siigo, waitingForDocument: !!payment && !doc.manual && !doc.due, advance };
  });
}

const documentRef = (target: PayableTarget) => ('billId' in target ? { bill_id: target.billId } : { cuenta_cobro_id: target.cuentaCobroId });

/** Flujo de Caja expenses for `amount` paid on a document, split by its categories. Returns their ids. */
async function paymentExpenses(doc: Document, date: string, amount: number, concept = `Pago ${doc.label} · ${doc.supplierName}`): Promise<string[]> {
  const ids: string[] = [];
  const types = categoryTypes(await loadExpenseCategories(await createClient(), { includeInactive: true }));
  try {
    for (const part of allocatePayment(doc.lines, amount)) {
      // A fixed asset is registered (and depreciated) in Flujo de Caja as it is paid.
      const asset = part.asset;
      const res = await createExpenseDirect(date, {
        concept: (asset?.description ? `${asset.description} · ${concept}` : concept).slice(0, 200),
        category: part.category,
        amount: part.amount,
        tax_amount: part.tax,
        expense_type: asset ? 'CAPEX' : types[part.category] === 'CAPEX' ? 'OPEX' : types[part.category] ?? 'OPEX',
        depreciation_months: asset?.months ?? null,
        ...(asset ? { asset_kind: asset.description || null, in_service_date: asset.in_service_date } : {}),
        ...(doc.supplierId ? { supplier_id: doc.supplierId } : {}),
      });
      if ('error' in res && res.error) throw new Error(res.error);
      const id = (res as { data?: { id: string } }).data?.id;
      if (id) ids.push(id);
    }
  } catch (err) {
    if (ids.length) {
      const supabase = await createClient();
      await supabase.from('cashflow_expenses').delete().in('id', ids);
    }
    throw err;
  }
  return ids;
}

// ── Saldo a favor (anticipos) ───────────────────────────────

type AdvanceResult = { id: string; amount: number; sent: boolean; name: string | null; error: string | null; manual: boolean };
type SiigoResult = { sent: boolean; name: string | null; error: string | null };
type Supplier = { supplierId: string | null; supplierName: string; supplierIdentification: string };
type AdvanceMoveRow = { id: string; kind: string; amount: number; move_date: string; siigo_name: string | null; siigo_status: string; applied: { advance_id: string; amount: number }[] | null };

/** Every movement of a supplier's saldo a favor (by identification). */
async function supplierMoves(supabase: Supabase, identification: string): Promise<AdvanceMoveRow[]> {
  const { data, error } = await supabase.from('supplier_advances').select('id, kind, amount, move_date, siigo_name, siigo_status, applied').eq('supplier_identification', identification);
  if (error) throw error;
  return (data ?? []) as AdvanceMoveRow[];
}

/** A Flujo de Caja ANTICIPO row: + money that left to the supplier, − money that came back or was crossed. */
async function advanceCashRow(s: Supplier, date: string, amount: number, concept: string): Promise<string | null> {
  const res = await createExpenseDirect(date, {
    concept: `${concept} · ${s.supplierName}`.slice(0, 200),
    category: ADVANCE_CATEGORY,
    amount,
    tax_amount: 0,
    expense_type: 'ANTICIPO',
    depreciation_months: null,
    ...(s.supplierId ? { supplier_id: s.supplierId } : {}),
  });
  if ('error' in res && res.error) throw new Error(res.error);
  return (res as { data?: { id: string } }).data?.id ?? null;
}

/**
 * Money given to a supplier as saldo a favor: Flujo de Caja row, the
 * movement, and its Siigo egreso. One already in Siigo (manual) keeps the
 * number of its egreso there, so cruces and devoluciones can point to it.
 */
async function createAdvance(
  supabase: Supabase,
  userId: string | null,
  a: Supplier & { date: string; amount: number; method: 'bank' | 'cash'; notes: string | null; paymentId: string | null; manual: boolean; receipt?: string | null }
): Promise<AdvanceResult> {
  const expenseId = await advanceCashRow(a, a.date, a.amount, 'Anticipo (saldo a favor)');
  const { data: move, error } = await supabase
    .from('supplier_advances')
    .insert({
      supplier_id: a.supplierId,
      supplier_name: a.supplierName,
      supplier_identification: a.supplierIdentification,
      kind: 'anticipo',
      move_date: a.date,
      amount: a.amount,
      method: a.method,
      payment_id: a.paymentId,
      expense_id: expenseId,
      notes: a.notes || null,
      siigo_status: a.manual ? 'no_aplica' : 'pendiente',
      siigo_name: a.manual ? a.receipt ?? null : null,
      created_by: userId,
    })
    .select('id')
    .single();
  if (error || !move) {
    if (expenseId) await supabase.from('cashflow_expenses').delete().eq('id', expenseId);
    throw error ?? new Error('No se pudo guardar el anticipo.');
  }
  if (a.manual) return { id: move.id, amount: a.amount, sent: false, name: a.receipt ?? null, error: null, manual: true };
  return { id: move.id, amount: a.amount, manual: false, ...(await sendAdvance(supabase, userId, move.id)) };
}

/** The Siigo body of a movement: AdvancePayment egreso (anticipo) or journal (cruce, devolución). */
type AdvanceRow = AdvanceMoveRow & { method: 'bank' | 'cash'; supplier_identification: string; notes: string | null; payment_id: string | null };

async function advancePayload(supabase: Supabase, m: AdvanceRow) {
  const settings = await loadSiigoSettings(supabase);
  if (m.kind === 'anticipo') {
    const { payload, problems } = buildAdvancePaymentPayload(
      { date: m.move_date, amount: Number(m.amount), method: m.method, supplier_identification: m.supplier_identification, notes: m.notes },
      settings
    );
    return { path: '/v1/payment-receipts', key: 'ANT', payload, problems };
  }
  // Which anticipo egresos (RP-1-…) it takes, with their current numbers.
  const moves = await supplierMoves(supabase, m.supplier_identification);
  const allocations = ((m.applied ?? []) as { advance_id: string; amount: number }[]).map((a) => {
    const from = moves.find((x) => x.id === a.advance_id);
    return { receipt: from?.siigo_name ?? null, date: from?.move_date ?? m.move_date, amount: Number(a.amount) };
  });
  if (m.kind === 'devolucion') {
    const { payload, problems } = buildAdvanceRefundPayload(
      { date: m.move_date, method: m.method, supplier_identification: m.supplier_identification, allocations, notes: m.notes },
      settings
    );
    return { path: '/v1/journals', key: 'DEV', payload, problems };
  }
  const { data: p, error } = await supabase.from('payable_payments').select('bill_id, cuenta_cobro_id').eq('id', m.payment_id).single();
  if (error || !p) throw error ?? new Error('Pago no encontrado.');
  const doc = await loadDocument(supabase, p.bill_id ? { billId: p.bill_id } : { cuentaCobroId: p.cuenta_cobro_id }, 'pago');
  if (!doc.due) throw new Error('El documento aún no está en Siigo: envíalo primero.');
  const { payload, problems } = buildAdvanceCrossPayload(
    { date: m.move_date, supplier_identification: m.supplier_identification, due: doc.due, label: doc.label, allocations },
    settings
  );
  return { path: '/v1/journals', key: 'CRU', payload, problems };
}

/**
 * Sends a saldo a favor movement to Siigo — an anticipo as an AdvancePayment
 * egreso, a cruce or devolución as a journal against the anticipo egresos.
 * A failure stays on the movement (and on the payment of a cruce).
 */
async function sendAdvance(supabase: Supabase, userId: string | null, moveId: string): Promise<SiigoResult> {
  const { data: m, error } = await supabase.from('supplier_advances').select('*').eq('id', moveId).single();
  if (error || !m) throw error ?? new Error('Movimiento no encontrado.');
  if (m.siigo_id) return { sent: true, name: m.siigo_name, error: null };
  const mirror = async (fields: Record<string, unknown>) => {
    await supabase.from('supplier_advances').update(fields).eq('id', moveId);
    if (m.kind === 'cruce' && m.payment_id) await supabase.from('payable_payments').update(fields).eq('id', m.payment_id);
  };
  try {
    if (!siigoConfigFromEnv()) throw new Error('Siigo no está configurado en el servidor.');
    const { path, key, payload, problems } = await advancePayload(supabase, m);
    if (problems.length) throw new Error(problems.join(' · '));
    const out = await getSiigoClient().request<{ id: string; name?: string }>('POST', path, { body: payload, idempotencyKey: idempotencyKey(key, m.id) });
    await mirror({ siigo_status: 'enviado', siigo_id: out.id, siigo_name: out.name ?? null, siigo_error: null });
    await siigoLog(supabase, userId, { entity: 'supplier_advance', local_id: moveId, siigo_id: out.id, siigo_name: out.name ?? null, status: 'ok', message: `${m.kind} ${m.supplier_name}` });
    return { sent: true, name: out.name ?? null, error: null };
  } catch (err) {
    const msg = message(err);
    await mirror({ siigo_status: 'error', siigo_error: msg });
    await siigoLog(supabase, userId, { entity: 'supplier_advance', local_id: moveId, status: 'error', message: msg });
    return { sent: false, name: null, error: msg };
  }
}

/**
 * Pays (part of) a document with the supplier's saldo a favor: the
 * document's expenses go into Flujo de Caja on that date and an ANTICIPO
 * row takes the same amount back out, so the day's cash doesn't move. In
 * Siigo a journal crosses the anticipo egresos against the document.
 */
async function payWithAdvance(supabase: Supabase, userId: string | null, target: PayableTarget, doc: Document, balance: number, input: PayableInput) {
  const amount = Number(input.amount);
  const moves = await supplierMoves(supabase, doc.supplierIdentification);
  const problems = advanceUseProblems(balance, advanceBalance(moves), amount);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) problems.push('Fecha del pago inválida.');
  if (problems.length) throw new Error(problems.join(' · '));
  const applied = allocateAdvances(moves, amount).map((a) => ({ advance_id: a.advance_id, amount: a.amount }));

  const expenseIds: string[] = [];
  let paymentId: string | null = null;
  try {
    expenseIds.push(...(await paymentExpenses(doc, input.date, amount, `Pago con saldo a favor ${doc.label} · ${doc.supplierName}`)));
    const back = await advanceCashRow(doc, input.date, -amount, `Saldo a favor aplicado a ${doc.label}`);
    if (back) expenseIds.push(back);
    const { data: payment, error } = await supabase
      .from('payable_payments')
      .insert({
        ...documentRef(target),
        payment_date: input.date,
        amount,
        method: 'advance',
        notes: input.notes?.trim() || null,
        expense_ids: expenseIds,
        siigo_status: doc.manual ? 'no_aplica' : 'pendiente',
        created_by: userId,
      })
      .select('id')
      .single();
    if (error || !payment) throw error ?? new Error('No se pudo guardar el pago.');
    paymentId = payment.id;
    const { data: move, error: moveErr } = await supabase
      .from('supplier_advances')
      .insert({
        supplier_id: doc.supplierId,
        supplier_name: doc.supplierName,
        supplier_identification: doc.supplierIdentification,
        kind: 'cruce',
        move_date: input.date,
        amount,
        payment_id: payment.id,
        applied,
        notes: `Aplicado a ${doc.label}`,
        siigo_status: doc.manual ? 'no_aplica' : 'pendiente',
        created_by: userId,
      })
      .select('id')
      .single();
    if (moveErr || !move) throw moveErr ?? new Error('No se pudo guardar el cruce.');
    // A document made by hand in Siigo is crossed there too; one not there yet waits for it.
    const siigo = doc.manual || !doc.due ? null : await sendAdvance(supabase, userId, move.id);
    refresh();
    return { paymentId: payment.id, siigo, waitingForDocument: !doc.manual && !doc.due, advance: null, crossed: amount };
  } catch (err) {
    if (paymentId) await supabase.from('payable_payments').delete().eq('id', paymentId);
    if (expenseIds.length) await supabase.from('cashflow_expenses').delete().in('id', expenseIds);
    throw err;
  }
}

/** The saldo a favor of a document's supplier (for the payment form). */
export async function getAdvanceBalance(target: PayableTarget) {
  const { supabase } = await requireAdmin();
  return guard(async () => {
    const doc = await loadDocument(supabase, target, 'pago');
    const { data, error } = await supabase.from('supplier_advances').select('kind, amount').eq('supplier_identification', doc.supplierIdentification);
    // Before the migration there is simply no balance.
    return { balance: error ? 0 : advanceBalance(data ?? []), ready: !error };
  });
}

async function supplierById(supabase: Supabase, supplierId: string): Promise<Supplier> {
  const { data, error } = await supabase.from('suppliers').select('id, name, document_number').eq('id', supplierId).single();
  if (error || !data) throw error ?? new Error('Proveedor no encontrado.');
  const identification = cleanIdentification(data.document_number).identification;
  if (!identification) throw new Error('El proveedor no tiene cédula o NIT.');
  return { supplierId: data.id, supplierName: data.name, supplierIdentification: identification };
}

export type AdvanceInput = {
  supplierId: string;
  date: string;
  amount: number;
  method: 'bank' | 'cash';
  notes?: string | null;
  alreadyInSiigo?: boolean;
  /** Its egreso in Siigo when it was made there by hand (e.g. RP-1-48). */
  siigoReceipt?: string | null;
};

const advanceInputProblems = (input: AdvanceInput) => {
  const p: string[] = [];
  if (!['bank', 'cash'].includes(input.method)) p.push('Medio de pago inválido.');
  if (!(Number(input.amount) > 0)) p.push('El valor debe ser mayor a cero.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) p.push('Fecha inválida.');
  return p;
};

/** Money given to a supplier with no document (or a past overpayment): saldo a favor. */
export async function registerAdvance(input: AdvanceInput) {
  const { supabase, userId } = await requireAdmin();
  return guard(async () => {
    const problems = advanceInputProblems(input);
    const receipt = (input.siigoReceipt ?? '').trim().toUpperCase().replace(/\s+/g, '');
    if (input.alreadyInSiigo && !splitDocumentName(receipt)) problems.push('Escribe el número del egreso de anticipo en Siigo (por ejemplo RP-1-48).');
    if (problems.length) throw new Error(problems.join(' · '));
    const supplier = await supplierById(supabase, input.supplierId);
    const advance = await createAdvance(supabase, userId, {
      ...supplier, date: input.date, amount: Number(input.amount), method: input.method,
      notes: input.notes?.trim() || null, paymentId: null, manual: !!input.alreadyInSiigo, receipt: input.alreadyInSiigo ? receipt : null,
    });
    refresh();
    return { advance };
  });
}

/** The supplier gave (part of) the saldo a favor back: it comes into Flujo de Caja and Siigo gets the journal. */
export async function registerAdvanceRefund(input: AdvanceInput) {
  const { supabase, userId } = await requireAdmin();
  return guard(async () => {
    const problems = advanceInputProblems(input);
    if (problems.length) throw new Error(problems.join(' · '));
    const supplier = await supplierById(supabase, input.supplierId);
    const amount = Number(input.amount);
    const moves = await supplierMoves(supabase, supplier.supplierIdentification);
    if (amount > advanceBalance(moves) + 0.5) throw new Error('La devolución supera el saldo a favor del proveedor.');
    const expenseId = await advanceCashRow(supplier, input.date, -amount, 'Devolución de saldo a favor');
    const { data: move, error } = await supabase
      .from('supplier_advances')
      .insert({
        supplier_id: supplier.supplierId,
        supplier_name: supplier.supplierName,
        supplier_identification: supplier.supplierIdentification,
        kind: 'devolucion',
        move_date: input.date,
        amount,
        method: input.method,
        expense_id: expenseId,
        applied: allocateAdvances(moves, amount).map((a) => ({ advance_id: a.advance_id, amount: a.amount })),
        notes: input.notes?.trim() || null,
        siigo_status: 'pendiente',
        created_by: userId,
      })
      .select('id')
      .single();
    if (error || !move) {
      if (expenseId) await supabase.from('cashflow_expenses').delete().eq('id', expenseId);
      throw error ?? new Error('No se pudo guardar la devolución.');
    }
    const siigo = await sendAdvance(supabase, userId, move.id);
    refresh();
    return { siigo };
  });
}

export async function retryAdvance(moveId: string) {
  const { supabase, userId } = await requireAdmin();
  return guard(async () => {
    const res = await sendAdvance(supabase, userId, moveId);
    refresh();
    if (!res.sent) throw new Error(res.error ?? 'No se pudo enviar a Siigo.');
    return { name: res.name };
  });
}

/** Checks that these movements can go: not in Siigo, and no anticipo that a cruce or devolución already took from. */
async function canRemoveAdvances(supabase: Supabase, moves: { id: string; kind: string; amount: number; siigo_status: string; supplier_identification: string }[]) {
  for (const m of moves) {
    if (m.siigo_status === 'enviado') throw new Error(m.kind === 'anticipo' ? 'El anticipo ya está en Siigo: anúlalo allá primero.' : 'Ya está en Siigo: anula allá el comprobante primero.');
    if (m.kind !== 'anticipo') continue;
    const all = await supplierMoves(supabase, m.supplier_identification);
    if (all.some((x) => (x.applied ?? []).some((a) => a.advance_id === m.id)) || advanceBalance(all) - Number(m.amount) < -0.5) {
      throw new Error('Ese saldo a favor ya se usó en otro pago o devolución: elimina eso primero.');
    }
  }
}

/** Removes an anticipo or devolución registered on its own (a cruce goes away with its payment). */
export async function deleteAdvance(moveId: string) {
  const { supabase } = await requireAdmin();
  return guard(async () => {
    const { data: m, error } = await supabase.from('supplier_advances').select('*').eq('id', moveId).single();
    if (error || !m) throw error ?? new Error('Movimiento no encontrado.');
    if (m.kind === 'cruce' || m.payment_id) throw new Error('Este movimiento es parte de un pago: elimina el pago.');
    await canRemoveAdvances(supabase, [m]);
    if (m.expense_id) {
      const { error: delExp } = await supabase.from('cashflow_expenses').delete().eq('id', m.expense_id);
      if (delExp) throw delExp;
    }
    const { error: delErr } = await supabase.from('supplier_advances').delete().eq('id', moveId);
    if (delErr) throw delErr;
    refresh();
    return {};
  });
}

/** Sends a payment's egreso to Siigo; a failure stays on the payment. */
async function sendPaymentReceipt(supabase: Supabase, userId: string | null, paymentId: string): Promise<{ sent: boolean; name: string | null; error: string | null }> {
  const { data: p, error } = await supabase.from('payable_payments').select('*').eq('id', paymentId).single();
  if (error || !p) throw error ?? new Error('Pago no encontrado.');
  if (p.siigo_id) return { sent: true, name: p.siigo_name, error: null };
  try {
    if (!siigoConfigFromEnv()) throw new Error('Siigo no está configurado en el servidor.');
    const doc = await loadDocument(supabase, p.bill_id ? { billId: p.bill_id } : { cuentaCobroId: p.cuenta_cobro_id }, 'pago');
    if (!doc.due) throw new Error('El documento aún no está en Siigo: envíalo primero.');
    const settings = await loadSiigoSettings(supabase);
    const { payload, problems } = buildPaymentReceiptPayload(
      { date: p.payment_date, amount: Number(p.amount), method: p.method, notes: p.notes },
      { supplier_identification: doc.supplierIdentification, ...doc.due, label: doc.label },
      settings
    );
    if (problems.length) throw new Error(problems.join(' · '));
    const out = await getSiigoClient().request<{ id: string; name?: string }>('POST', '/v1/payment-receipts', { body: payload, idempotencyKey: idempotencyKey('RP', p.id) });
    await supabase.from('payable_payments').update({ siigo_status: 'enviado', siigo_id: out.id, siigo_name: out.name ?? null, siigo_error: null }).eq('id', paymentId);
    await siigoLog(supabase, userId, { entity: 'payment_receipt', local_id: paymentId, siigo_id: out.id, siigo_name: out.name ?? null, status: 'ok', message: doc.label });
    return { sent: true, name: out.name ?? null, error: null };
  } catch (err) {
    const msg = message(err);
    await supabase.from('payable_payments').update({ siigo_status: 'error', siigo_error: msg }).eq('id', paymentId);
    await siigoLog(supabase, userId, { entity: 'payment_receipt', local_id: paymentId, status: 'error', message: msg });
    return { sent: false, name: null, error: msg };
  }
}

export async function retryPayablePayment(paymentId: string) {
  const { supabase, userId } = await requireAdmin();
  return guard(async () => {
    // A payment made with the saldo a favor goes to Siigo as its cruce journal.
    const { data: cruce } = await supabase.from('supplier_advances').select('id').eq('payment_id', paymentId).eq('kind', 'cruce').maybeSingle();
    const res = cruce ? await sendAdvance(supabase, userId, cruce.id) : await sendPaymentReceipt(supabase, userId, paymentId);
    refresh();
    if (!res.sent) throw new Error(res.error ?? 'No se pudo enviar a Siigo.');
    return { name: res.name };
  });
}

/** Removes a payment whose egreso is not in Siigo, with its Flujo de Caja expenses. */
export async function deletePayablePayment(paymentId: string) {
  const { supabase } = await requireAdmin();
  return guard(async () => {
    const { data: p, error } = await supabase.from('payable_payments').select('id, siigo_status, expense_ids').eq('id', paymentId).single();
    if (error || !p) throw error ?? new Error('Pago no encontrado.');
    if (p.siigo_status === 'enviado') throw new Error('El egreso ya está en Siigo: anúlalo allá primero.');
    // The excess it left as saldo a favor goes with it (the cruce rows go by cascade).
    const { data: moves } = await supabase.from('supplier_advances').select('id, kind, amount, siigo_status, supplier_identification, expense_id').eq('payment_id', paymentId);
    await canRemoveAdvances(supabase, (moves ?? []).filter((m) => m.kind === 'anticipo'));
    const advanceRows = (moves ?? []).map((m) => m.expense_id).filter((id): id is string => !!id);
    if (advanceRows.length) {
      const { error: delAdv } = await supabase.from('cashflow_expenses').delete().in('id', advanceRows);
      if (delAdv) throw delAdv;
    }
    if ((p.expense_ids ?? []).length) {
      const { error: delExp } = await supabase.from('cashflow_expenses').delete().in('id', p.expense_ids);
      if (delExp) throw delExp;
    }
    const { error: delErr } = await supabase.from('payable_payments').delete().eq('id', paymentId);
    if (delErr) throw delErr;
    refresh();
    return {};
  });
}
