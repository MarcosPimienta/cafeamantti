"use server";

import { createClient } from "@/utils/supabase/server";
import { checkIsAdmin, logAuditAction } from "@/app/(admin)/actions";
import { revalidatePath } from "next/cache";
import {
  SiigoParsedOrder,
  SiigoImportOptions,
  InventoryLookupItem,
  ClientLookupItem,
} from "@/utils/siigo/types";

/**
 * Fetch necessary catalog data for Siigo import: inventory items, CRM clients,
 * and already registered Siigo invoice numbers to detect duplicates.
 */
export async function getImportContextAction(): Promise<{
  inventory: InventoryLookupItem[];
  clients: ClientLookupItem[];
  existingInvoices: string[];
}> {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) throw new Error("Acceso no autorizado");

  const supabase = await createClient();

  const [invRes, clientsRes, ordersRes] = await Promise.all([
    supabase
      .from('inventory')
      .select('id, product_code, product_name, category, unit, current_stock')
      .order('product_name', { ascending: true }),
    supabase
      .from('clients')
      .select('id, name, document_number, email, phone, address, city, department')
      .order('name', { ascending: true }),
    supabase
      .from('orders')
      .select('id, shipping_info')
      .order('created_at', { ascending: false }),
  ]);

  if (invRes.error) console.error("Error fetching inventory for import:", invRes.error);
  if (clientsRes.error) console.error("Error fetching clients for import:", clientsRes.error);

  const existingInvoices = new Set<string>();

  // Extract invoice numbers from existing orders
  for (const order of ordersRes.data || []) {
    // Check inside shipping_info
    const info = order.shipping_info as Record<string, any> | null;
    if (info?.siigo_invoice) {
      existingInvoices.add(String(info.siigo_invoice).trim());
    }
  }

  // Also check if siigo_invoice physical column exists
  try {
    const { data: directInvoices } = await supabase
      .from('orders')
      .select('siigo_invoice')
      .not('siigo_invoice', 'is', null);

    if (directInvoices) {
      for (const row of directInvoices) {
        if (row.siigo_invoice) {
          existingInvoices.add(String(row.siigo_invoice).trim());
        }
      }
    }
  } catch (e) {
    // Physical column may not exist yet, ignored safely
  }

  return {
    inventory: (invRes.data as InventoryLookupItem[]) || [],
    clients: (clientsRes.data as ClientLookupItem[]) || [],
    existingInvoices: Array.from(existingInvoices),
  };
}

/**
 * Execute the batch import of parsed Siigo sales.
 */
export async function executeSiigoImportAction(
  ordersToImport: SiigoParsedOrder[],
  options: SiigoImportOptions
): Promise<{
  success: boolean;
  importedCount: number;
  skippedCount: number;
  clientsCreatedCount: number;
  totalRevenue: number;
  errors: string[];
}> {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) throw new Error("Acceso no autorizado");

  if (!ordersToImport || ordersToImport.length === 0) {
    throw new Error("No hay órdenes para importar");
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const PAID_STATUSES = ['paid', 'processing', 'shipped', 'delivered'];
  const shouldDeductStock = options.syncInventory && PAID_STATUSES.includes(options.defaultStatus);

  let importedCount = 0;
  let skippedCount = 0;
  let clientsCreatedCount = 0;
  let totalRevenue = 0;
  const errors: string[] = [];

  // Re-verify existing invoices to avoid race conditions
  const { existingInvoices } = await getImportContextAction();
  const existingSet = new Set(existingInvoices);

  for (const parsedOrder of ordersToImport) {
    try {
      const invoiceNum = String(parsedOrder.invoice_number || '').trim();

      // Check if duplicate and skip option is on
      if (options.skipExisting && existingSet.has(invoiceNum)) {
        skippedCount++;
        continue;
      }

      // 1. Resolve or Create CRM Client
      let clientId = parsedOrder.matched_client_id;

      if (!clientId && options.syncClients && parsedOrder.client_name) {
        // Insert client
        const { data: newClient, error: clientErr } = await supabase
          .from('clients')
          .insert({
            name: parsedOrder.client_name,
            document_number: parsedOrder.client_doc || null,
            document_type: parsedOrder.client_doc?.includes('-') ? 'NIT' : 'CC',
            email: parsedOrder.client_email || null,
            phone: parsedOrder.client_phone || null,
            address: parsedOrder.client_address || null,
            city: parsedOrder.client_city || 'Bogotá',
            department: 'Cundinamarca',
          })
          .select('id')
          .single();

        if (!clientErr && newClient) {
          clientId = newClient.id;
          clientsCreatedCount++;
        } else if (clientErr) {
          console.warn("Could not create client:", clientErr.message);
        }
      }

      // 2. Determine Order Timestamp
      let orderTimestamp: string;
      if (options.useSaleDate && parsedOrder.date) {
        // Keep midday UTC to preserve the exact date across Colombian timezones (UTC-5)
        orderTimestamp = `${parsedOrder.date}T12:00:00.000Z`;
      } else {
        orderTimestamp = new Date().toISOString();
      }

      // 3. Prepare shipping_info JSON
      const shippingInfo = {
        address: parsedOrder.client_address || 'Mostrador / Tienda',
        city: parsedOrder.client_city || 'Bogotá',
        department: 'Cundinamarca',
        recipient_name: parsedOrder.client_name,
        contact_phone: parsedOrder.client_phone || '',
        contact_email: parsedOrder.client_email || '',
        siigo_invoice: invoiceNum,
        source: 'siigo',
        notes: parsedOrder.notes || 'Venta importada de Siigo',
      };

      // 4. Insert Order
      const orderPayload: Record<string, any> = {
        user_id: null,
        client_id: clientId || null,
        total_amount: parsedOrder.total_amount,
        shipping_info: shippingInfo,
        contact_email: parsedOrder.client_email || 'siigo@tienda.local',
        contact_phone: parsedOrder.client_phone || '0000000000',
        status: options.defaultStatus,
        created_at: orderTimestamp,
        updated_at: orderTimestamp,
      };

      // Include optional columns if migration is applied
      try {
        orderPayload.siigo_invoice = invoiceNum;
        orderPayload.source = 'siigo';
        orderPayload.notes = parsedOrder.notes || null;
      } catch (_) {}

      let orderRow: any;
      let orderErr: any;

      const firstAttempt = await supabase.from('orders').insert(orderPayload).select('id').single();
      if (firstAttempt.error && (firstAttempt.error.message.includes('column') || firstAttempt.error.message.includes('does not exist'))) {
        // Fallback without new columns if DB migration was not yet run
        delete orderPayload.siigo_invoice;
        delete orderPayload.source;
        delete orderPayload.notes;
        const secondAttempt = await supabase.from('orders').insert(orderPayload).select('id').single();
        orderRow = secondAttempt.data;
        orderErr = secondAttempt.error;
      } else {
        orderRow = firstAttempt.data;
        orderErr = firstAttempt.error;
      }

      if (orderErr || !orderRow) {
        throw new Error(`Error insertando orden ${invoiceNum}: ${orderErr?.message}`);
      }

      // 5. Insert Order Items
      const itemsPayload = parsedOrder.items.map(item => {
        let weight: string | null = null;
        const nameLower = (item.matched_product_name || item.raw_name).toLowerCase();
        if (nameLower.includes('250g')) weight = '250g';
        else if (nameLower.includes('500g')) weight = '500g';
        else if (nameLower.includes('2.5kg') || nameLower.includes('2k5')) weight = '2.5kg';

        return {
          order_id: orderRow.id,
          product_id: item.matched_product_name || item.raw_name,
          inventory_id: item.matched_inventory_id || null,
          quantity: item.quantity,
          price_at_time: item.unit_price,
          weight,
          grind: null,
          created_at: orderTimestamp,
        };
      });

      const { error: itemsErr } = await supabase.from('order_items').insert(itemsPayload);
      if (itemsErr) {
        await supabase.from('orders').delete().eq('id', orderRow.id);
        throw new Error(`Error en items de orden ${invoiceNum}: ${itemsErr.message}`);
      }

      // 6. Deduct inventory if requested
      if (shouldDeductStock) {
        const movementReason = invoiceNum ? `Venta Siigo #${invoiceNum}` : `Orden Siigo #${orderRow.id.split('-')[0]}`;

        for (const item of parsedOrder.items) {
          if (!item.matched_inventory_id || !(item.quantity > 0)) continue;

          // Insert movement
          const { data: movData, error: movErr } = await supabase
            .from('inventory_movements')
            .insert({
              inventory_id: item.matched_inventory_id,
              type: 'salida',
              quantity: -Number(item.quantity),
              reason: movementReason,
              created_by: user?.id ?? null,
              movement_date: orderTimestamp,
              tab_source: 'salida',
              era: 'v2',
            })
            .select('id')
            .single();

          if (!movErr && movData) {
            // Update stock
            const { data: invRow } = await supabase
              .from('inventory')
              .select('current_stock')
              .eq('id', item.matched_inventory_id)
              .single();

            if (invRow) {
              const newStock = Number(invRow.current_stock) - Number(item.quantity);
              await supabase
                .from('inventory')
                .update({ current_stock: newStock })
                .eq('id', item.matched_inventory_id);
            }

            await logAuditAction("CREATE", "MOVEMENT", movData.id, item.matched_inventory_id, {
              qty: -Number(item.quantity),
              reason: movementReason,
            });
          }
        }
      }

      existingSet.add(invoiceNum);
      importedCount++;
      totalRevenue += parsedOrder.total_amount;
    } catch (err: any) {
      console.error("Error processing order import:", err);
      errors.push(`Factura ${parsedOrder.invoice_number}: ${err.message}`);
    }
  }

  // Revalidate relevant pages
  revalidatePath('/admin');
  revalidatePath('/admin/orders');
  revalidatePath('/admin/inventory');
  revalidatePath('/admin/cashflow');
  revalidatePath('/admin/customers');

  return {
    success: importedCount > 0,
    importedCount,
    skippedCount,
    clientsCreatedCount,
    totalRevenue,
    errors,
  };
}
