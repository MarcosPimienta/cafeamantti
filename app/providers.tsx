"use client";

import { LanguageProvider } from "@/app/context/LanguageContext";
import { CartProvider } from "@/app/context/CartContext";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <LanguageProvider>
      <CartProvider>
        {children}
      </CartProvider>
    </LanguageProvider>
  );
}
