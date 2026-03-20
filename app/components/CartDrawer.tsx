"use client";

import React from "react";
import Image from "next/image";
import { X, Plus, Minus, ShoppingBag, ArrowRight } from "lucide-react";
import { useCart } from "@/app/context/CartContext";
import { useLanguage } from "@/app/context/LanguageContext";

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CartDrawer({ isOpen, onClose }: CartDrawerProps) {
  const { items, removeItem, updateQuantity, subtotal, itemCount } = useCart();
  const { t } = useLanguage();

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    }).format(price);
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] transition-opacity duration-300"
        onClick={onClose}
      />
      
      {/* Drawer */}
      <div className={`fixed top-0 right-0 h-full w-full max-w-md bg-white z-[70] shadow-2xl flex flex-col transition-transform duration-500 ease-out ${isOpen ? "translate-x-0" : "translate-x-full"}`}>
        {/* Header */}
        <div className="p-6 border-b border-foreground/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShoppingBag className="w-5 h-5 text-[#C59F59]" />
            <h2 className="text-xl font-serif">{t("cart.title")}</h2>
            <span className="bg-[#C59F59]/10 text-[#C59F59] text-[10px] font-bold px-2 py-0.5 rounded-full">
              {itemCount} {itemCount === 1 ? t("cart.item") : t("cart.items")}
            </span>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-foreground/5 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
              <div className="w-20 h-20 bg-foreground/5 rounded-full flex items-center justify-center text-foreground/20">
                <ShoppingBag className="w-10 h-10" strokeWidth={1} />
              </div>
              <p className="text-foreground/40 font-medium">{t("cart.empty")}</p>
              <button 
                onClick={onClose}
                className="text-sm font-bold uppercase tracking-widest text-[#C59F59] hover:underline"
              >
                {t("nav.shop")}
              </button>
            </div>
          ) : (
            items.map((item) => (
              <div key={`${item.id}-${item.weight}-${item.grind}-${item.grindLevel}`} className="flex gap-4 group">
                <div className="relative w-24 h-24 bg-[#f9f7f2] rounded-2xl overflow-hidden shrink-0">
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
                      <h3 className="font-serif text-sm leading-tight">{t(item.nameKey as any)}</h3>
                      <button 
                        onClick={() => removeItem(item.id, item.weight, item.grind, item.grindLevel)}
                        className="text-foreground/20 hover:text-red-500 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="text-[10px] text-foreground/40 font-medium uppercase tracking-wider mt-1">
                      {item.weight} • {item.grind === "ground" ? `${t("products.ground")} (${t(`products.grind.${item.grindLevel}` as any)})` : t("products.wholeBean")}
                    </p>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 bg-foreground/5 rounded-lg p-1">
                      <button 
                        onClick={() => updateQuantity(item.id, item.weight, item.grind, item.grindLevel, item.quantity - 1)}
                        className="w-6 h-6 flex items-center justify-center text-foreground/40 hover:text-foreground transition-colors"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="text-xs font-bold w-4 text-center">{item.quantity}</span>
                      <button 
                        onClick={() => updateQuantity(item.id, item.weight, item.grind, item.grindLevel, item.quantity + 1)}
                        className="w-6 h-6 flex items-center justify-center text-foreground/40 hover:text-foreground transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                    <p className="text-sm font-bold text-[#C59F59]">{formatPrice(item.price * item.quantity)}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="p-6 border-t border-foreground/5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-foreground/40 text-sm">{t("cart.subtotal")}</span>
              <span className="text-2xl font-serif">{formatPrice(subtotal)}</span>
            </div>
            <button className="w-full py-4 bg-foreground text-background hover:bg-[#C59F59] hover:text-white font-bold uppercase tracking-[0.2em] text-[10px] rounded-2xl transition-all shadow-xl flex items-center justify-center gap-3 group">
              {t("cart.checkout")}
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </button>
          </div>
        )}
      </div>
    </>
  );
}
