"use client";

import { LanguageProvider } from "@/app/context/LanguageContext";
import { CartProvider } from "@/app/context/CartContext";
import { AuthRecoveryHandler } from "@/app/components/AuthRecoveryHandler";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <LanguageProvider>
      <CartProvider>
        <AuthRecoveryHandler />
        {children}
      </CartProvider>
    </LanguageProvider>
  );
}
