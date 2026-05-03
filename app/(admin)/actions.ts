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

export async function getCurrentUserProfile() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  return profile;
}

export async function logAuditAction(
  actionType: "CREATE" | "UPDATE" | "DELETE",
  entityType: "MOVEMENT" | "TRILLA_BATCH" | "TOSTION_BATCH",
  entityId: string,
  inventoryId?: string,
  details?: Record<string, any>
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return; // Silent return if no admin context

  await supabase.from("inventory_audit_logs").insert({
    admin_id: user.id,
    action_type: actionType,
    entity_type: entityType,
    entity_id: entityId,
    inventory_id: inventoryId || null,
    details: details || null,
  });
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
// MANUAL ORDERS (ADMIN)
// ============================================================

export async function createManualAdminOrder(
  data: {
    client_id?: string;
    contact_email: string;
    contact_phone: string;
    shipping_info: { address: string; details?: string; city: string; state: string };
    status: string;
    items: {
      inventory_id: string;
      product_code: string;
      product_name: string;
      quantity: number;
      price: number;
      weight?: string;
      grind?: string;
    }[];
  }
) {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) throw new Error("Unauthorized");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Validate stock for all items
  for (const item of data.items) {
    if (item.quantity <= 0) continue;
    const { data: matInfo, error } = await supabase
      .from('inventory')
      .select('current_stock, product_name')
      .eq('id', item.inventory_id)
      .single();
    
    if (error || !matInfo) throw new Error(`Producto en inventario no encontrado: ${item.product_name}`);
    if (Number(matInfo.current_stock) < item.quantity) throw new Error(`Stock insuficiente: ${matInfo.product_name}.`);
  }

  let total_amount = 0;
  for (const item of data.items) {
    total_amount += item.price * item.quantity;
  }

  // Insert Order
  const { data: order, error: orderErr } = await supabase.from('orders').insert({
    user_id: null,
    client_id: data.client_id || null,
    total_amount,
    shipping_info: data.shipping_info,
    contact_email: data.contact_email,
    contact_phone: data.contact_phone,
    status: data.status
  }).select('id').single();

  if (orderErr) throw new Error(orderErr.message);

  // Insert Order Items
  const orderItemsData = data.items.map(item => ({
    order_id: order.id,
    product_id: item.product_name, // Save name to represent what was sold
    weight: item.weight || null,
    grind: item.grind || null,
    quantity: item.quantity,
    price_at_time: item.price
  }));

  const { error: itemsErr } = await supabase.from('order_items').insert(orderItemsData);
  if (itemsErr) {
    // Cleanup if order items fail
    await supabase.from('orders').delete().eq('id', order.id);
    if (itemsErr.message.toLowerCase().includes('check constraint')) {
      throw new Error("Por favor ejecuta la migración SQL '20260425000000_relax_order_items.sql' para permitir vender cualquier producto.");
    }
    throw new Error(itemsErr.message);
  }

  // Deduct Inventory
  const movementDate = new Date().toISOString();
  for (const item of data.items) {
    if (item.quantity <= 0) continue;
    
    const reason = `Orden Manual #${order.id.split('-')[0]}`;
    
    const mId = await _insertMovement(supabase, user?.id ?? null, item.inventory_id, 'salida', -item.quantity, {
      movement_date: movementDate,
      reason: reason,
      tab_source: 'salida',
    });
    
    await _updateStockBy(supabase, item.inventory_id, -item.quantity);
    await logAuditAction("CREATE", "MOVEMENT", mId, item.inventory_id, { qty: -item.quantity, reason });
  }

  revalidatePath('/admin');
  revalidatePath('/admin/orders');
  revalidatePath('/admin/inventory');
  revalidatePath('/admin/inventory', 'page');

  return { success: true, orderId: order.id };
}

export async function deleteManualAdminOrder(orderId: string) {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) throw new Error("Unauthorized");

  const supabase = await createClient();

  // Find the movements associated with this order
  const shortId = orderId.split('-')[0];
  const reasonStr = `Orden Manual #${shortId}`;

  const { data: movements, error: movErr } = await supabase
    .from('inventory_movements')
    .select('id, inventory_id, quantity')
    .eq('reason', reasonStr);

  if (movErr) throw new Error(movErr.message);

  // Revert inventory for each movement
  if (movements && movements.length > 0) {
    for (const mov of movements) {
      await _updateStockBy(supabase, mov.inventory_id, -Number(mov.quantity));
      await logAuditAction("DELETE", "MOVEMENT", mov.id, mov.inventory_id, { old_quantity: mov.quantity, note: "Reverted by order deletion" });
    }
    // Delete the movements
    await supabase.from('inventory_movements').delete().eq('reason', reasonStr);
  }

  // Delete the order (cascade will handle order_items)
  const { error: orderErr } = await supabase.from('orders').delete().eq('id', orderId);
  if (orderErr) throw new Error(orderErr.message);

  revalidatePath('/admin');
  revalidatePath('/admin/orders');
  revalidatePath('/admin/inventory');
  revalidatePath('/admin/inventory', 'page');

  return { success: true };
}

export async function updateManualAdminOrder(
  orderId: string,
  data: {
    client_id?: string;
    contact_email: string;
    contact_phone: string;
    shipping_info: { address: string; details?: string; city: string; state: string };
    status: string;
    items: {
      inventory_id: string;
      product_code: string;
      product_name: string;
      quantity: number;
      price: number;
      weight?: string;
      grind?: string;
    }[];
  }
) {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) throw new Error("Unauthorized");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const shortId = orderId.split('-')[0];
  const reasonStr = `Orden Manual #${shortId}`;

  // 1. Validate stock for new items (considering what was already deducted)
  // To keep it simple and safe: Revert old inventory, then check new inventory, then apply new inventory.
  // Actually, checking stock should be done before mutating. 
  // For a robust implementation:
  
  // A. Revert old inventory movements
  const { data: oldMovements } = await supabase
    .from('inventory_movements')
    .select('id, inventory_id, quantity')
    .eq('reason', reasonStr);

  if (oldMovements) {
    for (const mov of oldMovements) {
      await _updateStockBy(supabase, mov.inventory_id, -Number(mov.quantity));
    }
    await supabase.from('inventory_movements').delete().eq('reason', reasonStr);
  }

  // B. Delete old order items
  await supabase.from('order_items').delete().eq('order_id', orderId);

  // C. Validate new stock
  for (const item of data.items) {
    if (item.quantity <= 0) continue;
    const { data: matInfo, error } = await supabase
      .from('inventory')
      .select('current_stock, product_name')
      .eq('id', item.inventory_id)
      .single();
    
    if (error || !matInfo) throw new Error(`Producto en inventario no encontrado: ${item.product_name}`);
    if (Number(matInfo.current_stock) < item.quantity) {
      // Re-apply old movements to restore state since we are aborting!
      if (oldMovements) {
        for (const mov of oldMovements) {
          await _updateStockBy(supabase, mov.inventory_id, Number(mov.quantity));
          await supabase.from('inventory_movements').insert({
            inventory_id: mov.inventory_id,
            type: 'salida',
            quantity: mov.quantity,
            reason: reasonStr,
            created_by: user?.id,
            tab_source: 'salida',
          });
        }
      }
      throw new Error(`Stock insuficiente: ${matInfo.product_name}.`);
    }
  }

  // D. Insert new order items and update order details
  let total_amount = 0;
  for (const item of data.items) {
    total_amount += item.price * item.quantity;
  }

  const { error: orderErr } = await supabase.from('orders').update({
    client_id: data.client_id || null,
    total_amount,
    shipping_info: data.shipping_info,
    contact_email: data.contact_email,
    contact_phone: data.contact_phone,
    status: data.status
  }).eq('id', orderId);

  if (orderErr) throw new Error(orderErr.message);

  const orderItemsData = data.items.map(item => ({
    order_id: orderId,
    product_id: item.product_name,
    weight: item.weight || null,
    grind: item.grind || null,
    quantity: item.quantity,
    price_at_time: item.price
  }));

  const { error: itemsErr } = await supabase.from('order_items').insert(orderItemsData);
  if (itemsErr) throw new Error(itemsErr.message);

  // E. Deduct new inventory
  const movementDate = new Date().toISOString();
  for (const item of data.items) {
    if (item.quantity <= 0) continue;
    
    const mId = await _insertMovement(supabase, user?.id ?? null, item.inventory_id, 'salida', -item.quantity, {
      movement_date: movementDate,
      reason: reasonStr,
      tab_source: 'salida',
    });
    
    await _updateStockBy(supabase, item.inventory_id, -item.quantity);
    await logAuditAction("UPDATE", "MOVEMENT", mId, item.inventory_id, { qty: -item.quantity, reason: reasonStr });
  }

  revalidatePath('/admin');
  revalidatePath('/admin/orders');
  revalidatePath('/admin/inventory');
  revalidatePath('/admin/inventory', 'page');

  return { success: true };
}

export async function createManualCustomer(data: {
  email: string;
  first_name: string;
  last_name: string;
  phone_number: string;
  cedula_number: string;
  address: string;
  city: string;
  department: string;
}) {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) throw new Error("Unauthorized");

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("Falta la llave SUPABASE_SERVICE_ROLE_KEY en .env.local para registrar usuarios manuales.");
  }

  const { createClient: createSupabaseClient } = await import('@supabase/supabase-js');
  const adminAuthClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: authData, error: authError } = await adminAuthClient.auth.admin.createUser({
    email: data.email,
    password: "Amantti2026*",
    email_confirm: true,
    user_metadata: {
      first_name: data.first_name,
      last_name: data.last_name,
    }
  });

  if (authError) {
    if (authError.message.includes('already registered')) throw new Error("Ya existe un cliente con este correo.");
    throw new Error(authError.message);
  }

  if (!authData?.user) throw new Error("No se pudo crear el usuario.");

  // The database trigger will automatically create the row in profiles.
  // Wait a small moment to ensure the trigger completes, though usually it's synchronous in Postgres.
  // We'll update the extra fields using standard client.
  const supabase = await createClient();
  const { error: profileError } = await supabase
    .from('profiles')
    .update({
      cedula_number: data.cedula_number || null,
      phone_number: data.phone_number || null,
      address: data.address || null,
      city: data.city || null,
      department: data.department || null,
    })
    .eq('id', authData.user.id);

  if (profileError) throw new Error(`Usuario creado pero fallo el perfil: ${profileError.message}`);

  revalidatePath('/admin/customers');
  return { success: true };
}

// ============================================================
// CLIENTS CRM (MANUAL B2B/RETAIL)
// ============================================================

export async function getClientsCRM() {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) throw new Error("Unauthorized");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('clients')
    .select(`
      *,
      orders(count)
    `)
    .order('created_at', { ascending: false });

  if (error) {
    console.error("Error fetching clients:", error);
    return [];
  }
  return data;
}

export async function createClientCRM(data: {
  name: string;
  document_type: string;
  document_number: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  department: string;
}) {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) throw new Error("Unauthorized");

  const supabase = await createClient();
  const { error } = await supabase.from('clients').insert(data);

  if (error) throw new Error(error.message);

  revalidatePath('/admin/customers');
  revalidatePath('/admin/orders'); // For the manual order dropdown
  return { success: true };
}

export async function updateClientCRM(id: string, data: any) {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) throw new Error("Unauthorized");

  const supabase = await createClient();
  const { error } = await supabase.from('clients').update(data).eq('id', id);

  if (error) throw new Error(error.message);

  revalidatePath('/admin/customers');
  revalidatePath('/admin/orders');
  return { success: true };
}

export async function deleteClientCRM(id: string) {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) throw new Error("Unauthorized");

  const supabase = await createClient();
  const { error } = await supabase.from('clients').delete().eq('id', id);

  if (error) throw new Error(error.message);

  revalidatePath('/admin/customers');
  revalidatePath('/admin/orders');
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

  const currentStock = Number(item.current_stock);
  const newStock = currentStock + delta;
  
  // Only block if we are making it MORE negative than it already was, 
  // or if it's a new negative and current was >= 0.
  // Exception: if the adjustment is intended to reach a specific positive value, we allow it.
  if (newStock < 0 && newStock < currentStock) {
    throw new Error('El stock resultante no puede ser menor al actual si es negativo.');
  }

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

// ============================================================
// INTERNAL HELPERS (not exported — run on-server only)
// ============================================================

async function _insertMovement(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string | null,
  inventoryId: string,
  type: 'entrada' | 'salida',
  quantity: number,
  opts: {
    movement_date?: string;
    reason?: string;
    responsable?: string;
    entry_type?: string;
    tab_source?: string;
    lote?: string;
  } = {}
) {
  const { data, error } = await supabase.from('inventory_movements').insert({
    inventory_id: inventoryId,
    type,
    quantity,
    reason: opts.reason ?? null,
    created_by: userId,
    movement_date: opts.movement_date ?? null,
    responsable: opts.responsable ?? null,
    entry_type: opts.entry_type ?? null,
    tab_source: opts.tab_source ?? null,
    lote: opts.lote ?? null,
  }).select('id').single();
  if (error) throw new Error(error.message);
  return data.id;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function _updateStockBy(supabase: any, inventoryId: string, delta: number): Promise<number> {
  const { data, error: selErr } = await supabase
    .from('inventory')
    .select('current_stock')
    .eq('id', inventoryId)
    .single();
  if (selErr || !data) throw new Error('Producto no encontrado');
  const newStock = Number(data.current_stock) + delta;
  if (newStock < 0) throw new Error('El stock no puede ser negativo');
  const { error: updErr } = await supabase
    .from('inventory')
    .update({ current_stock: newStock })
    .eq('id', inventoryId);
  if (updErr) throw new Error(updErr.message);
  return newStock;
}

// ============================================================
// TAB-BASED DATA FETCHING
// ============================================================

export async function getMovementsByTab(tabSource: string) {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) throw new Error('Unauthorized');

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('inventory_movements')
    .select(`
      id, inventory_id, type, quantity, reason, lote,
      movement_date, responsable, entry_type, tab_source, created_at,
      inventory ( product_code, product_name, unit )
    `)
    .eq('tab_source', tabSource)
    .order('movement_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    console.error('getMovementsByTab error:', error);
    return [];
  }
  return data;
}

export async function getTrillaBatches() {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) throw new Error('Unauthorized');

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('production_batches')
    .select(`
      id, process_type, input_quantity_kg, output_quantity_kg,
      weight_loss_pct, rendimiento_pct, movement_date, notes, created_at,
      input_inventory:input_inventory_id ( product_code, product_name ),
      output_inventory:output_inventory_id ( product_code, product_name )
    `)
    .eq('process_type', 'trilla')
    .order('movement_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('getTrillaBatches error:', error);
    return [];
  }
  return data;
}

export async function getTostionBatches() {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) throw new Error('Unauthorized');

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('production_batches')
    .select(`
      id, process_type, input_quantity_kg, output_quantity_kg,
      weight_loss_pct, rendimiento_pct, movement_date, notes, created_at,
      input_inventory:input_inventory_id ( product_code, product_name ),
      output_inventory:output_inventory_id ( product_code, product_name )
    `)
    .eq('process_type', 'tostion')
    .order('movement_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('getTostionBatches error:', error);
    return [];
  }
  return data;
}

// ============================================================
// TAB OPERATION ACTIONS
// ============================================================

export async function createEntrada(
  inventoryId: string,
  qty: number,
  date: string,
  entryType: 'MP' | 'MAT',
  responsable?: string,
  lote?: string
) {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) throw new Error('Unauthorized');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  try {
    const mId = await _insertMovement(supabase, user?.id ?? null, inventoryId, 'entrada', qty, {
      movement_date: date,
      entry_type: entryType,
      responsable,
      tab_source: 'entrada',
      lote,
    });

    const newStock = await _updateStockBy(supabase, inventoryId, qty);
    await logAuditAction("CREATE", "MOVEMENT", mId, inventoryId, { qty, entryType, responsable, lote });
    revalidatePath('/admin/inventory');
    return { success: true, newStock };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function createSalida(
  inventoryId: string,
  qty: number,
  date: string,
  reason?: string,
  responsable?: string
) {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) throw new Error('Unauthorized');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  try {
    const mId = await _insertMovement(supabase, user?.id ?? null, inventoryId, 'salida', -qty, {
      movement_date: date,
      reason,
      responsable,
      tab_source: 'salida',
    });

    const newStock = await _updateStockBy(supabase, inventoryId, -qty);
    await logAuditAction("CREATE", "MOVEMENT", mId, inventoryId, { qty: -qty, reason, responsable });
    revalidatePath('/admin/inventory');
    return { success: true, newStock };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function createProdConsumo(
  inventoryId: string,
  qty: number,
  date: string,
  entryType: 'MP' | 'MAT',
  responsable?: string
) {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) throw new Error('Unauthorized');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  try {
    const mId = await _insertMovement(supabase, user?.id ?? null, inventoryId, 'salida', -qty, {
      movement_date: date,
      entry_type: entryType,
      responsable,
      tab_source: 'prod_consumo',
    });

    const newStock = await _updateStockBy(supabase, inventoryId, -qty);
    await logAuditAction("CREATE", "MOVEMENT", mId, inventoryId, { qty: -qty, entryType, responsable });
    revalidatePath('/admin/inventory');
    return { success: true, newStock };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function createProdAlta(
  inventoryId: string,
  qty: number,
  date: string,
  consumos: { id: string; qty: number }[] = [],
  lote?: string,
  notes?: string
) {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) throw new Error('Unauthorized');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  try {
    // Validate stock for all consumos first to avoid partial commits
    for (const c of consumos) {
      if (c.qty <= 0) continue;
      const { data: matInfo, error } = await supabase
        .from('inventory')
        .select('current_stock, product_name')
        .eq('id', c.id)
        .single();
      
      if (error || !matInfo) throw new Error(`Material consumido no encontrado.`);
      if (matInfo.current_stock < c.qty) throw new Error(`Stock insuficiente: ${matInfo.product_name}.`);
    }

    const reason = [lote ? `Lote: ${lote}` : null, notes].filter(Boolean).join(' — ') || null;

    // 1. Process consumos
    const consumedResults: { id: string; newStock: number }[] = [];
    for (const c of consumos) {
      if (c.qty <= 0) continue;
      const matReason = `Consumo para Alta de prod. term.${reason ? ` — ${reason}` : ''}`;
      const cId = await _insertMovement(supabase, user?.id ?? null, c.id, 'salida', -c.qty, {
        movement_date: date,
        reason: matReason,
        entry_type: 'MAT',
        tab_source: 'prod_alta',
      });
      const ns = await _updateStockBy(supabase, c.id, -c.qty);
      consumedResults.push({ id: c.id, newStock: ns });
      await logAuditAction("CREATE", "MOVEMENT", cId, c.id, { qty: -c.qty, reason: matReason });
    }

    // 2. Process Prod Alta
    const mId = await _insertMovement(supabase, user?.id ?? null, inventoryId, 'entrada', qty, {
      movement_date: date,
      reason: reason ?? undefined,
      tab_source: 'prod_alta',
    });

    const newStock = await _updateStockBy(supabase, inventoryId, qty);
    await logAuditAction("CREATE", "MOVEMENT", mId, inventoryId, { qty, reason, consumosCount: consumos.length });
    
    revalidatePath('/admin/inventory');
    return { success: true, newStock, consumedResults };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function createTrillaBatch(
  pergaminoInventoryId: string,
  verdeInventoryId: string,
  inputQtyKg: number,
  rendimientoPct: number, // decimal, e.g. 0.735
  date: string,
  notes?: string
) {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) throw new Error('Unauthorized');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  try {
    // Validate Pergamino stock
    const { data: pergamino, error: pergErr } = await supabase
      .from('inventory')
      .select('current_stock, product_name')
      .eq('id', pergaminoInventoryId)
      .single();
    if (pergErr || !pergamino) throw new Error('Café Pergamino no encontrado');
    if (Number(pergamino.current_stock) < inputQtyKg) {
      throw new Error(
        `Stock insuficiente de Café Pergamino. Disponible: ${pergamino.current_stock} kg`
      );
    }

    const outputQtyKg = inputQtyKg * rendimientoPct;
    const weightLossPct = (1 - rendimientoPct) * 100;

    // Salida: Pergamino
    await _insertMovement(supabase, user?.id ?? null, pergaminoInventoryId, 'salida', -inputQtyKg, {
      movement_date: date,
      reason: `Trilla → Café Verde${notes ? ` — ${notes}` : ''}`,
      tab_source: 'trilla',
    });
    const newPergaminoStock = await _updateStockBy(supabase, pergaminoInventoryId, -inputQtyKg);

    // Entrada: Verde
    await _insertMovement(supabase, user?.id ?? null, verdeInventoryId, 'entrada', outputQtyKg, {
      movement_date: date,
      reason: `Trilla (rend. ${(rendimientoPct * 100).toFixed(1)}%)${notes ? ` — ${notes}` : ''}`,
      tab_source: 'trilla',
    });
    const newVerdeStock = await _updateStockBy(supabase, verdeInventoryId, outputQtyKg);

    // Production batch record
    const { data: batchData, error: batchErr } = await supabase.from('production_batches').insert({
      process_type: 'trilla',
      input_inventory_id: pergaminoInventoryId,
      input_quantity_kg: inputQtyKg,
      output_inventory_id: verdeInventoryId,
      output_quantity_kg: outputQtyKg,
      weight_loss_pct: weightLossPct,
      rendimiento_pct: rendimientoPct,
      notes: notes ?? null,
      created_by: user?.id ?? null,
      movement_date: date,
    }).select('id').single();
    if (batchErr) throw new Error(batchErr.message);

    await logAuditAction("CREATE", "TRILLA_BATCH", batchData.id, undefined, { inputQtyKg, outputQtyKg, rendimientoPct });

    revalidatePath('/admin/inventory');
    return { success: true, newPergaminoStock, newVerdeStock };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function createTostionBatch(
  verdeInventoryId: string,
  tostadoInventoryId: string,
  inputQtyKg: number,
  rendimientoPct: number,
  date: string,
  notes?: string
) {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) throw new Error('Unauthorized');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  try {
    // Validate Verde stock
    const { data: verde, error: vErr } = await supabase
      .from('inventory')
      .select('current_stock, product_name')
      .eq('id', verdeInventoryId)
      .single();
    if (vErr || !verde) throw new Error('Café Verde no encontrado');
    if (Number(verde.current_stock) < inputQtyKg) {
      throw new Error(`Stock insuficiente de Café Verde. Disponible: ${verde.current_stock} kg`);
    }

    const outputQtyKg = inputQtyKg * rendimientoPct;
    const weightLossPct = (1 - rendimientoPct) * 100;

    // Salida: Verde
    await _insertMovement(supabase, user?.id ?? null, verdeInventoryId, 'salida', -inputQtyKg, {
      movement_date: date,
      reason: `Tostión → Café Tostado${notes ? ` — ${notes}` : ''}`,
      tab_source: 'prod_consumo', // Keep using same tab_source or create 'tostion'
    });
    const newVerdeStock = await _updateStockBy(supabase, verdeInventoryId, -inputQtyKg);

    // Entrada: Tostado
    await _insertMovement(supabase, user?.id ?? null, tostadoInventoryId, 'entrada', outputQtyKg, {
      movement_date: date,
      reason: `Tostión (rend. ${(rendimientoPct * 100).toFixed(1)}%)${notes ? ` — ${notes}` : ''}`,
      tab_source: 'prod_consumo',
    });
    const newTostadoStock = await _updateStockBy(supabase, tostadoInventoryId, outputQtyKg);

    // Production batch record
    const { data: batchData, error: batchErr } = await supabase.from('production_batches').insert({
      process_type: 'tostion',
      input_inventory_id: verdeInventoryId,
      input_quantity_kg: inputQtyKg,
      output_inventory_id: tostadoInventoryId,
      output_quantity_kg: outputQtyKg,
      weight_loss_pct: weightLossPct,
      rendimiento_pct: rendimientoPct,
      notes: notes ?? null,
      created_by: user?.id ?? null,
      movement_date: date,
    }).select('id').single();
    if (batchErr) throw new Error(batchErr.message);

    await logAuditAction("CREATE", "TOSTION_BATCH", batchData.id, undefined, { inputQtyKg, outputQtyKg, rendimientoPct });

    revalidatePath('/admin/inventory');
    return { success: true, newVerdeStock, newTostadoStock };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ============================================================
// REPORT AND AUDIT ACTIONS
// ============================================================

export async function getAuditLogs() {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) throw new Error('Unauthorized');

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('inventory_audit_logs')
    .select(`
      *,
      profiles:admin_id (first_name, last_name)
    `)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data;
}

export async function getInventoryReportData() {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) throw new Error('Unauthorized');

  const supabase = await createClient();

  // All movements in the last 180 days
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 180);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  const { data: movements } = await supabase
    .from('inventory_movements')
    .select('id, type, quantity, movement_date, tab_source, created_at, inventory_id')
    .gte('movement_date', cutoffStr)
    .order('movement_date', { ascending: true });

  const { data: trillaBatches } = await supabase
    .from('production_batches')
    .select(
      'id, input_quantity_kg, output_quantity_kg, weight_loss_pct, rendimiento_pct, movement_date, created_at'
    )
    .eq('process_type', 'trilla')
    .order('movement_date', { ascending: true });

  const { data: tostionBatches } = await supabase
    .from('production_batches')
    .select(
      'id, input_quantity_kg, output_quantity_kg, weight_loss_pct, rendimiento_pct, movement_date, created_at'
    )
    .eq('process_type', 'tostion')
    .order('movement_date', { ascending: true });

  // All movements (no cutoff) grouped by tab_source for pie chart
  const { data: allMovements } = await supabase
    .from('inventory_movements')
    .select('tab_source, quantity');

  return {
    movements: movements ?? [],
    trillaBatches: trillaBatches ?? [],
    tostionBatches: tostionBatches ?? [],
    allMovements: allMovements ?? [],
  };
}

// ============================================================
// EDIT / DELETE ACTIONS
// ============================================================

export async function deleteMovement(id: string) {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) throw new Error('Unauthorized');

  const supabase = await createClient();

  const { data: mov, error: selErr } = await supabase
    .from('inventory_movements')
    .select('inventory_id, quantity')
    .eq('id', id)
    .single();
  if (selErr || !mov) throw new Error('Movimiento no encontrado');

  const { error } = await supabase
    .from('inventory_movements')
    .delete()
    .eq('id', id);
  if (error) throw new Error(error.message);

  // Reverse the stock effect (negate the stored quantity)
  const newStock = await _updateStockBy(supabase, mov.inventory_id, -Number(mov.quantity));
  await logAuditAction("DELETE", "MOVEMENT", id, mov.inventory_id, { old_quantity: mov.quantity });
  revalidatePath('/admin/inventory');
  return { success: true, inventoryId: mov.inventory_id, newStock };
}

export async function updateMovement(
  id: string,
  newQty: number, // signed — same sign as the original movement
  date: string,
  reason?: string,
  responsable?: string,
  entry_type?: string
) {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) throw new Error('Unauthorized');

  const supabase = await createClient();

  const { data: mov, error: selErr } = await supabase
    .from('inventory_movements')
    .select('inventory_id, quantity')
    .eq('id', id)
    .single();
  if (selErr || !mov) throw new Error('Movimiento no encontrado');

  const { error } = await supabase
    .from('inventory_movements')
    .update({
      quantity: newQty,
      movement_date: date,
      reason: reason ?? null,
      responsable: responsable ?? null,
      entry_type: entry_type || null,
    })
    .eq('id', id);
  if (error) throw new Error(error.message);

  // Apply only the difference to stock
  const delta = newQty - Number(mov.quantity);
  const newStock = await _updateStockBy(supabase, mov.inventory_id, delta);
  
  await logAuditAction("UPDATE", "MOVEMENT", id, mov.inventory_id, { 
    old_quantity: mov.quantity, 
    new_quantity: newQty,
    reason, responsable
  });
  
  revalidatePath('/admin/inventory');
  return { success: true, inventoryId: mov.inventory_id as string, newStock };
}

export async function deleteProductionBatch(batchId: string) {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) throw new Error('Unauthorized');

  const supabase = await createClient();

  const { data: batch, error: selErr } = await supabase
    .from('production_batches')
    .select('input_inventory_id, output_inventory_id, input_quantity_kg, output_quantity_kg')
    .eq('id', batchId)
    .single();
  if (selErr || !batch) throw new Error('Lote no encontrado');

  // Delete any linked movements (if production_batch_id column exists)
  await supabase.from('inventory_movements').delete().eq('production_batch_id', batchId);

  const { error } = await supabase
    .from('production_batches')
    .delete()
    .eq('id', batchId);
  if (error) throw new Error(error.message);

  // Reverse: add back input, subtract output
  const newInputStock = await _updateStockBy(
    supabase, batch.input_inventory_id, Number(batch.input_quantity_kg)
  );
  const newOutputStock = await _updateStockBy(
    supabase, batch.output_inventory_id, -Number(batch.output_quantity_kg)
  );

  await logAuditAction("DELETE", "TRILLA_BATCH", batchId, undefined, { 
    batch_details: batch 
  });

  revalidatePath('/admin/inventory');
  return {
    success: true,
    inputInventoryId: batch.input_inventory_id as string,
    newInputStock,
    outputInventoryId: batch.output_inventory_id as string,
    newOutputStock,
  };
}

export async function migrateLegacyTostion() {
  try {
    const isAdmin = await checkIsAdmin();
    if (!isAdmin) throw new Error('Unauthorized');
    
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    // 1. Get CAFT-001 ID
    const { data: caft, error: cErr } = await supabase
      .from('inventory')
      .select('id, current_stock')
      .eq('product_code', 'CAFT-001')
      .maybeSingle();

    if (cErr) throw new Error("Error buscando CAFT-001: " + cErr.message);
    if (!caft) throw new Error("No se encontró CAFT-001");

    // 2. Get legacy movements (Limit to 10. Filter out already processed by looking at the reason)
    const { data: movs, error: mErr } = await supabase
      .from('inventory_movements')
      .select('*, inventory:inventory_id(product_code, product_name)')
      .or('tab_source.eq.prod_consumo,tab_source.eq.prod_consumos,reason.ilike.%Historial%')
      .not('reason', 'ilike', '%[MIGRADO]%') // Filter out already migrated
      .limit(10);

    if (mErr) throw new Error("Error DB: " + mErr.message);
    
    if (!movs || movs.length === 0) {
      return { 
        success: true, 
        count: 0, 
        message: "No hay registros pendientes (todos los detectados ya están marcados como [MIGRADO])." 
      };
    }

    let totalKgs = 0;
    let successCount = 0;

    for (const m of movs) {
      try {
        const qty = Math.abs(Number(m.quantity));
        if (qty <= 0) continue;
        
        // Create batch record (standard columns only)
        const { data: batch, error: bErr } = await supabase.from('production_batches').insert({
          process_type: 'tostion',
          input_inventory_id: m.inventory_id,
          input_quantity_kg: qty,
          output_inventory_id: caft.id,
          output_quantity_kg: qty,
          rendimiento_pct: 1.0,
          weight_loss_pct: 0.0,
          movement_date: m.movement_date || m.created_at,
          notes: (m.reason || 'Migración automática') + ' [MIGRADO]',
          created_by: user?.id ?? null
        }).select('id').single();

        if (bErr || !batch) continue;

        // Create Entrada for CAFT-001 (standard columns only)
        await supabase.from('inventory_movements').insert({
          inventory_id: caft.id,
          type: 'entrada',
          quantity: qty,
          movement_date: m.movement_date || m.created_at,
          reason: `Entrada automática (Migración de Tostión Lote:${batch.id}) [MIGRADO]`,
          admin_id: user?.id ?? null,
          tab_source: 'prod_consumo'
        });

        // Mark the original legacy movement as migrated by updating its reason
        await supabase.from('inventory_movements')
          .update({ reason: (m.reason || 'Consumo') + ' [MIGRADO]' })
          .eq('id', m.id);
        
        totalKgs += qty;
        successCount++;
      } catch (inner) {
        console.error("Inner migration error", inner);
      }
    }

    if (successCount > 0) {
      const finalNewStock = Number(caft.current_stock) + totalKgs;
      await supabase.from('inventory').update({ current_stock: finalNewStock }).eq('id', caft.id);
    }

    revalidatePath('/admin/inventory');
    return { success: true, count: successCount, totalKgs, message: `Procesados ${successCount} registros.` };
  } catch (err: any) {
    return { success: false, message: "ERROR: " + err.message };
  }
}

export async function migrateLegacyAltas() {
  try {
    const isAdmin = await checkIsAdmin();
    if (!isAdmin) throw new Error('Unauthorized');
    
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const { data: caft } = await supabase
      .from('inventory')
      .select('id, current_stock')
      .eq('product_code', 'CAFT-001')
      .maybeSingle();

    if (!caft) throw new Error("CAFT-001 not found");

    // Get bag entries from prod_alta that are not marked as migrated
    const { data: movs, error: mErr } = await supabase
      .from('inventory_movements')
      .select('*, inventory:inventory_id(product_code)')
      .eq('tab_source', 'prod_alta')
      .eq('type', 'entrada')
      .not('reason', 'ilike', '%[MIGRADO]%')
      .limit(10);

    if (mErr) throw new Error("Error DB: " + mErr.message);
    if (!movs || movs.length === 0) return { success: true, count: 0, message: "No hay registros de altas pendientes." };

    function getUnitWeight(code: string): number {
      if (code.includes("-125G")) return 0.125;
      if (code.includes("-250G")) return 0.250;
      if (code.includes("-500G")) return 0.500;
      if (code.includes("-2K5")) return 2.5;
      return 0;
    }

    let totalKgsToDeduct = 0;
    let successCount = 0;

    for (const m of movs) {
      const inv = m.inventory as any;
      if (!inv?.product_code.startsWith("CAFT-") || inv.product_code === "CAFT-001") {
        // Just mark as migrated to skip in next run
        await supabase.from('inventory_movements').update({ reason: (m.reason || '') + ' [MIGRADO]' }).eq('id', m.id);
        continue;
      }

      const unitW = getUnitWeight(inv.product_code);
      if (unitW === 0) {
        await supabase.from('inventory_movements').update({ reason: (m.reason || '') + ' [MIGRADO]' }).eq('id', m.id);
        continue;
      }

      const qty = Number(m.quantity);
      const coffeeNeeded = qty * unitW;

      // Create Salida for CAFT-001
      await supabase.from('inventory_movements').insert({
        inventory_id: caft.id,
        type: 'salida',
        quantity: -coffeeNeeded,
        movement_date: m.movement_date || m.created_at,
        reason: `Consumo automático por migración (Bolsas: ${inv.product_code}) [MIGRADO]`,
        admin_id: user?.id ?? null,
        tab_source: 'prod_alta'
      });

      // Mark original as migrated
      await supabase.from('inventory_movements').update({ reason: (m.reason || '') + ' [MIGRADO]' }).eq('id', m.id);

      totalKgsToDeduct += coffeeNeeded;
      successCount++;
    }

    if (totalKgsToDeduct > 0) {
      const finalNewStock = Number(caft.current_stock) - totalKgsToDeduct;
      await supabase.from('inventory').update({ current_stock: finalNewStock }).eq('id', caft.id);
    }

    revalidatePath('/admin/inventory');
    return { success: true, count: successCount, totalKgs: -totalKgsToDeduct, message: `Deducidos ${totalKgsToDeduct.toFixed(2)} kg de CAFT-001.` };
  } catch (err: any) {
    return { success: false, message: "ERROR: " + err.message };
  }
}
