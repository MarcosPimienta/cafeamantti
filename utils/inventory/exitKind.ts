// What a salida was for (inventory_movements.exit_kind) and where its cost
// goes in the income statement. A sale is cost of sales; samples and gifts
// are selling expenses; coffee drunk by the team is an admin expense; waste
// and count adjustments stay in cost, apart from what was sold.

export const EXIT_KINDS = ["venta", "muestra", "regalo", "consumo_interno", "merma", "ajuste"] as const;
export type ExitKind = (typeof EXIT_KINDS)[number];

export const EXIT_KIND_LABEL: Record<ExitKind, string> = {
  venta: "Venta",
  muestra: "Muestra / degustación",
  regalo: "Regalo / cortesía",
  consumo_interno: "Consumo interno",
  merma: "Merma",
  ajuste: "Ajuste de conteo",
};

/** What the form asks for in "Para quién" (null = not asked). */
export const EXIT_KIND_TO: Record<ExitKind, string | null> = {
  venta: "Cliente",
  muestra: "Para quién (prospecto o evento)",
  regalo: "Para quién",
  consumo_interno: "Quién lo consumió",
  merma: null,
  ajuste: null,
};

export function isExitKind(v: unknown): v is ExitKind {
  return typeof v === "string" && (EXIT_KINDS as readonly string[]).includes(v);
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * The kind a salida's free-text reason points to, for salidas registered
 * before the field existed. Null when the reason doesn't say (left to review).
 */
export function guessExitKind(reason: string | null | undefined, orderId?: string | null): ExitKind | null {
  if (orderId) return "venta";
  const r = fold(reason ?? "");
  if (!r.trim()) return null;
  if (/\b(muestras?|degustacion(es)?|cata)\b/.test(r)) return "muestra";
  if (/\b(regalos?|cortesia|obsequios?|donacion)\b/.test(r)) return "regalo";
  if (/\b(merma|danad[oa]s?|dano|vencid[oa]s?|rot[oa]s?|perdid[oa]s?)\b/.test(r)) return "merma";
  if (/\b(ajuste|conteo|inventario fisico|diferencia)\b/.test(r)) return "ajuste";
  if (/\b(consumo (interno|administracion|oficina|socios?)|oficina|reunion)\b/.test(r)) return "consumo_interno";
  if (/\b(venta|vendid[oa]|factura|fv-|orden|pedido|feria)\b/.test(r)) return "venta";
  return null;
}

/** Where the cost of a salida of this kind goes in the income statement. */
export type ExitCostLine = "cost" | "selling" | "admin";
export function exitCostLine(kind: ExitKind | null): ExitCostLine {
  if (kind === "muestra" || kind === "regalo") return "selling";
  if (kind === "consumo_interno") return "admin";
  return "cost";
}

/** Category of the statement item for the salidas of a kind (null = not classified yet). */
export function exitCostCategory(kind: ExitKind | null): string {
  switch (kind) {
    case "venta": return "Café vendido";
    case "muestra": return "Muestras y degustaciones (al costo)";
    case "regalo": return "Regalos y cortesías (al costo)";
    case "consumo_interno": return "Consumo interno de café (al costo)";
    case "merma": return "Merma";
    case "ajuste": return "Ajuste de inventario";
    default: return "Salidas sin clasificar";
  }
}
