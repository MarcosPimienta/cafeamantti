'use server';

import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';

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

export async function getSuppliers() {
  const supabase = await createClient();
  try {
    await checkAdmin(supabase);
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
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

export async function createSupplier(payload: {
  name: string;
  document_type?: string;
  document_number?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  bank_name?: string;
  bank_account_type?: string;
  bank_account_number?: string;
}) {
  const supabase = await createClient();
  try {
    await checkAdmin(supabase);

    const { data, error } = await supabase
      .from('suppliers')
      .insert({
        name: payload.name,
        document_type: payload.document_type || 'NIT',
        document_number: payload.document_number || null,
        email: payload.email || null,
        phone: payload.phone || null,
        address: payload.address || null,
        city: payload.city || null,
        bank_name: payload.bank_name || null,
        bank_account_type: payload.bank_account_type || null,
        bank_account_number: payload.bank_account_number || null,
      })
      .select()
      .single();

    if (error) throw error;

    revalidatePath('/admin/suppliers');
    revalidatePath('/admin/cuentas-cobro');
    return { success: true, data };
  } catch (err: any) {
    console.error('Error creating supplier:', err.message);
    return { success: false, error: err.message };
  }
}

export async function updateSupplier(
  id: string,
  payload: {
    name: string;
    document_type?: string;
    document_number?: string;
    email?: string;
    phone?: string;
    address?: string;
    city?: string;
    bank_name?: string;
    bank_account_type?: string;
    bank_account_number?: string;
  }
) {
  const supabase = await createClient();
  try {
    await checkAdmin(supabase);

    const { error } = await supabase
      .from('suppliers')
      .update({
        name: payload.name,
        document_type: payload.document_type || 'NIT',
        document_number: payload.document_number || null,
        email: payload.email || null,
        phone: payload.phone || null,
        address: payload.address || null,
        city: payload.city || null,
        bank_name: payload.bank_name || null,
        bank_account_type: payload.bank_account_type || null,
        bank_account_number: payload.bank_account_number || null,
      })
      .eq('id', id);

    if (error) throw error;

    revalidatePath('/admin/suppliers');
    revalidatePath('/admin/cuentas-cobro');
    return { success: true };
  } catch (err: any) {
    console.error('Error updating supplier:', err.message);
    return { success: false, error: err.message };
  }
}

export async function deleteSupplier(id: string) {
  const supabase = await createClient();
  try {
    await checkAdmin(supabase);

    const { error } = await supabase
      .from('suppliers')
      .delete()
      .eq('id', id);

    if (error) throw error;

    revalidatePath('/admin/suppliers');
    revalidatePath('/admin/cuentas-cobro');
    return { success: true };
  } catch (err: any) {
    console.error('Error deleting supplier:', err.message);
    return { success: false, error: err.message };
  }
}
