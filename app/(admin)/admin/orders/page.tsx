import React from "react";
import { checkIsAdmin, getClientsCRM } from "../../actions";
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { isWhatsAppConfigured } from "@/utils/whatsapp";
import OrdersBoard from "./OrdersBoard";

export default async function AdminOrdersPage() {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) redirect('/dashboard');

  const supabase = await createClient();
  const [{ data: orders }, { data: inventory }, crmClients, { data: lastNotification }] = await Promise.all([
    supabase
      .from('orders')
      .select(`
        *,
        order_items (*),
        client:client_id ( name )
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
  ]);

  // Each order shows its sede (from the clients' sedes, so no join is needed).
  const siteNames = new Map<string, string>();
  for (const c of crmClients) for (const site of (c.sites ?? []) as { id: string; name: string }[]) siteNames.set(site.id, site.name);
  const withSites = (orders ?? []).map((o) => ({ ...o, site_name: o.site_id ? siteNames.get(o.site_id) ?? null : null }));

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
