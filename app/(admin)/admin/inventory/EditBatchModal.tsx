"use client";

import React, { useState, useTransition } from "react";
import { Loader2, X } from "lucide-react";
import { updateProductionBatch } from "../../actions";
import { useTr } from "@/app/(admin)/AdminI18n";

type Batch = { id: string; date: string; inputQty: number; outputQty: number; notes: string | null };

/**
 * Corrects a roast or hulling batch. Only the difference moves: what was
 * already packed or sold from it stays as it is.
 */
export default function EditBatchModal({
  batch, kind, onClose, onSaved,
}: {
  batch: Batch;
  kind: "tostion" | "trilla";
  onClose: () => void;
  onSaved: (updates: { id: string; newStock: number }[]) => void;
}) {
  const tr = useTr();
  const [date, setDate] = useState(batch.date.slice(0, 10));
  const [inputQty, setInputQty] = useState(String(batch.inputQty));
  const [outputQty, setOutputQty] = useState(String(batch.outputQty));
  const [notes, setNotes] = useState(batch.notes ?? "");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const inNum = parseFloat(inputQty) || 0;
  const outNum = parseFloat(outputQty) || 0;
  const rend = inNum > 0 ? (outNum / inNum) * 100 : 0;
  const dIn = inNum - batch.inputQty;
  const dOut = outNum - batch.outputQty;
  const inputName = kind === "trilla" ? tr("Pergamino (entra)") : tr("Verde (entra)");
  const outputName = kind === "trilla" ? tr("Verde (sale)") : tr("Tostado (sale)");
  const fmt = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(2)} kg`;

  const save = () =>
    startTransition(async () => {
      setError("");
      const res = await updateProductionBatch(batch.id, { inputQtyKg: inNum, outputQtyKg: outNum, date, notes });
      if ("error" in res) return setError(tr.msg(res.error));
      onSaved([
        { id: res.inputInventoryId, newStock: res.newInputStock },
        { id: res.outputInventoryId, newStock: res.newOutputStock },
      ]);
    });

  const field = "w-full px-3 py-2 bg-[#fafaf9] border border-foreground/10 rounded-xl text-sm";
  return (
    <div className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 text-left">
      <div className="bg-white rounded-3xl max-w-md w-full max-h-[90vh] overflow-y-auto border border-foreground/5 shadow-2xl p-6 space-y-4">
        <div className="flex justify-between items-start gap-3">
          <div>
            <h2 className="text-xl font-serif font-bold">{kind === "trilla" ? tr("Editar trilla") : tr("Editar tostión")}</h2>
            <p className="text-xs text-foreground/50">{tr("Solo se mueve la diferencia en el inventario; lo ya empacado o vendido no cambia.")}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={tr("Cerrar")} className="p-1 text-foreground/40 hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 [&>*]:min-w-0">
          <label className="sm:col-span-2 text-xs font-bold text-foreground/60 space-y-1">
            <span>{tr("Fecha")}</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
          </label>
          <label className="text-xs font-bold text-foreground/60 space-y-1">
            <span>{inputName} (kg)</span>
            <input type="number" min={0} step="any" value={inputQty} onChange={(e) => setInputQty(e.target.value)} className={field} />
          </label>
          <label className="text-xs font-bold text-foreground/60 space-y-1">
            <span>{outputName} (kg)</span>
            <input type="number" min={0} step="any" value={outputQty} onChange={(e) => setOutputQty(e.target.value)} className={field} />
          </label>
        </div>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={tr("Notas")} className={field} />
        <div className="rounded-2xl bg-[#fdfbf7] border border-foreground/5 p-4 text-sm space-y-1">
          <p className="flex justify-between"><span>{tr("Rendimiento")}</span><span className="font-bold">{rend.toFixed(1)}%</span></p>
          <p className="flex justify-between"><span>{inputName}</span><span className={dIn > 0 ? "text-red-600" : dIn < 0 ? "text-emerald-700" : "text-foreground/40"}>{dIn === 0 ? tr("sin cambio") : tr("{delta} usados", { delta: fmt(dIn) })}</span></p>
          <p className="flex justify-between"><span>{outputName}</span><span className={dOut > 0 ? "text-emerald-700" : dOut < 0 ? "text-red-600" : "text-foreground/40"}>{dOut === 0 ? tr("sin cambio") : tr("{delta} al inventario", { delta: fmt(dOut) })}</span></p>
        </div>
        {error && <p className="text-xs text-red-600 break-words">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-foreground/10 text-xs font-bold hover:bg-stone-50">{tr("Cancelar")}</button>
          <button type="button" onClick={save} disabled={isPending || !(inNum > 0) || !(outNum > 0)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#C59F59] text-white text-xs font-bold hover:bg-[#B38E4D] disabled:opacity-40">
            {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}{" "}{tr("Guardar cambios")}
          </button>
        </div>
      </div>
    </div>
  );
}
