"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Edit2, Loader2, Package, Trash2 } from "lucide-react";
import { deleteMaquilaProposal } from "./actions";
import { calculateProposal, DEFAULT_SETTINGS, type MaquilaLine, type MaquilaSettings } from "@/utils/maquila";

/* eslint-disable @typescript-eslint/no-explicit-any */
const STATUS_STYLE: Record<string, string> = {
  borrador: "bg-gray-100 text-gray-700",
  enviada: "bg-blue-50 text-blue-700",
  aceptada: "bg-green-100 text-green-800",
  rechazada: "bg-red-50 text-red-700",
};
const cop = (n: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

/** Maquila proposals table for CRM Documentos. */
export default function MaquilaList({ proposals, onDeleted }: { proposals: any[]; onDeleted: (id: string) => void }) {
  const [deleting, setDeleting] = useState<string | null>(null);

  async function remove(id: string) {
    if (!window.confirm("¿Eliminar esta propuesta de maquila?")) return;
    setDeleting(id);
    try {
      await deleteMaquilaProposal(id);
      onDeleted(id);
    } catch (err) {
      alert(err instanceof Error ? err.message : "No se pudo eliminar");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <table className="w-full text-left text-sm text-foreground/80">
      <thead className="bg-[#fdfbf7] border-b border-foreground/5 text-xs font-bold uppercase tracking-widest text-foreground/60">
        <tr>
          <th className="px-6 py-4 font-medium">Cliente / Propuesta</th>
          <th className="px-6 py-4 font-medium">Fecha</th>
          <th className="px-6 py-4 font-medium">Presentaciones</th>
          <th className="px-6 py-4 font-medium text-right">Valor mensual</th>
          <th className="px-6 py-4 font-medium">Estado</th>
          <th className="px-6 py-4 font-medium text-center">Acciones</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-foreground/5">
        {proposals.length === 0 ? (
          <tr>
            <td colSpan={6} className="px-6 py-20 text-center">
              <Package className="w-12 h-12 text-foreground/20 mx-auto mb-4" />
              <p className="text-lg font-serif text-foreground">No hay propuestas de maquila</p>
            </td>
          </tr>
        ) : (
          proposals.map((p) => {
            const client = Array.isArray(p.clients) ? p.clients[0] : p.clients;
            const lines = (p.lines ?? []) as MaquilaLine[];
            const settings = { ...DEFAULT_SETTINGS, ...(p.settings ?? {}) } as MaquilaSettings;
            const { totals } = calculateProposal(lines, settings);
            return (
              <tr key={p.id} className="hover:bg-foreground/[0.02]">
                <td className="px-6 py-4">
                  <div className="font-bold text-foreground">{client?.name || p.custom_client_name || "Cliente"}</div>
                  <div className="text-xs text-[#C59F59] font-medium">{p.title}</div>
                </td>
                <td className="px-6 py-4 text-xs text-foreground/60 whitespace-nowrap">{p.proposal_date}</td>
                <td className="px-6 py-4 text-xs text-foreground/60">{lines.map((l) => l.presentation).filter(Boolean).join(" · ") || "—"}</td>
                <td className="px-6 py-4 text-right font-mono text-xs">{cop(totals.total)}</td>
                <td className="px-6 py-4 text-xs">
                  <span className={`px-2.5 py-0.5 rounded-full font-bold capitalize ${STATUS_STYLE[p.status] ?? STATUS_STYLE.borrador}`}>{p.status}</span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center justify-center gap-3">
                    <Link href={`/admin/quotes/maquila/${p.id}`} className="text-[#C59F59] p-2 hover:bg-[#C59F59]/10 rounded-lg" title="Editar" aria-label="Editar">
                      <Edit2 className="w-4 h-4" />
                    </Link>
                    <button onClick={() => remove(p.id)} disabled={deleting === p.id} className="text-red-400 hover:text-red-600 p-2 hover:bg-red-50 rounded-lg disabled:opacity-50" title="Eliminar" aria-label="Eliminar">
                      {deleting === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );
}
