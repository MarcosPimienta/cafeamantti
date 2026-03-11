"use client";

import { LanguageProvider } from "@/app/context/LanguageContext";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return <LanguageProvider>{children}</LanguageProvider>;
}
