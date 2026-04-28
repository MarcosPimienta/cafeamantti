import React from "react";
import { checkIsAdmin } from "../../actions";
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { Users, Phone, MapPin, Search, Filter, Calendar, CreditCard, ShoppingBag, DollarSign } from "lucide-react";
import CreateCustomerModal from "./CreateCustomerModal";

export default async function AdminCustomersPage() {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) redirect('/dashboard');

  const supabase = await createClient();
  const { data: profiles } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });

  const { data: orders } = await supabase
    .from('orders')
    .select('user_id, contact_email, contact_phone, total_amount, created_at, status');

  const registeredCustomers = (profiles || []).map(c => {
    const customerOrders = orders?.filter(o => o.user_id === c.id) || [];
    const totalSpent = customerOrders.reduce((sum, o) => sum + Number(o.total_amount), 0);
    return {
      ...c,
      is_guest: false,
      contact_email: c.id, // We don't have email in profile, but we can assume auth
      total_spent: totalSpent,
      order_count: customerOrders.length
    };
  });

  // Aggregate guest orders by email
  const guestOrders = orders?.filter(o => !o.user_id) || [];
  const guestMap = new Map();
  
  guestOrders.forEach(o => {
    const email = o.contact_email?.trim().toLowerCase() || "sin-email@manual";
    if (!guestMap.has(email)) {
      guestMap.set(email, {
        id: `guest-${email}`,
        first_name: "Cliente",
        last_name: "Manual / Invitado",
        cedula_number: null,
        phone_number: o.contact_phone,
        city: null,
        address: null,
        department: null,
        created_at: o.created_at,
        role: 'user',
        is_guest: true,
        contact_email: email,
        total_spent: 0,
        order_count: 0
      });
    }
    const guest = guestMap.get(email);
    guest.total_spent += Number(o.total_amount);
    guest.order_count += 1;
  });

  const allCustomers = [...registeredCustomers, ...Array.from(guestMap.values())].sort((a, b) => {
    // Sort by total spent descending
    return b.total_spent - a.total_spent;
  });

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    }).format(price);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif text-foreground mb-2">Usuarios Registrados y Ventas</h1>
          <p className="text-foreground/60">Directorio de usuarios online y compras manuales históricas.</p>
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
          <div className="flex items-center gap-2 w-full md:w-auto">
            <button className="flex items-center gap-2 px-6 py-3 bg-white border border-foreground/10 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-foreground/5 transition-all w-full md:w-auto shrink-0">
              <Filter className="w-4 h-4" />
              Filtrar
            </button>
            <CreateCustomerModal />
          </div>
        </div>

        {/* Customers List */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-foreground/80">
            <thead className="bg-[#fdfbf7] border-b border-foreground/5 text-xs font-bold uppercase tracking-widest text-foreground/60">
              <tr>
                <th className="px-6 py-4 font-medium">Usuario</th>
                <th className="px-6 py-4 font-medium">Contacto</th>
                <th className="px-6 py-4 font-medium">Ubicación</th>
                <th className="px-6 py-4 font-medium text-center">Nº Órdenes</th>
                <th className="px-6 py-4 font-medium text-right">Total Comprado</th>
                <th className="px-6 py-4 font-medium">Registro</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-foreground/5">
              {!allCustomers || allCustomers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-20 text-center">
                    <Users className="w-12 h-12 text-foreground/20 mx-auto mb-4" />
                    <p className="text-lg font-serif text-foreground">Aún no hay usuarios ni ventas</p>
                    <p className="text-sm text-foreground/50">Los usuarios registrados o compras aparecerán aquí.</p>
                  </td>
                </tr>
              ) : (
                allCustomers.map((customer: any) => (
                  <tr key={customer.id} className="hover:bg-foreground/[0.02] transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-serif text-lg ${customer.is_guest ? 'bg-gray-100 text-gray-500' : 'bg-[#C59F59]/10 text-[#C59F59]'}`}>
                          {(customer.first_name?.[0] || customer.last_name?.[0] || "?").toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-foreground">
                            {customer.first_name || "Sin nombre"} {customer.last_name || ""}
                            {customer.is_guest && <span className="ml-2 text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full uppercase tracking-wider font-bold">Invitado</span>}
                          </p>
                          {customer.cedula_number && (
                            <p className="text-xs text-foreground/50 flex items-center gap-1 mt-0.5">
                              <CreditCard className="w-3 h-3" /> {customer.cedula_number}
                            </p>
                          )}
                          {customer.is_guest && (
                            <p className="text-xs text-foreground/50 mt-0.5">{customer.contact_email}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1 text-sm">
                        {customer.phone_number ? (
                          <span className="flex items-center gap-2"><Phone className="w-3 h-3 text-foreground/40" /> {customer.phone_number}</span>
                        ) : <span className="text-foreground/40 italic">Sin teléfono</span>}
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
                    <td className="px-6 py-4 text-center">
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">
                        <ShoppingBag className="w-3 h-3" />
                        {customer.order_count}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="font-serif text-lg text-[#C59F59]">
                        {formatPrice(customer.total_spent)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-xs text-foreground/60">
                        <Calendar className="w-4 h-4 text-foreground/40" />
                        {new Date(customer.created_at).toLocaleDateString("es-CO")}
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
