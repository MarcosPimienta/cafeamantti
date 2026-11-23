"use client";

// Producción: the coffee pipeline in one place. The stage strip shows the
// kilos at each step; the steps below are the existing forms and histories,
// in the order the coffee goes through them.

import React, { useMemo, useState } from "react";
import { useTr } from "@/app/(admin)/AdminI18n";
import { ColdBrewTab, ProdAltasTab, ReempaqueTab, TostionTab, TrillaTab } from "../InventoryClient";
import { useInventory } from "../InventoryContext";
import StageStrip from "../StageStrip";
import { stageTotals } from "../stages";
import { useWarehouses } from "../bodegas/useWarehouses";

export type ProductionStep = "trilla" | "tostion" | "empaque" | "reempaque" | "cold_brew";

const STEPS: { id: ProductionStep; n: string; label: string; hint: string }[] = [
  { id: "trilla", n: "1", label: "Trilla", hint: "Pergamino → verde" },
  { id: "tostion", n: "2", label: "Tostión", hint: "Verde → tostado a granel" },
  { id: "empaque", n: "3", label: "Empaque", hint: "Granel → bolsas" },
  { id: "reempaque", n: "↺", label: "Reempaque", hint: "Abrir y volver a empacar" },
  { id: "cold_brew", n: "☕", label: "Cold Brew", hint: "Maquila Café 11:11" },
];

export default function ProduccionClient({ initialStep }: { initialStep: ProductionStep }) {
  const tr = useTr();
  const { inventory, updateStocks } = useInventory();
  const [step, setStep] = useState<ProductionStep>(initialStep);
  const wh = useWarehouses();
  const totals = useMemo(() => stageTotals(inventory), [inventory]);

  function pick(s: ProductionStep) {
    setStep(s);
    window.history.replaceState(null, "", `/admin/inventory/produccion?paso=${s}`);
  }

  return (
    <div className="space-y-6">
      <StageStrip totals={totals} />

      <nav aria-label={tr("Pasos de producción")}>
        <ol className="grid grid-cols-2 gap-2 md:grid-cols-5">
          {STEPS.map((s) => {
            const active = s.id === step;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => pick(s.id)}
                  className={`flex w-full min-h-16 items-center gap-3 rounded-2xl border-[1.5px] px-4 py-3 text-left transition-all ${
                    active ? "border-foreground bg-white shadow-sm" : "border-foreground/10 bg-white/60 hover:border-foreground/30"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                      active ? "bg-foreground text-white" : "bg-[#efebe3] text-foreground/80"
                    }`}
                  >
                    {s.n}
                  </span>
                  <span>
                    <span className="block font-semibold">{tr(s.label)}</span>
                    <span className="block text-xs text-foreground/70">{tr(s.hint)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {step === "trilla" && <TrillaTab inventory={inventory} onStocksUpdate={updateStocks} era="v2" />}
      {step === "tostion" && <TostionTab inventory={inventory} onStocksUpdate={updateStocks} era="v2" />}
      {step === "empaque" && <ProdAltasTab inventory={inventory} onStocksUpdate={updateStocks} era="v2" />}
      {step === "reempaque" && <ReempaqueTab inventory={inventory} onStocksUpdate={updateStocks} era="v2" />}
      {step === "cold_brew" && (
        <ColdBrewTab
          inventory={inventory}
          onStocksUpdate={updateStocks}
          era="v2"
          warehouses={wh.migrated ? wh.warehouses : undefined}
          warehouseStock={wh.migrated ? wh.stock : undefined}
          onWarehousesChanged={wh.reload}
        />
      )}
    </div>
  );
}
