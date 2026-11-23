"use client";

// Loads the bodegas and the stock per bodega once, with a reload after
// anything that moves stock. migrated=false until the migration is applied.

import { useCallback, useEffect, useMemo, useState } from "react";
import { getWarehouseData, type WarehouseData } from "./actions";
import { stockByWarehouse, type Warehouse, type WarehouseStock } from "@/utils/inventory/warehouses";

export type WarehousesState = {
  status: "loading" | "ready" | "error";
  migrated: boolean;
  /** Every bodega, active or not. */
  all: Warehouse[];
  /** Active bodegas, the main one first. */
  warehouses: Warehouse[];
  main: Warehouse | null;
  maquila: Warehouse | null;
  stock: Record<string, Record<string, WarehouseStock>>;
  reload: () => void;
};

export function useWarehouses(): WarehousesState {
  const [data, setData] = useState<WarehouseData | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getWarehouseData()
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setStatus("ready");
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [tick]);

  const reload = useCallback(() => setTick((n) => n + 1), []);

  return useMemo(() => {
    const migrated = data?.migrated === true;
    const all = data && data.migrated ? data.warehouses : [];
    const warehouses = all.filter((w) => w.active).sort((a, b) => Number(b.is_default) - Number(a.is_default) || a.name.localeCompare(b.name, "es"));
    return {
      status,
      migrated,
      all,
      warehouses,
      main: warehouses.find((w) => w.is_default) ?? null,
      maquila: warehouses.find((w) => w.kind === "maquila") ?? null,
      stock: data && data.migrated ? stockByWarehouse(data.stock) : {},
      reload,
    };
  }, [data, status, reload]);
}
