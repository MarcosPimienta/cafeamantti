import React from "react";
import { checkIsAdmin } from "../../actions";
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { Users, Phone, MapPin, Search, Filter, Calendar, CreditCard } from "lucide-react";

export default async function AdminCustomersPage() {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) redirect('/dashboard');

  const supabase = await createClient();
  const { data: customers } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif text-foreground mb-2">Clientes</h1>
          <p className="text-foreground/60">Directorio de usuarios registrados en la plataforma.</p>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-foreground/5 shadow-sm overflow-hidden min-h-[500px]">
        {/* Toolbar */}
        <div className="p-6 border-b border-foreground/5 flex flex-col md:flex-row gap-4 justify-between items-center bg-[#f9f7f0]">
          <div className="relative w-full md:w-96">
            <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-foreground/40" />
            <input 
              type="text" 
              placeholder="Buscar por nombre, cédula o teléfono..." 
              className="w-full pl-11 pr-4 py-3 bg-white border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all"
            />
          </div>
          <button className="flex items-center gap-2 px-6 py-3 bg-white border border-foreground/10 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-foreground/5 transition-all w-full md:w-auto shrink-0">
            <Filter className="w-4 h-4" />
            Filtrar
          </button>
        </div>

        {/* Customers List */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-foreground/80">
            <thead className="bg-[#fdfbf7] border-b border-foreground/5 text-xs font-bold uppercase tracking-widest text-foreground/60">
              <tr>
                <th className="px-6 py-4 font-medium">Cliente</th>
                <th className="px-6 py-4 font-medium">Cédula</th>
                <th className="px-6 py-4 font-medium">Contacto</th>
                <th className="px-6 py-4 font-medium">Ubicación</th>
                <th className="px-6 py-4 font-medium">Registro</th>
                <th className="px-6 py-4 font-medium">Rol</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-foreground/5">
              {!customers || customers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-20 text-center">
                    <Users className="w-12 h-12 text-foreground/20 mx-auto mb-4" />
                    <p className="text-lg font-serif text-foreground">Aún no hay clientes</p>
                    <p className="text-sm text-foreground/50">Los usuarios registrados aparecerán aquí.</p>
                  </td>
                </tr>
              ) : (
                customers.map((customer: any) => (
                  <tr key={customer.id} className="hover:bg-foreground/[0.02] transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[#C59F59]/10 text-[#C59F59] flex items-center justify-center font-serif text-lg">
                          {(customer.first_name?.[0] || customer.last_name?.[0] || "?").toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-foreground">
                            {customer.first_name || "Sin nombre"} {customer.last_name || ""}
                          </p>
                          <p className="text-xs text-foreground/50 font-mono">
                            {customer.id.split('-')[0]}...
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <CreditCard className="w-4 h-4 text-foreground/40" />
                        {customer.cedula_number || "No registrado"}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4 text-foreground/40" />
                        {customer.phone_number || "No registrado"}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-start gap-2 max-w-[200px]">
                        <MapPin className="w-4 h-4 text-foreground/40 shrink-0 mt-0.5" />
                        <span className="truncate" title={`${customer.address}, ${customer.city}, ${customer.department}`}>
                          {customer.address ? `${customer.address}, ${customer.city}` : "No registrada"}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-foreground/40" />
                        {new Date(customer.created_at).toLocaleDateString("es-CO")}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        customer.role === 'admin' 
                          ? 'bg-[#C59F59]/20 text-[#C59F59]' 
                          : 'bg-foreground/5 text-foreground/60'
                      }`}>
                        {customer.role === 'admin' ? 'Admin' : 'Cliente'}
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
