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
    <main className="min-h-screen flex items-center justify-center bg-[#0B0B0B] p-4 font-sans text-[#F4F1ED]">
      <div className="max-w-md w-full p-10 bg-[#0B0B0B]/80 backdrop-blur-xl rounded-sm shadow-2xl border border-[#C2A878]/20 relative overflow-hidden">
        {/* Decorative element */}
        <div className="absolute -top-10 -right-10 w-32 h-32 bg-[#C2A878]/5 rounded-full blur-3xl"></div>
        
        <div className="relative z-10">
          <div className="flex flex-col items-center mb-10">
            <div className="w-16 h-16 bg-[#C2A878] rounded-sm flex items-center justify-center mb-6 shadow-lg border border-[#C2A878]/20 ring-8 ring-[#C2A878]/10">
              <Coffee className="w-8 h-8 text-[#0B0B0B]" strokeWidth={1.5} />
            </div>
            <h1 className="text-4xl font-serif text-center mb-3 text-[#F4F1ED]">
              Bienvenido, <span className="italic">{profile?.first_name || "a Amantti"}</span>
            </h1>
            <p className="text-sm text-white/40 text-center max-w-[280px] leading-relaxed">
              Solo necesitamos tu dirección para completar el envío de tu café.
            </p>
          </div>

          <form action={completeProfile} className="space-y-6">
            <div className="space-y-4">
              <div className="group">
                <label
                  htmlFor="address"
                  className="block text-[10px] font-bold uppercase tracking-[0.2em] text-white/40 mb-2 group-focus-within:text-[#C2A878] transition-colors"
                >
                  Dirección de Envío
                </label>
                <div className="relative">
                  <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 group-focus-within:text-[#C2A878] transition-colors" />
                  <input
                    id="address"
                    name="address"
                    type="text"
                    required
                    placeholder="Calle 123 # 45 - 67, Bogotá"
                    className="block w-full rounded-sm border border-white/20 bg-transparent px-11 py-4 text-sm text-[#F4F1ED] focus:border-[#C2A878] focus:outline-none transition-all placeholder:text-white/20"
                  />
                </div>
              </div>
            </div>

            <div className="pt-6">
              <button
                type="submit"
                className="group w-full rounded-sm bg-[#C2A878] px-6 py-4 text-sm font-semibold text-[#0B0B0B] shadow-xl hover:bg-[#F4F1ED] transition-all duration-500 flex items-center justify-center gap-2"
              >
                <span>Completar Perfil</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </form>

          <p className="mt-8 text-center text-[10px] text-white/30 uppercase tracking-[0.1em]">
            Tus datos están protegidos por Amantti Privacy
          </p>
        </div>
      </div>
    </main>
  );
}
