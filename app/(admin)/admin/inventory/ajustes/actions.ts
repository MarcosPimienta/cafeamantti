"use server";

// Comprobantes de ajuste de inventario: create (one transaction through
// inventory_adjustment_create), annul (writes the reversal) and read them.
// Mutations return { success, error }: production hides thrown messages.

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { checkIsAdmin, getCostingData, logAuditAction } from "../../../actions";
import { isGrindTracked, isMolienda } from "@/app/(admin)/coffeeProfiles";
import { bogotaToday } from "@/utils/orders/pendingDeliveries";
import { errorText } from "@/utils/siigo/server";
import {
  ADJUSTMENT_REASON_LABELS,
  adjustmentLabel,
  isAdjustmentReason,
  type AdjustmentReason,
} from "@/utils/inventory/adjustments";

const MIGRATION_HINT = "Falta aplicar la migración 20261126000000_inventory_adjustments.sql para hacer comprobantes de ajuste.";
const isMissingMigration = (m: string) => /inventory_adjustment|adjustment_id/.test(m) && /exist|relation|schema|function|column/i.test(m);
const message = (err: unknown) => {
  const m = errorText(err);
  return isMissingMigration(m) ? MIGRATION_HINT : m;
};

async function requireAdmin() {
  if (!(await checkIsAdmin())) throw new Error("Unauthorized");
  return createClient();
}

function refresh() {
  revalidatePath("/admin/inventory", "layout");
  revalidatePath("/admin/cashflow");
}

export type AdjustmentInput = {
  date: string;
  warehouseId: string | null;
  reason: AdjustmentReason;
  notes: string;
  responsable: string;
  /** Signed: + entra, − sale. */
  lines: { inventoryId: string; quantity: number; molienda: string | null }[];
};

export async function createAdjustment(input: AdjustmentInput): Promise<{ success: true; id: string; number: number } | { success: false; error: string }> {
  const supabase = await requireAdmin();
  try {
    if (!isAdjustmentReason(input.reason)) throw new Error("Elige el motivo del ajuste.");
    if (input.reason === "otro" && !input.notes.trim()) throw new Error("Con «Otro motivo», explica el ajuste en las observaciones.");
    if (!input.lines.length) throw new Error("Agrega al menos un producto.");
    if (input.lines.some((l) => !Number.isFinite(l.quantity) || l.quantity === 0)) throw new Error("Cada línea debe mover una cantidad distinta de cero.");

    const ids = [...new Set(input.lines.map((l) => l.inventoryId))];
    const { data: items, error } = await supabase.from("inventory").select("id, product_code, product_name").in("id", ids);
    if (error) throw error;
    const byId = new Map(((items ?? []) as { id: string; product_code: string; product_name: string }[]).map((i) => [i.id, i]));
    for (const l of input.lines) {
      const it = byId.get(l.inventoryId);
      if (!it) throw new Error("Producto no encontrado");
      if (isGrindTracked(it.product_code) && !isMolienda(l.molienda)) throw new Error(`Selecciona la molienda (Grano o Molido) para ${it.product_name}.`);
    }

    // The value of each line is fixed at today's unit cost.
    const costing = await getCostingData().catch(() => null);
    const costOf = (id: string) => {
      const c = costing?.unitCosts?.[id]?.cost;
      return typeof c === "number" && Number.isFinite(c) && c >= 0 ? Math.round(c * 100) / 100 : null;
    };

    const { data, error: rpcErr } = await supabase.rpc("inventory_adjustment_create", {
      p_date: input.date,
      p_warehouse: input.warehouseId || null,
      p_reason_kind: input.reason,
      p_reason_text: ADJUSTMENT_REASON_LABELS[input.reason],
      p_notes: input.notes.trim() || null,
      p_responsable: input.responsable.trim() || null,
      p_lines: input.lines.map((l) => ({
        inventory_id: l.inventoryId,
        quantity: l.quantity,
        molienda: isGrindTracked(byId.get(l.inventoryId)!.product_code) ? l.molienda : null,
        unit_cost: costOf(l.inventoryId),
      })),
    });
    if (rpcErr) throw rpcErr;
    const row = (Array.isArray(data) ? data[0] : data) as { adjustment_id: string; adjustment_number: number };
    await logAuditAction("CREATE", "ADJUSTMENT", row.adjustment_id, undefined, {
      number: adjustmentLabel(row.adjustment_number),
      reason: input.reason,
      warehouse_id: input.warehouseId,
      lines: input.lines,
    });
    refresh();
    return { success: true, id: row.adjustment_id, number: row.adjustment_number };
  } catch (err) {
    return { success: false, error: message(err) };
  }
}

export async function annulAdjustment(id: string, reason: string): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await requireAdmin();
  try {
    if (!reason.trim()) throw new Error("Escribe por qué se anula el comprobante.");
    const { data: head } = await supabase.from("inventory_adjustments").select("number").eq("id", id).maybeSingle();
    const { error } = await supabase.rpc("inventory_adjustment_annul", { p_id: id, p_date: bogotaToday(), p_reason: reason.trim() });
    if (error) throw error;
    await logAuditAction("DELETE", "ADJUSTMENT", id, undefined, { number: head ? adjustmentLabel(head.number) : null, annulled: true, reason: reason.trim() });
    refresh();
    return { success: true };
  } catch (err) {
    return { success: false, error: message(err) };
  }
}

export type AdjustmentLine = {
  id: string;
  inventory_id: string;
  product_code: string;
  product_name: string;
  unit: string | null;
  quantity: number;
  molienda: string | null;
  unit_cost: number | null;
  movement_date: string;
  /** The opposite movement written when the voucher was annulled. */
  reversal: boolean;
};

export type Adjustment = {
  id: string;
  number: number;
  adjustment_date: string;
  warehouse: { id: string; name: string } | null;
  reason_kind: AdjustmentReason;
  notes: string | null;
  responsable: string | null;
  status: "vigente" | "anulado";
  annulled_date: string | null;
  annul_reason: string | null;
  created_at: string;
  created_by_name: string | null;
  lines: AdjustmentLine[];
};

const HEADER = "id, number, adjustment_date, reason_kind, notes, responsable, status, annulled_date, annul_reason, created_at, created_by, warehouse:warehouse_id ( id, name )";
const LINES = "id, adjustment_id, inventory_id, quantity, molienda, unit_cost, movement_date, reason, inventory ( product_code, product_name, unit )";

/* eslint-disable @typescript-eslint/no-explicit-any */
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

function toAdjustment(h: any, lines: any[], names: Map<string, string>): Adjustment {
  return {
    id: h.id,
    number: h.number,
    adjustment_date: h.adjustment_date,
    warehouse: one(h.warehouse),
    reason_kind: h.reason_kind,
    notes: h.notes,
    responsable: h.responsable,
    status: h.status,
    annulled_date: h.annulled_date,
    annul_reason: h.annul_reason,
    created_at: h.created_at,
    created_by_name: h.created_by ? names.get(h.created_by) ?? null : null,
    lines: lines
      .filter((l) => l.adjustment_id === h.id)
      .map((l) => {
        const inv = one(l.inventory) as { product_code: string; product_name: string; unit: string | null } | null;
        return {
          id: l.id,
          inventory_id: l.inventory_id,
          product_code: inv?.product_code ?? "",
          product_name: inv?.product_name ?? "—",
          unit: inv?.unit ?? null,
          quantity: Number(l.quantity),
          molienda: l.molienda,
          unit_cost: l.unit_cost === null || l.unit_cost === undefined ? null : Number(l.unit_cost),
          movement_date: l.movement_date,
          reversal: String(l.reason ?? "").startsWith("Anulación del comprobante"),
        };
      }),
  };
}

async function creatorNames(supabase: any, headers: any[]): Promise<Map<string, string>> {
  const ids = [...new Set(headers.map((h) => h.created_by).filter(Boolean))];
  if (!ids.length) return new Map();
  const { data } = await supabase.from("profiles").select("id, first_name, last_name").in("id", ids);
  return new Map(((data ?? []) as any[]).map((p) => [p.id, [p.first_name, p.last_name].filter(Boolean).join(" ")]));
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** The latest vouchers, newest first (null before the migration). */
export async function getAdjustments(limit = 30): Promise<Adjustment[] | null> {
  const supabase = await requireAdmin();
  const { data: headers, error } = await supabase.from("inventory_adjustments").select(HEADER).order("number", { ascending: false }).limit(limit);
  if (error) {
    if (isMissingMigration(error.message)) return null;
    throw new Error(error.message);
  }
  const list = headers ?? [];
  if (!list.length) return [];
  const [{ data: lines, error: lErr }, names] = await Promise.all([
    supabase.from("inventory_movements").select(LINES).in("adjustment_id", list.map((h) => h.id)).order("created_at", { ascending: true }),
    creatorNames(supabase, list),
  ]);
  if (lErr) throw new Error(lErr.message);
  return list.map((h) => toAdjustment(h, lines ?? [], names));
}

export async function getAdjustment(id: string): Promise<Adjustment | null> {
  const supabase = await requireAdmin();
  const { data: h, error } = await supabase.from("inventory_adjustments").select(HEADER).eq("id", id).maybeSingle();
  if (error) {
    if (isMissingMigration(error.message)) return null;
    throw new Error(error.message);
  }
  if (!h) return null;
  const [{ data: lines, error: lErr }, names] = await Promise.all([
    supabase.from("inventory_movements").select(LINES).eq("adjustment_id", id).order("created_at", { ascending: true }),
    creatorNames(supabase, [h]),
  ]);
  if (lErr) throw new Error(lErr.message);
  return toAdjustment(h, lines ?? [], names);
}
