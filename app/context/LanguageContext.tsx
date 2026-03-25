"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { en, type TranslationKey } from "@/app/dictionaries/en";
import { es } from "@/app/dictionaries/es";

export type Locale = "en" | "es";

const dictionaries: Record<Locale, Record<TranslationKey, string>> = { en, es };

interface LanguageContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("es");

  // Hydrate from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem("locale") as Locale | null;
    if (stored && (stored === "en" || stored === "es")) {
      setLocaleState(stored);
      document.cookie = `NEXT_LOCALE=${stored}; path=/; max-age=31536000`;
    }
  }, []);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    localStorage.setItem("locale", newLocale);
    document.cookie = `NEXT_LOCALE=${newLocale}; path=/; max-age=31536000`;
  }, []);

  const t = useCallback(
    (key: TranslationKey): string => {
      return dictionaries[locale][key] ?? key;
    },
    [locale]
  );

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
