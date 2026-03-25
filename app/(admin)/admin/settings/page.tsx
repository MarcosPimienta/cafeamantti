import React from "react";
import Link from "next/link";
import { checkIsAdmin, updateStoreSettings, updateShippingSettings } from "../../actions";
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { Settings as SettingsIcon, Store, Bell, Shield, Wallet, Users } from "lucide-react";

export default async function AdminSettingsPage(props: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) redirect('/dashboard');

  const searchParams = typeof props.searchParams !== 'undefined' 
    ? await props.searchParams 
    : {};
  const tab = typeof searchParams?.tab === 'string' ? searchParams.tab : 'general';

  const supabase = await createClient();
  const { data: settings } = await supabase
    .from('store_settings')
    .select('*')
    .eq('id', 1)
    .single();

  let admins: any[] = [];
  if (tab === 'security') {
    const { data } = await supabase.from('profiles').select('*').eq('role', 'admin');
    admins = data || [];
  }

  const navLinks = [
    { id: 'general', label: 'General Store Settings', icon: Store, desc: 'Actualiza la información básica visible para los clientes.' },
    { id: 'security', label: 'Security & Roles', icon: Shield, desc: 'Gestiona quién tiene acceso de administrador al panel.' },
    { id: 'shipping', label: 'Payments & Shipping', icon: Wallet, desc: 'Configura costos de envío y límites para envíos gratuitos.' },
    { id: 'notifications', label: 'Notifications', icon: Bell, desc: 'Configura integraciones de email y notificaciones del sistema.' },
  ];

  const currentNav = navLinks.find(n => n.id === tab) || navLinks[0];
  const Icon = currentNav.icon;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-serif text-foreground mb-2">Ajustes</h1>
        <p className="text-foreground/60">Configuración global de la tienda y la cuenta administrativa.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Navigation Sidebar */}
        <div className="md:col-span-1 space-y-2">
          {navLinks.map((nav) => (
            <Link 
              key={nav.id} 
              href={`/admin/settings?tab=${nav.id}`}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left text-sm transition-all ${
                tab === nav.id 
                  ? 'bg-white border border-[#C59F59]/30 font-bold text-[#C59F59] shadow-sm' 
                  : 'border border-transparent hover:bg-white hover:border-foreground/10 font-medium text-foreground/60 hover:text-foreground'
              }`}
            >
              <nav.icon className="w-5 h-5" />
              {nav.label}
            </Link>
          ))}
        </div>

        {/* Content Area */}
        <div className="md:col-span-2 bg-white rounded-3xl border border-foreground/5 shadow-sm p-8 min-h-[500px]">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-12 h-12 rounded-xl bg-[#f9f7f0] flex items-center justify-center">
              <Icon className="w-6 h-6 text-[#C59F59]" />
            </div>
            <div>
              <h2 className="text-xl font-serif text-foreground">{currentNav.label}</h2>
              <p className="text-sm text-foreground/60">{currentNav.desc}</p>
            </div>
          </div>

          {tab === 'general' && (
            <form action={async (formData) => {
              "use server";
              await updateStoreSettings(formData);
            }}>
              <div className="space-y-6">
                <div className="space-y-4">
                  <label htmlFor="store_name" className="block text-sm font-bold uppercase tracking-widest text-foreground/60">Nombre de la Tienda</label>
                  <input suppressHydrationWarning
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
                  <input suppressHydrationWarning
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
                  <select suppressHydrationWarning
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
                 <button suppressHydrationWarning type="submit" className="px-6 py-3 bg-foreground text-background text-xs font-bold uppercase tracking-widest rounded-xl hover:bg-[#C59F59] hover:text-white transition-all shadow-md">
                    Guardar Ajustes
                  </button>
              </div>
            </form>
          )}

          {tab === 'shipping' && (
            <form action={async (formData) => {
              "use server";
              await updateShippingSettings(formData);
            }}>
              <div className="space-y-6">
                <div className="space-y-4">
                  <label htmlFor="default_shipping_cost" className="block text-sm font-bold uppercase tracking-widest text-foreground/60">Costo de Envío Estándar</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-foreground/40">$</span>
                    <input suppressHydrationWarning
                      type="number" 
                      name="default_shipping_cost"
                      id="default_shipping_cost"
                      defaultValue={settings?.default_shipping_cost || 15000}
                      className="w-full pl-8 pr-4 py-3 bg-[#f9f7f0] border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-4">
                  <label htmlFor="free_shipping_threshold" className="block text-sm font-bold uppercase tracking-widest text-foreground/60">Umbral para Envío Gratis</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-foreground/40">$</span>
                    <input suppressHydrationWarning
                      type="number" 
                      name="free_shipping_threshold"
                      id="free_shipping_threshold"
                      defaultValue={settings?.free_shipping_threshold || 150000}
                      className="w-full pl-8 pr-4 py-3 bg-[#f9f7f0] border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all"
                      required
                    />
                  </div>
                  <p className="text-xs text-foreground/40 mt-1">Los pedidos por encima de este valor tendrán envío gratuito.</p>
                </div>
              </div>
              
              <div className="mt-8 pt-8 border-t border-foreground/5 flex justify-end">
                 <button type="submit" className="px-6 py-3 bg-foreground text-background text-xs font-bold uppercase tracking-widest rounded-xl hover:bg-[#C59F59] hover:text-white transition-all shadow-md">
                    Guardar Ajustes
                  </button>
              </div>
            </form>
          )}

          {tab === 'security' && (
            <div className="space-y-6">
              <div className="bg-[#f9f7f0] rounded-xl p-6 border border-foreground/5">
                <h3 className="text-sm font-bold uppercase tracking-widest mb-4">Administradores Actuales</h3>
                <div className="space-y-4">
                  {admins.map(admin => (
                    <div key={admin.id} className="flex items-center gap-4 bg-white p-4 rounded-lg border border-foreground/5">
                      <div className="w-10 h-10 rounded-full bg-[#C59F59]/10 text-[#C59F59] flex items-center justify-center font-serif text-lg">
                        {(admin.first_name?.[0] || admin.last_name?.[0] || "?").toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-sm">{admin.first_name || "Sin Nombre"} {admin.last_name || ""}</p>
                        <p className="text-xs text-foreground/50 font-mono">{admin.id.split('-')[0]}...</p>
                      </div>
                    </div>
                  ))}
                  {admins.length === 0 && (
                    <p className="text-sm text-foreground/50">No se encontraron administradores.</p>
                  )}
                </div>
              </div>
              <div className="pt-4 border-t border-foreground/5">
                <p className="text-sm text-foreground/60">Para añadir un nuevo administrador, el usuario debe crear una cuenta en la tienda primero, luego puedes promover su rol en la base de datos a `admin`.</p>
              </div>
            </div>
          )}

          {tab === 'notifications' && (
            <div className="space-y-6 h-full flex flex-col items-center justify-center py-12 text-center opacity-50 grayscale">
              <Bell className="w-12 h-12 text-foreground/20 mb-4" />
              <h3 className="text-lg font-serif">Centro de Notificaciones</h3>
              <p className="text-sm text-foreground/50 max-w-[250px] mx-auto">
                Próximamente podrás configurar correos automáticos y manejar webhooks.
              </p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
