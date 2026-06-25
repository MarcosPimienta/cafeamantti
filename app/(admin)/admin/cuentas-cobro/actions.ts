'use server';

import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';
import { createExpenseDirect } from '../cashflow/actions';
import { ExpenseType } from '../cashflow/types';

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

    const { data, error } = await supabase
      .from('cuentas_cobro')
      .select('*')
      .order('created_at', { ascending: false });

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
  issuerData: {
    issuer_name: string;
    issuer_document: string;
    issuer_email: string;
    issuer_phone: string;
    concept?: string;
  },
  items: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    total_price: number;
  }>
) {
  const supabase = await createClient();
  try {
    await checkAdmin(supabase);

    const total_amount = items.reduce((acc, item) => acc + Number(item.total_price), 0);

    const { data, error } = await supabase
      .from('cuentas_cobro')
      .insert({
        status: 'pendiente',
        issuer_name: issuerData.issuer_name,
        issuer_document: issuerData.issuer_document,
        issuer_email: issuerData.issuer_email,
        issuer_phone: issuerData.issuer_phone,
        concept: issuerData.concept || 'Servicios Prestados',
        items,
        total_amount,
      })
      .select()
      .single();

    if (error) throw error;

    revalidatePath('/admin/cuentas-cobro');
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
  issuerData: {
    issuer_name: string;
    issuer_document: string;
    issuer_email: string;
    issuer_phone: string;
    concept?: string;
  },
  items: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    total_price: number;
  }>
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

    const total_amount = items.reduce((acc, item) => acc + Number(item.total_price), 0);

    const { error } = await supabase
      .from('cuentas_cobro')
      .update({
        issuer_name: issuerData.issuer_name,
        issuer_document: issuerData.issuer_document,
        issuer_email: issuerData.issuer_email,
        issuer_phone: issuerData.issuer_phone,
        concept: issuerData.concept || 'Servicios Prestados',
        items,
        total_amount,
      })
      .eq('id', id);

    if (error) throw error;

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

    const { error } = await supabase
      .from('cuentas_cobro')
      .delete()
      .eq('id', id);

    if (error) throw error;

    revalidatePath('/admin/cuentas-cobro');
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
  const supabase = await createClient();
  try {
    // 1. Fetch document and verify it is still 'pendiente' (Double Check RLS constraint)
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
