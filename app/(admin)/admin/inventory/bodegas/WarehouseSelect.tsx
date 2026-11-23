"use client";

// The «Bodega» field of the stock forms. Empty value = the main bodega, so
// the server falls back to the column default.

import React from "react";
import { useTr } from "@/app/(admin)/AdminI18n";
import type { Warehouse } from "@/utils/inventory/warehouses";

export default function WarehouseSelect({
  id,
  label,
  warehouses,
  value,
  onChange,
  className = "",
  labelClassName = "",
  allowAll = false,
}: {
  id: string;
  label: string;
  warehouses: Warehouse[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
  labelClassName?: string;
  /** Adds «Todas las bodegas» (value "all"). */
  allowAll?: boolean;
}) {
  const tr = useTr();
  const main = warehouses.find((w) => w.is_default);
  const others = warehouses.filter((w) => !w.is_default);
  return (
    <div>
      <label htmlFor={id} className={labelClassName || "block text-sm font-medium mb-1.5"}>
        {label}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={className}>
        {allowAll && <option value="all">{tr("Todas las bodegas")}</option>}
        {main && <option value={allowAll ? main.id : ""}>{tr("{name} (principal)", { name: main.name })}</option>}
        {others.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
            {w.kind === "maquila" ? ` · ${tr("maquilador")}` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
