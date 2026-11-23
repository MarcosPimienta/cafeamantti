// Bodegas: shared types and pure helpers (stock per bodega, transfers).
// Imported by the server actions and the inventory screens; no directives.

export type WarehouseKind = "propia" | "maquila";

export type Warehouse = {
  id: string;
  code: string;
  name: string;
  kind: WarehouseKind;
  is_default: boolean;
  active: boolean;
  address: string | null;
  notes: string | null;
};

/** One row of inventory_warehouse_stock: a product's stock in a bodega, per grind. */
export type WarehouseStockRow = {
  inventory_id: string;
  warehouse_id: string;
  molienda: string | null;
  quantity: number;
};

export type WarehouseStock = { total: number; grano: number; molido: number; sinDefinir: number };

export const WAREHOUSE_KIND_LABEL: Record<WarehouseKind, string> = {
  propia: "Propia",
  maquila: "Maquilador",
};

/** Stock per product and bodega: stock[inventoryId][warehouseId]. */
export function stockByWarehouse(rows: WarehouseStockRow[]): Record<string, Record<string, WarehouseStock>> {
  const out: Record<string, Record<string, WarehouseStock>> = {};
  for (const r of rows) {
    const qty = Number(r.quantity) || 0;
    const byWh = (out[r.inventory_id] ??= {});
    const s = (byWh[r.warehouse_id] ??= { total: 0, grano: 0, molido: 0, sinDefinir: 0 });
    s.total += qty;
    if (r.molienda === "grano") s.grano += qty;
    else if (r.molienda === "molido") s.molido += qty;
    else s.sinDefinir += qty;
  }
  return out;
}

/** What a bodega holds of a product (0 when nothing). */
export function stockIn(stock: Record<string, Record<string, WarehouseStock>>, inventoryId: string, warehouseId: string): WarehouseStock {
  return stock[inventoryId]?.[warehouseId] ?? { total: 0, grano: 0, molido: 0, sinDefinir: 0 };
}

/** The checks a transfer must pass before it is sent. Null = fine. */
export function transferProblem(input: {
  inventoryId: string;
  fromId: string;
  toId: string;
  qty: number;
  available: number;
  needsGrind: boolean;
  molienda: string | null;
}): string | null {
  if (!input.inventoryId) return "Elige el producto.";
  if (!input.fromId || !input.toId) return "Elige la bodega de origen y la de destino.";
  if (input.fromId === input.toId) return "La bodega de origen y la de destino son la misma.";
  if (!(input.qty > 0)) return "La cantidad debe ser mayor que cero.";
  if (input.needsGrind && input.molienda !== "grano" && input.molienda !== "molido") return "Selecciona la molienda (Grano o Molido)";
  if (input.qty > input.available + 0.0005) return "No hay suficiente en la bodega de origen.";
  return null;
}

/** The migration is missing when the table or view is unknown to the API. */
export function isMissingWarehousesMigration(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === "42P01" || err.code === "PGRST205" || err.code === "42883" || err.code === "PGRST202") return true;
  return /warehouse|inventory_warehouse_stock|inventory_transfer/i.test(err.message ?? "") && /exist|find|schema cache/i.test(err.message ?? "");
}

export const WAREHOUSES_MIGRATION = "supabase/migrations/20261123000000_warehouses.sql";
