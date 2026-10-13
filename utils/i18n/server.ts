// Admin language on the server (pages, layouts, server actions): the same
// NEXT_LOCALE cookie the storefront uses. Spanish when there is none.
import { cookies } from "next/headers";
import { LOCALE_COOKIE, isLocale, translator, type Locale } from "./translate";

export async function getLocale(): Promise<Locale> {
  try {
    const v = (await cookies()).get(LOCALE_COOKIE)?.value;
    return isLocale(v) ? v : "es";
  } catch {
    return "es"; // outside a request (tests, scripts)
  }
}

/** Translator for the current request: const tr = await getTr(); tr("Guardar"). */
export async function getTr() {
  return translator(await getLocale());
}
