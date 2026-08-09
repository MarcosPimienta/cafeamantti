"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  ArrowRight, 
  Coffee, 
  Calendar, 
  Package, 
  RefreshCw, 
  HelpCircle,
  ShieldAlert,
  Sparkles
} from "lucide-react";
import Link from "next/link";
import { useCart } from "@/app/context/CartContext";

function CheckoutResponseContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { clearCart } = useCart();
  const [status, setStatus] = useState<"loading" | "success" | "error" | "pending">("loading");
  const [txData, setTxData] = useState<any>(null);
  const [isSubscription, setIsSubscription] = useState(false);

  const mockStatus = searchParams.get("mock_status");
  const mockType = searchParams.get("type");
  const ref_payco = searchParams.get("ref_payco");
  const hasProcessed = useRef(false);

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    // Enable Mock Test Harness for Developers / Testers
    if (mockStatus) {
      const isSub = mockType === "subscription" || true;
      setIsSubscription(isSub);

      const mockData = {
        x_id_invoice: isSub ? "SUB-MOCK-8842" : "INV-MOCK-1049",
        x_ref_payco: "89410294",
        x_amount: "48000",
        x_currency_code: "COP",
        x_response_reason_text: mockStatus === "error" 
          ? "Transacción rechazada: Fondos insuficientes en la tarjeta de crédito o débito." 
          : undefined,
        plan_name: "Alquimia & Contraste",
        frequency_label: "Quincenal",
        weight: "500g",
        grind: "Molido (Espresso)",
        next_delivery: "15 de Agosto, 2026",
      };

      setTxData(mockData);

      if (mockStatus === "success") {
        setStatus("success");
        clearCart();
      } else if (mockStatus === "pending") {
        setStatus("pending");
      } else {
        setStatus("error");
      }
      return;
    }

    if (!ref_payco) {
      setStatus("error");
      return;
    }

    const verifyTransaction = async () => {
      try {
        const response = await fetch(`https://secure.epayco.co/validation/v1/reference/${ref_payco}`);
        const data = await response.json();

        if (data.success && data.data) {
          setTxData(data.data);
          const stateCode = data.data.x_cod_transaction_state;
          const invoiceStr = String(data.data.x_id_invoice || "").toUpperCase();
          setIsSubscription(invoiceStr.startsWith("SUB") || mockType === "subscription");

          if (stateCode === 1) { // Aceptada
            setStatus("success");
            clearCart();
          } else if (stateCode === 3) { // Pendiente
            setStatus("pending");
            clearCart();
          } else { // Rechazada, Fallida, Reversada, etc
            setStatus("error");
          }
        } else {
          setStatus("error");
        }
      } catch (err) {
        console.error("Error verifying transaction:", err);
        setStatus("error");
      }
    };

    verifyTransaction();
  }, [mockStatus, mockType, ref_payco, clearCart]);

  const formatCurrency = (val: string | number) => {
    const num = typeof val === "string" ? parseFloat(val) : val;
    if (isNaN(num)) return "$48.000 COP";
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0
    }).format(num);
  };

  return (
    <div className="min-h-[85vh] flex items-center justify-center py-16 px-4 bg-[#0B0B0B]">
      <div className="max-w-lg w-full bg-[#0B0B0B] p-8 md:p-10 rounded-sm shadow-2xl border border-[#C2A878]/20 text-center transition-all duration-300">
        
        {/* Banner indicator when using Mock Mode */}
        {searchParams.get("mock_status") && (
          <div className="mb-6 py-1.5 px-4 bg-[#C59F59]/10 text-[#C59F59] rounded-full text-[10px] font-bold uppercase tracking-widest inline-flex items-center gap-2">
            <Sparkles className="w-3 h-3" />
            Modo de Prueba Visual Directo (`mock_status=${searchParams.get("mock_status")}`)
          </div>
        )}

        {status === "loading" && (
          <div className="flex flex-col items-center gap-4 py-8">
            <Loader2 className="w-12 h-12 text-[#C2A878] animate-spin" />
            <h1 className="text-2xl font-serif text-[#F4F1ED]">Verificando tu transacción...</h1>
            <p className="text-sm text-white/40">Por favor espera un momento mientras conectamos con la pasarela.</p>
          </div>
        )}

        {status === "success" && (
          <div className="flex flex-col items-center gap-6 animate-in zoom-in duration-500">
            <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center ring-8 ring-green-50/50">
              <CheckCircle2 className="w-10 h-10 text-green-500" />
            </div>

            <div>
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#C2A878] bg-[#C2A878]/10 px-3 py-1 rounded-sm border border-[#C2A878]/20">
                {isSubscription ? "¡Suscripción Activada!" : "¡Pago Exitoso!"}
              </span>
              <h1 className="text-3xl font-serif text-[#F4F1ED] mt-3 mb-2">
                {isSubscription ? "¡Bienvenido al Club Café Amantti!" : "¡Gracias por tu compra!"}
              </h1>
              <p className="text-xs text-white/60 leading-relaxed max-w-sm mx-auto">
                Tu transacción <strong>#{txData?.x_id_invoice || "INV-001"}</strong> ha sido confirmada satisfactoriamente.
              </p>
            </div>

            {/* Subscription Detail Card */}
            {isSubscription && (
              <div className="w-full bg-[#0B0B0B] p-6 rounded-sm border border-[#C2A878]/20 text-left space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-[#C2A878]/20">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#F4F1ED]">
                    <Coffee className="w-4 h-4 text-[#C2A878]" />
                    <span>
                      {(() => {
                        const raw = txData?.plan_name || "";
                        const lower = raw.toLowerCase();
                        if (lower.includes("essential") || lower.includes("devoción") || lower.includes("devocion") || lower.includes("firma")) return "Selección Amantti";
                        if (lower.includes("alchemy") || lower.includes("alquimia") || lower.includes("honey")) return "Honey Process";
                        if (lower.includes("curator") || lower.includes("curaduría") || lower.includes("curaduria") || lower.includes("microlot")) return "Microlote del Mes";
                        if (lower.includes("custom") || lower.includes("crea tu") || lower.includes("personalizada")) return "Suscripción Personalizada";
                        return raw.replace(/^Plan\s+/i, "") || "Selección Amantti";
                      })()}
                    </span>
                  </div>
                  <span className="text-xs font-serif text-[#C2A878] font-bold">
                    {formatCurrency(txData?.x_amount || 35000)} / envío
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-white/40 block">Frecuencia</span>
                    <span className="font-medium text-[#F4F1ED]">{txData?.frequency_label || "Quincenal"}</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-white/40 block">Presentación</span>
                    <span className="font-medium text-[#F4F1ED]">{txData?.weight || "500g"} • {txData?.grind || "Grano"}</span>
                  </div>
                </div>

                <div className="pt-3 border-t border-[#C2A878]/20 flex items-center gap-2 text-xs text-white/70">
                  <Calendar className="w-4 h-4 text-[#C2A878] shrink-0" />
                  <span>Primer envío estimado: <strong>{txData?.next_delivery || "Próximos 3 días hábiles"}</strong></span>
                </div>
              </div>
            )}

            <div className="w-full space-y-3 pt-2">
              <Link 
                href="/dashboard?tab=overview"
                className="w-full py-4 bg-[#C2A878] text-[#0B0B0B] text-xs font-bold uppercase tracking-[0.2em] rounded-sm hover:bg-[#F4F1ED] transition-all flex items-center justify-center gap-3 group"
              >
                Ir a Mi Panel de Suscripciones
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </Link>
              
              <Link
                href="/dashboard?tab=orders"
                className="w-full py-3 bg-transparent text-white/60 text-xs font-medium hover:text-[#F4F1ED] transition-colors flex items-center justify-center gap-2"
              >
                <Package className="w-4 h-4 text-white/40" />
                Ver historial de pedidos
              </Link>
            </div>
          </div>
        )}

        {status === "pending" && (
          <div className="flex flex-col items-center gap-6 animate-in zoom-in duration-500">
            <div className="w-20 h-20 bg-yellow-50 rounded-full flex items-center justify-center ring-8 ring-yellow-50/50">
              <Loader2 className="w-10 h-10 text-yellow-500 animate-spin" />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-yellow-500 bg-yellow-500/10 px-3 py-1 rounded-sm border border-yellow-500/20">
                En Validación Bancaria
              </span>
              <h1 className="text-2xl font-serif text-[#F4F1ED] mt-3 mb-2">Pago Pendiente de Aprobación</h1>
              <p className="text-xs text-white/60 leading-relaxed max-w-sm mx-auto">
                Tu entidad bancaria está procesando la solicitud. Te notificaremos por correo electrónico una vez recibamos la confirmación oficial.
              </p>
            </div>

            <div className="w-full bg-[#0B0B0B] p-5 rounded-sm border border-[#C2A878]/20 text-xs text-white/60 text-left space-y-2">
              <div className="flex justify-between">
                <span>Referencia ePayco:</span>
                <strong className="font-mono">{txData?.x_ref_payco || "Pendiente"}</strong>
              </div>
              <div className="flex justify-between">
                <span>Monto:</span>
                <strong>{formatCurrency(txData?.x_amount || 0)}</strong>
              </div>
            </div>

            <Link 
              href="/dashboard"
              className="w-full py-4 bg-[#C2A878] text-[#0B0B0B] text-xs font-bold uppercase tracking-[0.2em] rounded-sm hover:bg-[#F4F1ED] transition-all flex items-center justify-center gap-3 group"
            >
              Ir a Mi Panel
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        )}

        {status === "error" && (
          <div className="flex flex-col items-center gap-6 animate-in zoom-in duration-500">
            <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center ring-8 ring-red-50/50">
              <XCircle className="w-10 h-10 text-red-500" />
            </div>

            <div>
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-400 bg-red-500/10 px-3 py-1 rounded-sm border border-red-500/20">
                Transacción No Completada
              </span>
              <h1 className="text-2xl font-serif text-[#F4F1ED] mt-3 mb-2">Pago Rechazado o Cancelado</h1>
              <p className="text-xs text-white/60 leading-relaxed max-w-sm mx-auto">
                No pudimos procesar el cobro de tu {isSubscription ? "suscripción de café" : "pedido"}. Tu tarjeta no ha sido cargada.
              </p>
            </div>

            {/* Error detail box */}
            <div className="w-full p-4 bg-red-500/10 border border-red-500/20 rounded-sm text-left flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-[11px] font-bold text-red-400 uppercase tracking-wider">Motivo informado por el banco</p>
                <p className="text-xs text-red-300 font-medium mt-0.5">
                  {txData?.x_response_reason_text || "Transacción declinada o cancelada por la entidad financiera. Verifica tus datos de facturación e intenta de nuevo."}
                </p>
              </div>
            </div>

            <div className="w-full space-y-3">
              <button 
                onClick={() => router.push("/builder")}
                className="w-full py-4 bg-[#C2A878] text-[#0B0B0B] text-xs font-bold uppercase tracking-[0.2em] rounded-sm hover:bg-[#F4F1ED] transition-all flex items-center justify-center gap-3 group"
              >
                <RefreshCw className="w-4 h-4" />
                Reintentar Pago / Configurar Suscripción
              </button>

              <a
                href="https://wa.me/573000000000?text=Hola,%20tuve%20un%20inconveniente%20con%20el%20pago%20de%20mi%20suscripción"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3 bg-transparent border border-white/20 text-[#F4F1ED] text-xs font-bold uppercase tracking-widest rounded-sm hover:bg-white/5 transition-all flex items-center justify-center gap-2"
              >
                <HelpCircle className="w-4 h-4 text-[#C2A878]" />
                Contactar a Soporte Café Amantti
              </a>

              <button 
                onClick={() => router.push("/dashboard")}
                className="w-full py-2 text-xs text-white/40 hover:text-white transition-colors"
              >
                Volver al Panel Principal
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

export default function CheckoutResponsePage() {
  return (
    <Suspense fallback={
      <div className="min-h-[80vh] flex items-center justify-center bg-[#0B0B0B]">
        <Loader2 className="w-8 h-8 text-[#C2A878] animate-spin" />
      </div>
    }>
      <CheckoutResponseContent />
    </Suspense>
  );
}

