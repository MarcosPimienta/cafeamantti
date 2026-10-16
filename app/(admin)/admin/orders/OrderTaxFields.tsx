"use client";

import React, { useEffect, useState } from "react";
import { getOrderTaxSetup } from "./taxActions";
import { orderTaxTotals, rateOf, type TaxOption, type TaxedLine } from "@/utils/orders/tax";
import { useTr } from "@/app/(admin)/AdminI18n";

export type OrderTaxSetup = { options: TaxOption[]; generalTaxId: number | null; pricesIncludeTax: boolean; error: string | null };

const cop = (n: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

/** Siigo's IVA taxes and how prices are entered, loaded once per form. */
export function useOrderTaxes(): OrderTaxSetup | null {
  const [setup, setSetup] = useState<OrderTaxSetup | null>(null);
  useEffect(() => {
    let alive = true;
    getOrderTaxSetup()
      .then((s) => alive && setSetup(s))
      .catch((e) => alive && setSetup({ options: [], generalTaxId: null, pricesIncludeTax: true, error: String(e) }));
    return () => {
      alive = false;
    };
  }, []);
  return setup;
}

/** The IVA of one order line: without IVA, or one of Siigo's (5%, 19%…). */
export function TaxSelect({ value, setup, onChange, disabled }: { value: number | null | undefined; setup: OrderTaxSetup | null; onChange: (taxId: number, rate: number) => void; disabled?: boolean }) {
  const tr = useTr();
  const options = setup?.options ?? [];
  const known = value === 0 || value == null || options.some((o) => o.id === value);
  return (
    <select
      value={value ?? 0}
      disabled={disabled || !setup}
      onChange={(e) => {
        const id = Number(e.target.value);
        onChange(id, rateOf(id, options));
      }}
      className="w-full px-3 py-2 bg-white border border-foreground/10 rounded-lg text-sm disabled:opacity-50"
      aria-label={tr("IVA")}
    >
      <option value={0}>{tr("Sin IVA")}</option>
      {options.filter((o) => o.rate > 0).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      {!known && <option value={value ?? 0}>{tr("IVA (id {id})", { id: String(value) })}</option>}
    </select>
  );
}

/** Subtotal, IVA and total of the order, as the invoice will charge them. */
export function OrderTaxTotals({ lines, setup }: { lines: TaxedLine[]; setup: OrderTaxSetup | null }) {
  const tr = useTr();
  const included = setup?.pricesIncludeTax ?? true;
  const { subtotal, iva, total } = orderTaxTotals(lines, included);
  return (
    <div className="pt-4 border-t border-foreground/5 space-y-1 text-sm">
      <div className="flex justify-between text-foreground/60"><span>{tr("Subtotal (sin IVA)")}</span><span>{cop(subtotal)}</span></div>
      <div className="flex justify-between text-foreground/60"><span>{included ? tr("IVA (incluido en los precios)") : tr("IVA")}</span><span>{cop(iva)}</span></div>
      <div className="flex justify-between items-center">
        <span className="font-medium">{tr("Total con IVA")}</span>
        <span className="font-serif text-xl text-[#C59F59]">{cop(total)}</span>
      </div>
      {setup?.error && <p className="text-[11px] text-amber-700">{tr("No se pudieron traer las tarifas de IVA de Siigo: {error}", { error: tr.msg(setup.error) })}</p>}
    </div>
  );
}
