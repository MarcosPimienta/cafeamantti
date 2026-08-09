"use client";

import React, { useState } from "react";
import Image from "next/image";
import { X, Plus, Minus, ShoppingBag, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useCart } from "@/app/context/CartContext";
import { useLanguage } from "@/app/context/LanguageContext";
import { TermsModal } from "@/app/components/TermsModal";
import { CheckoutModal } from "@/app/components/CheckoutModal";

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  profile?: any;
  epaycoKey: string;
}

export function CartDrawer({ isOpen, onClose, profile, epaycoKey }: CartDrawerProps) {
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

  if (!isOpen && !isCheckoutOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className={`fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] transition-opacity duration-300 ${isOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        onClick={onClose}
      />
      
      {/* Drawer */}
      <div className={`fixed top-0 right-0 h-full w-full max-w-md bg-[#0B0B0B] text-[#F4F1ED] z-[70] shadow-2xl flex flex-col transition-transform duration-500 ease-out border-l border-[#C2A878]/20 ${isOpen ? "translate-x-0" : "translate-x-full"}`}>
        {/* Header */}
        <div className="p-6 border-b border-[#C2A878]/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShoppingBag className="w-5 h-5 text-[#C2A878]" />
            <h2 className="text-xl font-serif">{t("cart.title")}</h2>
            <span className="bg-[#C2A878]/10 text-[#C2A878] text-[10px] font-bold px-2 py-0.5 rounded-sm border border-[#C2A878]/20">
              {itemCount} {itemCount === 1 ? t("cart.item") : t("cart.items")}
            </span>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-white/5 rounded-sm transition-colors text-white/70"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
              <div className="w-20 h-20 bg-white/5 rounded-sm flex items-center justify-center text-white/20 border border-white/10">
                <ShoppingBag className="w-10 h-10" strokeWidth={1} />
              </div>
              <p className="text-white/40 font-medium">{t("cart.empty")}</p>
              <button 
                onClick={onClose}
                className="text-sm font-bold uppercase tracking-widest text-[#C2A878] hover:underline"
              >
                {t("nav.shop")}
              </button>
            </div>
          ) : (
            items.map((item) => (
              <div key={`${item.id}-${item.weight}-${item.grind}-${item.grindLevel}`} className="flex gap-4 group">
                <div className="relative w-24 h-24 bg-[#0B0B0B] rounded-sm overflow-hidden shrink-0 border border-[#C2A878]/20">
                  <Image 
                    src={item.image} 
                    alt={t(item.nameKey as any)} 
                    fill 
                    className="object-contain p-2"
                  />
                </div>
                <div className="flex-1 flex flex-col justify-between py-1">
                  <div>
                    <div className="flex justify-between gap-2">
                      <h3 className="font-serif text-sm leading-tight text-[#F4F1ED]">{t(item.nameKey as any)}</h3>
                      <button 
                        onClick={() => removeItem(item.id, item.weight, item.grind, item.grindLevel)}
                        className="text-white/20 hover:text-red-400 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="text-[10px] text-white/40 font-medium uppercase tracking-wider mt-1">
                      {item.weight} • {item.grind === "ground" ? `${t("products.ground")} (${t(`products.grind.${item.grindLevel}` as any)})` : t("products.wholeBean")}
                    </p>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 bg-white/5 rounded-sm p-1 border border-white/10">
                      <button 
                        onClick={() => updateQuantity(item.id, item.weight, item.grind, item.grindLevel, item.quantity - 1)}
                        className="w-6 h-6 flex items-center justify-center text-white/40 hover:text-[#F4F1ED] transition-colors"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="text-xs font-bold w-4 text-center">{item.quantity}</span>
                      <button 
                        onClick={() => updateQuantity(item.id, item.weight, item.grind, item.grindLevel, item.quantity + 1)}
                        className="w-6 h-6 flex items-center justify-center text-white/40 hover:text-[#F4F1ED] transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                    <p className="text-sm font-bold text-[#C2A878]">{formatPrice(item.price * item.quantity)}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="p-6 border-t border-[#C2A878]/20 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-white/40 text-sm">{t("cart.subtotal")}</span>
              <span className="text-2xl font-serif text-[#F4F1ED]">{formatPrice(subtotal)}</span>
            </div>

            <div className="flex items-start gap-3 mt-4 mb-2">
              <input
                id="cart-terms"
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded-sm border-white/20 bg-transparent text-[#C2A878] focus:ring-[#C2A878] cursor-pointer"
              />
              <label htmlFor="cart-terms" className="text-xs text-white/60 leading-tight flex-1 cursor-pointer">
                {t("auth.terms" as any)}{" "}
                <button 
                  type="button" 
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsTermsOpen(true); }} 
                  className="font-bold text-[#C2A878] hover:underline"
                >
                  {t("auth.termsLink" as any)}
                </button>
              </label>
            </div>

            <button 
              disabled={!termsAccepted} 
              onClick={() => { setIsCheckoutOpen(true); onClose(); }}
              className="w-full py-4 bg-[#C2A878] text-[#0B0B0B] hover:bg-[#F4F1ED] hover:text-[#0B0B0B] disabled:opacity-50 disabled:hover:bg-[#C2A878] disabled:cursor-not-allowed font-bold uppercase tracking-[0.2em] text-[10px] rounded-sm transition-all shadow-xl flex items-center justify-center gap-3 group"
            >
              {t("cart.checkout")}
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </button>
          </div>
        )}
        <TermsModal isOpen={isTermsOpen} onClose={() => setIsTermsOpen(false)} />
      </div>
      
      <CheckoutModal 
        isOpen={isCheckoutOpen} 
        onClose={() => setIsCheckoutOpen(false)} 
        subtotal={subtotal}
        userProfile={profile}
        items={items}
        epaycoKey={epaycoKey}
      />
    </>
  );
}
