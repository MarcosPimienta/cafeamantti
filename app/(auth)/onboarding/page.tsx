import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { Coffee, MapPin, CreditCard, ArrowRight } from "lucide-react";

export default async function OnboardingPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch the existing profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("cedula_number, address, first_name, phone_number")
    .eq("id", user.id)
    .single();

  // If already complete, go to dashboard
  if (profile?.cedula_number && profile?.address) {
    redirect("/dashboard");
  }

  async function completeProfile(formData: FormData) {
    "use server";
    const supabaseServer = await createClient();
    const {
      data: { user },
    } = await supabaseServer.auth.getUser();

    if (user) {
      const sanitize = (str: string) => str ? str.replace(/<[^>]*>?/gm, '') : str;
      const address = sanitize(formData.get("address") as string);

      await supabaseServer
        .from("profiles")
        .update({ address })
        .eq("id", user.id);

      redirect("/dashboard");
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#fdfbf7] p-4 font-sans text-foreground">
      <div className="max-w-md w-full p-10 bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl border border-foreground/5 relative overflow-hidden">
        {/* Decorative element */}
        <div className="absolute -top-10 -right-10 w-32 h-32 bg-[#C59F59]/10 rounded-full blur-3xl"></div>
        
        <div className="relative z-10">
          <div className="flex flex-col items-center mb-10">
            <div className="w-16 h-16 bg-foreground rounded-full flex items-center justify-center mb-6 shadow-lg">
              <Coffee className="w-8 h-8 text-background" strokeWidth={1.5} />
            </div>
            <h1 className="text-4xl font-serif text-center mb-3">
              Bienvenido, <span className="italic">{profile?.first_name || "a Amantti"}</span>
            </h1>
            <p className="text-sm text-foreground/60 text-center max-w-[280px] leading-relaxed">
              Solo necesitamos tu dirección para completar el envío de tu café.
            </p>
          </div>

          <form action={completeProfile} className="space-y-6">
            <div className="space-y-4">
              <div className="group">
                <label
                  htmlFor="address"
                  className="block text-[10px] font-bold uppercase tracking-[0.2em] text-foreground/40 mb-2 group-focus-within:text-[#C59F59] transition-colors"
                >
                  Dirección de Envío
                </label>
                <div className="relative">
                  <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/20 group-focus-within:text-[#C59F59] transition-colors" />
                  <input
                    id="address"
                    name="address"
                    type="text"
                    required
                    placeholder="Calle 123 # 45 - 67, Bogotá"
                    className="block w-full rounded-2xl border border-foreground/10 bg-white/50 px-11 py-4 text-sm focus:border-[#C59F59] focus:outline-none focus:ring-4 focus:ring-[#C59F59]/5 transition-all placeholder:text-foreground/20"
                  />
                </div>
              </div>
            </div>

            <div className="pt-6">
              <button
                type="submit"
                className="group w-full rounded-2xl bg-foreground px-6 py-4 text-sm font-semibold text-background shadow-xl hover:bg-[#C59F59] hover:text-white transition-all duration-500 flex items-center justify-center gap-2"
              >
                <span>Completar Perfil</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </form>

          <p className="mt-8 text-center text-[10px] text-foreground/30 uppercase tracking-[0.1em]">
            Tus datos están protegidos por Amantti Privacy
          </p>
        </div>
      </div>
    </main>
  );
}
