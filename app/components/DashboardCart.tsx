"use client";

import React, { useState } from "react";
import Image from "next/image";
import { ShoppingBag, Plus, Minus, Trash2, ArrowRight, Coffee } from "lucide-react";
import { useCart } from "@/app/context/CartContext";
import { useLanguage } from "@/app/context/LanguageContext";
import Link from "next/link";
import { TermsModal } from "@/app/components/TermsModal";
import { CheckoutModal } from "@/app/components/CheckoutModal";

export function DashboardCart({ profile }: { profile: any }) {
  const { items, removeItem, updateQuantity, subtotal, itemCount } = useCart();
  const { t } = useLanguage();
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [isTermsOpen, setIsTermsOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    }).format(price);
  };

  return (
    <div className="bg-white rounded-3xl p-10 border border-foreground/5 shadow-xl">
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-xl font-serif flex items-center gap-3">
          <ShoppingBag className="w-5 h-5 text-[#C59F59]" />
          {t("cart.title")}
        </h2>
        {itemCount > 0 && (
          <span className="bg-[#C59F59]/10 text-[#C59F59] text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest">
            {itemCount} {itemCount === 1 ? t("cart.item") : t("cart.items")}
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-foreground/5 rounded-full flex items-center justify-center mx-auto mb-6 text-foreground/20">
            <ShoppingBag className="w-8 h-8" strokeWidth={1.5} />
          </div>
          <h3 suppressHydrationWarning className="text-lg font-serif mb-2">{t("cart.empty")}</h3>
          <p className="text-sm text-foreground/40 mb-8 max-w-xs mx-auto">Tu selección aparecerá aquí una vez que añadas productos desde la tienda.</p>
          <Link 
            href="/#tienda" 
            className="inline-flex items-center gap-2 px-8 py-4 border border-foreground/10 text-xs font-bold uppercase tracking-widest rounded-2xl hover:bg-foreground hover:text-white transition-all"
          >
            Ir a la tienda
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          <div className="space-y-6">
            {items.map((item) => (
              <div 
                key={`${item.id}-${item.weight}-${item.grind}-${item.grindLevel}`} 
                className="flex items-center gap-6 group border-b border-foreground/5 pb-6 last:border-0 last:pb-0"
              >
                <div className="relative w-20 h-20 bg-[#f9f7f0] rounded-2xl overflow-hidden shrink-0">
                  <Image 
                    src={item.image} 
                    alt={t(item.nameKey as any)} 
                    fill 
                    className="object-contain p-2"
                  />
                </div>
                
                <div className="flex-1 min-w-0">
                  <h4 suppressHydrationWarning className="font-serif text-lg mb-1 truncate">{t(item.nameKey as any)}</h4>
                  <p suppressHydrationWarning className="text-[10px] text-foreground/40 font-bold uppercase tracking-widest flex items-center gap-2">
                    <span>{item.weight}</span>
                    <span className="w-1 h-1 bg-foreground/10 rounded-full" />
                    <span>{item.grind === "ground" ? `${t("products.ground")} (${t(`products.grind.${item.grindLevel}` as any)})` : t("products.wholeBean")}</span>
                  </p>
                </div>

                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-3 bg-foreground/5 rounded-xl p-1">
                    <button 
                      onClick={() => updateQuantity(item.id, item.weight, item.grind, item.grindLevel, item.quantity - 1)}
                      className="w-8 h-8 flex items-center justify-center text-foreground/40 hover:text-foreground transition-colors"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="text-sm font-bold w-4 text-center">{item.quantity}</span>
                    <button 
                      onClick={() => updateQuantity(item.id, item.weight, item.grind, item.grindLevel, item.quantity + 1)}
                      className="w-8 h-8 flex items-center justify-center text-foreground/40 hover:text-foreground transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                  
                  <div className="text-right min-w-[100px]">
                    <p className="text-lg font-serif text-[#C59F59]">{formatPrice(item.price * item.quantity)}</p>
                  </div>

                  <button 
                    onClick={() => removeItem(item.id, item.weight, item.grind, item.grindLevel)}
                    className="p-2 text-foreground/10 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="pt-8 border-t border-foreground/5 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <p suppressHydrationWarning className="text-[10px] font-bold uppercase tracking-[0.2em] text-foreground/30 mb-1">{t("cart.subtotal")}</p>
              <p className="text-3xl font-serif text-[#C59F59]">{formatPrice(subtotal)}</p>
            </div>
            
            <div className="flex flex-col items-end gap-3">
              <div className="flex items-center gap-2">
                <input
                  id="dash-cart-terms"
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  className="w-4 h-4 rounded border-foreground/20 text-[#C59F59] focus:ring-[#C59F59] cursor-pointer"
                />
                <label htmlFor="dash-cart-terms" className="text-xs text-foreground/80 cursor-pointer">
                  {t("auth.terms" as any)}{" "}
                  <button 
                    type="button" 
                    onClick={(e) => { e.preventDefault(); setIsTermsOpen(true); }} 
                    className="font-bold text-[#C59F59] hover:underline"
                  >
                    {t("auth.termsLink" as any)}
                  </button>
                </label>
              </div>

              <button 
                disabled={!termsAccepted} 
                onClick={() => setIsCheckoutOpen(true)}
                suppressHydrationWarning 
                className="px-10 py-5 bg-foreground text-background text-[10px] font-bold uppercase tracking-[0.2em] rounded-[1.25rem] hover:bg-[#C59F59] hover:text-white disabled:opacity-50 disabled:hover:bg-foreground disabled:cursor-not-allowed transition-all shadow-xl flex items-center justify-center gap-3 group"
              >
                {t("cart.checkout")}
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </button>
            </div>
          </div>
        </div>
      )}
      <TermsModal isOpen={isTermsOpen} onClose={() => setIsTermsOpen(false)} />
      <CheckoutModal 
        isOpen={isCheckoutOpen} 
        onClose={() => setIsCheckoutOpen(false)} 
        subtotal={subtotal}
        userProfile={profile}
      />
    </div>
  );
}
