"use client";

import React, { useState } from "react";
import { X, CreditCard, ShieldCheck, Loader2, ArrowRight, AlertCircle } from "lucide-react";
import { updateUserProfile } from "@/app/(portal)/dashboard/actions";

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  subtotal: number;
  userProfile: any;
}

export function CheckoutModal({ isOpen, onClose, subtotal, userProfile }: CheckoutModalProps) {
  const [cedula, setCedula] = useState(userProfile?.cedula_number || "");
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    setError(null);

    try {
      // 1. Update profile with the new/confirmed Cedula
      const formData = new FormData();
      formData.append("cedula_number", cedula);
      formData.append("first_name", userProfile?.first_name || "");
      formData.append("last_name", userProfile?.last_name || "");
      // Pass other fields if necessary to avoid wiping them
      
      await updateUserProfile(formData);

      // 2. Here we would call ePayco SDK
      // For now, we simulate the handover to ePayco
      console.log("Handing over to ePayco with Cedula:", cedula);
      
      // Example of ePayco handler (Pseudo-code)
      /*
      const handler = window.ePayco.checkout.configure({
        key: process.env.NEXT_PUBLIC_EPAYCO_PUBLIC_KEY,
        test: true
      });
      
      handler.open({
        name: "Café Amantti",
        description: "Compra de Café Especial",
        currency: "cop",
        amount: subtotal.toString(),
        tax_base: "0",
        tax: "0",
        country: "co",
        lang: "es",
        external: "false",
        extra1: userProfile.id,
        // Pre-fill user data
        name_billing: `${userProfile.first_name} ${userProfile.last_name}`,
        address_billing: userProfile.address,
        type_doc_billing: "cc",
        number_doc_billing: cedula,
        mobile_phone_billing: userProfile.phone_number,
      });
      */

      // Simulate a small delay for the "processing" look
      setTimeout(() => {
        alert("Integración de ePayco: Aquí se abriría el widget de pago pre-cargado con tu cédula: " + cedula);
        setIsProcessing(false);
      }, 1500);

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
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="relative w-full max-w-md bg-white rounded-[2.5rem] p-10 shadow-2xl border border-white/20 animate-in zoom-in-95 duration-300">
        <button 
          onClick={onClose}
          className="absolute top-8 right-8 p-2 rounded-full hover:bg-foreground/5 text-foreground/20 hover:text-foreground transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="space-y-8">
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-[#C59F59]/10 rounded-full flex items-center justify-center mb-6">
              <CreditCard className="w-8 h-8 text-[#C59F59]" strokeWidth={1.5} />
            </div>
            <h2 className="text-2xl font-serif">Finalizar Compra</h2>
            <p className="text-sm text-foreground/40 mt-2">Completa tu información de facturación para ePayco</p>
          </div>

          <form onSubmit={handlePayment} className="space-y-6">
            <div className="bg-[#fdfbf7] p-6 rounded-2xl border border-foreground/5 space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-foreground/40">Total a pagar:</span>
                <span className="font-serif text-xl text-[#C59F59]">{formatPrice(subtotal)}</span>
              </div>
            </div>

            <div className="space-y-2 group">
              <label htmlFor="checkout-cedula" className="text-[10px] font-bold uppercase tracking-[0.2em] text-foreground/40 px-1 group-focus-within:text-[#C59F59] transition-colors">
                Cédula de Ciudadanía
              </label>
              <div className="relative">
                <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/20 group-focus-within:text-[#C59F59] transition-colors" />
                <input
                  id="checkout-cedula"
                  type="text"
                  required
                  value={cedula}
                  onChange={(e) => setCedula(e.target.value)}
                  placeholder="1029384756"
                  className="w-full pl-12 pr-4 py-4 bg-[#fdfbf7] border border-foreground/10 rounded-2xl text-sm focus:outline-none focus:ring-4 focus:ring-[#C59F59]/5 focus:border-[#C59F59] transition-all"
                />
              </div>
              <p className="text-[9px] text-foreground/30 italic px-1">Requerido por ePayco para validación de identidad y facturación.</p>
            </div>

            {error && (
              <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3 text-red-600 animate-in shake-1">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <p className="text-xs font-medium">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isProcessing || !cedula}
              className="w-full py-5 bg-foreground text-background text-xs font-bold uppercase tracking-[0.2em] rounded-2xl hover:bg-[#C59F59] hover:text-white transition-all shadow-xl flex items-center justify-center gap-3 disabled:opacity-50 group"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Conectando con ePayco...
                </>
              ) : (
                <>
                  Pagar con ePayco
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </>
              )}
            </button>
          </form>

          <div className="flex items-center justify-center gap-2 text-[9px] text-foreground/20 uppercase tracking-widest font-bold">
            <ShieldCheck className="w-3 h-3" />
            Transacción Segura y Encriptada
          </div>
        </div>
      </div>
    </div>
  );
}
