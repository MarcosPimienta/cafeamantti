import React from "react";
import { getDashboardMetrics, getRecentOrders } from "../actions";
import { DollarSign, ShoppingBag, Coffee, ArrowUpRight, AlertTriangle, Bell } from "lucide-react";
import Link from "next/link";
import { getMissingCashflowDays } from "./cashflow/actions";

export default async function AdminDashboardPage() {
  const metrics = await getDashboardMetrics();
  const recentOrders = await getRecentOrders();
  const missingDays = await getMissingCashflowDays();


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

  const getStatusLabel = (status: string) => {
    const map: Record<string, string> = {
      pending: "Pendiente",
      paid: "Pagado",
      processing: "Preparando",
      shipped: "Enviado",
      delivered: "Entregado",
      cancelled: "Cancelado",
    };
    return map[status] || status;
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-serif text-foreground mb-2">Resumen General</h1>
        <p className="text-foreground/60">Bienvenido al panel de control de Amantti.</p>
      </div>

      {/* 🚨 ALERTA DE FLUJO DE CAJA */}
      {missingDays.length > 0 && (
        <Link
          href="/admin/cashflow"
          className="group flex items-center gap-4 px-6 py-5 rounded-2xl border-2 border-amber-400 bg-gradient-to-r from-amber-50 to-orange-50 hover:from-amber-100 hover:to-orange-100 shadow-md transition-all"
        >
          <div className="w-12 h-12 rounded-xl bg-amber-400 flex items-center justify-center shrink-0 animate-pulse group-hover:animate-none group-hover:scale-110 transition-transform">
            <AlertTriangle className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-black text-amber-900 text-base">
              ⚠️ {missingDays.length} {missingDays.length === 1 ? 'día sin registros' : 'días sin registros'} en Flujo de Caja
            </p>
            <p className="text-sm text-amber-700 mt-0.5 truncate">
              Faltan registros desde el 1 mayo 2026 — último pendiente: <span className="font-bold font-mono">{missingDays[missingDays.length - 1]}</span>
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="hidden sm:block text-xs font-bold text-amber-700 bg-amber-200 px-3 py-1.5 rounded-lg group-hover:bg-amber-300 transition-colors">
              Ir a Flujo de Caja →
            </span>
            <ArrowUpRight className="w-5 h-5 text-amber-600 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </Link>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-foreground/5 shadow-sm flex items-center gap-6">
          <div className="w-16 h-16 rounded-2xl bg-[#C59F59]/10 flex items-center justify-center shrink-0">
            <DollarSign className="w-8 h-8 text-[#C59F59]" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-foreground/40 mb-1">Ingresos Totales</p>
            <p className="text-3xl font-serif">{formatPrice(metrics.totalRevenue)}</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-foreground/5 shadow-sm flex items-center gap-6">
          <div className="w-16 h-16 rounded-2xl bg-foreground/5 flex items-center justify-center shrink-0">
            <ShoppingBag className="w-8 h-8 text-foreground" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-foreground/40 mb-1">Órdenes</p>
            <p className="text-3xl font-serif">{metrics.totalOrders}</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-foreground/5 shadow-sm flex items-center gap-6">
          <div className="w-16 h-16 rounded-2xl bg-foreground/5 flex items-center justify-center shrink-0">
            <Coffee className="w-8 h-8 text-foreground" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-foreground/40 mb-1">Suscripciones Activas</p>
            <p className="text-3xl font-serif">{metrics.activeSubscriptions}</p>
          </div>
        </div>
      </div>

      {/* Recent Orders */}
      <div className="bg-white rounded-3xl border border-foreground/5 shadow-sm overflow-hidden">
        <div className="p-8 border-b border-foreground/5 flex items-center justify-between">
          <h2 className="text-xl font-serif">Órdenes Recientes</h2>
          <Link href="/admin/orders" className="text-sm font-bold uppercase tracking-widest text-[#C59F59] hover:text-[#b08d4f] flex items-center gap-2 group">
            Ver todas
            <ArrowUpRight className="w-4 h-4 group-hover:-translate-y-1 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#f9f7f0]">
                <th className="py-4 px-8 text-[10px] font-bold uppercase tracking-widest text-foreground/40">ID Orden</th>
                <th className="py-4 px-8 text-[10px] font-bold uppercase tracking-widest text-foreground/40">Cliente</th>
                <th className="py-4 px-8 text-[10px] font-bold uppercase tracking-widest text-foreground/40">Fecha</th>
                <th className="py-4 px-8 text-[10px] font-bold uppercase tracking-widest text-foreground/40 text-right">Monto</th>
                <th className="py-4 px-8 text-[10px] font-bold uppercase tracking-widest text-foreground/40 text-center">Estado</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-foreground/40">No hay órdenes recientes</td>
                </tr>
              ) : (
                recentOrders.map((order: any) => (
                  <tr key={order.id} className="border-b border-foreground/5 last:border-0 hover:bg-[#fdfbf7] transition-colors">
                    <td className="py-4 px-8 font-mono text-xs">{order.id.slice(0, 8)}...</td>
                    <td className="py-4 px-8">
                      <p className="font-medium text-sm">{order.profiles?.first_name} {order.profiles?.last_name}</p>
                      <p className="text-xs text-foreground/50">{order.contact_email}</p>
                    </td>
                    <td className="py-4 px-8 text-sm text-foreground/60">
                      {new Date(order.created_at).toLocaleDateString("es-CO")}
                    </td>
                    <td className="py-4 px-8 text-right font-medium text-sm">
                      {formatPrice(order.total_amount)}
                    </td>
                    <td className="py-4 px-8 text-center">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${getStatusColor(order.status)}`}>
                        {getStatusLabel(order.status)}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
