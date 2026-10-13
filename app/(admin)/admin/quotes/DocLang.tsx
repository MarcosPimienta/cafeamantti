"use client";

// Language of a client document (quote, proposal, tech sheet), independent
// of the admin's own language. The document's root component provides it
// and every part of the document translates with useDocTr().

import React, { createContext, useContext } from "react";
import { translator, type Locale } from "@/utils/i18n/translate";

const DocLangContext = createContext<Locale>("es");

export function DocLangProvider({ lang, children }: { lang: Locale | undefined; children: React.ReactNode }) {
  return <DocLangContext.Provider value={lang ?? "es"}>{children}</DocLangContext.Provider>;
}

/** Translator for the document being rendered. */
export function useDocTr() {
  return translator(useContext(DocLangContext));
}
