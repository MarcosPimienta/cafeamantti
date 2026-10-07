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
    supabase
      .from('inventory')
      .select('id, product_code, product_name, current_stock')
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

  return (
    <OrdersBoard
      orders={orders ?? []}
      inventory={inventory ?? []}
      crmClients={crmClients}
      whatsappConfigured={isWhatsAppConfigured()}
      lastNotification={lastNotification ?? null}
    />
  );
}
