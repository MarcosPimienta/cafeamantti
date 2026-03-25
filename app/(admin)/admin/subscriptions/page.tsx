import React from "react";
import { checkIsAdmin, updateSubscriptionStatus } from "../../actions";
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { Search, Filter, Coffee, Calendar, User, Activity } from "lucide-react";

export default async function AdminSubscriptionsPage() {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) redirect('/dashboard');

  const supabase = await createClient();
  const { data: subscriptions } = await supabase
    .from('subscriptions')
    .select(`
      *,
      profiles:user_id (
        first_name,
        last_name,
        phone_number
      )
    `)
    .order('created_at', { ascending: false });

  const getStatusColor = (status: string) => {
    const map: Record<string, string> = {
      active: "bg-green-100 text-green-800",
      paused: "bg-yellow-100 text-yellow-800",
      cancelled: "bg-red-100 text-red-800",
    };
    return map[status] || "bg-gray-100 text-gray-800";
  };

  const STATUSES = ['active', 'paused', 'cancelled'];
  const STATUS_LABELS: Record<string, string> = {
    active: "Activa",
    paused: "Pausada",
    cancelled: "Cancelada",
  };

  const PLAN_LABELS: Record<string, string> = {
    essential: "Devoción Esencial",
    alchemy: "Alquimia & Contraste",
    curator: "Curaduría Privada",
  };

  const FREQ_LABELS: Record<string, string> = {
    'weekly': "Semanal",
    'bi-weekly': "Quincenal",
    'monthly': "Mensual",
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif text-foreground mb-2">Suscripciones</h1>
          <p className="text-foreground/60">Gestiona y administra los planes de café activos.</p>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-foreground/5 shadow-sm overflow-hidden min-h-[500px]">
        {/* Toolbar */}
        <div className="p-6 border-b border-foreground/5 flex flex-col md:flex-row gap-4 justify-between items-center bg-[#f9f7f0]">
          <div className="relative w-full md:w-96">
            <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-foreground/40" />
            <input 
              type="text" 
              placeholder="Buscar por ID o cliente..." 
              className="w-full pl-11 pr-4 py-3 bg-white border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all"
            />
          </div>
          <button className="flex items-center gap-2 px-6 py-3 bg-white border border-foreground/10 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-foreground/5 transition-all w-full md:w-auto shrink-0">
            <Filter className="w-4 h-4" />
            Filtrar
          </button>
        </div>

        {/* Subscriptions List Content */}
        <div className="p-6 space-y-6">
          {!subscriptions || subscriptions.length === 0 ? (
            <div className="text-center py-20">
              <Coffee className="w-12 h-12 text-foreground/20 mx-auto mb-4" />
              <p className="text-lg font-serif">No hay suscripciones activas</p>
              <p className="text-sm text-foreground/50">Cuando los clientes se suscriban, aparecerán aquí.</p>
            </div>
          ) : (
            subscriptions.map((sub: any) => (
              <div key={sub.id} className="border border-foreground/10 rounded-2xl p-6 hover:shadow-md transition-shadow">
                <div className="flex flex-col lg:flex-row gap-8 justify-between">
                  {/* Left Column: Details */}
                  <div className="flex-1 space-y-6">
                    <div className="flex items-center gap-4">
                      <span className="font-mono text-sm font-bold bg-foreground/5 px-3 py-1 rounded-lg">
                        #{sub.id.split('-')[0]}
                      </span>
                      <span className="text-sm text-foreground/50">
                        {new Date(sub.created_at).toLocaleDateString("es-CO")}
                      </span>
                      <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${getStatusColor(sub.status)}`}>
                        {STATUS_LABELS[sub.status]}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-[#C59F59]">Cliente</p>
                        <div className="space-y-2 text-sm">
                          <p className="flex items-center gap-2">
                            <User className="w-4 h-4 text-foreground/40" /> 
                            {sub.profiles?.first_name} {sub.profiles?.last_name}
                          </p>
                          <p className="flex items-center gap-2">
                            <Activity className="w-4 h-4 text-foreground/40" /> 
                            {sub.profiles?.phone_number || "Sin teléfono"}
                          </p>
                        </div>
                      </div>
                      
                      <div className="space-y-3">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-[#C59F59]">Detalles del Plan</p>
                        <div className="space-y-2 text-sm text-foreground/80 flex flex-col gap-2">
                          <p>
                            <span className="font-bold">Plan:</span> {PLAN_LABELS[sub.plan_id]}
                          </p>
                          <p>
                            <span className="font-bold">Frecuencia:</span> {FREQ_LABELS[sub.frequency]}
                          </p>
                          <p>
                            <span className="font-bold">Especificaciones:</span> {sub.weight} - {sub.grind === 'whole' ? 'En grano' : 'Molido'} {sub.grind_level ? `(${sub.grind_level})` : ''}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3 pt-4 border-t border-foreground/5">
                      <div className="flex justify-between items-center text-sm">
                        <span className="flex items-center gap-2 font-medium">
                          <Calendar className="w-4 h-4 text-foreground/40" /> Próxima Entrega
                        </span>
                        <span className="font-serif text-[#C59F59]">
                          {sub.next_delivery_date ? new Date(sub.next_delivery_date).toLocaleDateString("es-CO") : 'Pendiente o Indefinida'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Actions */}
                  <div className="lg:w-64 shrink-0 bg-[#fdfbf7] p-6 rounded-2xl flex flex-col justify-start">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-foreground/40 mb-4">Actualizar Estado</p>
                    <form action={async (formData) => {
                      "use server";
                      const newStatus = formData.get("status") as string;
                      await updateSubscriptionStatus(sub.id, newStatus);
                    }} className="space-y-4">
                      
                      <select 
                        name="status"
                        defaultValue={sub.status}
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
