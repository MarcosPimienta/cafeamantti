import React from "react";
import { checkIsAdmin, updateOrderStatus } from "../../actions";
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { Search, Filter, Mail, Phone, Package, MapPin } from "lucide-react";
import ManualOrderModal from "./ManualOrderModal";
import OrderActions from "./OrderActions";

export default async function AdminOrdersPage() {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) redirect('/dashboard');

  const supabase = await createClient();
  const { data: orders } = await supabase
    .from('orders')
    .select(`
      *,
      order_items (*)
    `)
    .order('created_at', { ascending: false });

  const { data: inventory } = await supabase
    .from('inventory')
    .select('id, product_code, product_name, current_stock')
    .order('product_name', { ascending: true });

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    }).format(price);
  };

  const getStatusColor = (status: string) => {
    const map: Record<string, string> = {
      pending: "bg-yellow-100 text-yellow-800",
      paid: "bg-blue-100 text-blue-800",
      processing: "bg-purple-100 text-purple-800",
      shipped: "bg-indigo-100 text-indigo-800",
      delivered: "bg-green-100 text-green-800",
      cancelled: "bg-red-100 text-red-800",
    };
    return map[status] || "bg-gray-100 text-gray-800";
  };

  const STATUSES = ['pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled'];
  const STATUS_LABELS: Record<string, string> = {
    pending: "Pendiente",
    paid: "Pagado",
    processing: "Preparando",
    shipped: "Enviado",
    delivered: "Entregado",
    cancelled: "Cancelado",
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif text-foreground mb-2">Administrar Órdenes</h1>
          <p className="text-foreground/60">Gestiona y actualiza el estado de los pedidos.</p>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-foreground/5 shadow-sm overflow-hidden min-h-[500px]">
        {/* Toolbar */}
        <div className="p-6 border-b border-foreground/5 flex flex-col md:flex-row gap-4 justify-between items-center bg-[#f9f7f0]">
          <div className="relative w-full md:w-96">
            <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-foreground/40" />
            <input 
              type="text" 
              placeholder="Buscar por ID o email..." 
              className="w-full pl-11 pr-4 py-3 bg-white border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all"
            />
          </div>
          <div className="flex items-center gap-2 w-full md:w-auto">
            <button className="flex items-center gap-2 px-6 py-3 bg-white border border-foreground/10 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-foreground/5 transition-all w-full md:w-auto shrink-0">
              <Filter className="w-4 h-4" />
              Filtrar
            </button>
            <ManualOrderModal inventory={inventory || []} />
          </div>
        </div>

        {/* Orders List Content */}
        <div className="p-6 space-y-6">
          {!orders || orders.length === 0 ? (
            <div className="text-center py-20">
              <Package className="w-12 h-12 text-foreground/20 mx-auto mb-4" />
              <p className="text-lg font-serif">Aún no hay órdenes</p>
              <p className="text-sm text-foreground/50">Las órdenes nuevas aparecerán aquí.</p>
            </div>
          ) : (
            orders.map((order) => (
              <div key={order.id} className="border border-foreground/10 rounded-2xl p-6 hover:shadow-md transition-shadow">
                <div className="flex flex-col lg:flex-row gap-8 justify-between">
                  {/* Left Column: Details */}
                  <div className="flex-1 space-y-6">
                    <div className="flex items-center gap-4">
                      <span className="font-mono text-sm font-bold bg-foreground/5 px-3 py-1 rounded-lg">
                        #{order.id.split('-')[0]}
                      </span>
                      <span className="text-sm text-foreground/50">
                        {new Date(order.created_at).toLocaleString("es-CO")}
                      </span>
                      <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${getStatusColor(order.status)}`}>
                        {STATUS_LABELS[order.status]}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-[#C59F59]">Contacto</p>
                        <div className="space-y-2 text-sm">
                          <p className="flex items-center gap-2"><Mail className="w-4 h-4 text-foreground/40" /> {order.contact_email}</p>
                          <p className="flex items-center gap-2"><Phone className="w-4 h-4 text-foreground/40" /> {order.contact_phone}</p>
                        </div>
                      </div>
                      
                      <div className="space-y-3">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-[#C59F59]">Envío</p>
                        <div className="space-y-2 text-sm text-foreground/80 flex items-start gap-2">
                          <MapPin className="w-4 h-4 text-foreground/40 shrink-0 mt-0.5" />
                          <p className="leading-tight">
                            {order.shipping_info.address}<br/>
                            {order.shipping_info.details && <>{order.shipping_info.details}<br/></>}
                            {order.shipping_info.city}, {order.shipping_info.state}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3 pt-4 border-t border-foreground/5">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-[#C59F59]">Items</p>
                      <div className="space-y-2 bg-[#f9f7f0] p-4 rounded-xl">
                        {order.order_items?.map((item: any) => (
                          <div key={item.id} className="flex items-center justify-between text-sm">
                            <span className="font-medium">
                              {item.quantity}x <span className="capitalize">{item.product_id}</span> ({item.weight}) - {item.grind}
                            </span>
                            <span>{formatPrice(item.price_at_time)}</span>
                          </div>
                        ))}
                      </div>
                      <div className="flex justify-between items-center pt-2">
                        <span className="font-bold">Total</span>
                        <span className="font-serif text-xl text-[#C59F59]">{formatPrice(order.total_amount)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Actions */}
                  <div className="lg:w-64 shrink-0 bg-[#fdfbf7] p-6 rounded-2xl flex flex-col justify-start">
                    <div className="flex justify-between items-center mb-4">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-foreground/40">Acciones</p>
                      <OrderActions order={order} inventory={inventory || []} />
                    </div>
                    <form action={async (formData) => {
                      "use server";
                      const newStatus = formData.get("status") as string;
                      await updateOrderStatus(order.id, newStatus);
                    }} className="space-y-4">
                      
                      <select 
                        name="status"
                        defaultValue={order.status}
                        className="w-full px-4 py-3 border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20"
                      >
                        {STATUSES.map(status => (
                          <option key={status} value={status}>{STATUS_LABELS[status]}</option>
                        ))}
                      </select>

                      <button type="submit" className="w-full py-3 bg-foreground text-background text-xs font-bold uppercase tracking-widest rounded-xl hover:bg-[#C59F59] hover:text-white transition-all shadow-md">
                        Guardar Cambios
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
