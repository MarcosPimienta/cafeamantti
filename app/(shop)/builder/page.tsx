"use client";

import { useState, useEffect, Suspense } from "react";
import Image from "next/image";
import { 
  Coffee, 
  Check, 
  ArrowRight, 
  ArrowLeft, 
  Package, 
  Calendar, 
  ChevronRight,
  Info,
  Loader2
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { upsertSubscription, getSubscription } from "./actions";

const PLANS = [
  {
    id: "essential",
    name: "Devoción Esencial",
    price: 35000,
    image: "/images/Front_Paper_Traditional_Coffee_Bag.png",
    description: "El café esencial para empezar cada día con intención.",
  },
  {
    id: "alchemy",
    name: "Alquimia & Contraste",
    price: 48000,
    image: "/images/Front_White_Honey_Coffee_Bag.png",
    description: "Para quienes disfrutan descubrir nuevos perfiles y contrastes.",
  },
  {
    id: "curator",
    name: "Curaduría Privada",
    price: 65000,
    image: "/images/Amantti_Coffee_Bag.png",
    description: "Una selección privada de los cafés más excepcionales de Amantti.",
  },
];

const WEIGHTS = ["250g", "500g", "1kg"];
const FREQUENCIES = [
  { id: "weekly", label: "Semanal" },
  { id: "bi-weekly", label: "Quincenal" },
  { id: "monthly", label: "Mensual" },
];

const DEPARTAMENTOS = [
  "Amazonas", "Antioquia", "Arauca", "Atlántico", "Bogotá DC", "Bolívar", "Boyacá", "Caldas", 
  "Caquetá", "Casanare", "Cauca", "Cesar", "Chocó", "Córdoba", "Cundinamarca", "Guainía", 
  "Guaviare", "Huila", "La Guajira", "Magdalena", "Meta", "Nariño", "Norte de Santander", 
  "Putumayo", "Quindío", "Risaralda", "San Andrés y Providencia", "Santander", "Sucre", 
  "Tolima", "Valle del Cauca", "Vaupés", "Vichada"
];

function BuilderForm() {
  const searchParams = useSearchParams();
  const subscriptionId = searchParams.get("id");

  const [selection, setSelection] = useState({
    plan_id: "essential",
    weight: "250g",
    grind: "whole",
    grind_level: "drip",
    frequency: "monthly",
    shipping_state: "",
    shipping_city: "",
    shipping_address: "",
    shipping_details: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(!!subscriptionId);

  useEffect(() => {
    if (subscriptionId) {
      const loadSubscription = async () => {
        const data = await getSubscription(subscriptionId);
        if (data) {
          setSelection({
            plan_id: data.plan_id,
            weight: data.weight,
            grind: data.grind,
            grind_level: data.grind_level || "drip",
            frequency: data.frequency,
            shipping_state: data.shipping_state || "",
            shipping_city: data.shipping_city || "",
            shipping_address: data.shipping_address || "",
            shipping_details: data.shipping_details || "",
          });
        }
        setIsLoading(false);
      };
      loadSubscription();
    } else {
      // For new subscriptions, check if a plan was pre-selected in the URL
      const planFromUrl = searchParams.get("plan");
      if (planFromUrl && PLANS.some(p => p.id === planFromUrl)) {
        setSelection(prev => ({ ...prev, plan_id: planFromUrl }));
      }
    }
  }, [subscriptionId, searchParams]);

  const currentPlan = PLANS.find((p) => p.id === selection.plan_id)!;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const formData = new FormData();
      Object.entries(selection).forEach(([key, value]) => formData.append(key, value));
      await upsertSubscription(formData, subscriptionId);
    } catch (error) {
      console.error(error);
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#fdfbf7] flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-[#C59F59] animate-spin" />
      </div>
    );
  }

  const getPrice = () => {
    const multiplier = selection.weight === "250g" ? 1 : selection.weight === "500g" ? 1.8 : 3.2;
    return currentPlan.price * multiplier;
  };

  return (
    <main className="min-h-screen bg-[#fdfbf7] pt-32 pb-20 font-sans text-foreground">
      <div className="container mx-auto px-6 max-w-6xl">
        {/* Navigation & Header */}
        <div className="mb-12">
          <Link 
            href="/dashboard" 
            className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-foreground/40 hover:text-foreground transition-all mb-8 group"
          >
            <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
            Volver al Dashboard
          </Link>
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <h1 className="text-4xl md:text-6xl font-serif mb-4">Personaliza tu Suscripción</h1>
              <p className="text-foreground/40 text-lg font-light tracking-wide max-w-xl">
                Ajusta cada detalle de tu experiencia Amantti. Cambia tu plan, molienda o frecuencia en un solo lugar.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col lg:grid lg:grid-cols-12 gap-12">
          {/* Main Configuration Area */}
          <div className="lg:col-span-8 space-y-16">
            
            {/* Section 1: Plan Selection */}
            <section className="space-y-8">
              <div className="flex items-center gap-4">
                <span className="w-8 h-8 rounded-full bg-[#C59F59] text-white flex items-center justify-center font-serif text-sm">1</span>
                <h2 className="text-2xl font-serif">Selecciona tu Plan</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {PLANS.map((plan) => (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => setSelection({ ...selection, plan_id: plan.id })}
                    className={`relative p-6 rounded-3xl border transition-all duration-500 text-left flex flex-col items-center group ${
                      selection.plan_id === plan.id 
                        ? "bg-white border-[#C59F59] shadow-2xl scale-[1.02]" 
                        : "bg-white/50 border-foreground/5 hover:border-[#C59F59]/40 hover:bg-white"
                    }`}
                  >
                    <div className="relative w-32 h-40 mb-6 transition-transform duration-700 group-hover:scale-110">
                      {plan.id === 'essential' && (
                        <Image src="/images/Front_Paper_Traditional_Coffee_Bag.png" alt={plan.name} fill className="object-contain drop-shadow-xl" />
                      )}
                      {plan.id === 'alchemy' && (
                        <>
                          <Image src="/images/Front_Paper_Traditional_Coffee_Bag.png" alt="Bag 1" fill className="object-contain drop-shadow-lg -rotate-12 -translate-x-4 translate-y-2 opacity-90" />
                          <Image src="/images/Front_White_Honey_Coffee_Bag.png" alt="Bag 2" fill className="object-contain drop-shadow-2xl rotate-6 translate-x-4 -translate-y-1" />
                        </>
                      )}
                      {plan.id === 'curator' && (
                        <>
                          <Image src="/images/Front_Paper_Traditional_Coffee_Bag.png" alt="Bag 1" fill className="object-contain drop-shadow-xl -rotate-[20deg] -translate-x-8 translate-y-4 opacity-80" />
                          <Image src="/images/Front_White_Honey_Coffee_Bag.png" alt="Bag 2" fill className="object-contain drop-shadow-xl rotate-[20deg] translate-x-8 translate-y-4 opacity-80" />
                          <Image src="/images/Amantti_Coffee_Bag.png" alt="Bag 3" fill className="object-contain drop-shadow-[0_20px_40px_rgba(0,0,0,0.4)] scale-110 brightness-110 z-10" />
                        </>
                      )}
                    </div>
                    <h3 className="text-lg font-serif mb-2 text-center">{plan.name}</h3>
                    <p className="text-[10px] text-foreground/40 text-center leading-relaxed">
                      {plan.description}
                    </p>
                    {selection.plan_id === plan.id && (
                      <div className="absolute top-4 right-4 w-6 h-6 bg-[#C59F59] rounded-full flex items-center justify-center shadow-lg animate-in zoom-in duration-300">
                        <Check className="w-3 h-3 text-white" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </section>

            {/* Section 2: Presentation & Grind */}
            <section className="space-y-12">
              <div className="flex items-center gap-4">
                <span className="w-8 h-8 rounded-full bg-[#C59F59] text-white flex items-center justify-center font-serif text-sm">2</span>
                <h2 className="text-2xl font-serif">Personaliza tu Café</h2>
              </div>
              
              <div className="grid md:grid-cols-2 gap-12">
                <div className="space-y-6">
                  <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-foreground/40 block">Presentación</label>
                  <div className="grid grid-cols-3 gap-3">
                    {WEIGHTS.map((w) => (
                      <button
                        key={w}
                        type="button"
                        onClick={() => setSelection({ ...selection, weight: w })}
                        className={`py-4 rounded-2xl border text-sm font-medium transition-all ${
                          selection.weight === w 
                            ? "bg-foreground border-foreground text-background shadow-lg" 
                            : "bg-white border-foreground/10 hover:border-[#C59F59]"
                        }`}
                      >
                        {w}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-6">
                  <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-foreground/40 block">Molienda</label>
                  <div className="flex p-1.5 bg-foreground/5 rounded-2xl">
                    <button
                      type="button"
                      onClick={() => setSelection({ ...selection, grind: "whole" })}
                      className={`flex-1 py-4 text-sm font-medium rounded-xl transition-all ${
                        selection.grind === "whole" ? "bg-white text-foreground shadow-sm" : "text-foreground/40"
                      }`}
                    >
                      Grano Entero
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelection({ ...selection, grind: "ground" })}
                      className={`flex-1 py-4 text-sm font-medium rounded-xl transition-all ${
                        selection.grind === "ground" ? "bg-white text-foreground shadow-sm" : "text-foreground/40"
                      }`}
                    >
                      Molido
                    </button>
                  </div>
                </div>
              </div>

              {selection.grind === "ground" && (
                <div className="space-y-6 animate-in fade-in slide-in-from-top-2">
                  <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-foreground/40 block">Nivel de Molienda</label>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[
                      { id: "espresso", label: "Fina (Espresso)" },
                      { id: "drip", label: "Media (Filtro)" },
                      { id: "french", label: "Gruesa (Prensa)" }
                    ].map((level) => (
                      <button
                        key={level.id}
                        type="button"
                        onClick={() => setSelection({ ...selection, grind_level: level.id })}
                        className={`px-4 py-4 rounded-2xl border text-xs font-medium transition-all flex items-center justify-between group ${
                          selection.grind_level === level.id
                            ? "border-[#C59F59] bg-[#C59F59]/5 text-[#C59F59]"
                            : "bg-white border-foreground/10 hover:border-[#C59F59]/40"
                        }`}
                      >
                        <span>{level.label}</span>
                        {selection.grind_level === level.id && <Check className="w-3 h-3" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {/* Section 3: Frequency */}
            <section className="space-y-8">
              <div className="flex items-center gap-4">
                <span className="w-8 h-8 rounded-full bg-[#C59F59] text-white flex items-center justify-center font-serif text-sm">3</span>
                <h2 className="text-2xl font-serif">Frecuencia de Entrega</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {FREQUENCIES.map((freq) => (
                  <button
                    key={freq.id}
                    type="button"
                    onClick={() => setSelection({ ...selection, frequency: freq.id })}
                    className={`p-6 rounded-3xl border transition-all text-left group ${
                      selection.frequency === freq.id 
                        ? "bg-white border-[#C59F59] shadow-xl" 
                        : "bg-white/50 border-foreground/5 hover:border-[#C59F59]/40"
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 transition-colors ${
                      selection.frequency === freq.id ? "bg-[#C59F59] text-white" : "bg-foreground/5 text-foreground/40"
                    }`}>
                      <Calendar className="w-5 h-5" />
                    </div>
                    <h3 className="font-semibold mb-1">{freq.label}</h3>
                    <p className="text-[10px] text-foreground/40 leading-tight">
                      {freq.id === "weekly" && "Envíos semanales"}
                      {freq.id === "bi-weekly" && "Cada dos semanas"}
                      {freq.id === "monthly" && "Una vez al mes"}
                    </p>
                  </button>
                ))}
              </div>
            </section>

            {/* Section 4: Shipping Info */}
            <section className="space-y-8">
              <div className="flex items-center gap-4">
                <span className="w-8 h-8 rounded-full bg-[#C59F59] text-white flex items-center justify-center font-serif text-sm">4</span>
                <h2 className="text-2xl font-serif">Información de Envío</h2>
              </div>
              
              <div className="grid md:grid-cols-2 gap-6 bg-white p-8 rounded-3xl border border-foreground/5 shadow-sm">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-foreground/40 px-1">Departamento</label>
                  <select
                    value={selection.shipping_state}
                    onChange={(e) => setSelection({ ...selection, shipping_state: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-foreground/10 bg-[#fdfbf7] focus:ring-2 focus:ring-[#C59F59]/20 outline-none transition-all text-sm"
                    required
                  >
                    <option value="">Selecciona Departamento</option>
                    {DEPARTAMENTOS.map(dept => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-foreground/40 px-1">Ciudad / Municipio</label>
                  <input
                    type="text"
                    value={selection.shipping_city}
                    onChange={(e) => setSelection({ ...selection, shipping_city: e.target.value })}
                    placeholder="Ej. Bogotá, Medellín..."
                    className="w-full px-4 py-3 rounded-xl border border-foreground/10 bg-[#fdfbf7] focus:ring-2 focus:ring-[#C59F59]/20 outline-none transition-all text-sm"
                    required
                  />
                </div>

                <div className="md:col-span-2 space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-foreground/40 px-1">Dirección Exacta</label>
                  <input
                    type="text"
                    value={selection.shipping_address}
                    onChange={(e) => setSelection({ ...selection, shipping_address: e.target.value })}
                    placeholder="Calle, Carrera, Avenida..."
                    className="w-full px-4 py-3 rounded-xl border border-foreground/10 bg-[#fdfbf7] focus:ring-2 focus:ring-[#C59F59]/20 outline-none transition-all text-sm"
                    required
                  />
                </div>

                <div className="md:col-span-2 space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-foreground/40 px-1">Apto / Torre / Otros Detalles</label>
                  <input
                    type="text"
                    value={selection.shipping_details}
                    onChange={(e) => setSelection({ ...selection, shipping_details: e.target.value })}
                    placeholder="Ej. Apto 502, Torre A, Portería..."
                    className="w-full px-4 py-3 rounded-xl border border-foreground/10 bg-[#fdfbf7] focus:ring-2 focus:ring-[#C59F59]/20 outline-none transition-all text-sm"
                  />
                </div>
              </div>
            </section>
          </div>

          {/* Sticky Summary Card (Right Sidebar) */}
          <div className="lg:col-span-4">
            <div className="sticky top-32 space-y-6">
              <div className="bg-white rounded-[2.5rem] p-8 border border-foreground/5 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-[0.03]">
                  <Coffee className="w-32 h-32 rotate-12" />
                </div>
                
                <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-[#C59F59] mb-8">Tu Selección</h3>
                
                <div className="space-y-8 relative z-10">
                  <div className="flex items-center gap-6">
                    <div className="relative w-20 h-24 shrink-0 bg-[#fdfbf7] rounded-2xl p-2 ring-1 ring-black/5">
                      {selection.plan_id === 'essential' && (
                        <Image src="/images/Front_Paper_Traditional_Coffee_Bag.png" alt="Bag" fill className="object-contain" />
                      )}
                      {selection.plan_id === 'alchemy' && (
                        <Image src="/images/Front_White_Honey_Coffee_Bag.png" alt="Bag" fill className="object-contain" />
                      )}
                      {selection.plan_id === 'curator' && (
                        <Image src="/images/Amantti_Coffee_Bag.png" alt="Bag" fill className="object-contain scale-110" />
                      )}
                    </div>
                    <div>
                      <p className="text-xl font-serif leading-tight mb-1">{currentPlan.name}</p>
                      <p className="text-xs text-foreground/40 font-medium">{selection.weight} • {selection.grind === "whole" ? "Grano" : "Molido"}</p>
                    </div>
                  </div>

                  <div className="space-y-4 pt-8 border-t border-foreground/5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-foreground/40">Frecuencia</span>
                      <span className="font-medium">{FREQUENCIES.find(f => f.id === selection.frequency)?.label}</span>
                    </div>
                    {selection.grind === "ground" && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-foreground/40">Molienda</span>
                        <span className="font-medium capitalize">{selection.grind_level}</span>
                      </div>
                    )}
                  </div>

                  <div className="pt-8 border-t border-foreground/5">
                    <div className="flex items-end justify-between mb-8">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-foreground/30 mb-1">Total por Envío</p>
                        <p className="text-3xl font-serif text-[#C59F59]">
                          {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(getPrice())}
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={handleSubmit}
                      disabled={isSubmitting}
                      className="w-full py-5 bg-foreground text-background font-bold uppercase tracking-widest text-xs rounded-2xl hover:bg-[#C59F59] hover:text-white transition-all shadow-xl flex items-center justify-center gap-3 disabled:opacity-50"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Procesando...
                        </>
                      ) : (
                        <>
                          Confirmar Suscripción
                          <ChevronRight className="w-4 h-4" />
                        </>
                      )}
                    </button>

                    <div className="mt-6 flex gap-3 p-4 bg-[#fdfbf7] rounded-xl border border-foreground/5">
                      <Info className="w-4 h-4 text-[#C59F59] shrink-0" />
                      <p className="text-[9px] text-foreground/40 leading-relaxed italic">
                        Al confirmar, actualizaremos tu programa de entregas. Podrás realizar cambios adicionales en cualquier momento.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function BuilderPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#fdfbf7] flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-[#C59F59] animate-spin" />
      </div>
    }>
      <BuilderForm />
    </Suspense>
  );
}
