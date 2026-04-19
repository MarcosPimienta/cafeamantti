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
  const [address, setAddress] = useState(userProfile?.address || "");
  const [city, setCity] = useState(userProfile?.city || "");
  const [department, setDepartment] = useState(userProfile?.department || "");
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
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

      // 2. Simulated ePayco handover
      console.log("Handing over to ePayco with data:", { cedula, address, city, department });
      
      // Simulate delay
      setTimeout(() => {
        alert("Integración de ePayco: Se abriría el widget cargado con:\n" + 
              `CC: ${cedula}\n` +
              `Dirección: ${address}\n` +
              `Ciudad: ${city}, ${department}`);
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
      <div className="relative w-full max-w-lg bg-white rounded-[2.5rem] p-10 shadow-2xl border border-white/20 animate-in zoom-in-95 duration-300 max-h-[90vh] overflow-y-auto custom-scrollbar">
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
            <h2 className="text-2xl font-serif">Confirmar Datos de Pago</h2>
            <p className="text-sm text-foreground/40 mt-2">Verifica tu información para el envío y facturación</p>
          </div>

          <form onSubmit={handlePayment} className="space-y-6">
            <div className="bg-[#fdfbf7] p-6 rounded-2xl border border-foreground/5 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-widest text-foreground/40">Total Suscripción:</span>
              <span className="font-serif text-2xl text-[#C59F59]">{formatPrice(subtotal)}</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 group">
                <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-foreground/40 px-1">Cédula</label>
                <div className="relative">
                  <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/20 group-focus-within:text-[#C59F59] transition-colors" />
                  <input
                    required
                    value={cedula}
                    onChange={(e) => setCedula(e.target.value)}
                    placeholder="1029384756"
                    className="w-full pl-12 pr-4 py-3 bg-[#fdfbf7] border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all"
                  />
                </div>
              </div>
              <div className="space-y-2 group">
                <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-foreground/40 px-1">Dirección</label>
                <input
                  required
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Calle 123 #45-67"
                  className="w-full px-4 py-3 bg-[#fdfbf7] border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 group">
                <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-foreground/40 px-1">Departamento</label>
                <input
                  required
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="Cundinamarca"
                  className="w-full px-4 py-3 bg-[#fdfbf7] border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all"
                />
              </div>
              <div className="space-y-2 group">
                <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-foreground/40 px-1">Ciudad</label>
                <input
                  required
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Bogotá"
                  className="w-full px-4 py-3 bg-[#fdfbf7] border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all"
                />
              </div>
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
