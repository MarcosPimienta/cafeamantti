"use client";

// Kardex section. Data from before the September 2026 cutover is a period
// you can pick here (read-only), instead of a mode that changed every tab.

import React, { useMemo, useState } from "react";
import { Archive } from "lucide-react";
import { useTr } from "@/app/(admin)/AdminI18n";
import { KardexTab } from "../InventoryClient";
import { useInventory } from "../InventoryContext";
import { useWarehouses } from "../bodegas/useWarehouses";
import WarehouseSelect from "../bodegas/WarehouseSelect";

export default function KardexSection() {
  const tr = useTr();
  const { inventory } = useInventory();
  const [era, setEra] = useState<"v1" | "v2">("v2");
  const wh = useWarehouses();
  const [whFilter, setWhFilter] = useState("all");
  // Bodegas start with the warehouses migration; the archive has none.
  const warehouseId = wh.migrated && era === "v2" && whFilter !== "all" ? whFilter : null;

  const displayed = useMemo(
    () =>
      era === "v1"
        ? inventory.map((it) => ({ ...it, current_stock: Number(it.legacy_stock ?? it.current_stock) }))
        : inventory,
    [inventory, era]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-foreground/70">{tr("Datos")}</span>
        <div role="group" aria-label={tr("Periodo de datos")} className="flex gap-1 rounded-2xl bg-[#efebe3] p-1">
          {(
            [
              ["v2", "Actuales (desde sep 2026)"],
              ["v1", "Archivo (antes de sep 2026)"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={era === id}
              onClick={() => setEra(id)}
              className={`min-h-10 rounded-xl px-4 text-sm font-medium transition-all ${
                era === id ? "bg-white text-foreground shadow-sm" : "text-foreground/70 hover:text-foreground"
              }`}
            >
              {tr(label)}
            </button>
          ))}
        </div>
        {wh.migrated && era === "v2" && (
          <WarehouseSelect
            id="kardex-wh"
            label={tr("Bodega")}
            labelClassName="sr-only"
            className="min-h-11 rounded-xl border border-foreground/15 bg-white px-3 text-sm"
            warehouses={wh.warehouses}
            value={whFilter}
            onChange={setWhFilter}
            allowAll
          />
        )}
      </div>

      {wh.migrated && era === "v2" && (
        <p className="text-sm text-foreground/70">
          {warehouseId
            ? tr("Solo los movimientos de esta bodega; las transferencias cuentan como entradas y salidas.")
            : tr("Toda la empresa: las transferencias entre bodegas no se cuentan, porque no cambian el total.")}
        </p>
      )}

      {era === "v1" && (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3.5 text-sm text-amber-900">
          <Archive aria-hidden="true" className="w-5 h-5 shrink-0" />
          <span>
            <strong>{tr("Modo archivo")}</strong>{" "}
            {tr("— Estás viendo datos anteriores a septiembre 2026. Estos datos son de solo lectura.")}
          </span>
        </div>
      )}

      <KardexTab key={`${era}-${warehouseId ?? "all"}`} inventory={displayed} era={era} warehouseId={warehouseId} />
    </div>
  );
}
