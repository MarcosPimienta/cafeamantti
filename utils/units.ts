// Weight unit handling for quantity inputs. Stock is always stored in the
// item's own unit; the admin may type in kg or g and we convert before
// saving. Non-weight units (unidad, litro…) pass through untouched.

export type WeightUnit = "kg" | "g";

const KG = new Set(["kg", "kgs", "kilo", "kilos", "kilogramo", "kilogramos"]);
const G = new Set(["g", "gr", "grs", "gramo", "gramos"]);

/** The weight unit an item is stocked in, or null when it is not a weight. */
export function weightUnitOf(unit: string | null | undefined): WeightUnit | null {
  const u = (unit ?? "").trim().toLowerCase().replace(/\.$/, "");
  if (KG.has(u)) return "kg";
  if (G.has(u)) return "g";
  return null;
}

/** Rounds away float noise (0.1 + 0.2) while keeping milligram precision. */
export const roundQty = (n: number) => Math.round(n * 1e6) / 1e6;

export function convertWeight(value: number, from: WeightUnit, to: WeightUnit): number {
  if (from === to) return value;
  return roundQty(from === "kg" ? value * 1000 : value / 1000);
}

/**
 * Parses what an admin types: accepts "0,25" and "0.25", a leading minus
 * (adjustments), and Colombian thousands like "1.500" for grams. Returns
 * null for anything that is not a number.
 */
export function parseQtyInput(text: string, unit: WeightUnit | null = null): number | null {
  let s = text.trim().replace(/\s/g, "");
  if (!s || s === "-" || s === "," || s === ".") return null;
  if (s.includes(",") && s.includes(".")) {
    // "1.234,5" → thousands dot, decimal comma
    s = s.indexOf(".") < s.indexOf(",") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  } else if (unit === "g" && /^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    // grams are whole numbers: "1.500 g" is fifteen hundred grams
    s = s.replace(/\./g, "");
  }
  if (!/^-?\d*\.?\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Short display of a number in a unit, without float noise: 0.25 → "0.25". */
export function formatQty(n: number): string {
  return String(roundQty(n));
}

/** "= 250 g" / "= 0.25 kg" style hint for the other unit. */
export function describeIn(value: number, unit: WeightUnit): string {
  return `${roundQty(value).toLocaleString("es-CO", { maximumFractionDigits: 6 })} ${unit}`;
}
