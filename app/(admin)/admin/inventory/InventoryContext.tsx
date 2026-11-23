"use client";

// The inventory list every section of /admin/inventory works on. The layout
// loads it once on the server; the sections update it in place after each
// action, so switching sections never shows stale stock.

import React, { createContext, useContext, useMemo, useState } from "react";
import type { InventoryItem } from "./InventoryClient";

type InventoryCtx = {
  inventory: InventoryItem[];
  updateStock: (id: string, newStock: number) => void;
  updateStocks: (updates: { id: string; newStock: number }[]) => void;
  addItem: (item: InventoryItem) => void;
  patchItem: (id: string, patch: Partial<InventoryItem>) => void;
};

const Ctx = createContext<InventoryCtx | null>(null);

export function InventoryProvider({ initial, children }: { initial: InventoryItem[]; children: React.ReactNode }) {
  const [inventory, setInventory] = useState<InventoryItem[]>(initial);
  const [lastInitial, setLastInitial] = useState(initial);
  // Follow the server when it re-renders (router.refresh, revalidation).
  if (initial !== lastInitial) {
    setLastInitial(initial);
    setInventory(initial);
  }

  const value = useMemo<InventoryCtx>(
    () => ({
      inventory,
      updateStock: (id, newStock) =>
        setInventory((prev) => prev.map((it) => (it.id === id ? { ...it, current_stock: newStock } : it))),
      updateStocks: (updates) =>
        setInventory((prev) =>
          prev.map((it) => {
            const u = updates.find((x) => x.id === it.id);
            return u ? { ...it, current_stock: u.newStock } : it;
          })
        ),
      addItem: (item) => setInventory((prev) => [...prev, item]),
      patchItem: (id, patch) => setInventory((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it))),
    }),
    [inventory]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useInventory(): InventoryCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useInventory must be used inside <InventoryProvider>");
  return ctx;
}
