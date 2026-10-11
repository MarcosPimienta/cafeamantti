"use client";

import React, { useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Send } from "lucide-react";
import { createSiigoPurchase, previewSiigoPurchase } from "../siigo/actions";

const cop = (n: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

/** In the expense form (editing): send the saved expense to Siigo as a purchase invoice. */
export default function ExpenseSiigoPanel({ expenseId, sentName, dirty }: { expenseId: string; sentName?: string | null; dirty: boolean }) {
  const [sent, setSent] = useState<string | null>(sentName ?? null);
  const [check, setCheck] = useState<{ problems: string[]; supplier: string | null; total: number } | null>(null);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const review = () =>
    startTransition(async () => {
      setError("");
      const res = await previewSiigoPurchase(expenseId);
      if (!res.success) return setError(res.error);
      setCheck(res);
    });

  const send = () =>
    startTransition(async () => {
      setError("");
      const res = await createSiigoPurchase(expenseId);
      if (!res.success) {
        setError(res.error);
        if (res.problems) setCheck((c) => (c ? { ...c, problems: res.problems! } : c));
        return;
      }
      if (res.purchase) setSent(res.purchase.name ?? "Compra creada");
    });

  return (
    <div className="p-4 rounded-xl border border-foreground/10 space-y-2">
      <p className="field-label">Siigo</p>
      {sent ? (
        <p className="flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 className="w-4 h-4" /> En Siigo como factura de compra {sent}</p>
      ) : dirty ? (
        <p className="text-xs text-foreground/50">Guarda los cambios antes de enviarlo a Siigo.</p>
      ) : !check ? (
        <button type="button" onClick={review} disabled={isPending} className="flex items-center gap-2 text-xs font-bold text-[#C59F59] hover:underline disabled:opacity-50">
          {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Revisar envío a Siigo como factura de compra
        </button>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-foreground/60">Proveedor: <strong>{check.supplier ?? "—"}</strong> · Total {cop(check.total)}</p>
          {check.problems.length > 0 ? (
            <ul className="text-xs text-red-700 bg-red-50 rounded-xl p-3 space-y-1">
              {check.problems.map((p) => <li key={p} className="flex gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />{p}</li>)}
            </ul>
          ) : (
            <button type="button" onClick={send} disabled={isPending}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-foreground text-background text-xs font-bold hover:bg-[#C59F59] disabled:opacity-50">
              {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Enviar a Siigo
            </button>
          )}
        </div>
      )}
      {error && <p className="text-xs text-red-600 break-words">{error}</p>}
    </div>
  );
}
