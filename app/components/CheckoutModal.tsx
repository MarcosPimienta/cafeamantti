"use client";

import React, { useState, useEffect } from "react";
import Script from "next/script";
import { X, CreditCard, ShieldCheck, Loader2, ArrowRight, AlertCircle, Truck } from "lucide-react";
import { updateUserProfile } from "@/app/(portal)/dashboard/actions";
import { createPendingOrder } from "@/app/actions/checkout";
import { calculateMetropolitanShipping, calculateOrderShippingAndTotal } from "@/utils/shipping";

// Extend the window object for ePayco
declare global {
  interface Window {
    ePayco: any;
  }
}

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  subtotal: number;
  userProfile: any;
  items: any[];
  epaycoKey: string;
  isSubscription?: boolean;
  subscriptionId?: string;
  subscriptionPlanName?: string;
  subscriptionFrequency?: string;
}

export function CheckoutModal({ 
  isOpen, 
  onClose, 
  subtotal, 
  userProfile, 
  items, 
  epaycoKey,
  isSubscription = false,
  subscriptionId,
  subscriptionPlanName,
  subscriptionFrequency = "monthly"
}: CheckoutModalProps) {
  const [cedula, setCedula] = useState(userProfile?.cedula_number || "");
  const [address, setAddress] = useState(userProfile?.address || "");
  const [city, setCity] = useState(userProfile?.city || "");
  const [department, setDepartment] = useState(userProfile?.department || "");
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);

  useEffect(() => {
    // Check if ePayco was already loaded previously
    if (typeof window !== "undefined" && window.ePayco) {
      setScriptLoaded(true);
    }
  }, []);

  if (!isOpen) return null;

  // Compute dynamic shipping logic cost
  const orderCalculation = calculateOrderShippingAndTotal(items, department, city);
  const shippingZone = calculateMetropolitanShipping(department, city);

  const finalShippingCost = isSubscription 
    ? (shippingZone.isAvailable ? shippingZone.rate : 10000)
    : orderCalculation.shippingCost;

  const finalTotalAmount = isSubscription 
    ? subtotal 
    : orderCalculation.totalAmount;

  const netCoffeeTotal = isSubscription 
    ? Math.max(0, subtotal - finalShippingCost) 
    : orderCalculation.netItemsTotal;

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!shippingZone.isAvailable) {
      setError(shippingZone.message || "Entregas disponibles actualmente solo en el Área Metropolitana (Valle de Aburrá).");
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      // 1. Update profile with the confirmed data
      const formData = new FormData();
      formData.append("cedula_number", cedula);
      formData.append("address", address);
      formData.append("city", city);
      formData.append("department", department);
      formData.append("first_name", userProfile?.first_name || "");
      formData.append("last_name", userProfile?.last_name || "");
      formData.append("phone_number", userProfile?.phone_number || "");
      
      await updateUserProfile(formData);

      let invoiceId = "";

      if (isSubscription) {
        invoiceId = subscriptionId ? `SUB-${subscriptionId}` : `SUB-${Date.now()}`;
      } else {
        // 2. Create Pending Order in Database for regular cart purchases with calculated shipping
        const orderResponse = await createPendingOrder(items, finalShippingCost, {
          address,
          city,
          state: department,
          details: ""
        });
        if (!orderResponse.success) {
          throw new Error(orderResponse.error || "No se pudo generar el pedido.");
        }
        invoiceId = orderResponse.orderId;
      }

      // Compute ePayco periodicity format for recurring charges
      let periodicity = "1 month";
      if (subscriptionFrequency === "weekly") periodicity = "7 days";
      if (subscriptionFrequency === "bi-weekly") periodicity = "14 days";

      // 3. Initialize ePayco Checkout
      if (typeof window !== "undefined" && window.ePayco) {
        const isTestMode = process.env.NEXT_PUBLIC_EPAYCO_TEST_MODE !== "false";

        const handler = window.ePayco.checkout.configure({
          key: epaycoKey,
          test: isTestMode
        });

        const data: any = {
          // Parámetros de compra
          name: isSubscription ? `Suscripción Café Amantti — ${subscriptionPlanName || "Plan Café"}` : "Compra Café Amantti",
          description: isSubscription ? `Suscripción Recurrente (${subscriptionFrequency})` : "Compra de productos en tienda",
          invoice: invoiceId,
          currency: "cop",
          amount: finalTotalAmount.toString(),
          tax_base: "0",
          tax: "0",
          country: "co",
          lang: "es",

          // Configuración de métodos de pago (Restringido solo a Tarjetas para Suscripciones)
          methods: isSubscription ? "C" : undefined,

          // Configuración del popup
          external: "false", // Modal onpage

          // Configuración de recurrencia y suscripción automática ePayco
          subscription: isSubscription ? "true" : "false",
          periodicity: isSubscription ? periodicity : undefined,

          // Parámetros extra para webhook
          extra1: subscriptionId || "",
          extra2: subscriptionFrequency || "monthly",

          // URLs de respuesta y confirmación
          response: `${window.location.origin}/checkout/response${isSubscription ? "?type=subscription" : ""}`,
          confirmation: `${window.location.origin}/api/webhooks/epayco`,

          // Atributos del cliente
          name_billing: userProfile?.first_name ? `${userProfile.first_name} ${userProfile.last_name}` : "Cliente Amantti",
          address_billing: address,
          type_doc_billing: "cc",
          mobilephone_billing: userProfile?.phone_number || "",
          number_doc_billing: cedula
        };

        handler.open(data);
        setIsProcessing(false);
      } else {
        throw new Error("El componente de pago no pudo ser cargado. Intenta de nuevo.");
      }

    } catch (err: any) {
      setError("Error al procesar la información: " + err.message);
      setIsProcessing(false);
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    }).format(price);
  };

  return (
    <>
      <Script 
        src="https://checkout.epayco.co/checkout.js" 
        strategy="lazyOnload"
        onReady={() => setScriptLoaded(true)}
      />
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="relative w-full max-w-lg bg-[#0B0B0B] text-[#F4F1ED] rounded-sm p-10 shadow-2xl border border-[#C2A878]/20 animate-in zoom-in-95 duration-300 max-h-[90vh] overflow-y-auto custom-scrollbar">
        <button 
          onClick={onClose}
          className="absolute top-8 right-8 p-2 rounded-sm hover:bg-white/5 text-white/20 hover:text-[#F4F1ED] transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="space-y-8">
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-[#C2A878]/10 rounded-sm flex items-center justify-center mb-6">
              <CreditCard className="w-8 h-8 text-[#C2A878]" strokeWidth={1.5} />
            </div>
            <h2 className="text-2xl font-serif">Confirmar Datos de Pago</h2>
            <p className="text-sm text-white/40 mt-2">Verifica tu información para el envío y facturación</p>
          </div>

          <form onSubmit={handlePayment} className="space-y-6">
            <div className="bg-[#0B0B0B] p-6 rounded-sm border border-[#C2A878]/20 space-y-3">
              <div className="flex items-center justify-between text-xs text-white/60">
                <span>Café Neto:</span>
                <span className="font-medium text-[#F4F1ED]">{formatPrice(netCoffeeTotal)}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-white/60">
                <span>Costo de Envío ({shippingZone.zoneName} — {shippingZone.radiusLabel}):</span>
                <span className="font-medium text-[#F4F1ED]">
                  {shippingZone.isAvailable ? formatPrice(finalShippingCost) : "No disponible"}
                </span>
              </div>
              <div className="pt-3 border-t border-white/10 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-widest text-white/40">
                  {isSubscription ? "Total Suscripción:" : "Total a Pagar:"}
                </span>
                <span className="font-serif text-2xl text-[#C2A878]">{formatPrice(finalTotalAmount)}</span>
              </div>
            </div>

            {isSubscription && (
              <div className="p-4 bg-[#C2A878]/10 border border-[#C2A878]/25 rounded-sm text-[#C2A878] flex items-start gap-3 animate-in fade-in duration-300">
                <CreditCard className="w-4 h-4 shrink-0 mt-0.5 text-[#C2A878]" />
                <p className="leading-relaxed">
                  <strong>Cobro Recurrente Automático:</strong> Las suscripciones requieren Tarjeta de Crédito o Débito con CVV para tokenizar y automatizar tus renovaciones periódicas sin cortes de servicio.
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 group">
                <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40 px-1">Cédula</label>
                <div className="relative">
                  <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 group-focus-within:text-[#C2A878] transition-colors" />
                  <input
                    required
                    value={cedula}
                    onChange={(e) => setCedula(e.target.value)}
                    placeholder="1029384756"
                    className="w-full pl-12 pr-4 py-3 bg-transparent border border-white/20 rounded-sm text-sm focus:outline-none focus:ring-2 focus:ring-[#C2A878]/20 transition-all text-[#F4F1ED]"
                  />
                </div>
              </div>
              <div className="space-y-2 group">
                <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40 px-1">Dirección</label>
                <input
                  required
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Calle 123 #45-67"
                  className="w-full px-4 py-3 bg-transparent border border-white/20 rounded-sm text-sm focus:outline-none focus:ring-2 focus:ring-[#C2A878]/20 transition-all text-[#F4F1ED]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 group">
                <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40 px-1">Departamento</label>
                <input
                  required
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="Antioquia"
                  className="w-full px-4 py-3 bg-transparent border border-white/20 rounded-sm text-sm focus:outline-none focus:ring-2 focus:ring-[#C2A878]/20 transition-all text-[#F4F1ED]"
                />
              </div>
              <div className="space-y-2 group">
                <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40 px-1">Ciudad</label>
                <input
                  required
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Medellín"
                  className="w-full px-4 py-3 bg-transparent border border-white/20 rounded-sm text-sm focus:outline-none focus:ring-2 focus:ring-[#C2A878]/20 transition-all text-[#F4F1ED]"
                />
              </div>
            </div>

            {department && city && (
              <div className={`p-3.5 rounded-sm text-xs flex items-start gap-3 transition-all ${
                shippingZone.isAvailable 
                  ? "bg-[#C2A878]/10 text-[#C2A878] border border-[#C2A878]/20" 
                  : "bg-red-500/10 text-red-400 border border-red-500/20"
              }`}>
                <Truck className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="leading-tight">
                  {shippingZone.isAvailable ? (
                    <p>
                      <strong>{shippingZone.zoneName}</strong> ({shippingZone.radiusLabel}): Tarifa de transporte de {formatPrice(shippingZone.rate)} COP.
                    </p>
                  ) : (
                    <p>{shippingZone.message || "Entregas disponibles únicamente en el Área Metropolitana (Valle de Aburrá)."}</p>
                  )}
                </div>
              </div>
            )}

            {error && (
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-sm flex items-start gap-3 text-red-400 animate-in shake-1">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <p className="text-xs font-medium">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isProcessing || !cedula || !address || !city || !department || !scriptLoaded || !shippingZone.isAvailable}
              className="w-full py-5 bg-[#C2A878] text-[#0B0B0B] text-xs font-bold uppercase tracking-[0.2em] rounded-sm hover:bg-[#F4F1ED] transition-all shadow-xl flex items-center justify-center gap-3 disabled:opacity-50 group"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Conectando con ePayco...
                </>
              ) : !scriptLoaded ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Cargando pasarela...
                </>
              ) : !shippingZone.isAvailable ? (
                <>
                  Zona Fuera de Cobertura
                </>
              ) : (
                <>
                  Pagar con ePayco ({formatPrice(finalTotalAmount)})
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </>
              )}
            </button>
          </form>

          <div className="flex items-center justify-center gap-2 text-[9px] text-white/20 uppercase tracking-widest font-bold">
            <ShieldCheck className="w-3 h-3" />
            Transacción Segura y Encriptada
          </div>
        </div>
      </div>
    </div>
    </>
  );
}

