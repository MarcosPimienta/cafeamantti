"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { CheckCircle2, XCircle, Loader2, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useCart } from "@/app/context/CartContext";

function CheckoutResponseContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { clearCart } = useCart();
  const [status, setStatus] = useState<"loading" | "success" | "error" | "pending">("loading");
  const [txData, setTxData] = useState<any>(null);

  useEffect(() => {
    const ref_payco = searchParams.get("ref_payco");
    
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
  }, [searchParams, clearCart]);

  return (
    <div className="min-h-[80vh] flex items-center justify-center py-20 px-4">
      <div className="max-w-md w-full bg-white p-10 rounded-3xl shadow-xl border border-foreground/5 text-center">
        {status === "loading" && (
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-12 h-12 text-[#C59F59] animate-spin" />
            <h1 className="text-2xl font-serif">Verificando tu pago...</h1>
            <p className="text-sm text-foreground/40">Por favor espera un momento.</p>
          </div>
        )}

        {status === "success" && (
          <div className="flex flex-col items-center gap-6 animate-in zoom-in duration-500">
            <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10 text-green-500" />
            </div>
            <div>
              <h1 className="text-2xl font-serif text-foreground mb-2">¡Pago Exitoso!</h1>
              <p className="text-sm text-foreground/60">
                Tu pedido <strong>#{txData?.x_id_invoice}</strong> ha sido confirmado.
                Te enviamos los detalles a tu correo electrónico.
              </p>
            </div>
            
            <Link 
              href="/dashboard"
              className="mt-4 w-full py-4 bg-foreground text-background text-xs font-bold uppercase tracking-[0.2em] rounded-2xl hover:bg-[#C59F59] hover:text-white transition-all shadow-lg flex items-center justify-center gap-3 group"
            >
              Ir a mi panel
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        )}

        {status === "pending" && (
          <div className="flex flex-col items-center gap-6 animate-in zoom-in duration-500">
            <div className="w-20 h-20 bg-yellow-50 rounded-full flex items-center justify-center">
              <Loader2 className="w-10 h-10 text-yellow-500 animate-spin" />
            </div>
            <div>
              <h1 className="text-2xl font-serif text-foreground mb-2">Pago Pendiente</h1>
              <p className="text-sm text-foreground/60">
                Tu pago está en proceso de validación por parte de tu banco.
                Te notificaremos cuando se apruebe.
              </p>
            </div>
            
            <Link 
              href="/dashboard"
              className="mt-4 w-full py-4 bg-foreground text-background text-xs font-bold uppercase tracking-[0.2em] rounded-2xl hover:bg-[#C59F59] hover:text-white transition-all shadow-lg flex items-center justify-center gap-3 group"
            >
              Ir a mi panel
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        )}

        {status === "error" && (
          <div className="flex flex-col items-center gap-6 animate-in zoom-in duration-500">
            <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center">
              <XCircle className="w-10 h-10 text-red-500" />
            </div>
            <div>
              <h1 className="text-2xl font-serif text-foreground mb-2">Pago Rechazado</h1>
              <p className="text-sm text-foreground/60">
                Hubo un problema al procesar tu pago o fue rechazado por la entidad bancaria.
              </p>
              {txData?.x_response_reason_text && (
                <p className="text-xs font-medium text-red-500 mt-2 bg-red-50 p-2 rounded-lg">
                  {txData.x_response_reason_text}
                </p>
              )}
            </div>
            
            <button 
              onClick={() => router.push("/dashboard")}
              className="mt-4 w-full py-4 border border-foreground/10 text-foreground text-xs font-bold uppercase tracking-[0.2em] rounded-2xl hover:bg-foreground hover:text-white transition-all flex items-center justify-center gap-3 group"
            >
              Volver al inicio
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CheckoutResponsePage() {
  return (
    <Suspense fallback={
      <div className="min-h-[80vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#C59F59] animate-spin" />
      </div>
    }>
      <CheckoutResponseContent />
    </Suspense>
  );
}
