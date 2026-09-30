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
 * All roasted coffee exists in Grano or Molido — bulk by the kilo
 * (CAFT-001 / CAFT-HON-001 / CAFT-MIC-001) just as much as the packaged
 * sizes, since bulk can be bought or sold already ground. Pergamino
 * (CAPG-*), verde (CAFV-*), cold brew (CAFC-*), bags and stickers have no
 * grind.
 */
export function isGrindTracked(productCode: string | null | undefined): boolean {
  return !!productCode && productCode.startsWith("CAFT-");
}

/**
 * Bulk roasted coffee is measured in kg, the packaged sizes in units, so the
 * two can never be added into one total.
 */
export function isBulkCoffee(productCode: string | null | undefined): boolean {
  return isGrindTracked(productCode) && (productCode as string).endsWith("-001");
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

// ── Reempaque helpers ────────────────────────────────────────────────────

/**
 * Kilos of coffee in one stock unit of a roasted-coffee code: bulk is stored
 * in kg (1), packaged sizes are encoded in the code. Returns null when the
 * size cannot be read, so callers can refuse instead of guessing.
 */
export function unitWeightKg(productCode: string | null | undefined): number | null {
  if (!isGrindTracked(productCode)) return null;
  const code = productCode as string;
  if (isBulkCoffee(code)) return 1;
  const m = code.match(/-(\d+(?:K\d+)?)(G|K)?$/);
  if (!m) return null;
  const [, size] = m;
  if (/^\d+K\d+$/.test(size)) {
    // 2K5 → 2.5 kg
    const [whole, frac] = size.split("K");
    return Number(`${whole}.${frac}`);
  }
  if (code.endsWith("G")) return Number(size) / 1000;
  if (code.endsWith("K")) return Number(size);
  return null;
}

/** Code fragment used by bags and stickers for each profile. */
export const PROFILE_FLAVOR: Record<CoffeeProfileId, string> = {
  premium: "FIR",
  honey: "HON",
  chiroso: "MIC",
};

/** Bulk (kg) roasted-coffee code of a profile — where repack leftovers go. */
export function bulkCodeForProfile(profile: CoffeeProfileId): string {
  const marker = COFFEE_PROFILES.find((p) => p.id === profile)?.marker;
  return marker ? `CAFT${marker}001` : "CAFT-001";
}

/**
 * Packaging a packed unit of this code consumes: its bag and the profile
 * sticker. Bulk coffee needs neither.
 */
export function packagingCodesFor(productCode: string | null | undefined): string[] {
  if (!isGrindTracked(productCode) || isBulkCoffee(productCode)) return [];
  const profile = profileForCode(productCode);
  if (!profile) return [];
  const flavor = PROFILE_FLAVOR[profile];
  const size = (productCode as string).split("-").pop();
  return [`EMP-BOLSA-${flavor}-${size}`, `STK-AMT-${flavor}`];
}
