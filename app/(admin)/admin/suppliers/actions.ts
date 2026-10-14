'use server';

import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';
import { RUT_BUCKET, isRutPathOf } from '@/utils/suppliers/rut';

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

    const { data: s } = await supabase.from('suppliers').select('rut_path').eq('id', id).maybeSingle();
    const { error } = await supabase
      .from('suppliers')
      .delete()
      .eq('id', id);

    if (error) throw error;
    if (s?.rut_path) await supabase.storage.from(RUT_BUCKET).remove([s.rut_path]);

    revalidatePath('/admin/suppliers');
    revalidatePath('/admin/cuentas-cobro');
    return { success: true };
  } catch (err: any) {
    console.error('Error deleting supplier:', err.message);
    return { success: false, error: err.message };
  }
}

// ── RUT ─────────────────────────────────────────────────────
// The browser uploads the file straight to the private bucket (server
// actions cap request bodies at 1 MB); these record it, show it and
// remove it.

export async function saveSupplierRut(supplierId: string, path: string, fileName: string) {
  const supabase = await createClient();
  try {
    await checkAdmin(supabase);
    if (!isRutPathOf(supplierId, path)) throw new Error('Archivo de RUT inválido.');
    const { data: prev, error: prevErr } = await supabase.from('suppliers').select('rut_path').eq('id', supplierId).single();
    if (prevErr) throw prevErr;
    const { error } = await supabase
      .from('suppliers')
      .update({ rut_path: path, rut_file_name: fileName.slice(0, 200) || null, rut_uploaded_at: new Date().toISOString() })
      .eq('id', supplierId);
    if (error) throw error;
    // The previous copy is replaced, not kept.
    if (prev?.rut_path && prev.rut_path !== path) await supabase.storage.from(RUT_BUCKET).remove([prev.rut_path]);
    revalidatePath('/admin/suppliers');
    return { success: true };
  } catch (err: any) {
    console.error('Error saving supplier RUT:', err.message);
    return { success: false, error: err.message };
  }
}

/** A link to the supplier's RUT valid for 10 minutes. */
export async function getSupplierRutUrl(supplierId: string) {
  const supabase = await createClient();
  try {
    await checkAdmin(supabase);
    const { data: s, error } = await supabase.from('suppliers').select('rut_path').eq('id', supplierId).single();
    if (error) throw error;
    if (!s?.rut_path) throw new Error('El proveedor no tiene RUT.');
    const { data, error: urlErr } = await supabase.storage.from(RUT_BUCKET).createSignedUrl(s.rut_path, 600);
    if (urlErr || !data) throw urlErr ?? new Error('No se pudo abrir el RUT.');
    return { success: true, url: data.signedUrl };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function deleteSupplierRut(supplierId: string) {
  const supabase = await createClient();
  try {
    await checkAdmin(supabase);
    const { data: s, error } = await supabase.from('suppliers').select('rut_path').eq('id', supplierId).single();
    if (error) throw error;
    const { error: upErr } = await supabase.from('suppliers').update({ rut_path: null, rut_file_name: null, rut_uploaded_at: null }).eq('id', supplierId);
    if (upErr) throw upErr;
    if (s?.rut_path) await supabase.storage.from(RUT_BUCKET).remove([s.rut_path]);
    revalidatePath('/admin/suppliers');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
