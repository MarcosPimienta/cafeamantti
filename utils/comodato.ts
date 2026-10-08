// Rules for equipment lent in comodato. Pure: the server actions load and
// persist; this decides what is allowed and summarizes.

import { unitWeightKg } from "@/app/(admin)/coffeeProfiles";

export const UNIT_STATUSES = ["disponible", "en_comodato", "mantenimiento", "baja"] as const;
export type UnitStatus = (typeof UNIT_STATUSES)[number];

export const UNIT_STATUS_LABELS: Record<UnitStatus, string> = {
  disponible: "Disponible",
  en_comodato: "En comodato",
  mantenimiento: "Mantenimiento",
  baja: "De baja",
};

export type UnitAction = "asignar" | "devolver" | "mantenimiento" | "disponible" | "baja";

/** Which statuses each action may start from. */
const ALLOWED_FROM: Record<UnitAction, UnitStatus[]> = {
  asignar: ["disponible"],
  devolver: ["en_comodato"],
  mantenimiento: ["disponible"],
  disponible: ["mantenimiento"],
  baja: ["disponible", "mantenimiento"],
};

const ACTION_ERRORS: Record<UnitAction, string> = {
  asignar: "Solo se puede entregar en comodato una máquina disponible.",
  devolver: "Esta máquina no está en comodato.",
  mantenimiento: "Solo una máquina disponible puede pasar a mantenimiento (si está en comodato, regístrala como devuelta a mantenimiento).",
  disponible: "Solo una máquina en mantenimiento puede volver a estar disponible.",
  baja: "Para dar de baja una máquina, primero debe estar devuelta.",
};

export function canApply(action: UnitAction, from: string): boolean {
  return (ALLOWED_FROM[action] as string[]).includes(from);
}

/** Throws the message to show when an action is not allowed from `from`. */
export function assertCanApply(action: UnitAction, from: string): void {
  if (!canApply(action, from)) throw new Error(ACTION_ERRORS[action]);
}

/** Status a unit ends in after an action. */
export function statusAfter(action: UnitAction, returnTo: "disponible" | "mantenimiento" = "disponible"): UnitStatus {
  switch (action) {
    case "asignar":
      return "en_comodato";
    case "devolver":
      return returnTo;
    case "mantenimiento":
      return "mantenimiento";
    case "disponible":
      return "disponible";
    case "baja":
      return "baja";
  }
}

/** Whole days from a YYYY-MM-DD date to `today` (YYYY-MM-DD), never negative. */
export function daysSince(dateYmd: string, todayYmd: string): number {
  const ms = Date.parse(`${todayYmd}T00:00:00Z`) - Date.parse(`${dateYmd}T00:00:00Z`);
  return Math.max(0, Math.round(ms / 86400000));
}

export function summarizeUnits(units: { status: string }[]) {
  const counts: Record<UnitStatus, number> = { disponible: 0, en_comodato: 0, mantenimiento: 0, baja: 0 };
  for (const u of units) if (u.status in counts) counts[u.status as UnitStatus] += 1;
  return { ...counts, activos: units.length - counts.baja };
}

/**
 * Kilos of coffee each client bought, from paid order lines. Used to compare
 * against the monthly commitment of their comodato.
 */
export function kgByClient(lines: { client_id: string | null; product_code: string; quantity: number }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of lines) {
    if (!l.client_id) continue;
    const w = unitWeightKg(l.product_code);
    const q = Number(l.quantity);
    if (w === null || !(q > 0)) continue;
    out[l.client_id] = (out[l.client_id] ?? 0) + q * w;
  }
  return out;
}

/** Share of the monthly commitment met (1 = 100 %); null without commitment. */
export function commitmentProgress(boughtKg: number, commitmentKg: number | null | undefined): number | null {
  if (!commitmentKg || commitmentKg <= 0) return null;
  return boughtKg / commitmentKg;
}
