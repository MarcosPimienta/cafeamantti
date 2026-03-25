import React from "react";
import { checkIsAdmin, updateStoreSettings } from "../../actions";
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { Settings as SettingsIcon, Store, Bell, Shield, Wallet } from "lucide-react";

export default async function AdminSettingsPage() {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) redirect('/dashboard');

  const supabase = await createClient();
  const { data: settings } = await supabase
    .from('store_settings')
    .select('*')
    .eq('id', 1)
    .single();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-serif text-foreground mb-2">Ajustes</h1>
        <p className="text-foreground/60">Configuración global de la tienda y la cuenta administrativa.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Navigation Sidebar */}
        <div className="md:col-span-1 space-y-2">
          <button className="w-full flex items-center gap-3 px-4 py-3 bg-white border border-[#C59F59]/30 rounded-xl text-left text-sm font-bold text-[#C59F59] transition-all shadow-sm">
            <Store className="w-5 h-5" />
            General Store Settings
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-3 border border-transparent hover:bg-white hover:border-foreground/10 rounded-xl text-left text-sm font-medium text-foreground/60 hover:text-foreground transition-all disabled:opacity-50" disabled>
            <Shield className="w-5 h-5" />
            Security & Roles (Próximamente)
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-3 border border-transparent hover:bg-white hover:border-foreground/10 rounded-xl text-left text-sm font-medium text-foreground/60 hover:text-foreground transition-all disabled:opacity-50" disabled>
            <Wallet className="w-5 h-5" />
            Payments & Shipping (Próximamente)
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-3 border border-transparent hover:bg-white hover:border-foreground/10 rounded-xl text-left text-sm font-medium text-foreground/60 hover:text-foreground transition-all disabled:opacity-50" disabled>
            <Bell className="w-5 h-5" />
            Notifications (Próximamente)
          </button>
        </div>

        {/* Content Area */}
        <div className="md:col-span-2 bg-white rounded-3xl border border-foreground/5 shadow-sm p-8 min-h-[500px]">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-12 h-12 rounded-xl bg-[#f9f7f0] flex items-center justify-center">
              <SettingsIcon className="w-6 h-6 text-[#C59F59]" />
            </div>
            <div>
              <h2 className="text-xl font-serif text-foreground">General Store Options</h2>
              <p className="text-sm text-foreground/60">Actualiza la información básica visible para los clientes.</p>
            </div>
          </div>

          <form action={updateStoreSettings}>
            <div className="space-y-6">
              <div className="space-y-4">
                <label htmlFor="store_name" className="block text-sm font-bold uppercase tracking-widest text-foreground/60">Nombre de la Tienda</label>
                <input 
                  type="text" 
                  name="store_name"
                  id="store_name"
                  defaultValue={settings?.store_name || "Café Amantti"}
                  className="w-full px-4 py-3 bg-[#f9f7f0] border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all"
                  required
                />
              </div>
              <div className="space-y-4">
                <label htmlFor="admin_email" className="block text-sm font-bold uppercase tracking-widest text-foreground/60">Email Administrativo</label>
                <input 
                  type="email" 
                  name="admin_email"
                  id="admin_email"
                  defaultValue={settings?.admin_email || "admin@cafeamantti.com"}
                  className="w-full px-4 py-3 bg-[#f9f7f0] border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all"
                  required
                />
                <p className="text-xs text-foreground/40 mt-1">Este email recibirá las notificaciones de nuevas órdenes y contactos.</p>
              </div>
              <div className="space-y-4">
                <label htmlFor="base_currency" className="block text-sm font-bold uppercase tracking-widest text-foreground/60">Moneda Base</label>
                <select 
                  name="base_currency"
                  id="base_currency"
                  defaultValue={settings?.base_currency || "COP"}
                  className="w-full px-4 py-3 bg-[#f9f7f0] border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all"
                >
                  <option value="COP">COP - Peso Colombiano</option>
                  <option value="USD">USD - US Dollar</option>
                </select>
              </div>
            </div>
            
            <div className="mt-8 pt-8 border-t border-foreground/5 flex justify-end">
               <button type="submit" className="px-6 py-3 bg-foreground text-background text-xs font-bold uppercase tracking-widest rounded-xl hover:bg-[#C59F59] hover:text-white transition-all shadow-md">
                  Guardar Ajustes
                </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
