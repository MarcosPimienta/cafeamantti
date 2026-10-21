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
import { EXPENSE_CATEGORY_TYPE_MAP } from '../cashflow/types';
import { getSiigoClient, idempotencyKey, siigoConfigFromEnv } from '@/utils/siigo/api';
import { buildPaymentReceiptPayload, buildPurchaseBillPayload, cleanIdentification } from '@/utils/siigo/mapping';
import { daneCodeFor } from '@/utils/siigo/daneCities';
import { ensureSiigoSupplier, errorText, loadSiigoSettings, siigoLog, todayBogota, type Supabase } from '@/utils/siigo/server';
import { entryTypeFor, tracksStock } from '@/utils/inventory/categories';
import { isGrindTracked } from '@/app/(admin)/coffeeProfiles';
import { allocatePayment, billProblems, billTotals, payableBalance, payablePaymentProblems, type BillLine, type PayableMethod } from '@/utils/payables/ledger';

const MIGRATION_HINT = 'Falta aplicar la migración 20261025000000_purchases_payables.sql';
/** Siigo requires the supplier invoice's prefix; without one the accountant uses "FC". */
const NO_PREFIX = 'FC';
const providerPrefix = (raw: string | null | undefined) => (raw ?? '').trim().toUpperCase() || NO_PREFIX;

const MIGRATION_INVENTORY_HINT = 'Falta aplicar la migración 20261028000000_purchase_bill_inventory.sql';
const CAPEX = Object.entries(EXPENSE_CATEGORY_TYPE_MAP).filter(([, t]) => t === 'CAPEX').map(([c]) => c);

async function requireAdmin() {
  if (!(await checkIsAdmin())) throw new Error('Unauthorized');
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, userId: user?.id ?? null };
}

function message(err: unknown) {
  const m = errorText(err);
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
  const categories = Object.keys(EXPENSE_CATEGORY_TYPE_MAP).filter((c) => !CAPEX.includes(c));
  return {
    migrationApplied: !error,
    bills: bills ?? [],
    suppliers: suppliers ?? [],
    // Signed cuentas de cobro still owed (registered the old way = already paid).
    cuentasCobro: (ccs ?? [])
      .filter((c) => !c.expense_id)
      .map((c) => ({ id: c.id, number: c.number, issuer_name: c.issuer_name, total: Number(c.siigo_ds_owed ?? c.total_amount), paid: (c.payments ?? []).reduce((s: number, p: { amount: number }) => s + Number(p.amount), 0), date: c.siigo_ds_date ?? c.issue_date })),
    categories,
    // Products a purchase can bring in (services have no stock).
    inventory: (inventory ?? []).filter((p) => tracksStock(p.category)),
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
    const lines = normalizeLines(input.lines);
    const bill = { supplier_identification: identification, provider_number: input.providerNumber.trim(), issue_date: input.issueDate, due_date: input.dueDate, lines };
    const problems = billProblems(bill, CAPEX);
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
    const lines = normalizeLines(input.lines);
    const bill = { supplier_identification: identification, provider_number: input.providerNumber.trim(), issue_date: input.issueDate, due_date: input.dueDate, lines };
    const problems = billProblems(bill, CAPEX);
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
      const { data: products } = await supabase.from('inventory').select('id, product_name, category, current_stock').in('id', [...delta.keys()]);
      for (const [id, d] of delta) {
        const p = (products ?? []).find((x) => x.id === id);
        if (!p) throw new Error('Producto del inventario no encontrado.');
        if (d > 0 && !tracksStock(p.category)) throw new Error(`"${p.product_name}" es un servicio: no lleva inventario.`);
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

const normalizeLines = (lines: BillLine[]): BillLine[] =>
  lines.map((l) => ({
    ...l,
    base: Number(l.base),
    tax_rate: Number(l.tax_rate) || 0,
    retention_rate: Number(l.retention_rate) || 0,
    description: (l.description || l.category).trim(),
    inventory_id: l.inventory_id || null,
    inventory_qty: l.inventory_id ? Number(l.inventory_qty) || 0 : null,
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
      if (!tracksStock(p.category)) throw new Error(`"${p.product_name}" es un servicio: no lleva inventario.`);
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
export type PayableInput = { date: string; amount: number; method: PayableMethod; notes?: string | null; category?: string | null };

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
 * the document isn't in Siigo yet, the egreso waits for it.
 */
export async function registerPayablePayment(target: PayableTarget, input: PayableInput) {
  const { supabase, userId } = await requireAdmin();
  return guard(async () => {
    if (!['bank', 'cash'].includes(input.method)) throw new Error('Medio de pago inválido.');
    const doc = await loadDocument(supabase, target, input.category);
    const amount = Number(input.amount);
    const problems = payablePaymentProblems(payableBalance(doc.total, doc.payments), amount, input.date);
    if (problems.length) throw new Error(problems.join(' · '));

    const expenseIds: string[] = [];
    try {
      for (const part of allocatePayment(doc.lines, amount)) {
        const res = await createExpenseDirect(input.date, {
          concept: `Pago ${doc.label} · ${doc.supplierName}`.slice(0, 200),
          category: part.category,
          amount: part.amount,
          tax_amount: part.tax,
          expense_type: EXPENSE_CATEGORY_TYPE_MAP[part.category] ?? 'OPEX',
          depreciation_months: null,
          ...(doc.supplierId ? { supplier_id: doc.supplierId } : {}),
        });
        if ('error' in res && res.error) throw new Error(res.error);
        const id = (res as { data?: { id: string } }).data?.id;
        if (id) expenseIds.push(id);
      }
    } catch (err) {
      if (expenseIds.length) await supabase.from('cashflow_expenses').delete().in('id', expenseIds);
      throw err;
    }

    const { data: payment, error } = await supabase
      .from('payable_payments')
      .insert({
        ...('billId' in target ? { bill_id: target.billId } : { cuenta_cobro_id: target.cuentaCobroId }),
        payment_date: input.date,
        amount,
        method: input.method,
        notes: input.notes?.trim() || null,
        expense_ids: expenseIds,
        siigo_status: doc.manual ? 'no_aplica' : 'pendiente',
        created_by: userId,
      })
      .select('id')
      .single();
    if (error) {
      if (expenseIds.length) await supabase.from('cashflow_expenses').delete().in('id', expenseIds);
      throw error;
    }
    const siigo = doc.manual || !doc.due ? null : await sendPaymentReceipt(supabase, userId, payment.id);
    refresh();
    return { paymentId: payment.id, siigo, waitingForDocument: !doc.manual && !doc.due };
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
    const res = await sendPaymentReceipt(supabase, userId, paymentId);
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
