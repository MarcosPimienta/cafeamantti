"use client";

import { useState } from "react";
import Image from "next/image";
import { 
  Coffee, 
  Check, 
  ArrowRight, 
  ArrowLeft, 
  Package, 
  Calendar, 
  ChevronRight,
  Info
} from "lucide-react";
import { createSubscription } from "./actions";

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

export default function BuilderPage() {
  const [step, setStep] = useState(1);
  const [selection, setSelection] = useState({
    plan_id: "essential",
    weight: "250g",
    grind: "whole",
    grind_level: "drip",
    frequency: "monthly",
  });

  const currentPlan = PLANS.find((p) => p.id === selection.plan_id)!;

  const handleNext = () => setStep((s) => Math.min(s + 1, 4));
  const handleBack = () => setStep((s) => Math.max(s - 1, 1));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData();
    Object.entries(selection).forEach(([key, value]) => formData.append(key, value));
    await createSubscription(formData);
  };

  const getPrice = () => {
    const multiplier = selection.weight === "250g" ? 1 : selection.weight === "500g" ? 1.8 : 3.2;
    return currentPlan.price * multiplier;
  };

  return (
    <main className="min-h-screen bg-[#fdfbf7] pt-32 pb-20 font-sans text-foreground">
      <div className="container mx-auto px-6 max-w-5xl">
        <div className="flex flex-col lg:flex-row gap-12">
          
          {/* Main Builder Area */}
          <div className="flex-1">
            {/* Progress Header */}
            <div className="mb-12">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#C59F59] mb-4">
                <Coffee className="w-3 h-3" />
                <span>Paso {step} de 4</span>
              </div>
              <h1 className="text-4xl md:text-5xl font-serif mb-4">
                {step === 1 && "Selecciona tu Plan"}
                {step === 2 && "Personaliza tu Café"}
                {step === 3 && "Frecuencia de Entrega"}
                {step === 4 && "Confirma tu Suscripción"}
              </h1>
              <div className="flex gap-2 h-1 w-full bg-foreground/5 rounded-full overflow-hidden">
                {[1, 2, 3, 4].map((i) => (
                  <div 
                    key={i} 
                    className={`h-full transition-all duration-500 rounded-full ${i <= step ? "bg-[#C59F59] flex-1" : "w-4 bg-transparent"}`}
                  />
                ))}
              </div>
            </div>

            <form onSubmit={handleSubmit} className="min-h-[400px]">
              {/* Step 1: Plan Selection */}
              {step === 1 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  {PLANS.map((plan) => (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => setSelection({ ...selection, plan_id: plan.id })}
                      className={`relative group p-6 rounded-3xl border transition-all duration-500 text-left flex flex-col items-center ${
                        selection.plan_id === plan.id 
                          ? "bg-white border-[#C59F59] shadow-2xl scale-[1.02]" 
                          : "bg-white/50 border-foreground/5 hover:border-[#C59F59]/40 hover:bg-white"
                      }`}
                    >
                      <div className="relative w-32 h-40 mb-6 transition-transform duration-700 group-hover:scale-110">
                        <Image src={plan.image} alt={plan.name} fill className="object-contain drop-shadow-xl" />
                      </div>
                      <h3 className="text-xl font-serif mb-2 text-center">{plan.name}</h3>
                      <p className="text-xs text-foreground/50 text-center leading-relaxed">
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
              )}

              {/* Step 2: Customization */}
              {step === 2 && (
                <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  {/* Weight Selector */}
                  <div className="space-y-4">
                    <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-foreground/40">Presentación</label>
                    <div className="grid grid-cols-3 gap-4">
                      {WEIGHTS.map((w) => (
                        <button
                          key={w}
                          type="button"
                          onClick={() => setSelection({ ...selection, weight: w })}
                          className={`py-4 rounded-2xl border font-medium transition-all ${
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

                  {/* Grind Selector */}
                  <div className="space-y-4">
                    <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-foreground/40">Molienda</label>
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

                  {/* Grind Level */}
                  {selection.grind === "ground" && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                      <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-foreground/40">Nivel de Molienda</label>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {["espresso", "drip", "french"].map((level) => (
                          <button
                            key={level}
                            type="button"
                            onClick={() => setSelection({ ...selection, grind_level: level })}
                            className={`px-4 py-3 rounded-xl border text-xs font-medium transition-all ${
                              selection.grind_level === level
                                ? "border-[#C59F59] bg-[#C59F59]/5 text-[#C59F59]"
                                : "border-foreground/10 hover:border-[#C59F59]/40"
                            }`}
                          >
                            {level === "espresso" && "Fina (Espresso)"}
                            {level === "drip" && "Media (Filtro)"}
                            {level === "french" && "Gruesa (Prensa)"}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Step 3: Frequency */}
              {step === 3 && (
                <div className="grid grid-cols-1 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  {FREQUENCIES.map((freq) => (
                    <button
                      key={freq.id}
                      type="button"
                      onClick={() => setSelection({ ...selection, frequency: freq.id })}
                      className={`p-6 rounded-3xl border flex items-center justify-between transition-all ${
                        selection.frequency === freq.id 
                          ? "bg-white border-[#C59F59] shadow-xl" 
                          : "bg-white/50 border-foreground/5 hover:border-[#C59F59]/40"
                      }`}
                    >
                      <div className="flex items-center gap-6">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors ${
                          selection.frequency === freq.id ? "bg-[#C59F59]/10 text-[#C59F59]" : "bg-foreground/5 text-foreground/40"
                        }`}>
                          <Calendar className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="font-semibold">{freq.label}</h3>
                          <p className="text-xs text-foreground/40">
                            {freq.id === "weekly" && "Envíos todos los lunes"}
                            {freq.id === "bi-weekly" && "Cada dos semanas (Perfecto para balance)"}
                            {freq.id === "monthly" && "Una vez al mes"}
                          </p>
                        </div>
                      </div>
                      {selection.frequency === freq.id && (
                        <div className="w-6 h-6 bg-[#C59F59] rounded-full flex items-center justify-center shadow-lg">
                          <Check className="w-3 h-3 text-white" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {/* Step 4: Confirm */}
              {step === 4 && (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <div className="bg-white rounded-3xl p-10 border border-[#C59F59]/20 shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-8 opacity-5">
                      <Coffee className="w-40 h-40 rotate-12" />
                    </div>
                    <h2 className="text-2xl font-serif mb-8 border-b border-foreground/5 pb-6">Detalles Finales</h2>
                    <ul className="space-y-6 relative z-10">
                      <li className="flex items-center justify-between">
                        <span className="text-foreground/40 text-sm">Plan</span>
                        <span className="font-medium text-lg">{currentPlan.name}</span>
                      </li>
                      <li className="flex items-center justify-between">
                        <span className="text-foreground/40 text-sm">Presentación</span>
                        <span className="font-medium">{selection.weight} • {selection.grind === "whole" ? "Grano Entero" : `Molido (${selection.grind_level})`}</span>
                      </li>
                      <li className="flex items-center justify-between">
                        <span className="text-foreground/40 text-sm">Frecuencia</span>
                        <span className="font-medium">{FREQUENCIES.find(f => f.id === selection.frequency)?.label}</span>
                      </li>
                      <li className="pt-6 border-t border-foreground/10 flex items-center justify-between">
                        <span className="text-xl font-serif">Total por envío</span>
                        <span className="text-2xl font-serif text-[#C59F59]">
                          {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(getPrice())}
                        </span>
                      </li>
                    </ul>

                    <div className="mt-10 p-4 bg-[#fdfbf7] rounded-2xl border border-[#C59F59]/10 flex gap-4">
                      <Info className="w-5 h-5 text-[#C59F59] shrink-0" />
                      <p className="text-[10px] text-foreground/60 leading-relaxed italic">
                        Al completar tu suscripción, serás redirigido a tu panel de cliente. Podrás pausar o modificar tu selección en cualquier momento. El primer cobro se realizará inmediatamente.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </form>

            {/* Navigation Buttons */}
            <div className="mt-12 flex items-center justify-between">
              {step > 1 ? (
                <button
                  type="button"
                  onClick={handleBack}
                  className="px-8 py-4 text-sm font-bold uppercase tracking-widest text-foreground/40 hover:text-foreground transition-all flex items-center gap-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Atrás
                </button>
              ) : (
                <div />
              )}
              
              {step < 4 ? (
                <button
                  type="button"
                  onClick={handleNext}
                  className="px-10 py-5 bg-foreground text-background font-bold uppercase tracking-widest text-sm rounded-2xl hover:bg-[#C59F59] hover:text-white transition-all shadow-xl flex items-center gap-2"
                >
                  Siguiente
                  <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="submit"
                  onClick={handleSubmit}
                  className="px-12 py-5 bg-[#C59F59] text-white font-bold uppercase tracking-widest text-sm rounded-2xl hover:bg-foreground transition-all shadow-xl flex items-center gap-2"
                >
                  Confirmar Suscripción
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Sticky Summary Card (Sidebar) */}
          <div className="lg:w-80">
            <div className="sticky top-32 space-y-6">
              <div className="bg-white rounded-3xl p-8 border border-foreground/5 shadow-xl">
                <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-[#C59F59] mb-6">Tu Selección</h3>
                <div className="flex items-center gap-4 mb-6">
                  <div className="relative w-16 h-20 shrink-0">
                    <Image src={currentPlan.image} alt="Plan" fill className="object-contain" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold leading-tight">{currentPlan.name}</p>
                    <p className="text-[10px] text-foreground/40 uppercase tracking-wider">{selection.weight}</p>
                  </div>
                </div>
                <div className="space-y-4 pt-6 border-t border-foreground/5">
                  <div className="flex items-center gap-3 text-sm">
                    <Package className="w-4 h-4 text-foreground/20" />
                    <span className="text-foreground/60">{selection.grind === "whole" ? "Grano Entero" : "Molido"}</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <Calendar className="w-4 h-4 text-foreground/20" />
                    <span className="text-foreground/60">{FREQUENCIES.find(f => f.id === selection.frequency)?.label}</span>
                  </div>
                </div>
                <div className="mt-8 pt-8 border-t border-foreground/5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-foreground/30 mb-1">Precio Estimado</p>
                  <p className="text-2xl font-serif text-[#C59F59]">
                    {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(getPrice())}
                  </p>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </main>
  );
}
