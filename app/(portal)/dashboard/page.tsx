import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { en } from "@/app/dictionaries/en";
import { es } from "@/app/dictionaries/es";
import { Coffee, Calendar, Package, CreditCard, ChevronRight, Settings, LogOut, MapPin, User, Phone, Map } from "lucide-react";
import Link from "next/link";
import { signOut } from "@/app/(auth)/login/actions";
import { SubscriptionCard } from "./SubscriptionCard";
import { DashboardCart } from "@/app/components/DashboardCart";
import { updateUserProfile } from "./actions";

export default async function DashboardPage(props: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const cookieStore = await cookies();
  const localeOption = cookieStore.get("NEXT_LOCALE")?.value;
  const locale = localeOption === "en" ? "en" : "es";
  const t = (key: keyof typeof en) => (locale === "en" ? en[key] : es[key]) ?? key;

  const searchParams = typeof props.searchParams !== 'undefined' ? await props.searchParams : {};
  const tab = typeof searchParams?.tab === 'string' ? searchParams.tab : 'overview';

  // Fetch the profile
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  const epaycoKey = process.env.NEXT_PUBLIC_EPAYCO_PUBLIC_KEY || "";

  let subscriptions: any[] = [];
  let orders: any[] = [];

  if (tab === 'overview') {
    const { data } = await supabase.from("subscriptions").select("*").eq("user_id", user.id).eq("status", "active").order("created_at", { ascending: false });
    subscriptions = data || [];
  } else if (tab === 'orders') {
    const { data } = await supabase.from("orders").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    orders = data || [];
  }

  const greetingName = profile?.first_name || 
    user.user_metadata?.first_name || 
    user.email?.split('@')[0] || 
    t("dashboard.guest");

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

  const STATUS_LABELS: Record<string, string> = {
    pending: locale === "en" ? "Pending" : "Pendiente",
    paid: locale === "en" ? "Paid" : "Pagado",
    processing: locale === "en" ? "Processing" : "Preparando",
    shipped: locale === "en" ? "Shipped" : "Enviado",
    delivered: locale === "en" ? "Delivered" : "Entregado",
    cancelled: locale === "en" ? "Cancelled" : "Cancelado",
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat(locale === "en" ? "en-US" : "es-CO", {
      style: "currency",
      currency: locale === "en" ? "USD" : "COP",
      maximumFractionDigits: 0,
    }).format(price);
  };

  return (
    <main className="min-h-screen bg-[#0B0B0B] p-8 font-sans text-[#F4F1ED]">
      <div className="max-w-6xl mx-auto">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
          <div className="flex items-center gap-8">
            <Link href="/" className="hover:opacity-70 transition-opacity">
              <span className="font-bodoni italic text-4xl font-bold tracking-tight">
                amantti
              </span>
            </Link>
            <div className="h-10 w-px bg-white/10 hidden md:block" />
            <div>
              <h1 className="text-3xl font-serif text-[#F4F1ED]">{t("dashboard.title")}</h1>
              <p className="text-white/40 text-xs italic">{t("dashboard.welcome")} {greetingName}.</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/dashboard?tab=profile" className="p-3 rounded-sm hover:bg-white/5 transition-colors">
              <Settings className="w-5 h-5 text-white/40" />
            </Link>
            <form action={signOut}>
              <button suppressHydrationWarning type="submit" className="p-3 rounded-full hover:bg-red-50 text-red-400 transition-colors" title="Cerrar sesión">
                <LogOut className="w-5 h-5" />
              </button>
            </form>
          </div>
        </header>

        <div className="mb-8 border-b border-[#C2A878]/20 overflow-x-auto">
          <div className="flex gap-8 whitespace-nowrap min-w-max">
            <Link href="/dashboard?tab=overview" suppressHydrationWarning className={`pb-4 text-sm font-bold uppercase tracking-widest border-b-2 transition-all ${tab === 'overview' ? 'border-[#C2A878] text-[#C2A878]' : 'border-transparent text-white/40 hover:text-white'}`}>{t("dashboard.tab.overview")}</Link>
            <Link href="/dashboard?tab=orders" suppressHydrationWarning className={`pb-4 text-sm font-bold uppercase tracking-widest border-b-2 transition-all ${tab === 'orders' ? 'border-[#C2A878] text-[#C2A878]' : 'border-transparent text-white/40 hover:text-white'}`}>{t("dashboard.tab.orders")}</Link>
            <Link href="/dashboard?tab=profile" suppressHydrationWarning className={`pb-4 text-sm font-bold uppercase tracking-widest border-b-2 transition-all ${tab === 'profile' ? 'border-[#C2A878] text-[#C2A878]' : 'border-transparent text-white/40 hover:text-white'}`}>{t("dashboard.tab.profile")}</Link>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Content Area */}
          <div className="lg:col-span-2 space-y-8">
            <DashboardCart profile={profile} epaycoKey={epaycoKey} />
            
            {tab === 'overview' && (
              <div className="bg-[#0B0B0B] rounded-sm p-10 border border-[#C2A878]/20">
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-xl font-serif text-[#F4F1ED]">{t("dashboard.activeSub.title")}</h2>
                  {subscriptions.length > 0 && (
                    <span className="bg-[#C2A878]/10 text-[#C2A878] text-[10px] font-bold px-3 py-1 rounded-sm uppercase tracking-widest border border-[#C2A878]/20">
                      {t("dashboard.activeSub.badge")}
                    </span>
                  )}
                </div>

                {subscriptions.length > 0 ? (
                  <div className="space-y-8">
                    <SubscriptionCard subscription={subscriptions[0]} />
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 bg-[#C2A878]/10 rounded-sm flex items-center justify-center mx-auto mb-6">
                      <Coffee className="w-8 h-8 text-[#C2A878]" strokeWidth={1.5} />
                    </div>
                    <h3 className="text-lg font-serif mb-2 text-[#F4F1ED]">{t("dashboard.noSub.title")}</h3>
                    <p className="text-sm text-white/40 mb-8 max-w-xs mx-auto">{t("dashboard.noSub.desc")}</p>
                    <Link 
                      href="/builder" 
                      className="inline-flex items-center gap-2 px-8 py-4 bg-[#C2A878] text-[#0B0B0B] text-xs font-bold uppercase tracking-widest rounded-sm hover:bg-[#F4F1ED] hover:text-[#0B0B0B] transition-all"
                    >
                      {t("dashboard.noSub.cta")}
                      <ChevronRight className="w-4 h-4" />
                    </Link>
                  </div>
                )}
              </div>
            )}

            {tab === 'orders' && (
              <div className="bg-[#0B0B0B] rounded-sm p-10 border border-[#C2A878]/20">
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-xl font-serif text-[#F4F1ED]">{t("dashboard.orders.title")}</h2>
                </div>

                {orders.length > 0 ? (
                  <div className="space-y-4">
                    {orders.map(order => (
                      <div key={order.id} className="p-6 border border-[#C2A878]/20 rounded-sm flex flex-col md:flex-row md:items-center justify-between gap-6 hover:bg-white/5 transition-colors">
                        <div className="flex items-start gap-4">
                          <div className="w-12 h-12 rounded-sm bg-[#C2A878]/10 flex items-center justify-center shrink-0">
                            <Package className="w-6 h-6 text-[#C2A878]" />
                          </div>
                          <div>
                            <p className="text-sm font-bold uppercase tracking-widest text-[#C2A878] mb-1">
                              {t("dashboard.orders.orderLabel")}{order.id.split('-')[0]}
                            </p>
                            <p className="text-xs text-white/50">
                              {new Date(order.created_at).toLocaleDateString(locale === "en" ? "en-US" : "es-CO")}
                            </p>
                            <span className={`inline-block mt-3 px-3 py-1 rounded-sm text-[10px] font-bold uppercase tracking-wider ${getStatusColor(order.status)}`}>
                              {STATUS_LABELS[order.status] || order.status}
                            </span>
                          </div>
                        </div>
                        <div className="md:text-right flex flex-row md:flex-col items-center md:items-end justify-between w-full md:w-auto">
                          <p className="font-serif text-2xl text-[#F4F1ED]">
                            {formatPrice(order.total_amount)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 bg-white/5 rounded-sm flex items-center justify-center mx-auto mb-6">
                      <Package className="w-8 h-8 text-white/20" />
                    </div>
                    <h3 className="text-lg font-serif mb-2 text-[#F4F1ED]">{t("dashboard.noOrders.title")}</h3>
                    <p className="text-sm text-white/40 mb-8 max-w-xs mx-auto">{t("dashboard.noOrders.desc")}</p>
                  </div>
                )}
              </div>
            )}

            {tab === 'profile' && (
              <div className="bg-[#0B0B0B] rounded-sm p-10 border border-[#C2A878]/20">
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-xl font-serif text-[#F4F1ED]">{t("dashboard.profile.title")}</h2>
                  <div className="w-12 h-12 rounded-sm bg-[#C2A878]/10 flex items-center justify-center text-[#C2A878] font-serif text-xl border border-[#C2A878]/30">
                    {(profile?.first_name?.[0] || user.email?.[0] || "?").toUpperCase()}
                  </div>
                </div>

                <form action={async (formData) => {
                  "use server";
                  await updateUserProfile(formData);
                }} className="space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label htmlFor="first_name" className="text-[10px] font-bold uppercase tracking-widest text-white/50">{t("dashboard.profile.firstName")}</label>
                      <div className="relative">
                        <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                        <input suppressHydrationWarning
                          type="text" 
                          name="first_name" 
                          id="first_name"
                          defaultValue={profile?.first_name || ""} 
                          className="w-full pl-12 pr-4 py-3 bg-transparent border border-white/20 rounded-sm text-sm focus:outline-none focus:border-[#C2A878] transition-all text-[#F4F1ED]"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="last_name" className="text-[10px] font-bold uppercase tracking-widest text-white/50">{t("dashboard.profile.lastName")}</label>
                      <input suppressHydrationWarning
                        type="text" 
                        name="last_name" 
                        id="last_name"
                        defaultValue={profile?.last_name || ""} 
                        className="w-full px-4 py-3 bg-transparent border border-white/20 rounded-sm text-sm focus:outline-none focus:border-[#C2A878] transition-all text-[#F4F1ED]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label htmlFor="cedula_number" className="text-[10px] font-bold uppercase tracking-widest text-white/50">{t("dashboard.profile.cedula")}</label>
                      <div className="relative">
                        <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                        <input suppressHydrationWarning
                          type="text" 
                          name="cedula_number" 
                          id="cedula_number"
                          defaultValue={profile?.cedula_number || ""} 
                          className="w-full pl-12 pr-4 py-3 bg-transparent border border-white/20 rounded-sm text-sm focus:outline-none focus:border-[#C2A878] transition-all text-[#F4F1ED]"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="phone_number" className="text-[10px] font-bold uppercase tracking-widest text-white/50">{t("dashboard.profile.phone")}</label>
                      <div className="relative">
                        <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                        <input suppressHydrationWarning
                          type="tel" 
                          name="phone_number" 
                          id="phone_number"
                          defaultValue={profile?.phone_number || ""} 
                          className="w-full pl-12 pr-4 py-3 bg-transparent border border-white/20 rounded-sm text-sm focus:outline-none focus:border-[#C2A878] transition-all text-[#F4F1ED]"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-white/10 space-y-6">
                    <h3 className="text-sm font-bold uppercase tracking-widest text-[#C2A878]">{t("dashboard.profile.addressTitle")}</h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label htmlFor="department" className="text-[10px] font-bold uppercase tracking-widest text-white/50">{t("dashboard.profile.department")}</label>
                        <div className="relative">
                          <Map className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                          <input suppressHydrationWarning
                            type="text" 
                            name="department" 
                            id="department"
                            defaultValue={profile?.department || ""} 
                            className="w-full pl-12 pr-4 py-3 bg-transparent border border-white/20 rounded-sm text-sm focus:outline-none focus:border-[#C2A878] transition-all text-[#F4F1ED]"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label htmlFor="city" className="text-[10px] font-bold uppercase tracking-widest text-white/50">{t("dashboard.profile.city")}</label>
                        <input suppressHydrationWarning
                          type="text" 
                          name="city" 
                          id="city"
                          defaultValue={profile?.city || ""} 
                          className="w-full px-4 py-3 bg-transparent border border-white/20 rounded-sm text-sm focus:outline-none focus:border-[#C2A878] transition-all text-[#F4F1ED]"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="address" className="text-[10px] font-bold uppercase tracking-widest text-white/50">{t("dashboard.profile.address")}</label>
                      <div className="relative">
                        <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                        <input suppressHydrationWarning
                          type="text" 
                          name="address" 
                          id="address"
                          defaultValue={profile?.address || ""} 
                          className="w-full pl-12 pr-4 py-3 bg-transparent border border-white/20 rounded-sm text-sm focus:outline-none focus:border-[#C2A878] transition-all text-[#F4F1ED]"
                          placeholder={t("dashboard.profile.addressPlaceholder")}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end pt-4">
                     <button suppressHydrationWarning type="submit" className="px-8 py-4 bg-[#C2A878] text-[#0B0B0B] text-xs font-bold uppercase tracking-widest rounded-sm hover:bg-[#F4F1ED] transition-all">
                        {t("dashboard.profile.saveBtn")}
                      </button>
                  </div>
                </form>
              </div>
            )}
          </div>

          {/* Sidebar Area */}
          <div className="space-y-8">
            <div className="bg-[#C2A878] text-[#0B0B0B] rounded-sm p-8 relative overflow-hidden">
              <div className="absolute -right-8 -bottom-8 opacity-20">
                <Coffee className="w-32 h-32" />
              </div>
              <h3 className="text-lg font-serif mb-4">{t("dashboard.sidebar.title")}</h3>
              <p className="text-sm text-[#0B0B0B]/70 leading-relaxed mb-6 italic">{t("dashboard.sidebar.quote")}</p>
              <button suppressHydrationWarning className="text-xs font-bold uppercase tracking-widest text-[#0B0B0B] hover:text-white transition-colors relative z-10">{t("dashboard.sidebar.link")}</button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
