"use client";

// Coffee by stage, from parchment to packed bags. Shown on Existencias and
// Producción so the pipeline is always in view.

import React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useTr } from "@/app/(admin)/AdminI18n";
import { fmtQty } from "./InventoryClient";
import type { StageTotals } from "./stages";

export default function StageStrip({ totals, valueText }: { totals: StageTotals; valueText?: React.ReactNode }) {
  const tr = useTr();
  const steps = [
    { label: tr("Pergamino"), value: fmtQty(round1(totals.pergaminoKg)), unit: "kg", sub: tr("Llega de Compras") },
    { label: tr("Verde"), value: fmtQty(round1(totals.verdeKg)), unit: "kg", sub: tr("Después de la trilla") },
    { label: tr("Tostado a granel"), value: fmtQty(round1(totals.granelKg)), unit: "kg", sub: tr("Grano y molido") },
    {
      label: tr("Empacado"),
      value: fmtQty(round1(totals.empacadoKg)),
      unit: "kg",
      sub: tr("{uds} uds · {cb} cold brew", { uds: fmtQty(totals.empacadoUds), cb: fmtQty(totals.coldBrewUds) }),
    },
  ];
  return (
    <section aria-label={tr("Café por etapa")} className="bg-white rounded-3xl border border-foreground/5 shadow-sm p-5 space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">{tr("Café por etapa")}</h2>
        {valueText && <div className="text-sm text-foreground/70">{valueText}</div>}
      </div>
      <ol className="flex flex-wrap items-stretch gap-2">
        {steps.map((s, i) => (
          <li key={s.label} className="flex flex-1 basis-40 items-center gap-2">
            <Link
              href="/admin/inventory/produccion"
              className="flex-1 rounded-2xl border border-foreground/5 bg-[#f9f7f0] px-4 py-3 hover:border-foreground/20 transition-colors"
            >
              <span className="block text-xs font-medium text-foreground/70">{s.label}</span>
              <span className="block text-xl font-semibold tabular-nums">
                {s.value} <span className="text-sm font-medium text-foreground/60">{s.unit}</span>
              </span>
              <span className="block text-xs text-foreground/60">{s.sub}</span>
            </Link>
            {i < steps.length - 1 && <ChevronRight aria-hidden="true" className="w-4 h-4 shrink-0 text-foreground/30" />}
          </li>
        ))}
      </ol>
    </section>
  );
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
