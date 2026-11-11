// What a salida was for (inventory_movements.exit_kind) and where its cost
// goes in the income statement. Sales are not salidas: they are orders, which
// deduct their own stock ("venta" stays for order salidas and the manual sale
// salidas from before). Roasting and hulling loss (merma) is not a salida
// either: production batches record it and it is in the cost per kg already.

export const EXIT_KINDS = ["venta", "muestra", "regalo", "consumo_interno", "perdida", "ajuste"] as const;
export type ExitKind = (typeof EXIT_KINDS)[number];

/** What the salida form lets you pick: everything but a sale. */
export const SELECTABLE_EXIT_KINDS: ExitKind[] = ["muestra", "regalo", "consumo_interno", "perdida", "ajuste"];

export const EXIT_KIND_LABEL: Record<ExitKind, string> = {
  venta: "Venta",
  muestra: "Muestra / degustación",
  regalo: "Regalo / cortesía",
  consumo_interno: "Consumo interno",
  perdida: "Daño / pérdida",
  ajuste: "Ajuste de conteo",
};

/** What the form asks for in "Para quién" (null = not asked). */
export const EXIT_KIND_TO: Record<ExitKind, string | null> = {
  venta: "Cliente",
  muestra: "Para quién (prospecto o evento)",
  regalo: "Para quién",
  consumo_interno: "Quién lo consumió",
  perdida: null,
  ajuste: null,
};

const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** A reason that describes a sale (the form sends those to Pedidos). */
export function looksLikeSale(text: string | null | undefined): boolean {
  return /\b(ventas?|vend[a-z]*|factur[a-z]*)\b/.test(fold(text ?? ""));
}

export function isExitKind(v: unknown): v is ExitKind {
  return typeof v === "string" && (EXIT_KINDS as readonly string[]).includes(v);
}


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
  if (/\b(merma|danad[oa]s?|dano|vencid[oa]s?|rot[oa]s?|perdid[oa]s?|perdida|robad[oa]s?)\b/.test(r)) return "perdida";
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
    case "perdida": return "Producto dañado o perdido";
    case "ajuste": return "Ajuste de inventario";
    default: return "Salidas sin clasificar";
  }
}
