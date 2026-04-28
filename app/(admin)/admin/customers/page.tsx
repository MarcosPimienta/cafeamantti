import React from "react";
import { checkIsAdmin, getClientsCRM } from "../../actions";
import { redirect } from "next/navigation";
import { Users, Phone, MapPin, Search, Mail, CreditCard, Calendar, Building2 } from "lucide-react";
import CreateCRMClientModal from "./CreateCRMClientModal";

export default async function AdminCRMCustomersPage() {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) redirect('/dashboard');

  const clients = await getClientsCRM();

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif text-foreground mb-2">Directorio de Clientes</h1>
          <p className="text-foreground/60">Gestión de clientes manuales (B2B, Mayoristas, Tienda Física) sin cuenta online.</p>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-foreground/5 shadow-sm overflow-hidden min-h-[500px]">
        {/* Toolbar */}
        <div className="p-6 border-b border-foreground/5 flex flex-col md:flex-row gap-4 justify-between items-center bg-[#f9f7f0]">
          <div className="relative w-full md:w-96">
            <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-foreground/40" />
            <input 
              type="text" 
              placeholder="Buscar por nombre, NIT o teléfono..." 
              className="w-full pl-11 pr-4 py-3 bg-white border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all"
            />
          </div>
          <div className="flex items-center gap-2 w-full md:w-auto">
            <CreateCRMClientModal />
          </div>
        </div>

        {/* Clients List */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-foreground/80">
            <thead className="bg-[#fdfbf7] border-b border-foreground/5 text-xs font-bold uppercase tracking-widest text-foreground/60">
              <tr>
                <th className="px-6 py-4 font-medium">Cliente / Empresa</th>
                <th className="px-6 py-4 font-medium">Documento</th>
                <th className="px-6 py-4 font-medium">Contacto</th>
                <th className="px-6 py-4 font-medium">Ubicación</th>
                <th className="px-6 py-4 font-medium text-center">Órdenes</th>
                <th className="px-6 py-4 font-medium">Registro</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-foreground/5">
              {!clients || clients.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-20 text-center">
                    <Building2 className="w-12 h-12 text-foreground/20 mx-auto mb-4" />
                    <p className="text-lg font-serif text-foreground">Aún no hay clientes registrados</p>
                    <p className="text-sm text-foreground/50">Crea tu primer cliente manual para empezar.</p>
                  </td>
                </tr>
              ) : (
                clients.map((client: any) => (
                  <tr key={client.id} className="hover:bg-foreground/[0.02] transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center font-serif text-lg bg-[#C59F59]/10 text-[#C59F59]">
                          {(client.name?.[0] || "?").toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-foreground">{client.name}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {client.document_number ? (
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-widest bg-foreground/5 text-foreground/50 px-2 py-0.5 rounded-md mr-2">
                            {client.document_type || "DOC"}
                          </span>
                          <span className="font-mono text-xs">{client.document_number}</span>
                        </div>
                      ) : <span className="text-foreground/40 italic">N/A</span>}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1 text-sm">
                        {client.email && (
                          <span className="flex items-center gap-2"><Mail className="w-3 h-3 text-foreground/40" /> {client.email}</span>
                        )}
                        {client.phone && (
                          <span className="flex items-center gap-2"><Phone className="w-3 h-3 text-foreground/40" /> {client.phone}</span>
                        )}
                        {!client.email && !client.phone && <span className="text-foreground/40 italic">Sin contacto</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-start gap-2 max-w-[200px]">
                        <MapPin className="w-4 h-4 text-foreground/40 shrink-0 mt-0.5" />
                        <span className="truncate" title={`${client.address}, ${client.city}, ${client.department}`}>
                          {client.address ? `${client.address}, ${client.city}` : "No registrada"}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="inline-flex items-center justify-center px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-bold">
                        {client.orders?.[0]?.count || 0}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-xs text-foreground/60">
                        <Calendar className="w-4 h-4 text-foreground/40" />
                        {new Date(client.created_at).toLocaleDateString("es-CO")}
                      </div>
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
