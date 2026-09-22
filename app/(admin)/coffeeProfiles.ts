// Shared vocabulary for the three roasted-coffee profiles and their grind.
//
// The profiles are not separate SKUs — they are encoded in the product code
// (Premium = CAFT-*, Honey = CAFT-HON-*, Chiroso = CAFT-MIC-*). The grind is
// recorded per movement, because it is decided when coffee is registered
// (Entradas) or packed (Empaque/Altas), not when the SKU is created.
//
// Imported by both the server actions and the inventory client, so it stays a
// plain module with no "use server" / "use client" directive.

export const MOLIENDAS = ["grano", "molido"] as const;
export type Molienda = (typeof MOLIENDAS)[number];

export const MOLIENDA_LABELS: Record<Molienda, string> = {
  grano: "Grano",
  molido: "Molido",
};

export function isMolienda(v: unknown): v is Molienda {
  return v === "grano" || v === "molido";
}

export type CoffeeProfileId = "premium" | "honey" | "chiroso";

export const COFFEE_PROFILES: {
  id: CoffeeProfileId;
  label: string;
  /** Code fragment that marks the profile; Premium is the unmarked default. */
  marker: string | null;
}[] = [
  { id: "premium", label: "Premium", marker: null },
  { id: "honey", label: "Honey", marker: "-HON-" },
  { id: "chiroso", label: "Chiroso", marker: "-MIC-" },
];

export const PROFILE_LABELS: Record<CoffeeProfileId, string> = {
  premium: "Premium",
  honey: "Honey",
  chiroso: "Chiroso",
};

/**
 * Only *packaged* roasted coffee exists in Grano or Molido. Bulk roasted
 * coffee (CAFT-001 / CAFT-HON-001 / CAFT-MIC-001) comes out of the roaster
 * grind-agnostic and is ground at packing time, so it carries no grind — that
 * is exactly why consuming bulk to produce a Molido bag nets out correctly.
 * Pergamino (CAPG-*), verde (CAFV-*), cold brew (CAFC-*), bags and stickers
 * have no grind either.
 */
export function isGrindTracked(productCode: string | null | undefined): boolean {
  return (
    !!productCode &&
    productCode.startsWith("CAFT-") &&
    !productCode.endsWith("-001")
  );
}

/**
 * Which of the three profiles a roasted-coffee code belongs to, if any.
 * Covers bulk as well as packaged coffee, unlike {@link isGrindTracked}.
 */
export function profileForCode(
  productCode: string | null | undefined
): CoffeeProfileId | null {
  if (!productCode || !productCode.startsWith("CAFT-")) return null;
  for (const p of COFFEE_PROFILES) {
    if (p.marker && productCode.includes(p.marker)) return p.id;
  }
  return "premium";
}

export function profileLabelForCode(
  productCode: string | null | undefined
): string | null {
  const id = profileForCode(productCode);
  return id ? PROFILE_LABELS[id] : null;
}
