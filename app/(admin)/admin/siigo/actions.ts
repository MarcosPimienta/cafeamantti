'use server';

// Everything that talks to Siigo. Admin-only; credentials stay on the
// server (utils/siigo/api.ts). Mutations return { success, error } instead
// of throwing, because production builds hide thrown messages.

import { revalidatePath } from 'next/cache';
import { createClient } from '@/utils/supabase/server';
import { checkIsAdmin } from '../../actions';
import { SiigoError, getSiigoClient, idempotencyKey, siigoConfigFromEnv } from '@/utils/siigo/api';
import { ensureSiigoCustomer, loadSiigoSettings, siigoLog, todayBogota, type Supabase as SharedSupabase } from '@/utils/siigo/server';
import {
  API_ROW_MAPPING,
  buildInvoicePayload,
  buildProductPayload,
  buildPurchasePayload,
  cleanIdentification,
  compareProducts,
  normalizeSiigoSettings,
  siigoCodeOf,
  inventoryRowFromSiigo,
  serviceTypeUpdate,
  siigoInvoicesToRows,
  suggestItemKind,
  suggestSiigoMatch,
  type AppClient,
  type AppOrder,
  type SiigoCustomer,
  type SiigoInvoice,
  type SiigoProduct,
  type SiigoSettings,
} from '@/utils/siigo/mapping';

const MIGRATION_HINT = 'Falta aplicar la migración 20261016000000_siigo_integration.sql';

type Result<T extends object = object> = ({ success: true } & T) | { success: false; error: string; problems?: string[] };

async function requireAdmin() {
  if (!(await checkIsAdmin())) throw new Error('Unauthorized');
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, userId: user?.id ?? null };
}

function message(err: unknown) {
  if (err instanceof SiigoError) return err.message;
  const m = err instanceof Error ? err.message : String(err);
  return /siigo_|city_code|supplier_id/.test(m) && /exist|column|relation|schema/i.test(m) ? MIGRATION_HINT : m;
}

async function guard<T extends object>(run: () => Promise<T>): Promise<Result<T>> {
  try {
    return { success: true, ...(await run()) };
  } catch (err) {
    return { success: false, error: message(err) };
  }
}

type Supabase = SharedSupabase;
const log = siigoLog;
const loadSettings = loadSiigoSettings;

// ── Settings & connection ───────────────────────────────────

export async function getSiigoSetup() {
  const { supabase } = await requireAdmin();
  const [{ data: settingsRow, error }, { data: logRows }] = await Promise.all([
    supabase.from('siigo_settings').select('config, updated_at').eq('id', 1).maybeSingle(),
    supabase.from('siigo_sync_log').select('*').order('created_at', { ascending: false }).limit(30),
  ]);
  return {
    configured: siigoConfigFromEnv() !== null,
    migrationApplied: !error,
    settings: normalizeSiigoSettings(settingsRow?.config),
    updatedAt: settingsRow?.updated_at ?? null,
    log: logRows ?? [],
  };
}

type Named = { id: number; name: string; active?: boolean };

/** Checks the credentials and brings the lists to choose from. */
export async function testSiigoConnection() {
  const { supabase, userId } = await requireAdmin();
  const res = await guard(async () => {
    const siigo = getSiigoClient();
    const get = <T,>(path: string, query?: Record<string, string>) => siigo.request<T>('GET', path, { query });
    const [invoiceTypes, purchaseTypes, users, salesPayments, purchasePayments, taxes, accountGroups, voucherTypes, voucherPayments, supportTypes, creditNoteTypes, receiptTypes] = await Promise.all([
      get<Named[]>('/v1/document-types', { type: 'FV' }),
      get<Named[]>('/v1/document-types', { type: 'FC' }),
      get<{ results?: { id: number; first_name: string; last_name: string; active: boolean }[] }>('/v1/users'),
      get<(Named & { due_date?: boolean })[]>('/v1/payment-types', { document_type: 'FV' }),
      get<(Named & { due_date?: boolean })[]>('/v1/payment-types', { document_type: 'FC' }),
      get<(Named & { type?: string; percentage?: number })[]>('/v1/taxes'),
      get<Named[]>('/v1/account-groups'),
      get<Named[]>('/v1/document-types', { type: 'RC' }),
      get<(Named & { due_date?: boolean })[]>('/v1/payment-types', { document_type: 'RC' }),
      get<Named[]>('/v1/document-types', { type: 'DS' }),
      get<Named[]>('/v1/document-types', { type: 'NC' }),
      get<Named[]>('/v1/document-types', { type: 'RP' }),
    ]);
    const active = <T extends { active?: boolean }>(xs: T[] | null | undefined) => (xs ?? []).filter((x) => x.active !== false);
    return {
      catalogs: {
        invoiceTypes: active(invoiceTypes).map((d) => ({ id: d.id, name: d.name })),
        purchaseTypes: active(purchaseTypes).map((d) => ({ id: d.id, name: d.name })),
        sellers: active(users?.results).map((u) => ({ id: u.id, name: `${u.first_name} ${u.last_name}`.trim() })),
        salesPayments: active(salesPayments).map((p) => ({ id: p.id, name: p.name, dueDate: !!p.due_date })),
        purchasePayments: active(purchasePayments).map((p) => ({ id: p.id, name: p.name, dueDate: !!p.due_date })),
        taxes: active(taxes).filter((t) => t.type === 'IVA').map((t) => ({ id: t.id, name: t.name, percentage: t.percentage ?? null })),
        accountGroups: active(accountGroups).map((g) => ({ id: g.id, name: g.name })),
        voucherTypes: active(voucherTypes).map((d) => ({ id: d.id, name: d.name })),
        voucherPayments: active(voucherPayments).map((p) => ({ id: p.id, name: p.name })),
        supportTypes: active(supportTypes).map((d) => ({ id: d.id, name: d.name })),
        creditNoteTypes: active(creditNoteTypes).map((d) => ({ id: d.id, name: d.name })),
        receiptTypes: active(receiptTypes).map((d) => ({ id: d.id, name: d.name })),
        retentions: active(taxes)
          .filter((t) => t.type === 'Retefuente')
          .map((t) => ({ id: t.id, name: t.name, percentage: t.percentage ?? null }))
          .sort((a, b) => (a.percentage ?? 0) - (b.percentage ?? 0)),
      },
    };
  });
  await log(supabase, userId, { entity: 'connection', status: res.success ? 'ok' : 'error', message: res.success ? 'Conexión verificada' : res.error });
  return res;
}

const optId = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : NaN);

export async function saveSiigoSettings(input: SiigoSettings) {
  const { supabase, userId } = await requireAdmin();
  return guard(async () => {
    const s = normalizeSiigoSettings(input);
    for (const key of ['invoice_document_id', 'seller_id', 'payment_web_id', 'payment_cash_id', 'payment_transfer_id', 'payment_credit_id', 'sales_tax_id', 'product_account_group_id', 'purchase_document_id', 'purchase_payment_id', 'voucher_document_id', 'voucher_cash_id', 'voucher_transfer_id', 'voucher_web_id', 'support_document_id', 'support_payment_id', 'credit_note_document_id', 'payment_receipt_document_id', 'payout_bank_id', 'payout_cash_id'] as const) {
      const v = optId(s[key]);
      if (Number.isNaN(v)) throw new Error(`Valor inválido en ${key}.`);
      s[key] = v;
    }
    if (s.credit_term_days != null && !(Number.isInteger(Number(s.credit_term_days)) && Number(s.credit_term_days) >= 0 && Number(s.credit_term_days) <= 365)) {
      throw new Error('El plazo de crédito debe ser un número de días entre 0 y 365.');
    }
    s.credit_term_days = s.credit_term_days == null || (s.credit_term_days as unknown) === '' ? null : Number(s.credit_term_days);
    const ident = cleanIdentification(s.final_consumer_identification).identification;
    s.final_consumer_identification = ident || null;
    s.shipping_product_code = s.shipping_product_code?.trim() || null;
    for (const [k, v] of Object.entries(s.expense_accounts ?? {})) {
      if (!v.trim()) delete s.expense_accounts![k];
      else if (!/^\d{4,10}$/.test(v.trim())) throw new Error(`La cuenta de "${k}" debe ser un código PUC de 4 a 10 dígitos.`);
      else s.expense_accounts![k] = v.trim();
    }
    for (const [k, v] of Object.entries(s.support_retentions ?? {})) {
      const id = optId(v);
      if (Number.isNaN(id)) throw new Error(`Retención inválida para "${k}".`);
      if (id === null) delete s.support_retentions![k];
      else s.support_retentions![k] = id;
    }
    s.support_assumed_account = s.support_assumed_account?.trim() || null;
    if (s.support_assumed_account && !/^\d{4,10}$/.test(s.support_assumed_account)) throw new Error('La cuenta de la retención asumida debe ser un código PUC de 4 a 10 dígitos.');
    for (const [k, v] of Object.entries(s.fixed_asset_codes ?? {})) {
      if (!v.trim()) delete s.fixed_asset_codes![k];
      else s.fixed_asset_codes![k] = v.trim();
    }
    const { error } = await supabase.from('siigo_settings').upsert({ id: 1, config: s, updated_at: new Date().toISOString(), updated_by: userId });
    if (error) throw error;
    revalidatePath('/admin/settings/siigo');
    return { settings: s };
  });
}

/**
 * Brings the ledger accounts registered in Siigo, to choose from instead of
 * typing codes. Siigo's API has no chart-of-accounts endpoint, so they come
 * from its trial balance (this year and last): every transactional account
 * that had movements.
 */
export async function refreshSiigoAccounts() {
  const { supabase, userId } = await requireAdmin();
  return guard(async () => {
    const XLSX = await import('xlsx');
    const siigo = getSiigoClient();
    const year = Number(todayBogota().slice(0, 4));
    const accounts = new Map<string, string>();
    for (const y of [year - 1, year]) {
      const report = await siigo.request<{ file_url: string }>('POST', '/v1/test-balance-report', { body: { year: y, month_start: 1, month_end: 13, includes_tax_difference: false } });
      const res = await fetch(report.file_url);
      if (!res.ok) throw new Error(`No se pudo descargar el balance de prueba ${y}.`);
      const wb = XLSX.read(Buffer.from(await res.arrayBuffer()), { type: 'buffer' });
      const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
      for (const r of rows) {
        const code = String(r[2] ?? '').trim();
        if (/^\d{6,10}$/.test(code) && /^s/i.test(String(r[1] ?? '').trim())) accounts.set(code, String(r[3] ?? '').trim());
      }
    }
    if (!accounts.size) throw new Error('Siigo no devolvió cuentas en el balance de prueba.');
    const current = await loadSettings(supabase);
    // Added to the accounts already known (e.g. a full chart of accounts loaded from Siigo's export).
    for (const a of current.siigo_accounts ?? []) if (!accounts.has(a.code)) accounts.set(a.code, a.name);
    const list = [...accounts].map(([code, name]) => ({ code, name })).sort((a, b) => a.code.localeCompare(b.code));
    const { error } = await supabase.from('siigo_settings').upsert({ id: 1, config: { ...current, siigo_accounts: list }, updated_at: new Date().toISOString(), updated_by: userId });
    if (error) throw error;
    revalidatePath('/admin/settings/siigo');
    return { accounts: list };
  });
}

// ── Products ────────────────────────────────────────────────

export async function compareSiigoProducts() {
  const { supabase } = await requireAdmin();
  return guard(async () => {
    const [{ data: inventory, error }, siigoProducts] = await Promise.all([
      supabase.from('inventory').select('*').order('product_name'),
      getSiigoClient().listAll<SiigoProduct>('/v1/products'),
    ]);
    if (error) throw error;
    const cmp = compareProducts(inventory ?? [], siigoProducts);
    // Remember the links so invoices and pulls know them.
    for (const { app, siigo } of cmp.linked) {
      if (app.siigo_product_id !== siigo.id) await supabase.from('inventory').update({ siigo_product_id: siigo.id }).eq('id', app.id);
    }
    return {
      linked: cmp.linked.map(({ app, siigo }) => ({ id: app.id, code: app.product_code, siigoCode: siigo.code, appName: app.product_name, siigoName: siigo.name, category: app.category ?? null, taxId: app.sales_tax_id ?? null })),
      missingInSiigo: cmp.missingInSiigo.map((p) => ({ id: p.id, code: p.product_code, name: p.product_name, suggestion: suggestSiigoMatch(p, siigoProducts)?.code ?? null, category: p.category ?? null, taxId: p.sales_tax_id ?? null })),
      missingInApp: cmp.missingInApp.map((p) => ({ code: p.code, name: p.name.trim(), type: p.type ?? null, kind: suggestItemKind(p) })),
      siigoProducts: siigoProducts.filter((p) => p.active !== false).map((p) => ({ code: p.code, name: p.name })).sort((a, b) => a.name.localeCompare(b.name)),
    };
  });
}

/** Links app products to existing Siigo products (by Siigo code; null unlinks). */
export async function linkSiigoProducts(links: { inventoryId: string; siigoCode: string | null }[]) {
  const { supabase, userId } = await requireAdmin();
  return guard(async () => {
    const siigoProducts = await getSiigoClient().listAll<SiigoProduct>('/v1/products');
    const byCode = new Map(siigoProducts.map((p) => [p.code.trim().toUpperCase(), p]));
    const seen = new Set<string>();
    for (const l of links) {
      const code = l.siigoCode?.trim() || null;
      const product = code ? byCode.get(code.toUpperCase()) : null;
      if (code && !product) throw new Error(`El código ${code} no existe en Siigo.`);
      if (code && seen.has(code.toUpperCase())) throw new Error(`El producto ${code} de Siigo quedó vinculado a dos productos de la app.`);
      if (code) seen.add(code.toUpperCase());
    }
    for (const l of links) {
      const product = l.siigoCode ? byCode.get(l.siigoCode.trim().toUpperCase()) : null;
      const { error } = await supabase.from('inventory').update({ siigo_code: product?.code ?? null, siigo_product_id: product?.id ?? null }).eq('id', l.inventoryId);
      if (error) throw error;
      await log(supabase, userId, { entity: 'product', local_id: l.inventoryId, siigo_id: product?.id ?? null, siigo_name: product ? `${product.code} ${product.name}` : null, status: 'ok', message: product ? 'Vinculado' : 'Desvinculado' });
    }
    return { linked: links.length };
  });
}

/**
 * Creates app products in Siigo. `accountGroupId` is the inventory group
 * chosen on screen: it is used and remembered, so it does not have to be
 * saved first.
 */
/** IVA per product (null = the general one, 0 = without IVA). */
export async function saveProductTaxes(taxes: { inventoryId: string; taxId: number | null }[]) {
  const { supabase } = await requireAdmin();
  return guard(async () => {
    for (const t of taxes) {
      if (t.taxId !== null && !(Number.isInteger(t.taxId) && t.taxId >= 0)) throw new Error('IVA inválido.');
      const { error } = await supabase.from('inventory').update({ sales_tax_id: t.taxId }).eq('id', t.inventoryId);
      if (error) throw error;
    }
    return { saved: taxes.length };
  });
}

/**
 * Brings Siigo services and parts into the app: services without stock,
 * parts with stock (starting at 0), both linked to their Siigo code.
 */
export async function importSiigoItems(items: { siigoCode: string; kind: 'servicio' | 'repuesto'; taxId: number | null }[]) {
  const { supabase, userId } = await requireAdmin();
  return guard(async () => {
    if (items.some((i) => i.kind !== 'servicio' && i.kind !== 'repuesto')) throw new Error('Tipo inválido: debe ser servicio o repuesto.');
    const siigoProducts = await getSiigoClient().listAll<SiigoProduct>('/v1/products');
    const byCode = new Map(siigoProducts.map((p) => [p.code.trim().toUpperCase(), p]));
    const { data: existing, error: exErr } = await supabase.from('inventory').select('product_code, siigo_code');
    if (exErr) throw exErr;
    const taken = new Set((existing ?? []).flatMap((r: { product_code: string; siigo_code: string | null }) => [r.product_code.toUpperCase(), (r.siigo_code ?? '').toUpperCase()]));
    const imported: string[] = [];
    const skipped: string[] = [];
    for (const item of items) {
      const p = byCode.get(item.siigoCode.trim().toUpperCase());
      if (!p) {
        skipped.push(`${item.siigoCode}: no existe en Siigo`);
        continue;
      }
      const row = inventoryRowFromSiigo(p, item.kind, item.taxId);
      if (taken.has(row.product_code.toUpperCase()) || taken.has(p.code.toUpperCase())) {
        skipped.push(`${p.code} ${row.product_name}: ya está en la app`);
        continue;
      }
      const { error } = await supabase.from('inventory').insert(row);
      if (error) throw error;
      taken.add(row.product_code.toUpperCase());
      taken.add(p.code.toUpperCase());
      await log(supabase, userId, { entity: 'product', local_id: row.product_code, siigo_id: p.id, siigo_name: `${p.code} ${row.product_name}`, status: 'ok', message: `Traído de Siigo como ${item.kind}` });
      imported.push(row.product_code);
    }
    revalidatePath('/admin/inventory');
    return { imported, skipped };
  });
}

/** Marks Siigo items as type Service (they were created as Product). */
export async function markSiigoItemsAsService(siigoCodes: string[]) {
  const { supabase, userId } = await requireAdmin();
  return guard(async () => {
    const siigo = getSiigoClient();
    const updated: string[] = [];
    const failed: string[] = [];
    for (const code of siigoCodes) {
      try {
        const found = await siigo.request<{ results?: SiigoProduct[] }>('GET', '/v1/products', { query: { code } });
        const p = found?.results?.find((x) => x.code.trim().toUpperCase() === code.trim().toUpperCase());
        if (!p) throw new Error('no existe en Siigo');
        if (p.type === 'Service') {
          updated.push(code);
          continue;
        }
        // Siigo's PUT replaces the product: send back what it has, with type Service.
        await siigo.request('PUT', `/v1/products/${p.id}`, { body: serviceTypeUpdate(p) });
        await log(supabase, userId, { entity: 'product', local_id: null, siigo_id: p.id, siigo_name: `${p.code} ${p.name}`, status: 'ok', message: 'Tipo cambiado a Servicio en Siigo' });
        updated.push(code);
      } catch (err) {
        await log(supabase, userId, { entity: 'product', local_id: null, siigo_name: code, status: 'error', message: message(err) });
        failed.push(`${code}: ${message(err)}`);
      }
    }
    return { updated, failed };
  });
}

export async function createSiigoProducts(inventoryIds: string[], accountGroupId?: number | null) {
  const { supabase, userId } = await requireAdmin();
  return guard(async () => {
    const settings = await loadSettings(supabase);
    if (accountGroupId && accountGroupId !== settings.product_account_group_id) {
      if (!Number.isInteger(accountGroupId) || accountGroupId <= 0) throw new Error('Grupo de inventario inválido.');
      settings.product_account_group_id = accountGroupId;
      const { error } = await supabase.from('siigo_settings').upsert({ id: 1, config: settings, updated_at: new Date().toISOString(), updated_by: userId });
      if (error) throw error;
    }
    const { data: items, error } = await supabase.from('inventory').select('*').in('id', inventoryIds);
    if (error) throw error;
    const created: string[] = [];
    const failed: string[] = [];
    for (const item of items ?? []) {
      const { payload, problems } = buildProductPayload(item, settings);
      if (problems.length) {
        failed.push(`${item.product_code}: ${problems.join(' ')}`);
        continue;
      }
      try {
        const res = await getSiigoClient().request<{ id: string; code: string }>('POST', '/v1/products', { body: payload });
        await supabase.from('inventory').update({ siigo_product_id: res.id, siigo_code: res.code ?? payload.code }).eq('id', item.id);
        await log(supabase, userId, { entity: 'product', local_id: item.id, siigo_id: res.id, siigo_name: res.code, status: 'ok' });
        created.push(item.product_code);
      } catch (err) {
        await log(supabase, userId, { entity: 'product', local_id: item.id, status: 'error', message: message(err) });
        failed.push(`${item.product_code}: ${message(err)}`);
      }
    }
    return { created, failed };
  });
}

// ── Customers ───────────────────────────────────────────────

// ── Sales invoices: app → Siigo ─────────────────────────────

/** What would be sent for an order, and what is missing, without calling Siigo. */
async function prepareOrderInvoice(supabase: Supabase, orderId: string, paymentMethod: AppOrder['payment_method']) {
  const settings = await loadSettings(supabase);
  const [{ data: order, error }, { data: orderItems, error: itemsError }] = await Promise.all([
    supabase
      .from('orders')
      .select('id, total_amount, source, notes, shipping_info, siigo_invoice_id, siigo_invoice, client:client_id ( id, name, document_type, document_number, email, phone, address, city_code, siigo_customer_id )')
      .eq('id', orderId)
      .single(),
    supabase.from('order_items').select('product_id, quantity, price_at_time, inventory:inventory_id ( * )').eq('order_id', orderId),
  ]);
  if (error || !order) throw error ?? new Error('Pedido no encontrado.');
  if (itemsError) throw itemsError;
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const o = order as any;
  const client: AppClient | null = Array.isArray(o.client) ? o.client[0] ?? null : o.client;
  const items = (orderItems ?? []).map((it: any) => {
    const inv = Array.isArray(it.inventory) ? it.inventory[0] : it.inventory;
    return {
      product_code: inv ? siigoCodeOf(inv) : null,
      name: inv?.product_name ?? it.product_id ?? 'Producto',
      quantity: Number(it.quantity),
      unit_price: Number(it.price_at_time),
      // Linked when "Comparar con Siigo" found it, it was linked by hand or created from the app.
      linked: inv ? !!(inv.siigo_product_id || inv.siigo_code) : undefined,
      tax_id: inv?.sales_tax_id ?? null,
    };
  });
  /* eslint-enable @typescript-eslint/no-explicit-any */
  const hasClientId = !!cleanIdentification(client?.document_number).identification;
  const identification = hasClientId ? cleanIdentification(client!.document_number).identification : settings.final_consumer_identification ?? null;
  const appOrder: AppOrder = {
    id: o.id,
    total_amount: Number(o.total_amount),
    source: o.source,
    notes: o.notes,
    shipping_cost: Number(o.shipping_info?.shipping_cost ?? 0),
    payment_method: paymentMethod,
  };
  const built = buildInvoicePayload(appOrder, items, identification, settings, todayBogota());
  return { order: o, client: hasClientId ? client : null, settings, ...built };
}

export async function previewSiigoInvoice(orderId: string, paymentMethod: AppOrder['payment_method'] = 'web') {
  const { supabase } = await requireAdmin();
  return guard(async () => {
    const { order, client, settings, payload, problems } = await prepareOrderInvoice(supabase, orderId, paymentMethod);
    if (order.siigo_invoice_id) problems.unshift(`Este pedido ya tiene factura en Siigo (${order.siigo_invoice ?? order.siigo_invoice_id}).`);
    if (!siigoConfigFromEnv()) problems.unshift('Siigo no está configurado en el servidor.');
    return {
      problems,
      customer: client ? `${client.name} (${cleanIdentification(client.document_number).identification})` : `Consumidor final (${settings.final_consumer_identification ?? '—'})`,
      electronic: !!settings.stamp_dian,
      lines: payload.items.map((i) => ({ code: i.code, description: i.description, quantity: i.quantity, price: Number((i as Record<string, unknown>).taxed_price ?? (i as Record<string, unknown>).price) })),
      total: payload.payments[0]?.value ?? 0,
    };
  });
}

type InvoiceOut = { id: string; name?: string; public_url?: string; stamp?: { status?: string; cufe?: string; errors?: string } };

export async function createSiigoInvoice(orderId: string, paymentMethod: AppOrder['payment_method'] = 'web') {
  const { supabase, userId } = await requireAdmin();
  const res = await guard(async () => {
    const prepared = await prepareOrderInvoice(supabase, orderId, paymentMethod);
    if (prepared.order.siigo_invoice_id) throw new Error(`Este pedido ya tiene factura en Siigo (${prepared.order.siigo_invoice ?? prepared.order.siigo_invoice_id}).`);
    if (prepared.problems.length) return { problems: prepared.problems, invoice: null };

    if (prepared.client) prepared.payload.customer.identification = await ensureSiigoCustomer(supabase, userId, prepared.client);
    const inv = await getSiigoClient().request<InvoiceOut>('POST', '/v1/invoices', {
      body: prepared.payload,
      // Same key for the same order: a retry returns the invoice already created.
      idempotencyKey: idempotencyKey('FV', orderId),
    });
    const update = {
      siigo_invoice_id: inv.id,
      siigo_invoice: inv.name ?? null,
      siigo_status: inv.stamp?.status ?? (prepared.settings.stamp_dian ? 'Pending' : 'Draft'),
      siigo_cufe: inv.stamp?.cufe ?? null,
      siigo_public_url: inv.public_url ?? null,
      siigo_error: inv.stamp?.errors || null,
    };
    const { error } = await supabase.from('orders').update(update).eq('id', orderId);
    if (error) throw error;
    await log(supabase, userId, { entity: 'invoice', local_id: orderId, siigo_id: inv.id, siigo_name: inv.name ?? null, status: 'ok', message: inv.stamp?.status ?? null });
    return { problems: [] as string[], invoice: update };
  });
  if (!res.success) {
    await log(supabase, userId, { entity: 'invoice', local_id: orderId, status: 'error', message: res.error });
    await supabase.from('orders').update({ siigo_error: res.error }).eq('id', orderId);
  }
  revalidatePath('/admin/orders');
  if (res.success && res.problems.length) return { success: false as const, error: 'Faltan datos para facturar.', problems: res.problems };
  return res;
}

/** Re-reads the invoice (DIAN status, CUFE, public link). */
export async function refreshSiigoInvoice(orderId: string) {
  const { supabase } = await requireAdmin();
  return guard(async () => {
    const { data: order, error } = await supabase.from('orders').select('siigo_invoice_id').eq('id', orderId).single();
    if (error) throw error;
    if (!order?.siigo_invoice_id) throw new Error('El pedido no tiene factura en Siigo.');
    const inv = await getSiigoClient().request<InvoiceOut>('GET', `/v1/invoices/${order.siigo_invoice_id}`);
    let dianErrors: string | null = inv.stamp?.errors || null;
    if (inv.stamp?.status && /reject/i.test(inv.stamp.status)) {
      const errs = await getSiigoClient().request<{ errors?: { message?: string }[] }>('GET', `/v1/invoices/${order.siigo_invoice_id}/stamp/errors`).catch(() => null);
      dianErrors = errs?.errors?.map((e) => e.message).filter(Boolean).join(' · ') || dianErrors;
    }
    const update = { siigo_invoice: inv.name ?? null, siigo_status: inv.stamp?.status ?? null, siigo_cufe: inv.stamp?.cufe ?? null, siigo_public_url: inv.public_url ?? null, siigo_error: dianErrors };
    await supabase.from('orders').update(update).eq('id', orderId);
    revalidatePath('/admin/orders');
    return { invoice: update };
  });
}

// ── Sales invoices: Siigo → app (feeds Pedidos → Importar) ──

export async function pullSiigoInvoices(from: string, to: string) {
  await requireAdmin();
  return guard(async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from) throw new Error('Rango de fechas inválido.');
    const siigo = getSiigoClient();
    const invoices = await siigo.listAll<SiigoInvoice>('/v1/invoices', { date_start: from, date_end: to });
    // One lookup per distinct client, for names and contact data.
    const idents = [...new Set(invoices.map((i) => i.customer?.identification).filter(Boolean) as string[])];
    if (idents.length > 60) throw new Error(`Hay ${idents.length} clientes distintos en el rango: elige un rango más corto (Siigo permite 100 consultas por minuto).`);
    const customers = new Map<string, SiigoCustomer>();
    for (const identification of idents) {
      const r = await siigo.request<{ results?: SiigoCustomer[] }>('GET', '/v1/customers', { query: { identification } });
      if (r?.results?.[0]) customers.set(identification, r.results[0]);
    }
    return { rows: siigoInvoicesToRows(invoices, customers), mapping: API_ROW_MAPPING, invoiceCount: invoices.length };
  });
}

// ── Purchases: Flujo de Caja → Siigo ────────────────────────

export async function previewSiigoPurchase(expenseId: string) {
  const { supabase } = await requireAdmin();
  return guard(async () => {
    const prepared = await preparePurchase(supabase, expenseId);
    return { problems: prepared.problems, supplier: prepared.supplier?.name ?? null, total: prepared.payload.payments[0]?.value ?? 0, alreadySent: prepared.alreadySent };
  });
}

async function preparePurchase(supabase: Supabase, expenseId: string) {
  const settings = await loadSettings(supabase);
  const { data: e, error } = await supabase
    .from('cashflow_expenses')
    .select('id, concept, category, expense_type, amount, tax_amount, net_amount, siigo_purchase_id, siigo_purchase_name, cashflow:cashflow_id ( date ), supplier:supplier_id ( name, document_number )')
    .eq('id', expenseId)
    .single();
  if (error || !e) throw error ?? new Error('Gasto no encontrado.');
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const row = e as any;
  const one = (x: any) => (Array.isArray(x) ? x[0] ?? null : x);
  /* eslint-enable @typescript-eslint/no-explicit-any */
  const supplier = one(row.supplier);
  const built = buildPurchasePayload(
    { id: row.id, concept: row.concept, category: row.category, expense_type: row.expense_type, amount: Number(row.amount), tax_amount: Number(row.tax_amount), net_amount: Number(row.net_amount), date: one(row.cashflow)?.date ?? todayBogota() },
    supplier,
    settings
  );
  const alreadySent = row.siigo_purchase_id ? `Ya está en Siigo (${row.siigo_purchase_name ?? row.siigo_purchase_id}).` : null;
  if (alreadySent) built.problems.unshift(alreadySent);
  return { ...built, supplier, alreadySent };
}

export async function createSiigoPurchase(expenseId: string) {
  const { supabase, userId } = await requireAdmin();
  const res = await guard(async () => {
    const prepared = await preparePurchase(supabase, expenseId);
    if (prepared.problems.length) return { problems: prepared.problems, purchase: null };
    // Purchases do not accept Idempotency-Key: the local check above (and the
    // unique siigo_purchase_id) is what prevents sending one twice.
    const p = await getSiigoClient().request<{ id: string; name?: string }>('POST', '/v1/purchases', { body: prepared.payload });
    const { error } = await supabase.from('cashflow_expenses').update({ siigo_purchase_id: p.id, siigo_purchase_name: p.name ?? null, siigo_error: null }).eq('id', expenseId);
    if (error) throw error;
    await log(supabase, userId, { entity: 'purchase', local_id: expenseId, siigo_id: p.id, siigo_name: p.name ?? null, status: 'ok' });
    return { problems: [] as string[], purchase: { id: p.id, name: p.name ?? null } };
  });
  if (!res.success) {
    await log(supabase, userId, { entity: 'purchase', local_id: expenseId, status: 'error', message: res.error });
    await supabase.from('cashflow_expenses').update({ siigo_error: res.error }).eq('id', expenseId);
  }
  revalidatePath('/admin/cashflow');
  if (res.success && res.problems.length) return { success: false as const, error: 'Faltan datos para enviar la compra.', problems: res.problems };
  return res;
}
