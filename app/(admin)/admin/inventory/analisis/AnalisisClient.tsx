"use client";

// Análisis: cost per reference (Costos) and the inventory reports, which
// used to be two separate tabs. The audit log now lives in Ajustes.

import React, { useState } from "react";
import Link from "next/link";
import { useTr } from "@/app/(admin)/AdminI18n";
import CostosTab from "../CostosTab";
import { ReportesTab } from "../InventoryClient";
import { useInventory } from "../InventoryContext";

export default function AnalisisClient() {
  const tr = useTr();
  const { inventory } = useInventory();
  const [view, setView] = useState<"costos" | "reportes">("costos");

  return (
    <div className="space-y-6">
      <div role="group" aria-label={tr("Vista de análisis")} className="inline-flex gap-1 rounded-2xl bg-[#efebe3] p-1">
        {(
          [
            ["costos", "Costos y margen"],
            ["reportes", "Reportes"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={view === id}
            onClick={() => setView(id)}
            className={`min-h-10 rounded-xl px-4 text-sm font-medium transition-all ${
              view === id ? "bg-white text-foreground shadow-sm" : "text-foreground/70 hover:text-foreground"
            }`}
          >
            {tr(label)}
          </button>
        ))}
      </div>

      {view === "costos" ? <CostosTab /> : <ReportesTab inventory={inventory} era="v2" />}

      <p className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E6CF9E] bg-[#FBF3E2] px-5 py-3 text-sm">
        <span>
          💡 {tr("La auditoría ya no es una pestaña: cada producto tiene su «Historial de cambios», y el registro completo está en Ajustes.")}
        </span>
        <Link href="/admin/settings/auditoria" className="font-semibold text-[#7A5B22] underline">
          {tr("Abrir Auditoría →")}
        </Link>
      </p>
    </div>
  );
}
