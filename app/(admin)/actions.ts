"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";

export async function checkIsAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return false;

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  return profile?.role === 'admin';
}

export async function getDashboardMetrics() {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) throw new Error("Unauthorized");

  const supabase = await createClient();
  
  const [ordersRes, subsRes] = await Promise.all([
    supabase.from('orders').select('id, total_amount, status', { count: 'exact' }),
    supabase.from('subscriptions').select('id, status', { count: 'exact' })
  ]);

  const totalRevenue = (ordersRes.data || []).reduce((acc, order) => acc + Number(order.total_amount), 0);
  const activeSubs = (subsRes.data || []).filter(s => s.status === 'active').length;

  return {
    totalRevenue,
    totalOrders: ordersRes.count || 0,
    activeSubscriptions: activeSubs
  };
}

export async function getRecentOrders() {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) throw new Error("Unauthorized");

  const supabase = await createClient();
  
  const { data: orders, error } = await supabase
    .from('orders')
    .select(`
      id,
      status,
      total_amount,
      contact_email,
      created_at,
      profiles (
        first_name,
        last_name
      )
    `)
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) {
    console.error("Error fetching recent orders:", error);
    return [];
  }

  return orders;
}

export async function updateOrderStatus(orderId: string, newStatus: string) {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) throw new Error("Unauthorized");

  const supabase = await createClient();
  
  const { error } = await supabase
    .from('orders')
    .update({ status: newStatus })
    .eq('id', orderId);

  if (error) throw new Error(error.message);

  revalidatePath('/admin');
  revalidatePath('/admin/orders');
  
  return { success: true };
}

export async function updateSubscriptionStatus(subId: string, newStatus: string) {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) throw new Error("Unauthorized");

  const supabase = await createClient();
  
  const { error } = await supabase
    .from('subscriptions')
    .update({ status: newStatus })
    .eq('id', subId);

  if (error) throw new Error(error.message);

  revalidatePath('/admin');
  revalidatePath('/admin/subscriptions');
  
  return { success: true };
}

export async function updateStoreSettings(formData: FormData) {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) throw new Error("Unauthorized");

  const supabase = await createClient();
  
  const store_name = formData.get("store_name") as string;
  const admin_email = formData.get("admin_email") as string;
  const base_currency = formData.get("base_currency") as string;

  const { error } = await supabase
    .from('store_settings')
    .update({ 
      store_name, 
      admin_email, 
      base_currency 
    })
    .eq('id', 1);

  if (error) throw new Error(error.message);

  revalidatePath('/admin');
  revalidatePath('/admin/settings');
  
  return { success: true };
}

export async function updateShippingSettings(formData: FormData) {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) throw new Error("Unauthorized");

  const supabase = await createClient();
  
  const default_shipping_cost = Number(formData.get("default_shipping_cost"));
  const free_shipping_threshold = Number(formData.get("free_shipping_threshold"));

  const { error } = await supabase
    .from('store_settings')
    .update({ 
      default_shipping_cost, 
      free_shipping_threshold 
    })
    .eq('id', 1);

  if (error) throw new Error(error.message);

  revalidatePath('/admin');
  revalidatePath('/admin/settings');
  
  return { success: true };
}

// ============================================================
// INVENTORY ACTIONS
// ============================================================

export async function getInventory() {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) throw new Error("Unauthorized");

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('inventory')
    .select('*')
    .order('category', { ascending: true })
    .order('product_name', { ascending: true });

  if (error) {
    console.error("Error fetching inventory:", error);
    return [];
  }

  return data;
}

export async function getInventoryMovements(inventoryId?: string) {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) throw new Error("Unauthorized");

  const supabase = await createClient();

  let query = supabase
    .from('inventory_movements')
    .select(`
      id,
      inventory_id,
      type,
      quantity,
      reason,
      created_at,
      inventory ( product_code, product_name )
    `)
    .order('created_at', { ascending: false })
    .limit(100);

  if (inventoryId) {
    query = query.eq('inventory_id', inventoryId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Error fetching inventory movements:", error);
    return [];
  }

  return data;
}

export async function adjustInventoryStock(
  inventoryId: string,
  type: 'entrada' | 'salida' | 'ajuste',
  quantity: number,
  reason?: string
) {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) throw new Error("Unauthorized");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Fetch current stock
  const { data: item, error: fetchError } = await supabase
    .from('inventory')
    .select('current_stock')
    .eq('id', inventoryId)
    .single();

  if (fetchError || !item) throw new Error('Producto no encontrado');

  // Compute new stock
  let delta = quantity;
  if (type === 'salida') delta = -Math.abs(quantity);
  else if (type === 'entrada') delta = Math.abs(quantity);
  // 'ajuste' uses raw signed quantity

  const newStock = item.current_stock + delta;
  if (newStock < 0) throw new Error('El stock no puede ser negativo');

  // Insert movement record
  const { error: movError } = await supabase
    .from('inventory_movements')
    .insert({
      inventory_id: inventoryId,
      type,
      quantity: delta,
      reason: reason || null,
      created_by: user?.id || null,
    });

  if (movError) throw new Error(movError.message);

  // Update current_stock
  const { error: updateError } = await supabase
    .from('inventory')
    .update({ current_stock: newStock })
    .eq('id', inventoryId);

  if (updateError) throw new Error(updateError.message);

  revalidatePath('/admin/inventory');

  return { success: true, newStock };
}

export async function updateInventoryItem(
  id: string,
  data: { min_stock?: number; notes?: string; product_name?: string; unit?: string }
) {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) throw new Error("Unauthorized");

  const supabase = await createClient();

  const { error } = await supabase
    .from('inventory')
    .update(data)
    .eq('id', id);

  if (error) throw new Error(error.message);

  revalidatePath('/admin/inventory');

  return { success: true };
}

// ============================================================
// PRODUCTION BATCH ACTIONS
// ============================================================

export async function runProductionBatch(
  processType: 'trilla' | 'tostion',
  inputInventoryId: string,
  inputQtyKg: number,
  outputInventoryId: string,
  outputQtyKg: number,
  notes?: string
) {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) throw new Error('Unauthorized');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Fetch both inventory items
  const { data: items, error: fetchError } = await supabase
    .from('inventory')
    .select('id, current_stock, product_name')
    .in('id', [inputInventoryId, outputInventoryId]);

  if (fetchError || !items || items.length < 2) throw new Error('Productos no encontrados');

  const inputItem = items.find(i => i.id === inputInventoryId);
  const outputItem = items.find(i => i.id === outputInventoryId);

  if (!inputItem || !outputItem) throw new Error('Productos no encontrados');
  if (inputItem.current_stock < inputQtyKg) {
    throw new Error(`Stock insuficiente de "${inputItem.product_name}". Disponible: ${inputItem.current_stock} kg`);
  }

  const weightLossPct = ((inputQtyKg - outputQtyKg) / inputQtyKg) * 100;
  const processLabel = processType === 'trilla' ? 'Trilla' : 'Tostión';

  const newInputStock = inputItem.current_stock - inputQtyKg;
  const newOutputStock = outputItem.current_stock + outputQtyKg;

  // ── Salida on input ──────────────────────────────────────
  const { error: salErr } = await supabase.from('inventory_movements').insert({
    inventory_id: inputInventoryId,
    type: 'salida',
    quantity: -inputQtyKg,
    reason: `Proceso: ${processLabel}${notes ? ` — ${notes}` : ''}`,
    created_by: user?.id ?? null,
  });
  if (salErr) throw new Error(salErr.message);

  const { error: inpUpdErr } = await supabase
    .from('inventory')
    .update({ current_stock: newInputStock })
    .eq('id', inputInventoryId);
  if (inpUpdErr) throw new Error(inpUpdErr.message);

  // ── Entrada on output ────────────────────────────────────
  const { error: entErr } = await supabase.from('inventory_movements').insert({
    inventory_id: outputInventoryId,
    type: 'entrada',
    quantity: outputQtyKg,
    reason: `Producto de ${processLabel} (pérdida ${weightLossPct.toFixed(1)}%)${notes ? ` — ${notes}` : ''}`,
    created_by: user?.id ?? null,
  });
  if (entErr) throw new Error(entErr.message);

  const { error: outUpdErr } = await supabase
    .from('inventory')
    .update({ current_stock: newOutputStock })
    .eq('id', outputInventoryId);
  if (outUpdErr) throw new Error(outUpdErr.message);

  // ── Record the production batch ──────────────────────────
  const { error: batchErr } = await supabase.from('production_batches').insert({
    process_type: processType,
    input_inventory_id: inputInventoryId,
    input_quantity_kg: inputQtyKg,
    output_inventory_id: outputInventoryId,
    output_quantity_kg: outputQtyKg,
    weight_loss_pct: weightLossPct,
    notes: notes ?? null,
    created_by: user?.id ?? null,
  });
  if (batchErr) throw new Error(batchErr.message);

  revalidatePath('/admin/inventory');

  return { success: true, newInputStock, newOutputStock };
}

export async function getProductionBatches() {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) throw new Error('Unauthorized');

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('production_batches')
    .select(`
      id,
      process_type,
      input_quantity_kg,
      output_quantity_kg,
      weight_loss_pct,
      notes,
      created_at,
      input_inventory:input_inventory_id ( product_code, product_name ),
      output_inventory:output_inventory_id ( product_code, product_name )
    `)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('Error fetching production batches:', error);
    return [];
  }

  return data;
}
