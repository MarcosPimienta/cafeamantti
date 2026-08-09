'use client';

import { useState, useTransition } from 'react';
import { Coffee, Package, Calendar, Loader2, AlertTriangle, X, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { deleteSubscription } from '@/app/(shop)/builder/actions';

interface Subscription {
  id: string;
  plan_id: string;
  weight: string;
  grind: string;
  frequency: string;
  next_delivery_date: string;
  shipping_address?: string;
  shipping_city?: string;
  shipping_state?: string;
  shipping_details?: string;
}

export function SubscriptionCard({ subscription }: { subscription: Subscription }) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [isDeleted, setIsDeleted] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleDelete = () => {
    setErrorMsg(null);
    startTransition(async () => {
      try {
        const result = await deleteSubscription(subscription.id);
        if (result?.error) {
          setErrorMsg(result.error);
          return;
        }
        setIsDeleted(true);
      } catch (error: any) {
        console.error(error);
        setErrorMsg(error.message || "Error al cancelar la suscripción");
      }
    });
  };

  if (isDeleted) {
    return (
      <div className="bg-[#C2A878]/10 border border-[#C2A878]/20 rounded-sm p-10 flex flex-col items-center text-center animate-in fade-out zoom-out-95 duration-1000 fill-mode-forwards">
        <CheckCircle2 className="w-12 h-12 text-[#C2A878] mb-4" />
        <h3 className="text-xl font-serif text-[#C2A878] mb-1">Suscripción Cancelada</h3>
        <p className="text-sm text-white/60">Tu plan ha sido eliminado correctamente.</p>
      </div>
    );
  }

  const getProductName = (planId: string) => {
    switch (planId) {
      case 'essential':
      case 'traditional':
      case 'firma':
        return 'Selección Amantti';
      case 'alchemy':
      case 'honey':
        return 'Honey Process';
      case 'curator':
      case 'microlot':
        return 'Microlote del Mes';
      case 'custom':
        return 'Suscripción Personalizada';
      default:
        return planId;
    }
  };

  return (
    <>
      <div className="space-y-8">
        <div className="flex flex-col md:flex-row md:items-start gap-8">
          <div className="relative w-full md:w-32 h-40 bg-[#0B0B0B] rounded-sm flex items-center justify-center p-6 border border-[#C2A878]/20 overflow-hidden group">
            {subscription.plan_id === 'essential' && (
              <div className="relative w-full h-full transition-transform duration-500 group-hover:scale-110">
                <Image
                  src="/images/Front_Paper_Traditional_Coffee_Bag.png"
                  alt="Amantti Traditional Bag"
                  fill
                  className="object-contain drop-shadow-xl"
                />
              </div>
            )}
            {subscription.plan_id === 'alchemy' && (
              <div className="relative w-full h-full transition-transform duration-500 group-hover:scale-110 scale-90">
                <Image
                  src="/images/Front_Paper_Traditional_Coffee_Bag.png"
                  alt="Amantti Traditional Bag"
                  fill
                  className="object-contain drop-shadow-lg -rotate-12 -translate-x-3 translate-y-1 opacity-90"
                />
                <Image
                  src="/images/Front_White_Honey_Coffee_Bag.png"
                  alt="Amantti Honey Bag"
                  fill
                  className="object-contain drop-shadow-2xl rotate-6 translate-x-3 -translate-y-1"
                />
              </div>
            )}
            {subscription.plan_id === 'curator' && (
              <div className="relative w-full h-full transition-transform duration-500 group-hover:scale-110 scale-[0.8]">
                <Image
                  src="/images/Front_Paper_Traditional_Coffee_Bag.png"
                  alt="Amantti Traditional Bag"
                  fill
                  className="object-contain drop-shadow-xl -rotate-[20deg] -translate-x-6 translate-y-2 opacity-80"
                />
                <Image
                  src="/images/Front_White_Honey_Coffee_Bag.png"
                  alt="Amantti Honey Bag"
                  fill
                  className="object-contain drop-shadow-xl rotate-[20deg] translate-x-6 translate-y-2 opacity-80"
                />
                <Image
                  src="/images/Amantti_Coffee_Bag.png"
                  alt="Amantti Microlot Bag"
                  fill
                  className="object-contain drop-shadow-[0_10px_20px_rgba(0,0,0,0.4)] scale-110 brightness-110 z-10"
                />
              </div>
            )}
            {!['essential', 'alchemy', 'curator'].includes(subscription.plan_id) && (
              <>
                <Coffee className="w-8 h-8 text-[#C2A878] opacity-20 absolute" />
                <Package className="w-12 h-12 text-white/10" />
              </>
            )}
          </div>
          <div className="flex-1 space-y-6">
            <div>
              <h3 className="text-3xl font-serif mb-2 text-[#F4F1ED]">{getProductName(subscription.plan_id)}</h3>
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center gap-2 text-sm text-white/60 px-3 py-1 bg-white/5 rounded-sm">
                  <Package className="w-3.5 h-3.5" />
                  <span>{subscription.weight} • {subscription.grind === 'whole' ? 'Grano' : 'Molido'}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-white/60 px-3 py-1 bg-white/5 rounded-sm">
                  <Calendar className="w-3.5 h-3.5" />
                  <span className="capitalize">{subscription.frequency}</span>
                </div>
              </div>
            </div>

            {subscription.shipping_address && (
              <div className="p-4 bg-transparent border border-[#C2A878]/20 rounded-sm space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#C2A878]">Dirección de Entrega</p>
                <p className="text-sm font-medium text-[#F4F1ED]">
                  {subscription.shipping_address}
                  {subscription.shipping_details && `, ${subscription.shipping_details}`}
                </p>
                <p className="text-xs text-white/40 italic">
                  {subscription.shipping_city}, {subscription.shipping_state}
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="pt-8 border-t border-[#C2A878]/20 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-1 text-center sm:text-left">Próximo Envío</p>
            <p suppressHydrationWarning className="font-medium text-[#F4F1ED] text-center sm:text-left">
              {new Date(subscription.next_delivery_date).toLocaleDateString('es-CO', { day: 'numeric', month: 'long' })}
            </p>
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <Link 
              href={`/builder?id=${subscription.id}`} 
              className="flex-1 sm:flex-none text-center px-8 py-4 bg-[#C2A878] text-[#0B0B0B] text-xs font-bold uppercase tracking-widest rounded-sm hover:bg-[#F4F1ED] transition-all"
            >
              Gestionar
            </Link>
            <button 
              onClick={() => setShowConfirm(true)}
              suppressHydrationWarning
              className="flex-1 sm:flex-none px-8 py-4 border border-red-500/20 text-red-400 text-xs font-bold uppercase tracking-widest rounded-sm hover:bg-red-500/10 transition-all font-bold"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="relative w-full max-w-sm bg-[#0B0B0B] rounded-sm p-8 shadow-2xl border border-[#C2A878]/20 animate-in zoom-in-95 duration-300">
            <button 
              onClick={() => setShowConfirm(false)}
              className="absolute top-6 right-6 p-2 rounded-sm hover:bg-white/5 text-white/30 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-red-500/10 rounded-sm flex items-center justify-center mb-6">
                <AlertTriangle className="w-8 h-8 text-red-400" strokeWidth={1.5} />
              </div>
              
              <h3 className="text-xl font-serif mb-2 text-[#F4F1ED]">¿Cancelar suscripción?</h3>
              <p className="text-sm text-white/40 mb-8 max-w-[240px]">
                Esta acción eliminará tu {subscription.plan_id} de forma permanente. No recibirás más entregas de este plan.
              </p>

              {errorMsg && (
                <div className="w-full mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-sm flex items-start gap-3 text-red-400 animate-in fade-in slide-in-from-top-1">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <p className="text-xs font-medium text-left">{errorMsg}</p>
                </div>
              )}

              <div className="w-full flex flex-col gap-3">
                <button
                  onClick={handleDelete}
                  disabled={isPending}
                  className="w-full py-4 bg-red-500/20 text-red-400 border border-red-500/20 text-xs font-bold uppercase tracking-widest rounded-sm hover:bg-red-500/30 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Procesando...
                    </>
                  ) : (
                    "Confirmar Cancelación"
                  )}
                </button>
                <button
                  onClick={() => setShowConfirm(false)}
                  disabled={isPending}
                  className="w-full py-4 text-xs font-bold uppercase tracking-widest text-white/40 hover:text-[#F4F1ED] transition-colors"
                >
                  Mantener suscripción
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
