import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { Coffee, Calendar, Package, CreditCard, ChevronRight, Settings, LogOut } from "lucide-react";
import Link from "next/link";
import { signOut } from "@/app/(auth)/login/actions";

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch the profile and active subscriptions
  const [profileRes, subRes] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.from("subscriptions").select("*").eq("user_id", user.id).eq("status", "active").order("created_at", { ascending: false })
  ]);

  const profile = profileRes.data;
  const subscriptions = subRes.data || [];

  const greetingName = profile?.first_name || 
    user.user_metadata?.first_name || 
    user.email?.split('@')[0] || 
    "entusiasta del café";

  return (
    <main className="min-h-screen bg-[#fdfbf7] p-8 font-sans text-foreground">
      <div className="max-w-6xl mx-auto">
        <header className="flex items-center justify-between mb-12">
          <div>
            <h1 className="text-4xl font-serif mb-2">Mi Portal Amantti</h1>
            <p className="text-foreground/40 text-sm italic">Bienvenido de nuevo, {greetingName}.</p>
          </div>
          <div className="flex items-center gap-4">
            <button className="p-3 rounded-full hover:bg-foreground/5 transition-colors">
              <Settings className="w-5 h-5 text-foreground/40" />
            </button>
            <form action={signOut}>
              <button type="submit" className="p-3 rounded-full hover:bg-red-50 text-red-400 transition-colors" title="Cerrar sesión">
                <LogOut className="w-5 h-5" />
              </button>
            </form>
          </div>
        </header>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Content: Subscription Status */}
          <div className="lg:col-span-2 space-y-8">
            <div className="bg-white rounded-3xl p-10 border border-foreground/5 shadow-xl">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-xl font-serif">Tu Suscripción Activa</h2>
                {subscriptions.length > 0 && (
                  <span className="bg-green-50 text-green-700 text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest border border-green-100">
                    Activa
                  </span>
                )}
              </div>

              {subscriptions.length > 0 ? (
                <div className="space-y-8">
                  <div className="flex items-start gap-8">
                    <div className="relative w-24 h-32 bg-[#fdfbf7] rounded-2xl flex items-center justify-center p-4">
                      {/* Dynamic image based on plan_id */}
                      <Coffee className="w-8 h-8 text-[#C59F59] opacity-20 absolute" />
                      <Package className="w-12 h-12 text-foreground/10" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-2xl font-serif mb-2 capitalize">Plan {subscriptions[0].plan_id}</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex items-center gap-2 text-sm text-foreground/60">
                          <Package className="w-4 h-4" />
                          <span>{subscriptions[0].weight} • {subscriptions[0].grind === 'whole' ? 'Grano' : 'Molido'}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-foreground/60">
                          <Calendar className="w-4 h-4" />
                          <span className="capitalize">{subscriptions[0].frequency}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="pt-8 border-t border-foreground/5 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-foreground/30 mb-1">Próximo Envío</p>
                      <p suppressHydrationWarning className="font-medium">{new Date(subscriptions[0].next_delivery_date).toLocaleDateString('es-CO', { day: 'numeric', month: 'long' })}</p>
                    </div>
                    <Link 
                      href="/builder" 
                      className="px-6 py-3 bg-foreground text-background text-xs font-bold uppercase tracking-widest rounded-xl hover:bg-[#C59F59] transition-all"
                    >
                      Gestionar
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-[#C59F59]/10 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Coffee className="w-8 h-8 text-[#C59F59]" strokeWidth={1.5} />
                  </div>
                  <h3 className="text-lg font-serif mb-2">No tienes suscripciones activas</h3>
                  <p className="text-sm text-foreground/40 mb-8 max-w-xs mx-auto">Comienza tu viaje con Amantti y recibe el mejor café colombiano en la puerta de tu casa.</p>
                  <Link 
                    href="/builder" 
                    className="inline-flex items-center gap-2 px-8 py-4 bg-[#C59F59] text-white text-xs font-bold uppercase tracking-widest rounded-2xl hover:bg-foreground transition-all shadow-lg"
                  >
                    Crear mi suscripción
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                </div>
              )}
            </div>

            {/* Profile Info Card */}
            <div className="bg-white rounded-3xl p-10 border border-foreground/5 shadow-xl">
              <h2 className="text-xl font-serif mb-8 flex items-center gap-3">
                <CreditCard className="w-5 h-5 text-[#C59F59]" />
                Datos de Envío & Facturación
              </h2>
              <div className="grid md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-foreground/30">Dirección</label>
                  <p className="text-sm font-medium">{profile?.address || "No especificada"}</p>
                </div>
                <div className="space-y-4">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-foreground/30">Documento de Identidad</label>
                  <p className="text-sm font-medium">{profile?.cedula_number || "No especificado"}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar Area */}
          <div className="space-y-8">
            <div className="bg-foreground text-background rounded-3xl p-8 shadow-2xl relative overflow-hidden">
              <div className="absolute -right-8 -bottom-8 opacity-10">
                <Coffee className="w-32 h-32" />
              </div>
              <h3 className="text-lg font-serif mb-4">¿Sabías que?</h3>
              <p className="text-sm text-background/60 leading-relaxed mb-6 italic">"El café Amantti pasa por un proceso de selección manual grano a grano para asegurar que solo lo mejor llegue a tu taza."</p>
              <button suppressHydrationWarning className="text-xs font-bold uppercase tracking-widest text-[#C59F59] hover:text-white transition-colors">Ver bitácora de tueste</button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
