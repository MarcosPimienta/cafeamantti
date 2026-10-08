// What packing one unit of a roasted reference consumes. A saved recipe
// wins; otherwise the default is the reference's bag plus the profile
// sticker (what the app assumed before recipes existed).

import { packagingCodesFor } from "@/app/(admin)/coffeeProfiles";

export type PackagingLine = { code: string; qty: number };
/** reference code → recipe. An empty list means "no packaging". */
export type PackagingRecipes = Record<string, PackagingLine[]>;

export function defaultPackaging(referenceCode: string): PackagingLine[] {
  return packagingCodesFor(referenceCode).map((code) => ({ code, qty: 1 }));
}

export function packagingFor(
  referenceCode: string,
  recipes: PackagingRecipes = {}
): { lines: PackagingLine[]; custom: boolean } {
  const saved = recipes[referenceCode];
  return saved ? { lines: saved, custom: true } : { lines: defaultPackaging(referenceCode), custom: false };
}

/** Normalizes user input: positive quantities, one line per code. */
export function cleanRecipe(lines: { code: string; qty: number | string }[]): PackagingLine[] {
  const merged = new Map<string, number>();
  for (const l of lines) {
    const code = String(l.code || "").trim();
    const qty = Number(l.qty);
    if (!code || !Number.isFinite(qty) || qty <= 0) continue;
    merged.set(code, (merged.get(code) ?? 0) + qty);
  }
  return [...merged].map(([code, qty]) => ({ code, qty }));
}
