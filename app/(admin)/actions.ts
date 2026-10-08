"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import {
  COFFEE_PROFILES,
  type Molienda,
  isBulkCoffee,
  isGrindTracked,
  isMolienda,
  profileForCode,
  bulkCodeForProfile,
  PROFILE_LABELS,
} from "./coffeeProfiles";
import { ensureCashflowDate } from "./admin/cashflow/actions";
import { sendWhatsApp } from "@/utils/whatsapp";
import { buildPendingDeliveriesMessage, getPendingDeliveries } from "@/utils/orders/pendingDeliveries";
import { isSellable } from "@/utils/inventory/sellable";
import { planRepack, KG_EPS, round3, type RepackLine } from "@/utils/inventory/repack";
import { buildProductKardex, buildGeneralKardex } from "@/utils/inventory/kardex";

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
  entityType: "MOVEMENT" | "TRILLA_BATCH" | "TOSTION_BATCH" | "COLD_BREW_BATCH" | "REPACK_BATCH",
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
  const { data: { user } } = await supabase.auth.getUser();
  
  const { error } = await supabase
    .from('orders')
    .update({ status: newStatus })
    .eq('id', orderId);

  if (error) throw new Error(error.message);

  // Follow-up timestamps for the orders board. Separate, best-effort update
  // so status changes keep working even before the tracking migration runs.
  const now = new Date().toISOString();
  const { error: trackErr } = await supabase
    .from('orders')
    .update({
      status_changed_at: now,
      delivered_at: newStatus === 'delivered' ? now : null,
    })
    .eq('id', orderId);
  if (trackErr) console.warn('updateOrderStatus tracking fields:', trackErr.message);

  await _syncManualOrderStock(supabase, user?.id ?? null, orderId, newStatus);

  revalidatePath('/admin');
  revalidatePath('/admin/orders');
  revalidatePath('/admin/inventory');

  return { success: true };
}

/** Promised delivery day shown on the orders board; null clears it. */
export async function updateOrderDueDate(orderId: string, dueDate: string | null) {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) throw new Error("Unauthorized");
  if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) throw new Error('Fecha inválida');

  const supabase = await createClient();
  const { error } = await supabase
    .from('orders')
    .update({ delivery_due_date: dueDate || null })
    .eq('id', orderId);
  if (error) throw new Error(error.message);

  revalidatePath('/admin/orders');
  return { success: true };
}

/**
 * Sends the "órdenes por entregar" summary to the company WhatsApp now, and
 * logs the attempt (sent or failed) in notification_logs.
 */
export async function sendPendingOrdersWhatsApp() {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) throw new Error("Unauthorized");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const pending = await getPendingDeliveries(supabase);
  const message = buildPendingDeliveriesMessage(pending);
  const result = await sendWhatsApp(message);

  await supabase.from('notification_logs').insert({
    channel: 'whatsapp',
    kind: 'pending_deliveries',
    trigger: 'manual',
    recipients: result.recipients,
    message,
    success: result.success,
    error: result.error ?? null,
    created_by: user?.id ?? null,
  });

  revalidatePath('/admin/orders');
  return { ...result, message, pendingCount: pending.length };
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

/** Statuses in which an order counts as cobrada (same set Flujo de Caja uses). */
const PAID_ORDER_STATUSES = ['paid', 'processing', 'shipped', 'delivered'];

/**
 * Makes a manual order's stock match its payment state: salidas exist while
 * the order is paid and are reverted when it goes back to pending/cancelled.
 * Web-checkout orders have no inventory link and are left untouched.
 */
async function _syncManualOrderStock(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string | null,
  orderId: string,
  status: string
) {
  const reason = `Orden Manual #${orderId.split('-')[0]}`;

  const { data: existing, error: movErr } = await supabase
    .from('inventory_movements')
    .select('id, inventory_id, quantity')
    .eq('reason', reason);
  if (movErr) throw new Error(movErr.message);

  const deducted = (existing ?? []).length > 0;
  const shouldDeduct = PAID_ORDER_STATUSES.includes(status);
  if (deducted === shouldDeduct) return;

  if (!shouldDeduct) {
    // Only revert when the order can be re-applied later; older manual
    // orders without inventory_id on their items are left as they were.
    const { count } = await supabase
      .from('order_items')
      .select('id', { count: 'exact', head: true })
      .eq('order_id', orderId)
      .not('inventory_id', 'is', null);
    if (!count) return;

    for (const mov of existing) {
      await _updateStockBy(supabase, mov.inventory_id, -Number(mov.quantity));
      await logAuditAction("DELETE", "MOVEMENT", mov.id, mov.inventory_id, { old_quantity: mov.quantity, note: `Orden no pagada (${status})` });
    }
    await supabase.from('inventory_movements').delete().eq('reason', reason);
    return;
  }

  const { data: items, error: itemsErr } = await supabase
    .from('order_items')
    .select('inventory_id, quantity')
    .eq('order_id', orderId)
    .not('inventory_id', 'is', null);
  if (itemsErr) throw new Error(itemsErr.message);

  const movementDate = new Date().toISOString();
  for (const item of items ?? []) {
    const qty = Number(item.quantity);
    if (!(qty > 0)) continue;
    const mId = await _insertMovement(supabase, userId, item.inventory_id, 'salida', -qty, {
      movement_date: movementDate,
      reason,
      tab_source: 'salida',
    });
    await _updateStockBy(supabase, item.inventory_id, -qty);
    await logAuditAction("CREATE", "MOVEMENT", mId, item.inventory_id, { qty: -qty, reason });
  }
}

export async function createManualAdminOrder(
  data: {
    client_id?: string;
    /** Name shown on the order; for a CRM client it defaults to the CRM name. */
    customer_name?: string;
    /** A walk-in customer to save in the CRM and link to this order. */
    new_client?: {
      name: string;
      document_type?: string | null;
      document_number?: string | null;
    } | null;
    delivery_due_date?: string | null;
    notes?: string | null;
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

  if (data.delivery_due_date && !/^\d{4}-\d{2}-\d{2}$/.test(data.delivery_due_date)) {
    throw new Error('Fecha de entrega inválida');
  }

  // A new customer typed into the order can be saved to the CRM right away.
  let clientId = data.client_id || null;
  if (!clientId && data.new_client) {
    const name = data.new_client.name?.trim();
    if (!name) throw new Error('Escribe el nombre del cliente para guardarlo en el CRM.');
    const { data: created, error: clientErr } = await supabase
      .from('clients')
      .insert({
        name,
        document_type: data.new_client.document_type || null,
        document_number: data.new_client.document_number?.trim() || null,
        email: data.contact_email && data.contact_email !== 'manual@tienda.local' ? data.contact_email : null,
        phone: data.contact_phone && data.contact_phone !== '0000000000' ? data.contact_phone : null,
        address: data.shipping_info.address || null,
        city: data.shipping_info.city || null,
        department: data.shipping_info.state || null,
      })
      .select('id')
      .single();
    if (clientErr) throw new Error(`No se pudo crear el cliente: ${clientErr.message}`);
    clientId = created.id;
    revalidatePath('/admin/customers');
  }

  // Validate stock for all items
  for (const item of data.items) {
    if (item.quantity <= 0) continue;
    const { data: matInfo, error } = await supabase
      .from('inventory')
      .select('*')
      .eq('id', item.inventory_id)
      .single();
    
    if (error || !matInfo) throw new Error(`Producto en inventario no encontrado: ${item.product_name}`);
    // Orders only carry what we sell, never supplies (bolsas, pergamino…).
    if (!isSellable(matInfo)) {
      throw new Error(`${matInfo.product_name} es un insumo, no un producto de venta. Márcalo como "Se vende" en Inventario si sí lo vendes.`);
    }
    // Stock validation temporarily bypassed for sales without inventory restrictions
    // if (Number(matInfo.current_stock) < item.quantity) throw new Error(`Stock insuficiente: ${matInfo.product_name}.`);
  }

  let total_amount = 0;
  for (const item of data.items) {
    total_amount += item.price * item.quantity;
  }

  // Insert Order
  const { data: order, error: orderErr } = await supabase.from('orders').insert({
    user_id: null,
    client_id: clientId,
    total_amount,
    shipping_info: {
      ...data.shipping_info,
      department: data.shipping_info.state,
      recipient_name: data.customer_name?.trim() || null,
    },
    contact_email: data.contact_email,
    contact_phone: data.contact_phone,
    status: data.status
  }).select('id').single();

  if (orderErr) throw new Error(orderErr.message);

  // Insert Order Items
  const orderItemsData = data.items.map(item => ({
    order_id: order.id,
    product_id: item.product_name, // Save name to represent what was sold
    inventory_id: item.inventory_id || null,
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

  // Follow-up fields (later migrations): best-effort, reported back on failure.
  const now = new Date().toISOString();
  const { error: trackErr } = await supabase.from('orders').update({
    delivery_due_date: data.delivery_due_date || null,
    notes: data.notes?.trim() || null,
    status_changed_at: now,
    delivered_at: data.status === 'delivered' ? now : null,
  }).eq('id', order.id);

  // Inventory moves only once the order is paid — same moment it enters Flujo de Caja.
  await _syncManualOrderStock(supabase, user?.id ?? null, order.id, data.status);

  revalidatePath('/admin');
  revalidatePath('/admin/orders');
  revalidatePath('/admin/inventory');
  revalidatePath('/admin/inventory', 'page');

  return {
    success: true,
    orderId: order.id,
    warning: trackErr
      ? `La orden se creó, pero no se guardaron la fecha de entrega ni las notas (${trackErr.message}). ¿Ya aplicaste las migraciones?`
      : undefined,
  };
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

export type OrderItemInput = {
  inventory_id: string;
  product_code: string;
  product_name: string;
  quantity: number;
  price: number;
  weight?: string;
  grind?: string;
};

/**
 * Edits any field of an order. `items` is only sent when the products
 * changed: then the old items and their stock movements are replaced.
 * Otherwise products and stock are left alone (a contact fix should not
 * rewrite inventory history). `client_update` also saves the customer's
 * data to their CRM record.
 */
export async function updateManualAdminOrder(
  orderId: string,
  data: {
    client_id?: string | null;
    customer_name?: string;
    contact_email: string;
    contact_phone: string;
    shipping_info: { address: string; details?: string; city: string; state: string };
    status: string;
    delivery_due_date?: string | null;
    notes?: string | null;
    items?: OrderItemInput[];
    client_update?: {
      name: string;
      document_type?: string | null;
      document_number?: string | null;
      email?: string | null;
      phone?: string | null;
      address?: string | null;
      city?: string | null;
      department?: string | null;
    } | null;
  }
) {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) throw new Error("Unauthorized");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: current, error: curErr } = await supabase
    .from('orders')
    .select('status, shipping_info')
    .eq('id', orderId)
    .single();
  if (curErr || !current) throw new Error('Orden no encontrada');

  if (data.delivery_due_date && !/^\d{4}-\d{2}-\d{2}$/.test(data.delivery_due_date)) {
    throw new Error('Fecha de entrega inválida');
  }
  if (data.client_update && !data.client_update.name?.trim()) {
    throw new Error('El nombre del cliente es obligatorio para actualizar el CRM.');
  }

  // ── Products (only when they changed) ───────────────────
  let total_amount: number | undefined;
  if (data.items) {
    if (data.items.length === 0) throw new Error('Debes agregar al menos un producto.');
    for (const item of data.items) {
      if (item.quantity <= 0) continue;
      const { data: matInfo, error } = await supabase
        .from('inventory')
        .select('id')
        .eq('id', item.inventory_id)
        .single();
      if (error || !matInfo) throw new Error(`Producto en inventario no encontrado: ${item.product_name}`);
    }

    // Revert the old salidas; the sync below re-applies them if the order is paid.
    const reasonStr = `Orden Manual #${orderId.split('-')[0]}`;
    const { data: oldMovements } = await supabase
      .from('inventory_movements')
      .select('id, inventory_id, quantity')
      .eq('reason', reasonStr);
    for (const mov of oldMovements ?? []) {
      await _updateStockBy(supabase, mov.inventory_id, -Number(mov.quantity));
    }
    if (oldMovements?.length) {
      await supabase.from('inventory_movements').delete().eq('reason', reasonStr);
    }

    await supabase.from('order_items').delete().eq('order_id', orderId);
    const { error: itemsErr } = await supabase.from('order_items').insert(
      data.items.map((item) => ({
        order_id: orderId,
        product_id: item.product_name,
        inventory_id: item.inventory_id || null,
        weight: item.weight || null,
        grind: item.grind || null,
        quantity: item.quantity,
        price_at_time: item.price,
      }))
    );
    if (itemsErr) throw new Error(itemsErr.message);
    total_amount = data.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }

  // ── Order fields ────────────────────────────────────────
  // Merge, so fields this form does not show (siigo_invoice, source…) survive.
  const shipping_info = {
    ...(current.shipping_info ?? {}),
    address: data.shipping_info.address,
    details: data.shipping_info.details ?? '',
    city: data.shipping_info.city,
    state: data.shipping_info.state,
    department: data.shipping_info.state,
    ...(data.customer_name !== undefined ? { recipient_name: data.customer_name.trim() || null } : {}),
  };

  const { error: orderErr } = await supabase.from('orders').update({
    client_id: data.client_id || null,
    shipping_info,
    contact_email: data.contact_email,
    contact_phone: data.contact_phone,
    status: data.status,
    ...(total_amount !== undefined ? { total_amount } : {}),
  }).eq('id', orderId);
  if (orderErr) throw new Error(orderErr.message);

  // Follow-up fields live in later migrations; a failure here must not undo
  // the save above, but it is reported back instead of being swallowed.
  const statusChanged = current.status !== data.status;
  const now = new Date().toISOString();
  const { error: trackErr } = await supabase.from('orders').update({
    delivery_due_date: data.delivery_due_date || null,
    notes: data.notes?.trim() || null,
    ...(statusChanged
      ? { status_changed_at: now, delivered_at: data.status === 'delivered' ? now : null }
      : {}),
  }).eq('id', orderId);

  // ── Stock follows payment state ─────────────────────────
  await _syncManualOrderStock(supabase, user?.id ?? null, orderId, data.status);

  // ── CRM record ──────────────────────────────────────────
  if (data.client_id && data.client_update) {
    const c = data.client_update;
    const { error: clientErr } = await supabase.from('clients').update({
      name: c.name.trim(),
      document_type: c.document_type || null,
      document_number: c.document_number || null,
      email: c.email || null,
      phone: c.phone || null,
      address: c.address || null,
      city: c.city || null,
      department: c.department || null,
      updated_at: now,
    }).eq('id', data.client_id);
    if (clientErr) throw new Error(`La orden se guardó, pero no la ficha del cliente: ${clientErr.message}`);
    revalidatePath('/admin/customers');
  }

  revalidatePath('/admin');
  revalidatePath('/admin/orders');
  revalidatePath('/admin/inventory');
  revalidatePath('/admin/inventory', 'page');

  return {
    success: true,
    warning: trackErr
      ? `No se guardaron la fecha de entrega ni las notas (${trackErr.message}). ¿Ya aplicaste las migraciones?`
      : undefined,
  };
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

export async function getInventoryMovements(inventoryId?: string, era: 'v1' | 'v2' = 'v2') {
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
      lote,
      movement_date,
      responsable,
      entry_type,
      tab_source,
      molienda,
      production_batch_id,
      created_at,
      inventory ( product_code, product_name )
    `)
    .eq('era', era)
    .order('movement_date', { ascending: false })
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

export async function getProductionBatches(era: 'v1' | 'v2' = 'v2') {
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
    .eq('era', era)
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
    molienda?: Molienda | null;
    income_id?: string | null;
    repack_batch_id?: string | null;
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
    molienda: opts.molienda ?? null,
    income_id: opts.income_id ?? null,
    repack_batch_id: opts.repack_batch_id ?? null,
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

/**
 * Roasted coffee must say whether it is Grano or Molido; everything else must
 * not carry a grind at all. Returns the value to store on the movement.
 */
async function _resolveMolienda(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  inventoryId: string,
  molienda?: string | null
): Promise<Molienda | null> {
  const { data, error } = await supabase
    .from('inventory')
    .select('product_code, product_name')
    .eq('id', inventoryId)
    .single();
  if (error || !data) throw new Error('Producto no encontrado');

  if (!isGrindTracked(data.product_code)) return null;
  if (!isMolienda(molienda)) {
    throw new Error(
      `Selecciona la molienda (Grano o Molido) para ${data.product_name}.`
    );
  }
  return molienda;
}

// ============================================================
// SALE INCOMES (Salida pagada → Flujo de Caja)
// ============================================================
//
// A paid sale is registered once, from Inventario → Salidas, and moves stock
// and cash together: the salida movement carries income_id pointing at the
// cashflow_incomes row it created. The cashflow screen no longer touches
// inventory and treats these incomes as read-only.

const SALE_INCOME_CATEGORY = 'Ventas Físicas';

async function _createSaleIncome(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string | null,
  sale: { date: string; amount: number; concept: string; inventoryId: string; qty: number }
): Promise<string> {
  const cashflow_id = await ensureCashflowDate(sale.date);
  const { data, error } = await supabase
    .from('cashflow_incomes')
    .insert({
      concept: sale.concept,
      category: SALE_INCOME_CATEGORY,
      amount: sale.amount,
      gross_amount: sale.amount,
      fee_amount: 0,
      shipping_cost: 0,
      tax_amount: 0,
      net_revenue: sale.amount,
      cashflow_id,
      created_by: userId,
      inventory_id: sale.inventoryId,
      quantity_sold: sale.qty,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  await supabase.from('cashflow_audit_logs').insert({
    admin_id: userId,
    action_type: 'CREATE_INCOME',
    income_id: data.id,
    cashflow_id,
    details: { new: data, source: 'inventory_salida' },
  });
  return data.id;
}

async function _updateSaleIncome(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string | null,
  incomeId: string,
  changes: { date: string; qty: number; amount?: number }
) {
  const { data: old, error: getErr } = await supabase
    .from('cashflow_incomes')
    .select('*')
    .eq('id', incomeId)
    .single();
  if (getErr || !old) throw new Error('Ingreso vinculado no encontrado');

  const cashflow_id = await ensureCashflowDate(changes.date);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payload: Record<string, any> = { cashflow_id, quantity_sold: changes.qty };
  if (changes.amount !== undefined) {
    payload.amount = changes.amount;
    payload.gross_amount = changes.amount;
    payload.net_revenue = changes.amount - Number(old.fee_amount || 0)
      - Number(old.shipping_cost || 0) - Number(old.tax_amount || 0);
  }

  const { data: updated, error } = await supabase
    .from('cashflow_incomes')
    .update(payload)
    .eq('id', incomeId)
    .select()
    .single();
  if (error) throw new Error(error.message);

  await supabase.from('cashflow_audit_logs').insert({
    admin_id: userId,
    action_type: 'UPDATE_INCOME',
    income_id: incomeId,
    cashflow_id,
    details: { old, new: updated, source: 'inventory_salida' },
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function _deleteSaleIncome(supabase: any, userId: string | null, incomeId: string) {
  const { data: old } = await supabase
    .from('cashflow_incomes')
    .select('*')
    .eq('id', incomeId)
    .single();
  if (!old) return;
  const { error } = await supabase.from('cashflow_incomes').delete().eq('id', incomeId);
  if (error) throw new Error(error.message);
  await supabase.from('cashflow_audit_logs').insert({
    admin_id: userId,
    action_type: 'DELETE_INCOME',
    income_id: incomeId,
    cashflow_id: old.cashflow_id,
    details: { old, source: 'inventory_salida' },
  });
}

// ============================================================
// TAB-BASED DATA FETCHING
// ============================================================

export async function getMovementsByTab(tabSource: string, era: 'v1' | 'v2' = 'v2') {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) throw new Error('Unauthorized');

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('inventory_movements')
    .select(`
      id, inventory_id, type, quantity, reason, lote,
      movement_date, responsable, entry_type, tab_source, molienda, created_at,
      production_batch_id, income_id,
      inventory ( product_code, product_name, unit ),
      income:income_id ( gross_amount )
    `)
    .eq('tab_source', tabSource)
    .eq('era', era)
    .order('movement_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    console.error('getMovementsByTab error:', error);
    return [];
  }
  return data;
}

export async function getTrillaBatches(era: 'v1' | 'v2' = 'v2') {
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
    .eq('era', era)
    .order('movement_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('getTrillaBatches error:', error);
    return [];
  }
  return data;
}

export async function getTostionBatches(era: 'v1' | 'v2' = 'v2') {
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
    .eq('era', era)
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
  lote?: string,
  molienda?: string | null
) {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) throw new Error('Unauthorized');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  try {
    const grind = await _resolveMolienda(supabase, inventoryId, molienda);

    const mId = await _insertMovement(supabase, user?.id ?? null, inventoryId, 'entrada', qty, {
      movement_date: date,
      entry_type: entryType,
      responsable,
      tab_source: 'entrada',
      lote,
      molienda: grind,
    });

    const newStock = await _updateStockBy(supabase, inventoryId, qty);
    await logAuditAction("CREATE", "MOVEMENT", mId, inventoryId, { qty, entryType, responsable, lote, molienda: grind });
    revalidatePath('/admin/inventory');
    return { success: true, newStock };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Registers a salida. When `sale` is given the salida is a paid sale: stock
 * and Flujo de Caja are affected together, at the moment of payment (the
 * salida date), through a cashflow income linked to the movement.
 */
export async function createSalida(
  inventoryId: string,
  qty: number,
  date: string,
  reason?: string,
  responsable?: string,
  molienda?: string | null,
  sale?: { amount: number } | null
) {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) throw new Error('Unauthorized');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let incomeId: string | null = null;
  let mId: string | null = null;
  try {
    const grind = await _resolveMolienda(supabase, inventoryId, molienda);

    if (sale) {
      if (!(sale.amount > 0)) throw new Error('Ingresa el valor cobrado de la venta.');
      const { data: item } = await supabase
        .from('inventory')
        .select('product_name, unit')
        .eq('id', inventoryId)
        .single();
      incomeId = await _createSaleIncome(supabase, user?.id ?? null, {
        date,
        amount: sale.amount,
        concept: reason?.trim() || `Venta ${item?.product_name ?? 'producto'} × ${qty}${item?.unit ? ` ${item.unit}` : ''}`,
        inventoryId,
        qty,
      });
    }

    const movementId: string = await _insertMovement(supabase, user?.id ?? null, inventoryId, 'salida', -qty, {
      movement_date: date,
      reason,
      responsable,
      tab_source: 'salida',
      molienda: grind,
      income_id: incomeId,
    });
    mId = movementId;

    const newStock = await _updateStockBy(supabase, inventoryId, -qty);
    await logAuditAction("CREATE", "MOVEMENT", movementId, inventoryId, { qty: -qty, reason, responsable, molienda: grind, income_id: incomeId, sale_amount: sale?.amount });
    revalidatePath('/admin/inventory');
    if (incomeId) revalidatePath('/admin/cashflow');
    return { success: true, newStock };
  } catch (err: any) {
    // Never leave half a sale behind: stock and cash move together or not at all.
    if (mId) await supabase.from('inventory_movements').delete().eq('id', mId);
    if (incomeId) await supabase.from('cashflow_incomes').delete().eq('id', incomeId);
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
  notes?: string,
  molienda?: string | null
) {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) throw new Error('Unauthorized');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  try {
    // Reject a missing grind before any stock is touched. Consumed materials
    // (bags, stickers, bulk coffee) stay grind-free on purpose.
    const grind = await _resolveMolienda(supabase, inventoryId, molienda);

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
      molienda: grind,
    });

    const newStock = await _updateStockBy(supabase, inventoryId, qty);
    await logAuditAction("CREATE", "MOVEMENT", mId, inventoryId, { qty, reason, molienda: grind, consumosCount: consumos.length });
    
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
    const mId1 = await _insertMovement(supabase, user?.id ?? null, pergaminoInventoryId, 'salida', -inputQtyKg, {
      movement_date: date,
      reason: `Trilla → Café Verde${notes ? ` — ${notes}` : ''}`,
      tab_source: 'trilla',
    });
    const newPergaminoStock = await _updateStockBy(supabase, pergaminoInventoryId, -inputQtyKg);

    // Entrada: Verde
    const mId2 = await _insertMovement(supabase, user?.id ?? null, verdeInventoryId, 'entrada', outputQtyKg, {
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

    // Link movements to the production batch
    await supabase.from('inventory_movements')
      .update({ production_batch_id: batchData.id })
      .in('id', [mId1, mId2]);

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

    const { data: tostado } = await supabase
      .from('inventory')
      .select('product_code')
      .eq('id', tostadoInventoryId)
      .single();

    const outputQtyKg = inputQtyKg * rendimientoPct;
    const weightLossPct = (1 - rendimientoPct) * 100;

    // Salida: Verde
    const mId1 = await _insertMovement(supabase, user?.id ?? null, verdeInventoryId, 'salida', -inputQtyKg, {
      movement_date: date,
      reason: `Tostión → Café Tostado${notes ? ` — ${notes}` : ''}`,
      tab_source: 'prod_consumo', // Keep using same tab_source or create 'tostion'
    });
    const newVerdeStock = await _updateStockBy(supabase, verdeInventoryId, -inputQtyKg);

    // Entrada: Tostado. Coffee leaves the roaster whole-bean — grinding is a
    // separate step — so the batch output is always Grano.
    const mId2 = await _insertMovement(supabase, user?.id ?? null, tostadoInventoryId, 'entrada', outputQtyKg, {
      movement_date: date,
      reason: `Tostión (rend. ${(rendimientoPct * 100).toFixed(1)}%)${notes ? ` — ${notes}` : ''}`,
      tab_source: 'prod_consumo',
      molienda: isGrindTracked(tostado?.product_code) ? 'grano' : null,
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

    // Link movements to the production batch
    await supabase.from('inventory_movements')
      .update({ production_batch_id: batchData.id })
      .in('id', [mId1, mId2]);

    await logAuditAction("CREATE", "TOSTION_BATCH", batchData.id, undefined, { inputQtyKg, outputQtyKg, rendimientoPct });

    revalidatePath('/admin/inventory');
    return { success: true, newVerdeStock, newTostadoStock };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function createColdBrewBatch(
  roastedCoffeeInventoryId: string,
  coldBrewInventoryId: string,
  inputQtyKg: number,
  outputBottles: number,
  date: string,
  lote?: string,
  notes?: string,
  thirdParty: string = "Café 11:11"
) {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) throw new Error('Unauthorized');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  try {
    // Validate Roasted Coffee stock
    const { data: coffee, error: cErr } = await supabase
      .from('inventory')
      .select('current_stock, product_name')
      .eq('id', roastedCoffeeInventoryId)
      .single();
    if (cErr || !coffee) throw new Error('Café Tostado no encontrado');
    if (Number(coffee.current_stock) < inputQtyKg) {
      throw new Error(
        `Stock insuficiente de ${coffee.product_name}. Disponible: ${coffee.current_stock} kg`
      );
    }

    const reasonBase = [
      `Maquila ${thirdParty}`,
      lote ? `Lote: ${lote}` : null,
      notes ? notes : null,
    ].filter(Boolean).join(' — ');

    // 1. Salida: Café Tostado
    let salidaId: string;
    try {
      salidaId = await _insertMovement(supabase, user?.id ?? null, roastedCoffeeInventoryId, 'salida', -inputQtyKg, {
        movement_date: date,
        reason: `Cold Brew (${thirdParty}) → Salida café tostado${reasonBase ? ` — ${reasonBase}` : ''}`,
        tab_source: 'cold_brew',
        lote: lote || undefined,
        entry_type: 'MP',
      });
    } catch {
      // Fallback if DB tab_source constraint hasn't been migrated yet
      salidaId = await _insertMovement(supabase, user?.id ?? null, roastedCoffeeInventoryId, 'salida', -inputQtyKg, {
        movement_date: date,
        reason: `[Cold Brew 11:11] Salida café tostado${reasonBase ? ` — ${reasonBase}` : ''}`,
        tab_source: 'prod_consumo',
        lote: lote || undefined,
        entry_type: 'MP',
      });
    }
    const newCoffeeStock = await _updateStockBy(supabase, roastedCoffeeInventoryId, -inputQtyKg);

    // 2. Entrada: Cold Brew 340ml
    let entradaId: string;
    try {
      entradaId = await _insertMovement(supabase, user?.id ?? null, coldBrewInventoryId, 'entrada', outputBottles, {
        movement_date: date,
        reason: `Cold Brew (${thirdParty}) → Entrada producto terminado${reasonBase ? ` — ${reasonBase}` : ''}`,
        tab_source: 'cold_brew',
        lote: lote || undefined,
      });
    } catch {
      // Fallback if DB tab_source constraint hasn't been migrated yet
      entradaId = await _insertMovement(supabase, user?.id ?? null, coldBrewInventoryId, 'entrada', outputBottles, {
        movement_date: date,
        reason: `[Cold Brew 11:11] Entrada producto terminado${reasonBase ? ` — ${reasonBase}` : ''}`,
        tab_source: 'prod_alta',
        lote: lote || undefined,
      });
    }
    const newColdBrewStock = await _updateStockBy(supabase, coldBrewInventoryId, outputBottles);

    // 3. Ratio: bottles per kg
    const bottlesPerKg = inputQtyKg > 0 ? outputBottles / inputQtyKg : 0;
    const batchNote = `[Maquila: ${thirdParty}] ${outputBottles} botellas (340ml) elaboradas con ${inputQtyKg} kg (${bottlesPerKg.toFixed(1)} bot/kg). ${notes || ''}`.trim();

    let batchId: string | null = null;
    try {
      const { data: batchData, error: batchErr } = await supabase.from('production_batches').insert({
        process_type: 'cold_brew',
        input_inventory_id: roastedCoffeeInventoryId,
        input_quantity_kg: inputQtyKg,
        output_inventory_id: coldBrewInventoryId,
        output_quantity_kg: outputBottles,
        weight_loss_pct: 0,
        rendimiento_pct: bottlesPerKg,
        notes: batchNote,
        created_by: user?.id ?? null,
        movement_date: date,
      }).select('id').single();

      if (!batchErr && batchData) {
        batchId = batchData.id;
      }
    } catch {
      // Handled by fallback below
    }

    if (!batchId) {
      // Fallback if DB process_type constraint hasn't been migrated yet
      const { data: fbData } = await supabase.from('production_batches').insert({
        process_type: 'tostion',
        input_inventory_id: roastedCoffeeInventoryId,
        input_quantity_kg: inputQtyKg,
        output_inventory_id: coldBrewInventoryId,
        output_quantity_kg: outputBottles,
        weight_loss_pct: 0,
        rendimiento_pct: bottlesPerKg,
        notes: `[COLD_BREW_11_11] ${batchNote}`,
        created_by: user?.id ?? null,
        movement_date: date,
      }).select('id').single();
      batchId = fbData?.id ?? null;
    }

    if (batchId) {
      await supabase.from('inventory_movements')
        .update({ production_batch_id: batchId })
        .in('id', [salidaId, entradaId]);
    }

    await logAuditAction("CREATE", "COLD_BREW_BATCH", batchId || entradaId, coldBrewInventoryId, {
      thirdParty,
      inputQtyKg,
      outputBottles,
      bottlesPerKg,
      date,
      lote
    });

    revalidatePath('/admin/inventory');
    return { success: true, newCoffeeStock, newColdBrewStock };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function getColdBrewBatches(era: 'v1' | 'v2' = 'v2') {
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
    .or('process_type.eq.cold_brew,notes.ilike.%COLD_BREW_11_11%,notes.ilike.%11:11%')
    .eq('era', era)
    .order('movement_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('getColdBrewBatches error:', error);
    return [];
  }
  return data || [];
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

export async function getInventoryReportData(era: 'v1' | 'v2' = 'v2') {
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
    .eq('era', era)
    .gte('movement_date', cutoffStr)
    .order('movement_date', { ascending: true });

  const { data: trillaBatches } = await supabase
    .from('production_batches')
    .select(
      'id, input_quantity_kg, output_quantity_kg, weight_loss_pct, rendimiento_pct, movement_date, created_at'
    )
    .eq('process_type', 'trilla')
    .eq('era', era)
    .order('movement_date', { ascending: true });

  const { data: tostionBatches } = await supabase
    .from('production_batches')
    .select(
      'id, input_quantity_kg, output_quantity_kg, weight_loss_pct, rendimiento_pct, movement_date, created_at'
    )
    .eq('process_type', 'tostion')
    .eq('era', era)
    .order('movement_date', { ascending: true });

  // All movements (no cutoff) grouped by tab_source for pie chart
  const { data: allMovements } = await supabase
    .from('inventory_movements')
    .select('tab_source, quantity')
    .eq('era', era);

  return {
    movements: movements ?? [],
    trillaBatches: trillaBatches ?? [],
    tostionBatches: tostionBatches ?? [],
    allMovements: allMovements ?? [],
  };
}

/**
 * Roasted-coffee stock broken down by profile (Premium / Honey / Chiroso) and
 * grind (Grano / Molido).
 *
 * There is no per-grind current_stock column — the grind lives on the movement
 * that determined it (Entrada, Empaque/Alta, Salida, Tostion), so the balance
 * is the signed sum of those movements. Salidas are stored negative, so a
 * plain sum already nets out.
 *
 * Bulk (kg) and packaged (unidades) are returned as two separate groups: they
 * are different units of measure and must never be added together.
 */
export async function getMoliendaBalances(era: 'v1' | 'v2' = 'v2') {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) throw new Error('Unauthorized');

  const supabase = await createClient();

  const { data: items, error: itemsErr } = await supabase
    .from('inventory')
    .select('id, product_code')
    .eq('category', 'cafe');

  const empty = () => ({
    rows: [] as { id: string; label: string; grano: number; molido: number; sin_definir: number; total: number }[],
    totals: { grano: 0, molido: 0, sin_definir: 0, total: 0 },
  });

  if (itemsErr) {
    console.error('getMoliendaBalances items error:', itemsErr);
    return { packaged: empty(), bulk: empty() };
  }

  const tracked = new Map<string, string>();
  for (const it of items ?? []) {
    if (isGrindTracked(it.product_code)) tracked.set(it.id, it.product_code);
  }
  if (tracked.size === 0) return { packaged: empty(), bulk: empty() };

  // Page through the movements — a busy era can exceed the default row cap.
  const ids = [...tracked.keys()];
  const PAGE = 1000;
  const movements: { inventory_id: string; quantity: number; molienda: string | null }[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('inventory_movements')
      .select('inventory_id, quantity, molienda')
      .eq('era', era)
      .in('inventory_id', ids)
      .range(from, from + PAGE - 1);
    if (error) {
      console.error('getMoliendaBalances movements error:', error);
      break;
    }
    movements.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }

  const blank = () => ({ grano: 0, molido: 0, sin_definir: 0, total: 0 });
  const groups = {
    packaged: { byProfile: new Map<string, ReturnType<typeof blank>>(), totals: blank() },
    bulk: { byProfile: new Map<string, ReturnType<typeof blank>>(), totals: blank() },
  };

  for (const m of movements) {
    const code = tracked.get(m.inventory_id);
    const profile = profileForCode(code);
    if (!profile) continue;
    const g = isBulkCoffee(code) ? groups.bulk : groups.packaged;
    if (!g.byProfile.has(profile)) g.byProfile.set(profile, blank());
    const bucket = g.byProfile.get(profile)!;
    const qty = Number(m.quantity) || 0;
    const key = isMolienda(m.molienda) ? m.molienda : 'sin_definir';
    bucket[key] += qty;
    bucket.total += qty;
    g.totals[key] += qty;
    g.totals.total += qty;
  }

  const shape = (g: (typeof groups)['bulk']) => ({
    rows: COFFEE_PROFILES.map((p) => ({
      id: p.id,
      label: p.label,
      ...(g.byProfile.get(p.id) ?? blank()),
    })),
    totals: g.totals,
  });

  return { packaged: shape(groups.packaged), bulk: shape(groups.bulk) };
}

// ============================================================
// REEMPAQUE (repack)
// ============================================================
//
// Opening packed coffee and packing it again: one 2.5kg bag split into 250g
// bags or samples, or several small bags combined into a bigger one. Every
// movement of the operation hangs off one repack_batches row so it reads as
// one step in the Kardex and is reverted as a whole.
//
// Rules:
//  - Origin and destination lines are roasted coffee of ONE profile.
//  - Kilos are conserved: output ≤ input. The leftover goes back to the
//    profile's bulk coffee ('granel') or is written off ('merma').
//  - Grano can become Molido (it gets ground); Molido never becomes Grano,
//    so Grano out ≤ Grano in.


export async function createRepackBatch(input: {
  date: string;
  origins: RepackLine[];
  destinations: RepackLine[];
  consumos?: { id: string; qty: number }[];
  sobranteDestino?: 'granel' | 'merma';
  notes?: string;
}) {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) throw new Error('Unauthorized');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id ?? null;

  const origins = input.origins.filter((l) => l.inventoryId && l.qty > 0);
  const destinations = input.destinations.filter((l) => l.inventoryId && l.qty > 0);
  const consumos = (input.consumos ?? []).filter((c) => c.id && c.qty > 0);
  const sobranteDestino = input.sobranteDestino ?? 'granel';

  // Everything applied so far, so a failure can be undone completely.
  const applied: { movementId: string; inventoryId: string; delta: number }[] = [];
  let batchId: string | null = null;

  try {
    if (origins.length === 0) throw new Error('Agrega al menos un producto de origen.');
    if (destinations.length === 0 && sobranteDestino !== 'granel') {
      throw new Error('Agrega al menos un producto de destino.');
    }

    const ids = [...new Set([...origins, ...destinations].map((l) => l.inventoryId).concat(consumos.map((c) => c.id)))];
    const { data: items, error: itemsErr } = await supabase
      .from('inventory')
      .select('id, product_code, product_name, unit, current_stock')
      .in('id', ids);
    if (itemsErr) throw new Error(itemsErr.message);
    const byId = new Map((items ?? []).map((i) => [i.id, i]));

    // ── Validate coffee lines (kilos, grind, profile) ────
    const { profile, inKg, outKg, sobranteKg, sobranteGrano, sobranteMolido } = planRepack(origins, destinations, byId);
    const describe = (l: RepackLine) => `${l.qty}× ${byId.get(l.inventoryId)?.product_code}`;

    let bulk: { id: string; product_code: string } | null = null;
    if (sobranteKg > KG_EPS && sobranteDestino === 'granel') {
      const { data: b } = await supabase
        .from('inventory')
        .select('id, product_code')
        .eq('product_code', bulkCodeForProfile(profile))
        .single();
      if (!b) throw new Error(`No existe el café a granel ${bulkCodeForProfile(profile)} para recibir el sobrante.`);
      bulk = b;
    }

    // ── Stock check before touching anything ─────────────
    const need = new Map<string, number>();
    for (const l of origins) need.set(l.inventoryId, (need.get(l.inventoryId) ?? 0) + l.qty);
    for (const c of consumos) need.set(c.id, (need.get(c.id) ?? 0) + c.qty);
    for (const [id, qty] of need) {
      const it = byId.get(id);
      if (!it) throw new Error('Material consumido no encontrado.');
      if (Number(it.current_stock) < qty - KG_EPS) {
        throw new Error(`Stock insuficiente: ${it.product_name} (disponible ${it.current_stock}, requerido ${qty}).`);
      }
    }

    const summary = `${origins.map(describe).join(' + ')} → ${destinations.map(describe).join(' + ') || 'granel'}`;
    const reason = `Reempaque ${PROFILE_LABELS[profile]}: ${summary}${input.notes ? ` — ${input.notes}` : ''}`;

    // ── Persist ──────────────────────────────────────────
    const { data: batch, error: batchErr } = await supabase
      .from('repack_batches')
      .insert({
        movement_date: input.date,
        input_kg: inKg,
        output_kg: outKg,
        sobrante_kg: sobranteKg,
        sobrante_destino: sobranteKg > KG_EPS ? sobranteDestino : null,
        notes: input.notes || null,
        created_by: userId,
      })
      .select('id')
      .single();
    if (batchErr) throw new Error(batchErr.message);
    batchId = batch.id as string;

    const move = async (
      inventoryId: string,
      delta: number,
      molienda: Molienda | null,
      opts: { reason: string; entry_type?: string }
    ) => {
      const mId = await _insertMovement(supabase, userId, inventoryId, delta < 0 ? 'salida' : 'entrada', delta, {
        movement_date: input.date,
        reason: opts.reason,
        entry_type: opts.entry_type,
        tab_source: 'reempaque',
        molienda,
        repack_batch_id: batchId,
      });
      await _updateStockBy(supabase, inventoryId, delta);
      applied.push({ movementId: mId, inventoryId, delta });
    };

    for (const l of origins) await move(l.inventoryId, -l.qty, l.molienda as Molienda, { reason: `${reason} (abierto)` });
    for (const l of destinations) await move(l.inventoryId, l.qty, l.molienda as Molienda, { reason });
    if (bulk) {
      if (sobranteGrano > KG_EPS) await move(bulk.id, sobranteGrano, 'grano', { reason: `${reason} (sobrante a granel)` });
      if (sobranteMolido > KG_EPS) await move(bulk.id, sobranteMolido, 'molido', { reason: `${reason} (sobrante a granel)` });
    }
    for (const c of consumos) await move(c.id, -c.qty, null, { reason: `Consumo para ${reason}`, entry_type: 'MAT' });

    await logAuditAction('CREATE', 'REPACK_BATCH', batchId, undefined, {
      origins, destinations, consumos, inKg, outKg, sobranteKg, sobranteDestino,
    });

    // Final stock per touched product, for the client to refresh in place.
    const touched = [...new Set(applied.map((a) => a.inventoryId))];
    const { data: fresh } = await supabase.from('inventory').select('id, current_stock').in('id', touched);

    revalidatePath('/admin/inventory');
    return {
      success: true as const,
      updates: (fresh ?? []).map((f) => ({ id: f.id as string, newStock: Number(f.current_stock) })),
      sobranteKg,
    };
  } catch (err: unknown) {
    // Undo in reverse order so stock never dips below zero on the way back.
    for (const a of [...applied].reverse()) {
      try {
        await _updateStockBy(supabase, a.inventoryId, -a.delta);
        await supabase.from('inventory_movements').delete().eq('id', a.movementId);
      } catch (undoErr) {
        console.error('createRepackBatch rollback error:', undoErr);
      }
    }
    if (batchId) await supabase.from('repack_batches').delete().eq('id', batchId);
    return { success: false as const, error: err instanceof Error ? err.message : 'Error al registrar el reempaque' };
  }
}

export async function getRepackBatches(era: 'v1' | 'v2' = 'v2') {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) throw new Error('Unauthorized');

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('repack_batches')
    .select(`
      id, movement_date, input_kg, output_kg, sobrante_kg, sobrante_destino, notes, created_at,
      movements:inventory_movements (
        id, inventory_id, quantity, molienda, entry_type, reason,
        inventory ( product_code, product_name, unit )
      )
    `)
    .eq('era', era)
    .order('movement_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('getRepackBatches error:', error);
    return [];
  }
  return data;
}

/** Reverts every movement of a repack batch and deletes it. */
export async function deleteRepackBatch(batchId: string) {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) throw new Error('Unauthorized');

  const supabase = await createClient();

  const { data: movs, error: movErr } = await supabase
    .from('inventory_movements')
    .select('id, inventory_id, quantity, inventory ( product_name, current_stock )')
    .eq('repack_batch_id', batchId);
  if (movErr) throw new Error(movErr.message);

  // Products that received stock must still have it to give back.
  const giveBack = new Map<string, { qty: number; name: string; stock: number }>();
  for (const m of movs ?? []) {
    const q = Number(m.quantity);
    if (q <= 0) continue;
    const inv = Array.isArray(m.inventory) ? m.inventory[0] : m.inventory;
    const prev = giveBack.get(m.inventory_id);
    giveBack.set(m.inventory_id, {
      qty: (prev?.qty ?? 0) + q,
      name: inv?.product_name ?? 'Producto',
      stock: Number(inv?.current_stock ?? 0),
    });
  }
  for (const g of giveBack.values()) {
    if (g.stock < g.qty - KG_EPS) {
      throw new Error(
        `No se puede revertir: '${g.name}' tiene ${g.stock} y el reempaque le sumó ${round3(g.qty)}. Ya se usó parte de ese stock.`
      );
    }
  }

  // Take back what was added first, then return what was consumed.
  const ordered = [...(movs ?? [])].sort((a, b) => Number(b.quantity) - Number(a.quantity));
  for (const m of ordered) {
    await _updateStockBy(supabase, m.inventory_id, -Number(m.quantity));
  }
  await supabase.from('inventory_movements').delete().eq('repack_batch_id', batchId);
  const { error } = await supabase.from('repack_batches').delete().eq('id', batchId);
  if (error) throw new Error(error.message);

  await logAuditAction('DELETE', 'REPACK_BATCH', batchId, undefined, { movements: movs });

  const touched = [...new Set((movs ?? []).map((m) => m.inventory_id))];
  const { data: fresh } = touched.length
    ? await supabase.from('inventory').select('id, current_stock').in('id', touched)
    : { data: [] };

  revalidatePath('/admin/inventory');
  return {
    success: true,
    updates: (fresh ?? []).map((f) => ({ id: f.id as string, newStock: Number(f.current_stock) })),
  };
}

// ============================================================
// KARDEX
// ============================================================

/**
 * Kardex (tarjeta de inventario) for one product: every movement in date
 * order with its running balance, the opening balance before `from` and the
 * closing balance at `to`.
 *
 * Quantities are stored signed (salidas negative), so the balance is a plain
 * running sum. Paid-sale salidas carry the linked cashflow income, so the
 * card also shows what was collected for each sale.
 *
 * `molienda` narrows the card to Grano or Molido for roasted coffee; the
 * balances then describe that grind only.
 */
export async function getKardex(
  inventoryId: string,
  opts: {
    from?: string | null; // YYYY-MM-DD, inclusive
    to?: string | null;   // YYYY-MM-DD, inclusive
    molienda?: Molienda | null;
    era?: 'v1' | 'v2';
  } = {}
) {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) throw new Error('Unauthorized');

  const era = opts.era ?? 'v2';
  const supabase = await createClient();

  const { data: item, error: itemErr } = await supabase
    .from('inventory')
    .select('id, product_code, product_name, unit, current_stock, legacy_stock')
    .eq('id', inventoryId)
    .single();
  if (itemErr || !item) throw new Error('Producto no encontrado');

  type KardexMovement = {
    id: string;
    type: string;
    quantity: number;
    reason: string | null;
    lote: string | null;
    movement_date: string | null;
    responsable: string | null;
    entry_type: string | null;
    tab_source: string | null;
    molienda: string | null;
    production_batch_id: string | null;
    income_id: string | null;
    created_at: string;
    income: { gross_amount: number | null; concept: string | null } | null;
  };

  // Page through — an active product can exceed the default row cap.
  const PAGE = 1000;
  const movements: KardexMovement[] = [];
  for (let offset = 0; ; offset += PAGE) {
    let q = supabase
      .from('inventory_movements')
      .select(`
        id, type, quantity, reason, lote, movement_date, responsable,
        entry_type, tab_source, molienda, production_batch_id, income_id,
        created_at, income:income_id ( gross_amount, concept )
      `)
      .eq('inventory_id', inventoryId)
      .eq('era', era)
      .order('movement_date', { ascending: true, nullsFirst: true })
      .order('created_at', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (opts.molienda) q = q.eq('molienda', opts.molienda);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    for (const m of data ?? []) {
      const inc = Array.isArray(m.income) ? m.income[0] : m.income;
      movements.push({ ...m, income: inc ?? null } as KardexMovement);
    }
    if (!data || data.length < PAGE) break;
  }

  // Sorted by effective day inside, so dated and undated rows interleave.
  const { rows, summary, ledgerTotal } = buildProductKardex(movements, opts);

  // The full-history ledger should equal the stored stock. A difference means
  // stock was changed without a movement (or a movement without stock).
  // Only meaningful for the whole product, not a single grind.
  const systemStock = Number(era === 'v1' ? item.legacy_stock ?? item.current_stock : item.current_stock);

  return {
    item,
    rows,
    summary,
    reconciliation: opts.molienda
      ? null
      : { ledgerTotal, systemStock, difference: systemStock - ledgerTotal },
  };
}

/**
 * Kardex general: every product's inventario inicial, entradas, salidas and
 * inventario final for the period, plus the full movement history with each
 * product's running balance.
 *
 * Products are measured in different units (kg, unidades…), so quantities
 * are only ever summed per product, never across products.
 */
export async function getKardexGeneral(
  opts: {
    from?: string | null; // YYYY-MM-DD, inclusive
    to?: string | null;   // YYYY-MM-DD, inclusive
    era?: 'v1' | 'v2';
  } = {}
) {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) throw new Error('Unauthorized');

  const era = opts.era ?? 'v2';
  const supabase = await createClient();

  const { data: items, error: itemsErr } = await supabase
    .from('inventory')
    .select('id, product_code, product_name, category, unit, current_stock, legacy_stock')
    .order('product_code', { ascending: true });
  if (itemsErr) throw new Error(itemsErr.message);

  type GeneralMovement = {
    id: string;
    inventory_id: string;
    type: string;
    quantity: number;
    reason: string | null;
    lote: string | null;
    movement_date: string | null;
    responsable: string | null;
    tab_source: string | null;
    molienda: string | null;
    income_id: string | null;
    created_at: string;
    income: { gross_amount: number | null } | { gross_amount: number | null }[] | null;
  };

  // Page through the whole era; order by id last so pages never overlap.
  const PAGE = 1000;
  const movements: GeneralMovement[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from('inventory_movements')
      .select(`
        id, inventory_id, type, quantity, reason, lote, movement_date,
        responsable, tab_source, molienda, income_id, created_at,
        income:income_id ( gross_amount )
      `)
      .eq('era', era)
      .order('movement_date', { ascending: true, nullsFirst: true })
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(error.message);
    movements.push(...((data ?? []) as GeneralMovement[]));
    if (!data || data.length < PAGE) break;
  }
  return buildGeneralKardex(
    (items ?? []).map((it) => ({
      id: it.id,
      product_code: it.product_code,
      product_name: it.product_name,
      category: it.category,
      unit: it.unit,
      systemStock: Number(era === 'v1' ? it.legacy_stock ?? it.current_stock : it.current_stock),
    })),
    movements,
    opts
  );
}

// ============================================================
// EDIT / DELETE ACTIONS
// ============================================================

export async function deleteMovement(id: string) {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) throw new Error('Unauthorized');

  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  const { data: mov, error: selErr } = await supabase
    .from('inventory_movements')
    .select('inventory_id, quantity, income_id')
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
  // A paid-sale salida takes its cashflow income with it.
  if (mov.income_id) {
    await _deleteSaleIncome(supabase, user?.id ?? null, mov.income_id);
    revalidatePath('/admin/cashflow');
  }
  await logAuditAction("DELETE", "MOVEMENT", id, mov.inventory_id, { old_quantity: mov.quantity, income_id: mov.income_id });
  revalidatePath('/admin/inventory');
  return { success: true, inventoryId: mov.inventory_id, newStock };
}

export async function updateMovement(
  id: string,
  newQty: number, // signed — same sign as the original movement
  date: string,
  reason?: string,
  responsable?: string,
  entry_type?: string,
  molienda?: string | null,
  saleAmount?: number
) {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) throw new Error('Unauthorized');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: mov, error: selErr } = await supabase
    .from('inventory_movements')
    .select('inventory_id, quantity, income_id')
    .eq('id', id)
    .single();
  if (selErr || !mov) throw new Error('Movimiento no encontrado');
  if (mov.income_id && saleAmount !== undefined && !(saleAmount > 0)) {
    throw new Error('El valor cobrado debe ser mayor a cero.');
  }

  const grind = await _resolveMolienda(supabase, mov.inventory_id, molienda);

  const { error } = await supabase
    .from('inventory_movements')
    .update({
      quantity: newQty,
      movement_date: date,
      reason: reason ?? null,
      responsable: responsable ?? null,
      entry_type: entry_type || null,
      molienda: grind,
    })
    .eq('id', id);
  if (error) throw new Error(error.message);

  // Apply only the difference to stock
  const delta = newQty - Number(mov.quantity);
  const newStock = await _updateStockBy(supabase, mov.inventory_id, delta);

  // Keep the linked sale income on the same payment date, quantity and value.
  if (mov.income_id) {
    await _updateSaleIncome(supabase, user?.id ?? null, mov.income_id, {
      date,
      qty: Math.abs(newQty),
      amount: saleAmount,
    });
    revalidatePath('/admin/cashflow');
  }

  await logAuditAction("UPDATE", "MOVEMENT", id, mov.inventory_id, { 
    old_quantity: mov.quantity, 
    new_quantity: newQty,
    reason, responsable, molienda: grind, sale_amount: saleAmount
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
    .select('process_type, input_inventory_id, output_inventory_id, input_quantity_kg, output_quantity_kg')
    .eq('id', batchId)
    .single();
  if (selErr || !batch) throw new Error('Lote no encontrado');

  // Validate stock before reversing:
  // Reversing a production batch:
  // - Adds back input quantity (this is an addition, so stock will increase; always safe since stock won't go below 0).
  // - Subtracts output quantity from the output product. We must ensure the output product has enough stock!
  const { data: outProduct, error: outProductErr } = await supabase
    .from('inventory')
    .select('current_stock, product_name')
    .eq('id', batch.output_inventory_id)
    .single();
  if (outProductErr || !outProduct) throw new Error('Producto de salida no encontrado');
  
  const outputQty = Number(batch.output_quantity_kg);
  const currentOutputStock = Number(outProduct.current_stock);
  if (currentOutputStock < outputQty) {
    throw new Error(
      `No se puede eliminar el lote: el stock actual de '${outProduct.product_name}' (${currentOutputStock} kg) es menor que la cantidad a restar (${outputQty} kg).`
    );
  }

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

  const logEntityType =
    batch.process_type === 'trilla'
      ? 'TRILLA_BATCH'
      : batch.process_type === 'cold_brew'
      ? 'COLD_BREW_BATCH'
      : 'TOSTION_BATCH';
  await logAuditAction("DELETE", logEntityType, batchId, undefined, { 
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

/** Whether an item is offered when creating orders (vs. a supply/material). */
export async function setInventorySellable(id: string, sellable: boolean) {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) throw new Error("Unauthorized");

  const supabase = await createClient();
  const { error } = await supabase
    .from('inventory')
    .update({ is_sellable: sellable })
    .eq('id', id);
  if (error) {
    throw new Error(
      error.message.includes('is_sellable')
        ? 'Falta aplicar la migración 20261008000000_inventory_is_sellable.sql'
        : error.message
    );
  }

  revalidatePath('/admin/inventory');
  revalidatePath('/admin/orders');
  return { success: true };
}

export async function createInventoryProduct(data: {
  product_code: string;
  product_name: string;
  category: 'cafe' | 'empaque' | 'accesorio';
  unit: string;
  min_stock?: number;
  current_stock?: number;
  notes?: string;
}) {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) throw new Error("Unauthorized");

  const supabase = await createClient();

  const { data: newItem, error } = await supabase
    .from('inventory')
    .insert({
      product_code: data.product_code.toUpperCase().trim(),
      product_name: data.product_name.trim(),
      category: data.category,
      unit: data.unit,
      current_stock: data.current_stock || 0,
      min_stock: data.min_stock || 5,
      notes: data.notes || null,
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath('/admin/inventory');
  return { success: true, item: newItem };
}

