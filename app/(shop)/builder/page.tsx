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
  Loader2,
  Plus,
  Minus,
  AlertTriangle,
  Sparkles,
  SlidersHorizontal
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { upsertSubscription, getSubscription, getSubscriptionStock } from "./actions";
import { CheckoutModal } from "@/app/components/CheckoutModal";

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
  {
    id: "custom",
    name: "Crea Tu Suscripción",
    price: 0,
    image: "/images/Amantti_Coffee_Bag.png",
    description: "Arma tu combinación personalizada eligiendo cantidades de cualquier café.",
  },
];

const CUSTOM_PRODUCTS = [
  {
    id: "essential",
    name: "Devoción Esencial (Tradicional)",
    basePrice: 35000,
    image: "/images/Front_Paper_Traditional_Coffee_Bag.png",
    codePrefix: "CAFT"
  },
  {
    id: "alchemy",
    name: "Alquimia & Contraste (Honey)",
    basePrice: 48000,
    image: "/images/Front_White_Honey_Coffee_Bag.png",
    codePrefix: "CAFT-HON"
  },
  {
    id: "curator",
    name: "Curaduría Privada (Microlote)",
    basePrice: 65000,
    image: "/images/Amantti_Coffee_Bag.png",
    codePrefix: "CAFT-MIC"
  }
];

const WEIGHTS = ["250g", "500g", "2.5kg"];
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

  const [customQuantities, setCustomQuantities] = useState<Record<string, number>>({
    essential: 1,
    alchemy: 0,
    curator: 0,
  });

  const [stockMap, setStockMap] = useState<Record<string, number>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(!!subscriptionId);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [activeSubId, setActiveSubId] = useState<string | null>(null);

  useEffect(() => {
    // Fetch live inventory stock
    getSubscriptionStock().then(data => {
      if (data) setStockMap(data);
    });
  }, []);

  useEffect(() => {
    if (subscriptionId) {
      const loadSubscription = async () => {
        const data = await getSubscription(subscriptionId);
        if (data) {
          setSelection({
            plan_id: data.plan_id,
            weight: data.weight || "250g",
            grind: data.grind || "whole",
            grind_level: data.grind_level || "drip",
            frequency: data.frequency,
            shipping_state: data.shipping_state || "",
            shipping_city: data.shipping_city || "",
            shipping_address: data.shipping_address || "",
            shipping_details: data.shipping_details || "",
          });

          if (data.custom_items && Array.isArray(data.custom_items)) {
            const loadedQty: Record<string, number> = { essential: 0, alchemy: 0, curator: 0 };
            data.custom_items.forEach((ci: any) => {
              if (ci.id) loadedQty[ci.id] = ci.quantity;
            });
            setCustomQuantities(loadedQty);
          }

          setIsLoading(false);
        } else {
          // If ID is provided but no data (IDOR attempt or deleted), redirect
          window.location.href = "/dashboard";
        }
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

  // Helper to check stock availability for a custom item
  const getAvailableStock = (productId: string) => {
    const prod = CUSTOM_PRODUCTS.find(p => p.id === productId);
    if (!prod) return 50;
    const weightCode = selection.weight === "125g" ? "125G" : selection.weight === "250g" ? "250G" : selection.weight === "500g" ? "500G" : "2K5";
    const fullCode = `${prod.codePrefix}-${weightCode}`;
    return stockMap[fullCode] ?? 50; // Fallback stock if inventory not seeded
  };

  const handleCustomQuantityChange = (productId: string, delta: number) => {
    const current = customQuantities[productId] || 0;
    const next = Math.max(0, current + delta);
    const maxStock = getAvailableStock(productId);

    if (delta > 0 && next > maxStock) {
      return; // Restrict if stock is insufficient
    }

    setCustomQuantities(prev => ({
      ...prev,
      [productId]: next
    }));
  };

  const getPrice = () => {
    if (selection.plan_id === "custom") {
      let total = 0;
      CUSTOM_PRODUCTS.forEach(p => {
        const qty = customQuantities[p.id] || 0;
        if (qty > 0) {
          const mult = selection.weight === "250g" ? 1 : selection.weight === "500g" ? 1.8 : 8;
          total += (p.basePrice * mult) * qty;
        }
      });
      return total > 0 ? total : 35000;
    }
    const multiplier = selection.weight === "250g" ? 1 : selection.weight === "500g" ? 1.8 : 8;
    return currentPlan.price * multiplier;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const formData = new FormData();
      Object.entries(selection).forEach(([key, value]) => formData.append(key, value));

      if (selection.plan_id === "custom") {
        const customItemsList = CUSTOM_PRODUCTS.map(p => ({
          id: p.id,
          name: p.name,
          quantity: customQuantities[p.id] || 0
        })).filter(item => item.quantity > 0);

        formData.append("custom_items", JSON.stringify(customItemsList));
      }

      const res = await upsertSubscription(formData, subscriptionId);
      if (res && res.subscriptionId) {
        setActiveSubId(res.subscriptionId);
        setIsCheckoutOpen(true);
      }
    } catch (error) {
      console.error(error);
    } finally {
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
                Ajusta cada detalle de tu experiencia Amantti. Elije un plan predefinido o arma tu combinación a la medida.
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {PLANS.map((plan) => (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => setSelection({ ...selection, plan_id: plan.id })}
                    className={`relative p-5 rounded-3xl border transition-all duration-500 text-left flex flex-col items-center group ${
                      selection.plan_id === plan.id 
                        ? "bg-white border-[#C59F59] shadow-2xl scale-[1.02]" 
                        : "bg-white/50 border-foreground/5 hover:border-[#C59F59]/40 hover:bg-white"
                    }`}
                  >
                    <div className="relative w-24 h-32 mb-4 transition-transform duration-700 group-hover:scale-110">
                      {plan.id === 'essential' && (
                        <Image src="/images/Front_Paper_Traditional_Coffee_Bag.png" alt={plan.name} fill className="object-contain drop-shadow-xl" />
                      )}
                      {plan.id === 'alchemy' && (
                        <>
                          <Image src="/images/Front_Paper_Traditional_Coffee_Bag.png" alt="Bag 1" fill className="object-contain drop-shadow-lg -rotate-12 -translate-x-3 translate-y-2 opacity-90" />
                          <Image src="/images/Front_White_Honey_Coffee_Bag.png" alt="Bag 2" fill className="object-contain drop-shadow-2xl rotate-6 translate-x-3 -translate-y-1" />
                        </>
                      )}
                      {plan.id === 'curator' && (
                        <>
                          <Image src="/images/Front_Paper_Traditional_Coffee_Bag.png" alt="Bag 1" fill className="object-contain drop-shadow-xl -rotate-[20deg] -translate-x-5 translate-y-3 opacity-80" />
                          <Image src="/images/Front_White_Honey_Coffee_Bag.png" alt="Bag 2" fill className="object-contain drop-shadow-xl rotate-[20deg] translate-x-5 translate-y-3 opacity-80" />
                          <Image src="/images/Amantti_Coffee_Bag.png" alt="Bag 3" fill className="object-contain drop-shadow-2xl scale-110 brightness-110 z-10" />
                        </>
                      )}
                      {plan.id === 'custom' && (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-[#C59F59]/10 rounded-2xl p-2 text-[#C59F59]">
                          <SlidersHorizontal className="w-8 h-8 mb-1" />
                          <span className="text-[9px] font-bold uppercase tracking-wider text-center">Crea Tu Plan</span>
                        </div>
                      )}
                    </div>
                    <h3 className="text-base font-serif mb-1.5 text-center leading-snug">{plan.name}</h3>
                    <p className="text-[9px] text-foreground/40 text-center leading-relaxed">
                      {plan.description}
                    </p>
                    {selection.plan_id === plan.id && (
                      <div className="absolute top-3 right-3 w-5 h-5 bg-[#C59F59] rounded-full flex items-center justify-center shadow-lg animate-in zoom-in duration-300">
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
              
              {/* Custom Plan Product Quantity Builder */}
              {selection.plan_id === "custom" && (
                <div className="space-y-6 bg-white p-6 sm:p-8 rounded-3xl border border-[#C59F59]/30 shadow-xl animate-in fade-in duration-300">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Sparkles className="w-4 h-4 text-[#C59F59]" />
                      <h3 className="text-lg font-serif text-foreground">Elige las Cantidades de tu Suscripción</h3>
                    </div>
                    <p className="text-xs text-foreground/50">Selecciona cuántas unidades de cada producto deseas incluir. Validamos la disponibilidad en inventario en tiempo real.</p>
                  </div>

                  <div className="space-y-4">
                    {CUSTOM_PRODUCTS.map((prod) => {
                      const qty = customQuantities[prod.id] || 0;
                      const availableStock = getAvailableStock(prod.id);
                      const isOutOfStock = availableStock <= 0;
                      const isMaxStockReached = qty >= availableStock;

                      return (
                        <div key={prod.id} className="p-4 bg-[#fdfbf7] rounded-2xl border border-foreground/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <div className="relative w-12 h-16 shrink-0 bg-white p-1 rounded-xl ring-1 ring-black/5">
                              <Image src={prod.image} alt={prod.name} fill className="object-contain" />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-foreground">{prod.name}</p>
                              <p className="text-xs text-[#C59F59] font-serif font-bold">
                                {new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(
                                  prod.basePrice * (selection.weight === "250g" ? 1 : selection.weight === "500g" ? 1.8 : 8)
                                )} / unidad
                              </p>
                              {isOutOfStock ? (
                                <span className="inline-flex items-center gap-1 text-[9px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full mt-1">
                                  <AlertTriangle className="w-3 h-3" /> Agotado en Inventario
                                </span>
                              ) : (
                                <span className="text-[10px] text-foreground/40 block mt-0.5">
                                  Stock disponible: <strong className="text-foreground/70">{availableStock}</strong> unidades
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Quantity Controller */}
                          <div className="flex items-center gap-3 self-end sm:self-center">
                            <button
                              type="button"
                              onClick={() => handleCustomQuantityChange(prod.id, -1)}
                              disabled={qty === 0}
                              className="w-9 h-9 rounded-xl border border-foreground/10 bg-white flex items-center justify-center text-foreground hover:bg-foreground/5 disabled:opacity-30 transition-all"
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                            <span className="w-8 text-center font-bold text-sm">{qty}</span>
                            <button
                              type="button"
                              onClick={() => handleCustomQuantityChange(prod.id, 1)}
                              disabled={isOutOfStock || isMaxStockReached}
                              className="w-9 h-9 rounded-xl border border-foreground/10 bg-white flex items-center justify-center text-foreground hover:bg-[#C59F59] hover:text-white disabled:opacity-30 transition-all"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

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
                    <div className="relative w-20 h-24 shrink-0 bg-[#fdfbf7] rounded-2xl p-2 ring-1 ring-black/5 flex items-center justify-center">
                      {selection.plan_id === 'essential' && (
                        <Image src="/images/Front_Paper_Traditional_Coffee_Bag.png" alt="Bag" fill className="object-contain" />
                      )}
                      {selection.plan_id === 'alchemy' && (
                        <Image src="/images/Front_White_Honey_Coffee_Bag.png" alt="Bag" fill className="object-contain" />
                      )}
                      {selection.plan_id === 'curator' && (
                        <Image src="/images/Amantti_Coffee_Bag.png" alt="Bag" fill className="object-contain scale-110" />
                      )}
                      {selection.plan_id === 'custom' && (
                        <div className="flex flex-col items-center justify-center text-[#C59F59]">
                          <SlidersHorizontal className="w-8 h-8" />
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-xl font-serif leading-tight mb-1">{currentPlan.name}</p>
                      <p className="text-xs text-foreground/40 font-medium">{selection.weight} • {selection.grind === "whole" ? "Grano" : "Molido"}</p>
                    </div>
                  </div>

                  {selection.plan_id === "custom" && (
                    <div className="pt-4 border-t border-foreground/5 space-y-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-foreground/40">Resumen de Productos</p>
                      {CUSTOM_PRODUCTS.map(p => {
                        const qty = customQuantities[p.id] || 0;
                        if (qty === 0) return null;
                        return (
                          <div key={p.id} className="flex justify-between items-center text-xs">
                            <span className="text-foreground/70 truncate max-w-[170px]">{p.name}</span>
                            <span className="font-bold text-[#C59F59]">{qty} x</span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="space-y-4 pt-6 border-t border-foreground/5">
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

      <CheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        subtotal={getPrice()}
        userProfile={null}
        items={[]}
        epaycoKey={process.env.NEXT_PUBLIC_EPAYCO_PUBLIC_KEY || "452445a6435c2491a27e7b8971f11e9f"}
        isSubscription={true}
        subscriptionId={activeSubId || undefined}
        subscriptionPlanName={currentPlan.name}
        subscriptionFrequency={selection.frequency}
      />
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
