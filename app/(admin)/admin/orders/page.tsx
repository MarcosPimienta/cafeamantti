import React from "react";
import { checkIsAdmin, getClientsCRM } from "../../actions";
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { isWhatsAppConfigured } from "@/utils/whatsapp";
import OrdersBoard from "./OrdersBoard";
import { assignDuplicateSalidas, type ManualSalida } from "@/utils/orders/duplicateSalidas";
import { orderCustomer } from "@/utils/orders/pendingDeliveries";

export default async function AdminOrdersPage() {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) redirect('/dashboard');

  const supabase = await createClient();
  const [{ data: orders }, { data: inventory }, crmClients, { data: lastNotification }, { data: invoices }, { data: manualSalidas }, { data: orderMoves }] = await Promise.all([
    supabase
      .from('orders')
      .select(`
        *,
        order_items (*),
        client:client_id ( name, document_number )
      `)
      .order('created_at', { ascending: false }),
    // '*' so is_sellable comes along when its migration is applied; the
    // order forms fall back to the product-code rule otherwise.
    supabase
      .from('inventory')
      .select('*')
      .order('product_name', { ascending: true }),
    getClientsCRM(),
    // Table exists once the tracking migration runs; until then this is just null.
    supabase
      .from('notification_logs')
      .select('created_at, success, error, trigger')
      .eq('kind', 'pending_deliveries')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Live invoices made in the app: an order without one shows "Sin factura".
    supabase.from('sales_invoices').select('order_id, siigo_name, status').neq('status', 'anulada'),
    // Manual salidas (Inventario → Salidas) not tied to an order, and what each order deducted:
    // a sale typed both ways took the product out twice.
    supabase.from('inventory_movements').select('id, inventory_id, quantity, movement_date, reason, income_id')
      .eq('era', 'v2').eq('tab_source', 'salida').eq('type', 'salida').is('order_id', null),
    supabase.from('inventory_movements').select('order_id, inventory_id, quantity').eq('era', 'v2').not('order_id', 'is', null),
  ]);

  // Each order shows its sede (from the clients' sedes, so no join is needed).
  const siteNames = new Map<string, string>();
  for (const c of crmClients) for (const site of (c.sites ?? []) as { id: string; name: string }[]) siteNames.set(site.id, site.name);
  const invoiceOf = new Map(((invoices ?? []) as { order_id: string; siigo_name: string | null; status: string }[]).map((i) => [i.order_id, { siigo_name: i.siigo_name, status: i.status }]));
  const productName = new Map(((inventory ?? []) as { id: string; product_name: string }[]).map((i) => [i.id, i.product_name]));
  const movedBy = new Map<string, { inventory_id: string; quantity: number }[]>();
  for (const m of (orderMoves ?? []) as { order_id: string; inventory_id: string; quantity: number }[]) movedBy.set(m.order_id, [...(movedBy.get(m.order_id) ?? []), m]);
  const salidas = (manualSalidas ?? []) as ManualSalida[];
  const duplicates = assignDuplicateSalidas(
    (orders ?? []).filter((o) => o.status !== 'cancelled').map((o) => ({ id: o.id as string, created_at: o.created_at as string, customer: orderCustomer(o), moved: movedBy.get(o.id) ?? [] })),
    salidas
  );
  const withSites = (orders ?? []).map((o) => ({
    ...o,
    site_name: o.site_id ? siteNames.get(o.site_id) ?? null : null,
    invoice: invoiceOf.get(o.id) ?? null,
    duplicate_salidas: (duplicates.get(o.id) ?? []).map((x) => ({ ...x, product_name: productName.get(x.inventory_id) ?? '' })),
  }));

  return (
    <OrdersBoard
      orders={withSites}
      inventory={inventory ?? []}
      crmClients={crmClients}
      whatsappConfigured={isWhatsAppConfigured()}
      lastNotification={lastNotification ?? null}
    />
  );
}
