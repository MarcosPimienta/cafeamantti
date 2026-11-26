// Comprobantes de ajuste de inventario. Pure: what each line moves, what is
// wrong with a voucher before it is sent, its number and its value. The
// server actions write it through inventory_adjustment_create.

import type { StatementItem } from "@/utils/cashflow/incomeStatement";

export const ADJUSTMENT_REASONS = ["conteo", "dano", "vencimiento", "error_registro", "otro"] as const;
export type AdjustmentReason = (typeof ADJUSTMENT_REASONS)[number];

export const ADJUSTMENT_REASON_LABELS: Record<AdjustmentReason, string> = {
  conteo: "Diferencia en conteo físico",
  dano: "Producto dañado",
  vencimiento: "Producto vencido",
  error_registro: "Corrección de un error de registro",
  otro: "Otro motivo",
};

export function isAdjustmentReason(v: unknown): v is AdjustmentReason {
  return typeof v === "string" && (ADJUSTMENT_REASONS as readonly string[]).includes(v);
}

/** How a line says what changes: what comes in, what goes out, or what was counted. */
export type LineMode = "entrada" | "salida" | "conteo";

/** "AJ-0007". */
export function adjustmentLabel(n: number): string {
  return `AJ-${String(n).padStart(4, "0")}`;
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/** Signed quantity a line moves: + comes in, − goes out (null when the number is not valid). */
export function lineDelta(mode: LineMode, value: number | null, systemStock: number): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  if (mode === "conteo") return value < 0 ? null : round(value - systemStock);
  if (value <= 0) return null;
  return mode === "entrada" ? round(value) : -round(value);
}

export type DraftLine = {
  inventoryId: string;
  name: string;
  mode: LineMode;
  value: number | null;
  systemStock: number;
  needsGrind: boolean;
  molienda: string | null;
};

/** What stops a voucher from being saved, one message per problem (empty = fine). */
export function adjustmentProblems(v: { date: string; reason: string; notes: string; lines: DraftLine[] }): string[] {
  const out: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date)) out.push("Escribe la fecha del ajuste.");
  if (!isAdjustmentReason(v.reason)) out.push("Elige el motivo del ajuste.");
  if (v.reason === "otro" && !v.notes.trim()) out.push("Con «Otro motivo», explica el ajuste en las observaciones.");
  if (!v.lines.length) out.push("Agrega al menos un producto.");
  const seen = new Set<string>();
  for (const l of v.lines) {
    if (!l.inventoryId) {
      out.push("Hay una línea sin producto.");
      continue;
    }
    const key = `${l.inventoryId}|${l.needsGrind ? l.molienda ?? "" : ""}`;
    if (seen.has(key)) out.push(`${l.name} está dos veces: déjalo en una sola línea.`);
    seen.add(key);
    if (l.needsGrind && l.molienda !== "grano" && l.molienda !== "molido") out.push(`Selecciona la molienda (Grano o Molido) de ${l.name}.`);
    const d = lineDelta(l.mode, l.value, l.systemStock);
    if (d === null) out.push(l.mode === "conteo" ? `Escribe lo que contaste de ${l.name}.` : `Escribe una cantidad mayor que cero para ${l.name}.`);
    else if (d === 0) out.push(`${l.name}: el conteo coincide con el sistema, no hay nada que ajustar. Quita la línea.`);
    else if (l.systemStock + d < -0.0005) out.push(`${l.name}: no puede salir más de lo que hay (${l.systemStock.toLocaleString("es-CO")}).`);
  }
  return out;
}

export type AdjustmentLineValue = { quantity: number; unit_cost: number | null };

/** What the voucher is worth at its unit costs: + stock gained, − stock lost. Lines without cost are left out and counted. */
export function adjustmentValue(lines: AdjustmentLineValue[]): { gained: number; lost: number; net: number; withoutCost: number } {
  let gained = 0;
  let lost = 0;
  let withoutCost = 0;
  for (const l of lines) {
    if (l.unit_cost === null || l.unit_cost === undefined) {
      withoutCost += 1;
      continue;
    }
    const v = Number(l.quantity) * Number(l.unit_cost);
    if (v >= 0) gained += v;
    else lost += -v;
  }
  const r = (n: number) => Math.round(n * 100) / 100;
  return { gained: r(gained), lost: r(lost), net: r(gained - lost), withoutCost };
}

export type AdjustmentMovement = {
  date: string;
  inventory_id: string;
  quantity: number;
  unit_cost: number | null;
  /** "AJ-0007" (with "anulación" when it is the reversal). */
  label: string;
};

/**
 * The income statement's items for the month's adjustment movements: stock
 * lost adds to the cost of sales and stock gained takes from it, each at the
 * cost it was valued at (or today's cost when it had none).
 */
export function adjustmentCostItems(
  movements: AdjustmentMovement[],
  unitCosts: Map<string, { name: string; unit: string | null; cost: number | null }>
): { items: StatementItem[]; missing: { name: string; quantity: number }[] } {
  const items: StatementItem[] = [];
  const missing: { name: string; quantity: number }[] = [];
  for (const m of movements) {
    const known = unitCosts.get(m.inventory_id);
    const cost = m.unit_cost ?? known?.cost ?? null;
    const name = known?.name ?? m.inventory_id;
    const qty = Number(m.quantity);
    if (cost === null) {
      missing.push({ name, quantity: Math.abs(qty) });
      continue;
    }
    items.push({
      date: m.date,
      concept: `${m.label} · ${qty > 0 ? "+" : "−"}${Math.abs(qty).toLocaleString("es-CO")} ${known?.unit ?? ""} ${name}`.replace(/\s+/g, " "),
      category: "Ajustes de inventario",
      // Cost goes up with what was lost (negative quantity).
      amount: Math.round(-qty * cost * 100) / 100,
    });
  }
  return { items, missing };
}

// ─────────────────────────────────────────────────────────────
// Signatures
// ─────────────────────────────────────────────────────────────

export const SIGNATURE_ROLES = ["elaboro", "reviso", "aprobo"] as const;
export type SignatureRole = (typeof SIGNATURE_ROLES)[number];

export const SIGNATURE_ROLE_LABELS: Record<SignatureRole, string> = {
  elaboro: "Elaboró",
  reviso: "Revisó",
  aprobo: "Aprobó",
};

export type SignatureType = "scribble" | "typed";

export function isSignatureRole(v: unknown): v is SignatureRole {
  return typeof v === "string" && (SIGNATURE_ROLES as readonly string[]).includes(v);
}

/** Largest drawn signature accepted (a PNG data URL of the pad). */
export const MAX_SIGNATURE_LENGTH = 300_000;

/** What is wrong with a signature before it is saved (null = fine). */
export function signatureProblem(type: string, data: string): string | null {
  if (type === "typed") {
    const name = data.trim();
    if (name.length < 2) return "Escribe tu nombre para firmar.";
    if (name.length > 80) return "El nombre de la firma es demasiado largo.";
    return null;
  }
  if (type === "scribble") {
    if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(data)) return "Dibuja tu firma en el recuadro.";
    if (data.length > MAX_SIGNATURE_LENGTH) return "La firma es demasiado grande. Límpiala y fírmala de nuevo.";
    return null;
  }
  return "Elige cómo firmar: dibujada o digitada.";
}
