// Admin translations. The Spanish text is the key: code keeps writing
// Spanish (tr("Guardar")), and in English the dictionary gives "Save".
// Placeholders like {n} are filled the same way in both languages.
//
// Messages that arrive already written (server errors such as
// `Escribe lo que cobras por bolsa en Bolsa 250.`) are translated by
// matching the dictionary's templates ("Escribe lo que cobras por bolsa en
// {name}.") and carrying the values over.

import { EN } from "./en";

export type Locale = "es" | "en";
export const LOCALES: Locale[] = ["es", "en"];
export const LOCALE_COOKIE = "NEXT_LOCALE";

export type Vars = Record<string, string | number | null | undefined>;

export function isLocale(v: unknown): v is Locale {
  return v === "es" || v === "en";
}

function fill(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, k) => (k in vars && vars[k] !== null && vars[k] !== undefined ? String(vars[k]) : m));
}

/** `text` (Spanish) in `locale`, with {placeholders} filled from `vars`. */
export function translate(locale: Locale, text: string, vars?: Vars): string {
  if (locale === "es") return fill(text, vars);
  return fill(EN[text] ?? text, vars);
}

type Template = { re: RegExp; names: string[]; en: string };
let templates: Template[] | null = null;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function compiledTemplates(): Template[] {
  if (templates) return templates;
  templates = Object.entries(EN)
    .filter(([es]) => /\{\w+\}/.test(es))
    .map(([es, en]) => {
      const names: string[] = [];
      const pattern = es
        .split(/(\{\w+\})/)
        .map((part) => {
          const m = /^\{(\w+)\}$/.exec(part);
          if (!m) return escapeRe(part);
          names.push(m[1]);
          // Lazy and possibly empty: optional parts like notes ("{v}") may be "".
          return "(.*?)";
        })
        .join("");
      return { re: new RegExp(`^${pattern}$`, "s"), names, en };
    })
    // Longer templates first: they are more specific.
    .sort((a, b) => b.re.source.length - a.re.source.length);
  return templates;
}

/**
 * A finished Spanish message (from the server, an error…) in `locale`.
 * Exact dictionary entries first, then templates with {placeholders};
 * a message made of several sentences joined by " · " is translated part
 * by part. Unknown messages come back unchanged.
 */
export function translateMessage(locale: Locale, message: string | null | undefined): string {
  if (typeof message !== "string") return message == null ? "" : String(message);
  if (!message) return message;
  if (locale === "es") return message;
  if (EN[message]) return EN[message];
  if (message.includes(" · ")) return message.split(" · ").map((m) => translateMessage(locale, m)).join(" · ");
  for (const t of compiledTemplates()) {
    const m = t.re.exec(message);
    if (!m) continue;
    const vars: Vars = {};
    t.names.forEach((n, i) => (vars[n] = translateMessage(locale, m[i + 1])));
    return fill(t.en, vars);
  }
  return message;
}

/** A translator bound to a locale: tr("Guardar"), tr("Mínimo {n} und.", { n: 200 }). */
export type Translator = ((text: string, vars?: Vars) => string) & { locale: Locale; msg: (message: string | null | undefined) => string };

export function translator(locale: Locale): Translator {
  const tr = ((text: string, vars?: Vars) => translate(locale, text, vars)) as Translator;
  tr.locale = locale;
  tr.msg = (message) => translateMessage(locale, message);
  return tr;
}
