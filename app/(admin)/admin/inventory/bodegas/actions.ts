"use server";

// Bodegas: list them, stock per bodega, transfers between them and their
// settings. Until the warehouses migration is applied every read answers
// { migrated: false } so the screens can say so instead of failing.

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { checkIsAdmin, logAuditAction } from "../../../actions";
import { isMissingWarehousesMigration, type Warehouse, type WarehouseKind, type WarehouseStockRow } from "@/utils/inventory/warehouses";

export type WarehouseData =
  | { migrated: false }
  | { migrated: true; warehouses: Warehouse[]; stock: WarehouseStockRow[] };

export async function getWarehouseData(): Promise<WarehouseData> {
  if (!(await checkIsAdmin())) throw new Error("Unauthorized");
  const supabase = await createClient();

  const { data: warehouses, error } = await supabase
    .from("warehouses")
    .select("id, code, name, kind, is_default, active, address, notes")
    .order("is_default", { ascending: false })
    .order("name", { ascending: true });
  if (error) {
    if (isMissingWarehousesMigration(error)) return { migrated: false };
    throw new Error(error.message);
  }

  const stock: WarehouseStockRow[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error: sErr } = await supabase
      .from("inventory_warehouse_stock")
      .select("inventory_id, warehouse_id, molienda, quantity")
      .range(from, from + PAGE - 1);
    if (sErr) {
      if (isMissingWarehousesMigration(sErr)) return { migrated: false };
      throw new Error(sErr.message);
    }
    stock.push(...((data ?? []) as WarehouseStockRow[]));
    if (!data || data.length < PAGE) break;
  }

  return { migrated: true, warehouses: (warehouses ?? []) as Warehouse[], stock };
}

export type TransferInput = {
  inventoryId: string;
  fromId: string;
  toId: string;
  qty: number;
  date: string;
  molienda?: string | null;
  lote?: string | null;
  note?: string | null;
  responsable?: string | null;
};

/** Moves stock between bodegas: a salida in the origin and an entrada in the destination, together. */
export async function createTransfer(input: TransferInput): Promise<{ success: true; transferId: string } | { success: false; error: string }> {
  if (!(await checkIsAdmin())) throw new Error("Unauthorized");
  const supabase = await createClient();

  if (!(input.qty > 0)) return { success: false, error: "La cantidad debe ser mayor que cero." };
  if (input.fromId === input.toId) return { success: false, error: "La bodega de origen y la de destino son la misma." };

  const { data, error } = await supabase.rpc("inventory_transfer", {
    p_item: input.inventoryId,
    p_from: input.fromId,
    p_to: input.toId,
    p_qty: input.qty,
    p_date: input.date,
    p_molienda: input.molienda || null,
    p_lote: input.lote?.trim() || null,
    p_note: input.note?.trim() || null,
    p_responsable: input.responsable?.trim() || null,
  });
  if (error) {
    if (isMissingWarehousesMigration(error)) {
      return { success: false, error: "Falta aplicar la migración 20261123000000_warehouses.sql para transferir entre bodegas." };
    }
    return { success: false, error: error.message };
  }

  const transferId = data as string;
  await logAuditAction("CREATE", "TRANSFER", transferId, input.inventoryId, {
    qty: input.qty,
    from_warehouse: input.fromId,
    to_warehouse: input.toId,
    molienda: input.molienda || null,
    lote: input.lote || null,
    note: input.note || null,
  });
  revalidatePath("/admin/inventory", "layout");
  return { success: true, transferId };
}

export type TransferRow = {
  transfer_id: string;
  inventory_id: string;
  product_name: string;
  product_code: string;
  unit: string | null;
  qty: number;
  from_id: string | null;
  to_id: string | null;
  date: string;
  molienda: string | null;
  lote: string | null;
  reason: string | null;
};

/** The latest transfers, one row each (origin and destination joined). */
export async function getRecentTransfers(limit = 50): Promise<TransferRow[]> {
  if (!(await checkIsAdmin())) throw new Error("Unauthorized");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inventory_movements")
    .select("transfer_id, inventory_id, quantity, warehouse_id, movement_date, created_at, molienda, lote, reason, inventory ( product_name, product_code, unit )")
    .eq("tab_source", "transferencia")
    .eq("era", "v2")
    .not("transfer_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit * 2);
  if (error) {
    if (isMissingWarehousesMigration(error)) return [];
    throw new Error(error.message);
  }
  const byId = new Map<string, TransferRow>();
  for (const m of data ?? []) {
    const inv = (Array.isArray(m.inventory) ? m.inventory[0] : m.inventory) as { product_name: string; product_code: string; unit: string | null } | null;
    const id = m.transfer_id as string;
    const row =
      byId.get(id) ??
      {
        transfer_id: id,
        inventory_id: m.inventory_id as string,
        product_name: inv?.product_name ?? "—",
        product_code: inv?.product_code ?? "",
        unit: inv?.unit ?? null,
        qty: 0,
        from_id: null,
        to_id: null,
        date: (m.movement_date as string | null) ?? String(m.created_at).slice(0, 10),
        molienda: (m.molienda as string | null) ?? null,
        lote: (m.lote as string | null) ?? null,
        reason: null,
      };
    const q = Number(m.quantity);
    if (q < 0) row.from_id = m.warehouse_id as string;
    else {
      row.to_id = m.warehouse_id as string;
      row.qty = q;
      row.reason = (m.reason as string | null) ?? null;
    }
    byId.set(id, row);
  }
  return [...byId.values()].slice(0, limit);
}

export type WarehouseInput = {
  id?: string;
  name: string;
  code: string;
  kind: WarehouseKind;
  address?: string | null;
  notes?: string | null;
};

/** Creates a bodega, or renames / updates one. */
export async function saveWarehouse(input: WarehouseInput): Promise<{ success: true } | { success: false; error: string }> {
  if (!(await checkIsAdmin())) throw new Error("Unauthorized");
  const supabase = await createClient();
  const name = input.name.trim();
  const code = input.code.trim().toUpperCase().replace(/\s+/g, "-");
  if (!name) return { success: false, error: "Escribe el nombre de la bodega." };
  if (!code) return { success: false, error: "Escribe un código corto para la bodega." };
  if (input.kind !== "propia" && input.kind !== "maquila") return { success: false, error: "Tipo de bodega inválido." };

  const values = { name, code, kind: input.kind, address: input.address?.trim() || null, notes: input.notes?.trim() || null };
  const { data, error } = input.id
    ? await supabase.from("warehouses").update(values).eq("id", input.id).select("id").single()
    : await supabase.from("warehouses").insert(values).select("id").single();
  if (error) {
    if (error.code === "23505") return { success: false, error: `Ya existe una bodega con el código ${code}.` };
    return { success: false, error: error.message };
  }
  await logAuditAction(input.id ? "UPDATE" : "CREATE", "WAREHOUSE", data.id, undefined, values);
  revalidatePath("/admin/inventory", "layout");
  return { success: true };
}

/** Makes a bodega the main one: orders, purchases and production move stock there. */
export async function setDefaultWarehouse(id: string): Promise<{ success: true } | { success: false; error: string }> {
  if (!(await checkIsAdmin())) throw new Error("Unauthorized");
  const supabase = await createClient();
  const { data: wh, error: whErr } = await supabase.from("warehouses").select("active").eq("id", id).single();
  if (whErr || !wh) return { success: false, error: "Bodega no encontrada." };
  if (!wh.active) return { success: false, error: "Activa la bodega antes de hacerla principal." };
  const { error: offErr } = await supabase.from("warehouses").update({ is_default: false }).eq("is_default", true);
  if (offErr) return { success: false, error: offErr.message };
  const { error } = await supabase.from("warehouses").update({ is_default: true }).eq("id", id);
  if (error) return { success: false, error: error.message };
  await logAuditAction("UPDATE", "WAREHOUSE", id, undefined, { is_default: true });
  revalidatePath("/admin/inventory", "layout");
  return { success: true };
}

/** Turns a bodega on or off. The main one, or one with stock, cannot be turned off. */
export async function setWarehouseActive(id: string, active: boolean): Promise<{ success: true } | { success: false; error: string }> {
  if (!(await checkIsAdmin())) throw new Error("Unauthorized");
  const supabase = await createClient();
  if (!active) {
    const { data: wh } = await supabase.from("warehouses").select("is_default").eq("id", id).single();
    if (wh?.is_default) return { success: false, error: "La bodega principal no se puede desactivar." };
    const { data: rows } = await supabase.from("inventory_warehouse_stock").select("inventory_id, quantity").eq("warehouse_id", id);
    const perItem = new Map<string, number>();
    for (const r of rows ?? []) perItem.set(r.inventory_id, (perItem.get(r.inventory_id) ?? 0) + (Number(r.quantity) || 0));
    if ([...perItem.values()].some((q) => Math.abs(q) > 0.0005)) return { success: false, error: "La bodega todavía tiene stock: transfiérelo antes de desactivarla." };
  }
  const { error } = await supabase.from("warehouses").update({ active }).eq("id", id);
  if (error) return { success: false, error: error.message };
  await logAuditAction("UPDATE", "WAREHOUSE", id, undefined, { active });
  revalidatePath("/admin/inventory", "layout");
  return { success: true };
}
