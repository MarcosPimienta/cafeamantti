'use client';

import { useState, useTransition } from 'react';
import { Coffee, Package, Calendar, Loader2, AlertTriangle, X, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { deleteSubscription } from '@/app/(shop)/builder/actions';

interface Subscription {
  id: string;
  plan_id: string;
  weight: string;
  grind: string;
  frequency: string;
  next_delivery_date: string;
}

export function SubscriptionCard({ subscription }: { subscription: Subscription }) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [isDeleted, setIsDeleted] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleDelete = () => {
    startTransition(async () => {
      try {
        await deleteSubscription(subscription.id);
        setIsDeleted(true);
        // After showing success for a bit, it will vanish from the dashboard 
        // because of the revalidatePath in the action + server-side refresh
      } catch (error) {
        console.error(error);
        setShowConfirm(false);
      }
    });
  };

  if (isDeleted) {
    return (
      <div className="bg-green-50/50 border border-green-100 rounded-3xl p-10 flex flex-col items-center text-center animate-in fade-out zoom-out-95 duration-1000 fill-mode-forwards">
        <CheckCircle2 className="w-12 h-12 text-green-500 mb-4" />
        <h3 className="text-xl font-serif text-green-800 mb-1">Suscripción Cancelada</h3>
        <p className="text-sm text-green-600/60">Tu plan ha sido eliminado correctamente.</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-8">
        <div className="flex items-start gap-8">
          <div className="relative w-24 h-32 bg-[#fdfbf7] rounded-2xl flex items-center justify-center p-4 shadow-inner ring-1 ring-black/5">
            <Coffee className="w-8 h-8 text-[#C59F59] opacity-20 absolute" />
            <Package className="w-12 h-12 text-foreground/10" />
          </div>
          <div className="flex-1">
            <h3 className="text-2xl font-serif mb-2 capitalize">Plan {subscription.plan_id}</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-2 text-sm text-foreground/60">
                <Package className="w-4 h-4" />
                <span>{subscription.weight} • {subscription.grind === 'whole' ? 'Grano' : 'Molido'}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-foreground/60">
                <Calendar className="w-4 h-4" />
                <span className="capitalize">{subscription.frequency}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="pt-8 border-t border-foreground/5 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-foreground/30 mb-1">Próximo Envío</p>
            <p suppressHydrationWarning className="font-medium">
              {new Date(subscription.next_delivery_date).toLocaleDateString('es-CO', { day: 'numeric', month: 'long' })}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link 
              href="/builder" 
              className="px-6 py-3 bg-foreground text-background text-xs font-bold uppercase tracking-widest rounded-xl hover:bg-[#C59F59] transition-all"
            >
              Gestionar
            </Link>
            <button 
              onClick={() => setShowConfirm(true)}
              suppressHydrationWarning
              className="px-6 py-3 border border-red-100 text-red-400 text-xs font-bold uppercase tracking-widest rounded-xl hover:bg-red-50 transition-all font-bold"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="relative w-full max-w-sm bg-white rounded-[2rem] p-8 shadow-2xl border border-white/20 animate-in zoom-in-95 duration-300">
            <button 
              onClick={() => setShowConfirm(false)}
              className="absolute top-6 right-6 p-2 rounded-full hover:bg-foreground/5 text-foreground/30 hover:text-foreground transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-6">
                <AlertTriangle className="w-8 h-8 text-red-500" strokeWidth={1.5} />
              </div>
              
              <h3 className="text-xl font-serif mb-2">¿Cancelar suscripción?</h3>
              <p className="text-sm text-foreground/40 mb-8 max-w-[240px]">
                Esta acción eliminará tu {subscription.plan_id} de forma permanente. No recibirás más entregas de este plan.
              </p>

              <div className="w-full flex flex-col gap-3">
                <button
                  onClick={handleDelete}
                  disabled={isPending}
                  className="w-full py-4 bg-red-500 text-white text-xs font-bold uppercase tracking-widest rounded-2xl hover:bg-red-600 transition-all shadow-lg shadow-red-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
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
                  className="w-full py-4 text-xs font-bold uppercase tracking-widest text-foreground/40 hover:text-foreground transition-colors"
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
