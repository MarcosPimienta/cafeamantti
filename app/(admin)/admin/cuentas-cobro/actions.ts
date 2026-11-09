'use server';

import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';
import { createExpenseDirect, createIncomeDirect } from '../cashflow/actions';
import { ExpenseType } from '../cashflow/types';
import { entryTypeFor, tracksStock } from '@/utils/inventory/categories';
import { refreshStandardCost } from '@/utils/inventory/costServer';
import { isGrindTracked } from '@/app/(admin)/coffeeProfiles';

const MIGRATION_INVENTORY_HINT = 'Falta aplicar la migración 20261113000000_cuenta_cobro_inventory.sql';

/** An item of a cuenta de cobro; a supplier's can bring a product into the inventory. */
export type CuentaCobroItem = {
  description: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  /** Product that enters the inventory with this item (cuentas de gasto only). */
  inventory_id?: string | null;
  /** How much of it enters, in the product's unit (kg, unidades…). */
  inventory_qty?: number | null;
};

/** Products that keep stock, to pick in an item. */
export async function getStockProducts() {
  const supabase = await createClient();
  try {
    await checkAdmin(supabase);
    const { data, error } = await supabase.from('inventory').select('id, product_code, product_name, unit, category').order('product_name');
    if (error) return [];
    return ((data ?? []) as { id: string; product_code: string; product_name: string; unit: string | null; category: string | null }[])
      .filter((p) => tracksStock(p.category ?? undefined, p.product_code));
  } catch {
    return [];
  }
}

/** A client's cuenta de cobro carries no products: only a supplier's brings stock. */
const withoutStock = (items: CuentaCobroItem[]): CuentaCobroItem[] => items.map((i) => ({ ...i, inventory_id: undefined, inventory_qty: undefined }));

/** Items that bring stock, checked before anything is written. */
function stockProblems(items: CuentaCobroItem[]): string[] {
  return items
    .filter((i) => i.inventory_id && !(Number(i.inventory_qty) > 0))
    .map((i) => `Indica cuánto entra al inventario de «${i.description || 'el ítem'}».`);
}

type DB = Awaited<ReturnType<typeof createClient>>;

/**
 * Writes the entradas of a cuenta de cobro's items (all or none), at the
 * unit cost the item says. Returns the movement ids.
 */
async function stockItems(
  supabase: DB,
  userId: string | null,
  ccId: string,
  items: CuentaCobroItem[],
  opts: { date: string; label: string; supplier: string }
): Promise<string[]> {
  const wanted = items.filter((i) => i.inventory_id && Number(i.inventory_qty) > 0);
  if (!wanted.length) return [];
  const { data: products, error } = await supabase
    .from('inventory')
    .select('id, product_code, product_name, category')
    .in('id', wanted.map((i) => i.inventory_id as string));
  if (error) throw error;
  const written: string[] = [];
  try {
    for (const item of wanted) {
      const p = (products ?? []).find((x) => x.id === item.inventory_id);
      if (!p) throw new Error('Producto del inventario no encontrado.');
      if (!tracksStock(p.category, p.product_code)) throw new Error(`"${p.product_name}" no lleva inventario (servicio o venta por pedido).`);
      const qty = Number(item.inventory_qty);
      const unitCost = Math.round((Number(item.total_price) / qty) * 100) / 100;
      const { data: mov, error: movErr } = await supabase
        .from('inventory_movements')
        .insert({
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
          cuenta_cobro_id: ccId,
          ...(Number.isFinite(unitCost) && unitCost > 0 ? { unit_cost: unitCost } : {}),
        })
        .select('id')
        .single();
      if (movErr && /cuenta_cobro_id/.test(movErr.message)) throw new Error(MIGRATION_INVENTORY_HINT);
      if (movErr || !mov) throw movErr ?? new Error('No se pudo registrar la entrada.');
      written.push(mov.id);
      await refreshStandardCost(supabase, p.id);
    }
  } catch (err) {
    for (const id of written.reverse()) await supabase.from('inventory_movements').delete().eq('id', id);
    throw err;
  }
  return written;
}

/** Ids of the entradas a cuenta de cobro wrote (none before its migration). */
async function stockOf(supabase: DB, ccId: string): Promise<string[]> {
  const { data, error } = await supabase.from('inventory_movements').select('id').eq('cuenta_cobro_id', ccId);
  if (error) return [];
  return ((data ?? []) as { id: string }[]).map((m) => m.id);
}

/** Removes entradas; refused (and nothing removed) if that stock was already used. */
async function removeStock(supabase: DB, ids: string[]) {
  const removed: Record<string, unknown>[] = [];
  for (const id of ids) {
    const { data: row } = await supabase.from('inventory_movements').select('*').eq('id', id).maybeSingle();
    const { error } = await supabase.from('inventory_movements').delete().eq('id', id);
    if (error) {
      // Put back what was already removed, so the cuenta de cobro keeps all its stock.
      for (const r of removed.reverse()) await supabase.from('inventory_movements').insert(r);
      throw new Error(/Stock insuficiente/.test(error.message)
        ? `No se puede: el producto que entró con esta cuenta de cobro ya se usó (${error.message})`
        : error.message);
    }
    if (row) removed.push(row);
  }
}

// Helper to verify if current user is admin
async function checkAdmin(supabase: any) {
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) {
    throw new Error('No autenticado');
  }

  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileErr || !profile || profile.role !== 'admin') {
    throw new Error('No autorizado (Se requiere rol de Administrador)');
  }

  return user;
}

/**
 * Get all Cuentas de Cobro.
 */
export async function getCuentasCobro() {
  const supabase = await createClient();
  try {
    await checkAdmin(supabase);

    const query = (withPayments: boolean) =>
      supabase
        .from('cuentas_cobro')
        .select(withPayments ? '*, payments:payable_payments ( * )' : '*')
        .order('created_at', { ascending: false });
    let { data, error } = await query(true);
    // Before the purchases migration: without payments.
    if (error && /payable_payments/.test(error.message)) ({ data, error } = await query(false));

    if (error) {
      console.error('Error fetching cuentas_cobro:', error);
      return [];
    }
    return data || [];
  } catch (err: any) {
    console.error('Exception fetching cuentas_cobro:', err.message);
    return [];
  }
}

/**
 * Get a single Cuenta de Cobro by ID.
 * This does NOT require admin check, so that public users can open their signature link.
 */
export async function getCuentaCobroById(id: string) {
  const supabase = await createClient();
  try {
    const { data, error } = await supabase
      .from('cuentas_cobro')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching cuenta_cobro by id:', error);
      return null;
    }
    return data;
  } catch (err: any) {
    console.error('Exception fetching cuenta_cobro:', err.message);
    return null;
  }
}

/**
 * Get Suppliers to auto-fill issuer details if selected.
 */
export async function getSuppliers() {
  const supabase = await createClient();
  try {
    await checkAdmin(supabase);
    const { data, error } = await supabase
      .from('suppliers')
      .select('id, name, document_number, email, phone, bank_name, bank_account_type, bank_account_number')
      .order('name', { ascending: true });

    if (error) {
      console.error('Error fetching suppliers:', error);
      return [];
    }
    return data || [];
  } catch (err: any) {
    console.error('Exception fetching suppliers:', err.message);
    return [];
  }
}

/**
 * Helper to auto-register a supplier or client if they don't exist in DB.
 */
async function autoRegisterSupplierOrClient(
  supabase: any,
  type: 'gasto' | 'ingreso',
  issuerData: { issuer_name: string; issuer_document: string; issuer_email: string; issuer_phone: string },
  debtorData?: { debtor_name?: string; debtor_document?: string; debtor_email?: string; debtor_phone?: string }
) {
  try {
    if (type === 'gasto' && issuerData.issuer_name && issuerData.issuer_document) {
      const doc = issuerData.issuer_document.trim();
      const nameStr = issuerData.issuer_name.trim();

      const { data: existing } = await supabase
        .from('suppliers')
        .select('id')
        .or(`document_number.eq.${doc},name.ilike.${nameStr}`)
        .limit(1);

      if (!existing || existing.length === 0) {
        await supabase.from('suppliers').insert({
          name: nameStr,
          document_number: doc,
          email: issuerData.issuer_email?.trim() || null,
          phone: issuerData.issuer_phone?.trim() || null,
        });
        revalidatePath('/admin/suppliers');
      }
    } else if (type === 'ingreso' && debtorData?.debtor_name && debtorData?.debtor_document) {
      const doc = debtorData.debtor_document.trim();
      const nameStr = debtorData.debtor_name.trim();

      const { data: existing } = await supabase
        .from('clients')
        .select('id')
        .or(`document_number.eq.${doc},name.ilike.${nameStr}`)
        .limit(1);

      if (!existing || existing.length === 0) {
        await supabase.from('clients').insert({
          name: nameStr,
          document_number: doc,
          email: debtorData.debtor_email?.trim() || null,
          phone: debtorData.debtor_phone?.trim() || null,
        });
        revalidatePath('/admin/customers');
      }
    }
  } catch (err: any) {
    console.error('Error auto-registering supplier/client:', err.message);
  }
}

/**
 * Get B2B/CRM Clients to auto-fill issuer details if selected.
 */
export async function getClients() {
  const supabase = await createClient();
  try {
    await checkAdmin(supabase);
    const { data, error } = await supabase
      .from('clients')
      .select('id, name, document_number, email, phone')
      .order('name', { ascending: true });

    if (error) {
      console.error('Error fetching clients:', error);
      return [];
    }
    return data || [];
  } catch (err: any) {
    console.error('Exception fetching clients:', err.message);
    return [];
  }
}

/**
 * Create a new Cuenta de Cobro (draft).
 */
export async function createCuentaCobro(
  type: 'gasto' | 'ingreso',
  issuerData: {
    issuer_name: string;
    issuer_document: string;
    issuer_email: string;
    issuer_phone: string;
    concept?: string;
  },
  items: CuentaCobroItem[],
  debtorData?: {
    debtor_name?: string;
    debtor_document?: string;
    debtor_email?: string;
    debtor_phone?: string;
  },
  issueDate?: string
) {
  const supabase = await createClient();
  try {
    await checkAdmin(supabase);

    const { data: { user } } = await supabase.auth.getUser();
    // Only a supplier's cuenta de cobro brings products in.
    if (type !== 'gasto') items = withoutStock(items);
    const problems = stockProblems(items);
    if (problems.length) return { success: false, error: problems.join(' · ') };

    const total_amount = items.reduce((acc, item) => acc + Number(item.total_price), 0);

    const insertPayload: any = {
      type,
      status: 'pendiente',
      issuer_name: issuerData.issuer_name,
      issuer_document: issuerData.issuer_document,
      issuer_email: issuerData.issuer_email,
      issuer_phone: issuerData.issuer_phone,
      concept: issuerData.concept || 'Servicios Prestados',
      items,
      total_amount,
      debtor_name: debtorData?.debtor_name || null,
      debtor_document: debtorData?.debtor_document || null,
      debtor_email: debtorData?.debtor_email || null,
      debtor_phone: debtorData?.debtor_phone || null,
    };

    if (issueDate) {
      insertPayload.issue_date = issueDate;
    }

    const { data, error } = await supabase
      .from('cuentas_cobro')
      .insert(insertPayload)
      .select()
      .single();

    if (error) throw error;

    // What it brings enters the inventory now; if it can't, the cuenta de cobro isn't kept.
    try {
      await stockItems(supabase, user?.id ?? null, data.id, items, {
        date: data.issue_date ?? issueDate ?? new Date().toISOString().slice(0, 10),
        label: `Cuenta de cobro No. ${data.number} · ${issuerData.issuer_name}`,
        supplier: issuerData.issuer_name,
      });
    } catch (stockErr) {
      await supabase.from('cuentas_cobro').delete().eq('id', data.id);
      throw stockErr;
    }

    // Auto-register supplier or client if not present
    await autoRegisterSupplierOrClient(supabase, type, issuerData, debtorData);

    revalidatePath('/admin/cuentas-cobro');
    revalidatePath('/admin/inventory');
    return { success: true, id: data.id };
  } catch (err: any) {
    console.error('Error creating cuenta_cobro:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Update a Cuenta de Cobro draft.
 */
export async function updateCuentaCobro(
  id: string,
  type: 'gasto' | 'ingreso',
  issuerData: {
    issuer_name: string;
    issuer_document: string;
    issuer_email: string;
    issuer_phone: string;
    concept?: string;
  },
  items: CuentaCobroItem[],
  debtorData?: {
    debtor_name?: string;
    debtor_document?: string;
    debtor_email?: string;
    debtor_phone?: string;
  },
  issueDate?: string
) {
  const supabase = await createClient();
  try {
    await checkAdmin(supabase);

    // Verify it is not already signed
    const { data: current } = await supabase
      .from('cuentas_cobro')
      .select('status')
      .eq('id', id)
      .single();

    if (current && current.status !== 'pendiente') {
      return { success: false, error: 'No se puede modificar una cuenta de cobro ya firmada.' };
    }
    if (type !== 'gasto') items = withoutStock(items);
    const problems = stockProblems(items);
    if (problems.length) return { success: false, error: problems.join(' · ') };

    // The inventory follows the edit: new entradas first, then the old ones go
    // (refused if their stock was used — then nothing changes).
    const { data: cc } = await supabase.from('cuentas_cobro').select('number, issue_date').eq('id', id).single();
    const { data: { user } } = await supabase.auth.getUser();
    const old = await stockOf(supabase, id);
    const fresh = await stockItems(supabase, user?.id ?? null, id, items, {
      date: issueDate ?? cc?.issue_date ?? new Date().toISOString().slice(0, 10),
      label: `Cuenta de cobro No. ${cc?.number ?? ''} · ${issuerData.issuer_name}`,
      supplier: issuerData.issuer_name,
    });
    try {
      await removeStock(supabase, old);
    } catch (stockErr) {
      for (const mid of fresh) await supabase.from('inventory_movements').delete().eq('id', mid);
      throw stockErr;
    }

    const total_amount = items.reduce((acc, item) => acc + Number(item.total_price), 0);

    const updatePayload: any = {
      type,
      issuer_name: issuerData.issuer_name,
      issuer_document: issuerData.issuer_document,
      issuer_email: issuerData.issuer_email,
      issuer_phone: issuerData.issuer_phone,
      concept: issuerData.concept || 'Servicios Prestados',
      items,
      total_amount,
      debtor_name: debtorData?.debtor_name || null,
      debtor_document: debtorData?.debtor_document || null,
      debtor_email: debtorData?.debtor_email || null,
      debtor_phone: debtorData?.debtor_phone || null,
    };

    if (issueDate) {
      updatePayload.issue_date = issueDate;
    }

    const { error } = await supabase
      .from('cuentas_cobro')
      .update(updatePayload)
      .eq('id', id);

    if (error) throw error;

    // Auto-register supplier or client if not present
    await autoRegisterSupplierOrClient(supabase, type, issuerData, debtorData);

    revalidatePath('/admin/cuentas-cobro');
    return { success: true };
  } catch (err: any) {
    console.error('Error updating cuenta_cobro:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Delete a Cuenta de Cobro draft.
 */
export async function deleteCuentaCobro(id: string) {
  const supabase = await createClient();
  try {
    await checkAdmin(supabase);

    // Its entradas leave the inventory first (refused if that stock was used).
    await removeStock(supabase, await stockOf(supabase, id));

    const { error } = await supabase
      .from('cuentas_cobro')
      .delete()
      .eq('id', id);

    if (error) throw error;

    revalidatePath('/admin/cuentas-cobro');
    revalidatePath('/admin/inventory');
    return { success: true };
  } catch (err: any) {
    console.error('Error deleting cuenta_cobro:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Public action: Sign a Cuenta de Cobro.
 * Updates bank details, issuer details, signature data, and sets status to 'firmada'.
 */
export async function signCuentaCobro(
  id: string,
  signatureData: string,
  signatureType: 'scribble' | 'typed',
  bankDetails: {
    bank_name: string;
    bank_account_type: string;
    bank_account_number: string;
  },
  issuerDetails: {
    issuer_name: string;
    issuer_document: string;
    issuer_email: string;
    issuer_phone: string;
  }
) {
  let supabase: any;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceRoleKey && process.env.NEXT_PUBLIC_SUPABASE_URL) {
    const { createClient: createSupabaseJsClient } = await import('@supabase/supabase-js');
    supabase = createSupabaseJsClient(process.env.NEXT_PUBLIC_SUPABASE_URL, serviceRoleKey);
  } else {
    supabase = await createClient();
  }

  try {
    // 1. Fetch document and verify it is still 'pendiente'
    const { data: current, error: fetchErr } = await supabase
      .from('cuentas_cobro')
      .select('status')
      .eq('id', id)
      .single();

    if (fetchErr || !current) {
      return { success: false, error: 'Documento no encontrado.' };
    }

    if (current.status !== 'pendiente') {
      return { success: false, error: 'Este documento ya ha sido firmado previamente.' };
    }

    // 2. Perform the update
    const { error: updateErr } = await supabase
      .from('cuentas_cobro')
      .update({
        status: 'firmada',
        signature_data: signatureData,
        signature_type: signatureType,
        signed_at: new Date().toISOString(),
        bank_name: bankDetails.bank_name,
        bank_account_type: bankDetails.bank_account_type,
        bank_account_number: bankDetails.bank_account_number,
        issuer_name: issuerDetails.issuer_name,
        issuer_document: issuerDetails.issuer_document,
        issuer_email: issuerDetails.issuer_email,
        issuer_phone: issuerDetails.issuer_phone,
      })
      .eq('id', id);

    if (updateErr) throw updateErr;

    revalidatePath('/admin/cuentas-cobro');
    revalidatePath(`/cuentas-cobro/${id}`);
    return { success: true };
  } catch (err: any) {
    console.error('Error signing cuenta_cobro:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Admin action: Register a signed Cuenta de Cobro as a cashflow expense.
 */
export async function registerCuentaCobroExpense(
  id: string,
  expenseParams: {
    date: string;
    category: string;
    expenseType: ExpenseType;
  }
) {
  const supabase = await createClient();
  try {
    await checkAdmin(supabase);

    // 1. Fetch the signed Cuenta de Cobro
    const { data: cc, error: ccErr } = await supabase
      .from('cuentas_cobro')
      .select('*')
      .eq('id', id)
      .single();

    if (ccErr || !cc) {
      return { success: false, error: 'Cuenta de cobro no encontrada.' };
    }

    if (cc.status !== 'firmada') {
      return { success: false, error: 'La cuenta de cobro debe estar firmada para registrarse en contabilidad.' };
    }

    if (cc.type !== 'gasto') {
      return { success: false, error: 'Este documento no es de tipo gasto (egreso).' };
    }

    if (cc.expense_id) {
      return { success: false, error: 'Esta cuenta de cobro ya se encuentra asociada a un gasto contable.' };
    }

    // 2. Create the cashflow expense
    const concept = `Cuenta de Cobro No. ${cc.number} - ${cc.issuer_name} - ${cc.concept || 'Servicios'}`;
    const result = await createExpenseDirect(expenseParams.date, {
      concept,
      category: expenseParams.category,
      amount: Number(cc.total_amount),
      expense_type: expenseParams.expenseType,
      tax_amount: 0, // Natural persons in regime simplified don't charge IVA
      depreciation_months: null,
    });

    if ('error' in result && result.error) {
      return { success: false, error: result.error };
    }

    const expenseData = (result as any).data;
    if (!expenseData?.id) {
      return { success: false, error: 'No se pudo obtener el ID del gasto creado.' };
    }

    // 3. Link the expense back to the Cuenta de Cobro
    const { error: linkErr } = await supabase
      .from('cuentas_cobro')
      .update({ expense_id: expenseData.id })
      .eq('id', id);

    if (linkErr) throw linkErr;

    revalidatePath('/admin/cuentas-cobro');
    return { success: true };
  } catch (err: any) {
    console.error('Error registering cashflow expense for CC:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Admin action: Register a signed Cuenta de Cobro as a cashflow income.
 */
export async function registerCuentaCobroIncome(
  id: string,
  incomeParams: {
    date: string;
    category: string;
  }
) {
  const supabase = await createClient();
  try {
    await checkAdmin(supabase);

    // 1. Fetch the signed Cuenta de Cobro
    const { data: cc, error: ccErr } = await supabase
      .from('cuentas_cobro')
      .select('*')
      .eq('id', id)
      .single();

    if (ccErr || !cc) {
      return { success: false, error: 'Cuenta de cobro no encontrada.' };
    }

    if (cc.status !== 'firmada') {
      return { success: false, error: 'La cuenta de cobro debe estar firmada para registrarse en contabilidad.' };
    }

    if (cc.type !== 'ingreso') {
      return { success: false, error: 'Este documento no es de tipo ingreso (entrada).' };
    }

    if (cc.income_id) {
      return { success: false, error: 'Esta cuenta de cobro ya se encuentra asociada a un ingreso contable.' };
    }

    // 2. Create the cashflow income
    const concept = `Cuenta de Cobro No. ${cc.number} - ${cc.debtor_name} - ${cc.concept || 'Servicios'}`;
    const result = await createIncomeDirect(incomeParams.date, {
      concept,
      category: incomeParams.category,
      amount: Number(cc.total_amount),
      gross_amount: Number(cc.total_amount),
      fee_amount: 0,
      shipping_cost: 0,
      tax_amount: 0,
    });

    if ('error' in result && result.error) {
      return { success: false, error: result.error };
    }

    const incomeData = (result as any).data;
    if (!incomeData?.id) {
      return { success: false, error: 'No se pudo obtener el ID del ingreso creado.' };
    }

    // 3. Link the income back to the Cuenta de Cobro
    const { error: linkErr } = await supabase
      .from('cuentas_cobro')
      .update({ income_id: incomeData.id })
      .eq('id', id);

    if (linkErr) throw linkErr;

    revalidatePath('/admin/cuentas-cobro');
    return { success: true };
  } catch (err: any) {
    console.error('Error registering cashflow income for CC:', err.message);
    return { success: false, error: err.message };
  }
}
