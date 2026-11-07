"use client";

import React from "react";
import { X } from "lucide-react";
import { parseAmount, type ListRange, type ListSort } from "@/utils/lists/rangeSort";
import { useTr } from "@/app/(admin)/AdminI18n";

/** What the bar holds: amounts stay as typed ("1.500.000") so the inputs keep their format. */
export type RangeSortState = { from: string; to: string; minText: string; maxText: string; sort: ListSort };

export const emptyRange = (sort: ListSort): RangeSortState => ({ from: "", to: "", minText: "", maxText: "", sort });

export function toRange(s: RangeSortState): ListRange {
  return { from: s.from, to: s.to, min: parseAmount(s.minText), max: parseAmount(s.maxText) };
}

export const SORT_LABEL: Record<ListSort, string> = {
  "fecha-desc": "Fecha: más recientes primero",
  "fecha-asc": "Fecha: más antiguas primero",
  "valor-desc": "Valor: de mayor a menor",
  "valor-asc": "Valor: de menor a mayor",
  "saldo-desc": "Saldo: de mayor a menor",
  "vence-asc": "Vencimiento: el más próximo primero",
};

const INPUT = "rounded-lg border border-foreground/15 bg-background px-2 py-1.5 text-sm focus:border-[#C59F59] focus:outline-none";

/** Date range, amount range and sort order for an admin list. */
export default function RangeSortBar({ value, onChange, sorts, amountHint, children }: {
  value: RangeSortState;
  onChange: (next: RangeSortState) => void;
  sorts: ListSort[];
  /** Under the amount fields, e.g. "Entradas y salidas, sin signo". */
  amountHint?: string;
  /** Extra controls at the start of the bar (a search box). */
  children?: React.ReactNode;
}) {
  const tr = useTr();
  const set = (patch: Partial<RangeSortState>) => onChange({ ...value, ...patch });
  const ranged = !!(value.from || value.to || value.minText.trim() || value.maxText.trim());
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-foreground/10 bg-white p-3">
      {children}
      <Field label={tr("Desde")}>
        <input type="date" value={value.from} max={value.to || undefined} onChange={(e) => set({ from: e.target.value })} className={INPUT} />
      </Field>
      <Field label={tr("Hasta")}>
        <input type="date" value={value.to} min={value.from || undefined} onChange={(e) => set({ to: e.target.value })} className={INPUT} />
      </Field>
      <Field label={tr("Valor mínimo")}>
        <input inputMode="numeric" value={value.minText} onChange={(e) => set({ minText: e.target.value })} placeholder="$ 0" className={`${INPUT} w-32`} />
      </Field>
      <Field label={tr("Valor máximo")}>
        <input inputMode="numeric" value={value.maxText} onChange={(e) => set({ maxText: e.target.value })} placeholder={tr("Sin límite")} className={`${INPUT} w-32`} />
      </Field>
      <Field label={tr("Ordenar por")}>
        <select value={value.sort} onChange={(e) => set({ sort: e.target.value as ListSort })} className={INPUT}>
          {sorts.map((s) => <option key={s} value={s}>{tr(SORT_LABEL[s])}</option>)}
        </select>
      </Field>
      {ranged && (
        <button type="button" onClick={() => set({ from: "", to: "", minText: "", maxText: "" })} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-foreground/60 hover:bg-foreground/5">
          <X className="h-3.5 w-3.5" /> {tr("Quitar fechas y valores")}
        </button>
      )}
      {amountHint && <p className="w-full text-[11px] text-foreground/50">{amountHint}</p>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-bold uppercase tracking-widest text-foreground/50">{label}</span>
      {children}
    </label>
  );
}
