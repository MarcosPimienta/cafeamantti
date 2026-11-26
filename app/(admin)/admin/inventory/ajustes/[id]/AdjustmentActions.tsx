"use client";

// Print the voucher, or annul it (which writes the reversal movements).

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Printer, XCircle } from "lucide-react";
import { useTr } from "@/app/(admin)/AdminI18n";
import { annulAdjustment } from "../actions";

export default function AdjustmentActions({ id, label, annulled }: { id: string; label: string; annulled: boolean }) {
  const tr = useTr();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function annul(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!reason.trim()) {
      setError(tr("Escribe por qué se anula el comprobante."));
      return;
    }
    startTransition(async () => {
      const res = await annulAdjustment(id, reason);
      if (!res.success) {
        setError(res.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        <button type="button" onClick={() => window.print()} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-foreground/15 bg-white px-4 text-sm font-semibold hover:border-foreground/40">
          <Printer className="w-4 h-4" /> {tr("Imprimir")}
        </button>
        {!annulled && (
          <button type="button" onClick={() => setOpen((v) => !v)} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-red-200 bg-white px-4 text-sm font-semibold text-red-700 hover:bg-red-50">
            <XCircle className="w-4 h-4" /> {tr("Anular")}
          </button>
        )}
      </div>
      {open && (
        <form onSubmit={annul} className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-4 space-y-3 shadow-sm">
          <p className="text-sm">{tr("Anular {label} devuelve el inventario a como estaba con movimientos contrarios de hoy. El comprobante queda, marcado como anulado.", { label })}</p>
          <input
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={tr("Motivo de la anulación")}
            className="w-full min-h-10 rounded-xl border border-foreground/15 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200"
          />
          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{tr.msg(error)}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="min-h-10 rounded-xl px-4 text-sm font-semibold text-foreground/70 hover:bg-foreground/5">{tr("Cancelar")}</button>
            <button type="submit" disabled={pending} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">
              {pending && <Loader2 className="w-4 h-4 animate-spin" />}
              {tr("Anular comprobante")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
