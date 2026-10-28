"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, MapPin, Pencil, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { deleteClientSite, saveClientSite, setClientSiteActive, syncClientSite } from "./siteActions";
import { daneCodeFor } from "@/utils/siigo/daneCities";
import type { ClientSite } from "@/utils/clients/sites";
import { useTr } from "@/app/(admin)/AdminI18n";

type Draft = { id?: string; name: string; address: string; city: string; city_code: string; contact_name: string; phone: string; notes: string };
const EMPTY: Draft = { name: "", address: "", city: "Medellín", city_code: "05001", contact_name: "", phone: "", notes: "" };

/**
 * The sedes of a client (one NIT, several places it buys for): list, add,
 * edit, deactivate, and create each one in Siigo as a branch of the NIT.
 */
export default function ClientSitesButton({ client, sites }: { client: { id: string; name: string; document_number: string | null }; sites: ClientSite[] }) {
  const tr = useTr();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isPending, startTransition] = useTransition();
  const active = sites.filter((s) => s.active !== false);

  const run = (action: () => Promise<{ success: boolean; error?: string }>, ok: string, after?: () => void, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    startTransition(async () => {
      setError("");
      setNotice("");
      const res = await action();
      if (!res.success) return setError(res.error ?? "");
      setNotice(ok);
      after?.();
      router.refresh();
    });
  };

  const save = () => {
    if (!draft) return;
    run(() => saveClientSite({ ...draft, client_id: client.id }), draft.id ? tr("Sede actualizada.") : tr("Sede creada."), () => setDraft(null));
  };

  const field = "w-full px-3 py-2 bg-[#fafaf9] border border-foreground/10 rounded-xl text-sm";
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-foreground/5 text-foreground/60 hover:bg-[#C59F59]/15 hover:text-[#9a7a3c]" title={tr("Sedes")}>
        <MapPin className="w-3 h-3" />{" "}{active.length ? tr("{n} sede(s)", { n: String(active.length) }) : tr("Sedes")}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/20 backdrop-blur-sm text-left">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-foreground/10 p-6 space-y-4">
            <div className="flex justify-between items-start gap-3">
              <div className="min-w-0">
                <h2 className="text-xl font-serif">{tr("Sedes de {name}", { name: client.name })}</h2>
                <p className="text-xs text-foreground/50">{tr("Un solo NIT, varios lugares de entrega. Cada sede se crea en Siigo como sucursal del NIT y sus facturas salen a esa sucursal.")}</p>
              </div>
              <button type="button" onClick={() => { setOpen(false); setDraft(null); }} aria-label={tr("Cerrar")} className="p-1 text-foreground/40 hover:text-foreground"><X className="w-5 h-5" /></button>
            </div>

            {notice && <p className="flex gap-2 rounded-xl bg-green-50 p-3 text-sm text-green-800"><CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />{notice}</p>}
            {error && <p className="text-sm text-red-600 break-words">{tr.msg(error)}</p>}

            {sites.length === 0 && !draft && <p className="text-sm text-foreground/50">{tr("Este cliente aún no tiene sedes.")}</p>}
            <ul className="divide-y divide-foreground/5">
              {sites.map((s) => (
                <li key={s.id} className={`flex flex-wrap items-start justify-between gap-3 py-3 ${s.active === false ? "opacity-50" : ""}`}>
                  <div className="min-w-0 text-sm">
                    <p className="font-bold">{s.name}{s.active === false && <span className="ml-2 text-[10px] font-bold text-foreground/40">{tr("inactiva")}</span>}</p>
                    <p className="text-xs text-foreground/60">{[s.address, s.city].filter(Boolean).join(", ") || tr("Sin dirección")}</p>
                    {(s.contact_name || s.phone) && <p className="text-xs text-foreground/50">{[s.contact_name, s.phone].filter(Boolean).join(" · ")}</p>}
                    <p className={`text-[11px] font-bold ${s.siigo_branch_office != null ? "text-green-700" : "text-foreground/40"}`}>
                      {s.siigo_branch_office != null ? tr("Siigo: sucursal {n}", { n: String(s.siigo_branch_office) }) : tr("Aún no está en Siigo (se crea al facturarle o con «Crear en Siigo»)")}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {s.siigo_branch_office == null && s.active !== false && (
                      <button type="button" disabled={isPending || !client.document_number} onClick={() => run(() => syncClientSite(s.id), tr("Sede creada en Siigo como sucursal."))}
                        className="inline-flex items-center gap-1 text-xs font-bold text-[#C59F59] hover:underline disabled:opacity-40" title={client.document_number ? "" : tr("El cliente no tiene NIT")}>
                        {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}{" "}{tr("Crear en Siigo")}
                      </button>
                    )}
                    <button type="button" disabled={isPending} onClick={() => setDraft({ id: s.id, name: s.name, address: s.address ?? "", city: s.city ?? "", city_code: s.city_code ?? "", contact_name: s.contact_name ?? "", phone: s.phone ?? "", notes: s.notes ?? "" })}
                      aria-label={tr("Editar sede")} className="text-foreground/40 hover:text-[#C59F59]"><Pencil className="w-3.5 h-3.5" /></button>
                    <button type="button" disabled={isPending} onClick={() => run(() => setClientSiteActive(s.id, s.active === false), s.active === false ? tr("Sede activada.") : tr("Sede desactivada."))}
                      className="text-xs font-bold text-foreground/50 hover:text-foreground">{s.active === false ? tr("Activar") : tr("Desactivar")}</button>
                    {s.siigo_branch_office == null && (
                      <button type="button" disabled={isPending} onClick={() => run(() => deleteClientSite(s.id), tr("Sede eliminada."), undefined, tr("¿Eliminar la sede {name}?", { name: s.name }))}
                        aria-label={tr("Eliminar sede")} className="text-foreground/40 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            {draft ? (
              <div className="rounded-2xl border border-foreground/10 p-4 space-y-3">
                <p className="text-sm font-bold">{draft.id ? tr("Editar sede") : tr("Nueva sede")}</p>
                <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder={tr("Nombre, ej. Smart Fit Fabricato")} className={field} />
                <input value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} placeholder={tr("Dirección")} className={field} />
                <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_120px] gap-3">
                  <input value={draft.city} onChange={(e) => setDraft({ ...draft, city: e.target.value, city_code: daneCodeFor(e.target.value) ?? draft.city_code })} placeholder={tr("Ciudad")} className={field} />
                  <input value={draft.city_code} onChange={(e) => setDraft({ ...draft, city_code: e.target.value.replace(/\D/g, "").slice(0, 5) })} placeholder={tr("DANE")} aria-label={tr("Código DANE")} className={field} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input value={draft.contact_name} onChange={(e) => setDraft({ ...draft, contact_name: e.target.value })} placeholder={tr("Contacto (opcional)")} className={field} />
                  <input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} placeholder={tr("Teléfono (opcional)")} className={field} />
                </div>
                <input value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder={tr("Nota (opcional), ej. piso 5, recibe administración")} className={field} />
                {draft.id && sites.find((s) => s.id === draft.id)?.siigo_branch_office != null && (
                  <p className="text-[11px] text-amber-700">{tr("Esta sede ya es sucursal en Siigo: el cambio queda en la app y en las facturas nuevas; en Siigo edítala a mano si hace falta.")}</p>
                )}
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setDraft(null)} className="px-4 py-2 rounded-xl border border-foreground/10 text-xs font-bold hover:bg-stone-50">{tr("Cancelar")}</button>
                  <button type="button" onClick={save} disabled={isPending || !draft.name.trim()} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#C59F59] text-white text-xs font-bold hover:bg-[#B38E4D] disabled:opacity-40">
                    {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}{" "}{tr("Guardar sede")}
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setDraft({ ...EMPTY })} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-foreground/15 text-xs font-bold hover:bg-foreground/5">
                <Plus className="w-4 h-4" />{" "}{tr("Agregar sede")}
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
