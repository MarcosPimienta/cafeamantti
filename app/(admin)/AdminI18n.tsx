"use client";

// Admin language for client components. The admin layout reads the
// NEXT_LOCALE cookie on the server and passes it here, so the first render
// is already in the right language (no flash, no hydration mismatch).

import React, { createContext, useContext, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";
import { LOCALE_COOKIE, translator, type Locale, type Translator } from "@/utils/i18n/translate";

const Ctx = createContext<{ tr: Translator; setLocale: (l: Locale) => void } | null>(null);

export function AdminI18nProvider({ locale: initial, children }: { locale: Locale; children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initial);
  const [lastInitial, setLastInitial] = useState(initial);
  // Follow the server when it re-renders with another cookie.
  if (initial !== lastInitial) {
    setLastInitial(initial);
    setLocaleState(initial);
  }
  const router = useRouter();
  const [, startTransition] = useTransition();
  const value = useMemo(() => {
    const setLocale = (l: Locale) => {
      setLocaleState(l);
      document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=31536000`;
      try {
        localStorage.setItem("locale", l); // the storefront's switch reads this
      } catch {
        // storage blocked: the cookie is enough
      }
      // Server components (pages, tables) re-render in the new language.
      startTransition(() => router.refresh());
    };
    return { tr: translator(locale), setLocale };
  }, [locale, router]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** tr("Guardar") → "Save" in English; tr.msg(serverMessage) for finished messages. */
export function useTr(): Translator {
  const ctx = useContext(Ctx);
  // Outside the admin (tests, storefront): Spanish, as written.
  return ctx?.tr ?? translator("es");
}

export function LanguageSwitch({ className = "" }: { className?: string }) {
  const ctx = useContext(Ctx);
  const tr = useTr();
  if (!ctx) return null;
  return (
    <div className={`flex items-center gap-2 ${className}`} role="group" aria-label={tr("Idioma")}>
      <Languages className="w-4 h-4 text-foreground/40 shrink-0" />
      {(["es", "en"] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => ctx.setLocale(l)}
          aria-pressed={tr.locale === l}
          className={`px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-widest transition-colors ${
            tr.locale === l ? "bg-[#C59F59] text-white" : "text-foreground/50 hover:bg-foreground/5"
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

/** ES/EN choice for a client document (PDF), independent of the admin's language. */
export function DocLanguagePicker({ value, onChange, className = "" }: { value: Locale; onChange: (l: Locale) => void; className?: string }) {
  const tr = useTr();
  return (
    <div className={`flex items-center gap-1.5 ${className}`} role="group" aria-label={tr("Idioma del documento")}>
      <span className="text-[10px] font-bold uppercase tracking-widest text-foreground/40">{tr("Idioma del documento")}</span>
      {(["es", "en"] as const).map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={value === l}
          onClick={() => onChange(l)}
          className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${value === l ? "bg-[#C59F59] text-white" : "text-foreground/50 hover:bg-foreground/5"}`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
