"use client";

import React, { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Handshake,
  History,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Undo2,
  Wrench,
  X,
  CheckCircle2,
  Archive,
  StickyNote,
} from "lucide-react";
import {
  getComodatosData,
  getUnitHistory,
  registerEquipmentUnit,
  assignComodato,
  returnComodato,
  updateEquipmentStatus,
} from "./actions";
import { UNIT_STATUS_LABELS, canApply, commitmentProgress, daysSince, summarizeUnits, type UnitStatus } from "@/utils/comodato";

type Data = Awaited<ReturnType<typeof getComodatosData>>;
type Unit = Data["units"][number] & {
  serial: string | null;
  label: string | null;
  status: UnitStatus;
  notes: string | null;
  assignment: { start_date: string; monthly_commitment_kg: number | null; delivery_notes: string | null; client_id: string } | null;
};

const labelCls = "block text-[10px] font-bold uppercase tracking-widest text-foreground/40 mb-1.5";
const inputCls =
  "w-full px-3 py-2.5 bg-white border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20";

const STATUS_STYLE: Record<UnitStatus, string> = {
  disponible: "bg-emerald-50 text-emerald-700",
  en_comodato: "bg-[#C59F59]/15 text-[#9a7a3c]",
  mantenimiento: "bg-amber-50 text-amber-700",
  baja: "bg-foreground/5 text-foreground/40",
};

const fmtDate = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
};
const kg = (n: number) => `${n.toLocaleString("es-CO", { maximumFractionDigits: 1 })} kg`;
const unitTitle = (u: Unit) => u.label || u.model?.product_name || "Máquina";

type Dialog =
  | { kind: "register" }
  | { kind: "assign"; unit: Unit }
  | { kind: "return"; unit: Unit }
  | { kind: "status"; unit: Unit; action: "mantenimiento" | "disponible" | "baja" | "nota" }
  | { kind: "history"; unit: Unit };

/** Machines lent in comodato: who has each one, since when, and how much coffee they buy. */
export default function ComodatosClient() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<UnitStatus | "activos">("activos");
  const [isPending, startTransition] = useTransition();

  function load() {
    startTransition(async () => {
      try {
        setData(await getComodatosData());
        setError("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudieron cargar los comodatos");
      }
    });
  }
  useEffect(() => {
    load();
  }, []);

  const units = useMemo(() => (data?.units ?? []) as Unit[], [data]);
  const summary = summarizeUnits(units);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return units.filter((u) => {
      if (statusFilter === "activos" ? u.status === "baja" : u.status !== statusFilter) return false;
      if (!term) return true;
      return [u.serial, u.label, u.model?.product_name, u.client?.name, u.notes].filter(Boolean).join(" ").toLowerCase().includes(term);
    });
  }, [units, search, statusFilter]);

  if (error) return <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl">{error}</p>;
  if (!data) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 text-[#C59F59] animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-serif mb-1">Comodatos</h1>
          <p className="text-foreground/60 text-sm">Máquinas prestadas a clientes: quién tiene cada una, desde cuándo y cuánto café compran.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="p-2.5 rounded-xl border border-foreground/10 bg-white hover:bg-foreground/5" aria-label="Recargar">
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4 text-foreground/50" />}
          </button>
          <button
            onClick={() => setDialog({ kind: "register" })}
            disabled={!data.migrated}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-foreground text-background hover:bg-[#C59F59] hover:text-white text-xs font-bold uppercase tracking-widest disabled:opacity-50"
          >
            <Plus className="w-4 h-4" /> Registrar máquina
          </button>
        </div>
      </div>

      {!data.migrated && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          Falta aplicar la migración <code className="font-mono">20261010010000_comodatos.sql</code> en Supabase.
        </div>
      )}
      {data.migrated && data.models.length === 0 && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-[#fdfbf7] border border-foreground/10 text-sm text-foreground/70">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-[#C59F59]" />
          <span>
            Primero crea el <strong>modelo</strong> de la máquina en{" "}
            <Link href="/admin/inventory" className="underline">Inventario → Nuevo producto</Link> con la categoría <strong>Equipo</strong>.
            Luego registra aquí cada máquina física con su serial.
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {(
          [
            ["Máquinas activas", summary.activos, "activos"],
            ["En comodato", summary.en_comodato, "en_comodato"],
            ["Disponibles", summary.disponible, "disponible"],
            ["Mantenimiento", summary.mantenimiento, "mantenimiento"],
          ] as const
        ).map(([label, value, key]) => (
          <button
            key={key}
            onClick={() => setStatusFilter(key)}
            className={`text-left bg-white rounded-2xl border p-4 shadow-sm ${statusFilter === key ? "border-[#C59F59] ring-2 ring-[#C59F59]/20" : "border-foreground/5"}`}
          >
            <p className="text-[10px] font-bold uppercase tracking-widest text-foreground/40">{label}</p>
            <p className="text-2xl font-serif font-bold mt-1">{value}</p>
          </button>
        ))}
      </div>

      <div className="flex flex-col md:flex-row gap-3 md:items-center">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-foreground/40" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar serial, modelo, cliente…"
            aria-label="Buscar máquinas"
            className={`${inputCls} pl-10`}
          />
        </div>
        <button
          onClick={() => setStatusFilter(statusFilter === "baja" ? "activos" : "baja")}
          className={`self-start px-3 py-2 rounded-xl border text-xs font-bold ${statusFilter === "baja" ? "bg-foreground text-background border-foreground" : "bg-white text-foreground/60 border-foreground/10"}`}
        >
          Ver dadas de baja ({summary.baja})
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-3xl border border-foreground/5 shadow-sm text-center py-16">
          <Handshake className="w-12 h-12 text-foreground/20 mx-auto mb-3" />
          <p className="font-serif text-foreground/50">No hay máquinas en esta vista.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((u) => {
            const bought = u.client ? data.kgLast30ByClient[u.client.id] ?? 0 : 0;
            const progress = u.assignment ? commitmentProgress(bought, u.assignment.monthly_commitment_kg) : null;
            return (
              <article key={u.id} className="bg-white rounded-3xl border border-foreground/5 shadow-sm p-5 flex flex-col gap-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-bold leading-snug">{unitTitle(u)}</h3>
                    <p className="text-xs text-foreground/50 font-mono mt-0.5">
                      {u.serial ? `S/N ${u.serial}` : "Sin serial"}
                      {u.label && u.model ? ` · ${u.model.product_name}` : ""}
                    </p>
                  </div>
                  <span className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${STATUS_STYLE[u.status]}`}>
                    {UNIT_STATUS_LABELS[u.status]}
                  </span>
                </div>

                {u.status === "en_comodato" && u.assignment && (
                  <div className="rounded-2xl bg-[#fdfbf7] p-4 space-y-2 text-sm">
                    <p className="font-bold">{u.client?.name ?? "Cliente"}</p>
                    <p className="text-xs text-foreground/50">
                      Desde {fmtDate(u.assignment.start_date)} · {daysSince(u.assignment.start_date, data.today)} días
                    </p>
                    <div className="text-xs">
                      <span className="text-foreground/50">Café últimos 30 días: </span>
                      <span className="font-bold">{kg(bought)}</span>
                      {u.assignment.monthly_commitment_kg ? (
                        <span className="text-foreground/50"> de {kg(Number(u.assignment.monthly_commitment_kg))} comprometidos</span>
                      ) : null}
                    </div>
                    {progress !== null && (
                      <div className="h-1.5 rounded-full bg-foreground/10 overflow-hidden" aria-label={`Compromiso cumplido ${Math.round(progress * 100)} %`}>
                        <div
                          className={`h-full ${progress >= 1 ? "bg-emerald-500" : progress >= 0.6 ? "bg-amber-500" : "bg-red-500"}`}
                          style={{ width: `${Math.min(100, progress * 100)}%` }}
                        />
                      </div>
                    )}
                  </div>
                )}

                {u.notes && <p className="text-xs text-foreground/50 line-clamp-2">{u.notes}</p>}

                <div className="flex flex-wrap gap-2 mt-auto">
                  {canApply("asignar", u.status) && (
                    <ActionButton primary icon={<Handshake className="w-3.5 h-3.5" />} onClick={() => setDialog({ kind: "assign", unit: u })}>
                      Entregar
                    </ActionButton>
                  )}
                  {canApply("devolver", u.status) && (
                    <ActionButton primary icon={<Undo2 className="w-3.5 h-3.5" />} onClick={() => setDialog({ kind: "return", unit: u })}>
                      Registrar devolución
                    </ActionButton>
                  )}
                  {canApply("mantenimiento", u.status) && (
                    <ActionButton icon={<Wrench className="w-3.5 h-3.5" />} onClick={() => setDialog({ kind: "status", unit: u, action: "mantenimiento" })}>
                      Mantenimiento
                    </ActionButton>
                  )}
                  {canApply("disponible", u.status) && (
                    <ActionButton icon={<CheckCircle2 className="w-3.5 h-3.5" />} onClick={() => setDialog({ kind: "status", unit: u, action: "disponible" })}>
                      Lista para usar
                    </ActionButton>
                  )}
                  <ActionButton icon={<StickyNote className="w-3.5 h-3.5" />} onClick={() => setDialog({ kind: "status", unit: u, action: "nota" })}>
                    Nota
                  </ActionButton>
                  <ActionButton icon={<History className="w-3.5 h-3.5" />} onClick={() => setDialog({ kind: "history", unit: u })}>
                    Historial
                  </ActionButton>
                  {canApply("baja", u.status) && (
                    <ActionButton icon={<Archive className="w-3.5 h-3.5" />} onClick={() => setDialog({ kind: "status", unit: u, action: "baja" })}>
                      Dar de baja
                    </ActionButton>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {dialog?.kind === "register" && <RegisterDialog data={data} onClose={() => setDialog(null)} onDone={load} />}
      {dialog?.kind === "assign" && <AssignDialog data={data} unit={dialog.unit} onClose={() => setDialog(null)} onDone={load} />}
      {dialog?.kind === "return" && <ReturnDialog today={data.today} unit={dialog.unit} onClose={() => setDialog(null)} onDone={load} />}
      {dialog?.kind === "status" && (
        <StatusDialog today={data.today} unit={dialog.unit} action={dialog.action} onClose={() => setDialog(null)} onDone={load} />
      )}
      {dialog?.kind === "history" && <HistoryDialog unit={dialog.unit} onClose={() => setDialog(null)} />}
    </div>
  );
}

function ActionButton({ children, icon, onClick, primary }: { children: React.ReactNode; icon: React.ReactNode; onClick: () => void; primary?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-colors ${
        primary ? "bg-[#C59F59] text-white hover:bg-[#b08d4f]" : "border border-foreground/10 text-foreground/60 hover:bg-foreground/5"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function Modal({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[95vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={title}
      >
        <div className="px-6 pt-6 pb-4 border-b border-foreground/5 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-serif">{title}</h3>
            {subtitle && <p className="text-xs text-foreground/50 mt-1">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-foreground/5" aria-label="Cerrar">
            <X className="w-5 h-5 text-foreground/40" />
          </button>
        </div>
        <div className="p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </div>
  );
}

/** Shared submit/error plumbing for the dialogs. */
function useSubmit(onDone: () => void, onClose: () => void) {
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const submit = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      try {
        await fn();
        onDone();
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo guardar");
      }
    });
  return { error, isPending, submit };
}

function Footer({ isPending, error, label, danger }: { isPending: boolean; error: string; label: string; danger?: boolean }) {
  return (
    <>
      {error && <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl">{error}</p>}
      <button
        type="submit"
        disabled={isPending}
        className={`w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-white text-sm font-bold uppercase tracking-widest disabled:opacity-60 ${
          danger ? "bg-red-500 hover:bg-red-600" : "bg-[#C59F59] hover:bg-[#b08d4f]"
        }`}
      >
        {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
        {label}
      </button>
    </>
  );
}

function RegisterDialog({ data, onClose, onDone }: { data: Data; onClose: () => void; onDone: () => void }) {
  const [inventoryId, setInventoryId] = useState(data.models[0]?.id ?? "");
  const [serial, setSerial] = useState("");
  const [label, setLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(data.today);
  const { error, isPending, submit } = useSubmit(onDone, onClose);
  return (
    <Modal title="Registrar máquina" subtitle="Cada máquina física, con su serial. El modelo se crea en Inventario (categoría Equipo)." onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit(() => registerEquipmentUnit({ inventoryId, serial, label, notes, date }));
        }}
      >
        <div>
          <label htmlFor="reg-model" className={labelCls}>Modelo *</label>
          <select id="reg-model" value={inventoryId} onChange={(e) => setInventoryId(e.target.value)} className={inputCls} required>
            {data.models.length === 0 && <option value="">Crea primero un producto de categoría Equipo</option>}
            {data.models.map((m: { id: string; product_name: string; product_code: string }) => (
              <option key={m.id} value={m.id}>{m.product_name} ({m.product_code})</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="reg-serial" className={labelCls}>Serial</label>
            <input id="reg-serial" value={serial} onChange={(e) => setSerial(e.target.value)} placeholder="Número de serie" className={`${inputCls} font-mono`} />
          </div>
          <div>
            <label htmlFor="reg-label" className={labelCls}>Nombre corto (opcional)</label>
            <input id="reg-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ej. La Marzocco #2" className={inputCls} />
          </div>
        </div>
        <div>
          <label htmlFor="reg-date" className={labelCls}>Fecha de alta</label>
          <input id="reg-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label htmlFor="reg-notes" className={labelCls}>Notas</label>
          <textarea id="reg-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Marca, accesorios incluidos, valor comercial…" className={`${inputCls} resize-y`} />
        </div>
        <Footer isPending={isPending} error={error} label="Registrar máquina" />
      </form>
    </Modal>
  );
}

function AssignDialog({ data, unit, onClose, onDone }: { data: Data; unit: Unit; onClose: () => void; onDone: () => void }) {
  const [clientId, setClientId] = useState("");
  const [startDate, setStartDate] = useState(data.today);
  const [commitment, setCommitment] = useState("");
  const [notes, setNotes] = useState("");
  const { error, isPending, submit } = useSubmit(onDone, onClose);
  return (
    <Modal title="Entregar en comodato" subtitle={`${unitTitle(unit)}${unit.serial ? ` · S/N ${unit.serial}` : ""}`} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit(() =>
            assignComodato({ unitId: unit.id, clientId, startDate, monthlyCommitmentKg: commitment ? Number(commitment) : null, notes })
          );
        }}
      >
        <div>
          <label htmlFor="as-client" className={labelCls}>Cliente *</label>
          <select id="as-client" value={clientId} onChange={(e) => setClientId(e.target.value)} className={inputCls} required>
            <option value="">Seleccionar cliente del CRM…</option>
            {data.clients.map((c: { id: string; name: string; document_number: string | null }) => (
              <option key={c.id} value={c.id}>{c.name}{c.document_number ? ` (${c.document_number})` : ""}</option>
            ))}
          </select>
          <p className="text-[11px] text-foreground/40 mt-1">
            ¿No está? Créalo en <Link href="/admin/customers" className="underline">Clientes (B2B)</Link>.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="as-date" className={labelCls}>Fecha de entrega *</label>
            <input id="as-date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputCls} required />
          </div>
          <div>
            <label htmlFor="as-kg" className={labelCls}>Compromiso mensual</label>
            <div className="flex items-center gap-2">
              <input id="as-kg" type="number" min="0" step="0.5" inputMode="decimal" value={commitment} onChange={(e) => setCommitment(e.target.value)} placeholder="Opcional" className={inputCls} />
              <span className="text-xs text-foreground/40">kg</span>
            </div>
          </div>
        </div>
        <div>
          <label htmlFor="as-notes" className={labelCls}>Notas de entrega</label>
          <textarea id="as-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Contrato, accesorios entregados, estado de la máquina…" className={`${inputCls} resize-y`} />
        </div>
        <Footer isPending={isPending} error={error} label="Entregar" />
      </form>
    </Modal>
  );
}

function ReturnDialog({ today, unit, onClose, onDone }: { today: string; unit: Unit; onClose: () => void; onDone: () => void }) {
  const [endDate, setEndDate] = useState(today);
  const [returnTo, setReturnTo] = useState<"disponible" | "mantenimiento">("disponible");
  const [notes, setNotes] = useState("");
  const { error, isPending, submit } = useSubmit(onDone, onClose);
  return (
    <Modal title="Registrar devolución" subtitle={`${unitTitle(unit)} · ${unit.client?.name ?? ""}`} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit(() => returnComodato({ unitId: unit.id, endDate, returnTo, notes }));
        }}
      >
        <div>
          <label htmlFor="ret-date" className={labelCls}>Fecha de devolución *</label>
          <input id="ret-date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputCls} required />
        </div>
        <div>
          <p className={labelCls}>¿Cómo vuelve?</p>
          <div className="grid grid-cols-2 gap-2">
            {(["disponible", "mantenimiento"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={returnTo === v}
                onClick={() => setReturnTo(v)}
                className={`px-3 py-2.5 rounded-xl border text-xs font-bold ${returnTo === v ? "bg-[#C59F59] text-white border-[#C59F59]" : "bg-white text-foreground/60 border-foreground/10"}`}
              >
                {v === "disponible" ? "Lista para otro cliente" : "Necesita mantenimiento"}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label htmlFor="ret-notes" className={labelCls}>Notas</label>
          <textarea id="ret-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Estado en que llegó, accesorios faltantes…" className={`${inputCls} resize-y`} />
        </div>
        <Footer isPending={isPending} error={error} label="Registrar devolución" />
      </form>
    </Modal>
  );
}

const STATUS_DIALOG: Record<"mantenimiento" | "disponible" | "baja" | "nota", { title: string; button: string; placeholder: string }> = {
  mantenimiento: { title: "Enviar a mantenimiento", button: "Enviar a mantenimiento", placeholder: "Qué se le va a hacer, técnico…" },
  disponible: { title: "Lista para usar", button: "Marcar disponible", placeholder: "Qué se reparó…" },
  baja: { title: "Dar de baja", button: "Dar de baja", placeholder: "Motivo: daño irreparable, venta, pérdida…" },
  nota: { title: "Agregar nota", button: "Guardar nota", placeholder: "Visita técnica, cambio de empaques, observación…" },
};

function StatusDialog({
  today,
  unit,
  action,
  onClose,
  onDone,
}: {
  today: string;
  unit: Unit;
  action: "mantenimiento" | "disponible" | "baja" | "nota";
  onClose: () => void;
  onDone: () => void;
}) {
  const [date, setDate] = useState(today);
  const [description, setDescription] = useState("");
  const [cost, setCost] = useState("");
  const { error, isPending, submit } = useSubmit(onDone, onClose);
  const cfg = STATUS_DIALOG[action];
  return (
    <Modal title={cfg.title} subtitle={`${unitTitle(unit)}${unit.serial ? ` · S/N ${unit.serial}` : ""}`} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit(() => updateEquipmentStatus({ unitId: unit.id, action, date, description, cost: cost ? Number(cost) : null }));
        }}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="st-date" className={labelCls}>Fecha</label>
            <input id="st-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} required />
          </div>
          {action !== "baja" && (
            <div>
              <label htmlFor="st-cost" className={labelCls}>Costo (opcional)</label>
              <input id="st-cost" type="number" min="0" step="1000" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="$" className={inputCls} />
            </div>
          )}
        </div>
        <div>
          <label htmlFor="st-desc" className={labelCls}>Descripción{action === "nota" ? " *" : ""}</label>
          <textarea id="st-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder={cfg.placeholder} className={`${inputCls} resize-y`} required={action === "nota"} />
        </div>
        {action === "baja" && (
          <p className="text-xs text-red-700 bg-red-50 px-3 py-2 rounded-xl">La máquina sale del inventario (una salida del modelo). Queda en el historial.</p>
        )}
        <Footer isPending={isPending} error={error} label={cfg.button} danger={action === "baja"} />
      </form>
    </Modal>
  );
}

const EVENT_LABELS: Record<string, string> = {
  alta: "Alta",
  entrega: "Entrega",
  devolucion: "Devolución",
  mantenimiento: "Mantenimiento",
  reparacion: "Reparada",
  baja: "Baja",
  nota: "Nota",
};

function HistoryDialog({ unit, onClose }: { unit: Unit; onClose: () => void }) {
  const [history, setHistory] = useState<Awaited<ReturnType<typeof getUnitHistory>> | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    getUnitHistory(unit.id)
      .then(setHistory)
      .catch((err) => setError(err instanceof Error ? err.message : "No se pudo cargar"));
  }, [unit.id]);
  const nameOf = (c: unknown) => (Array.isArray(c) ? c[0]?.name : (c as { name?: string } | null)?.name);
  return (
    <Modal title="Historial" subtitle={`${unitTitle(unit)}${unit.serial ? ` · S/N ${unit.serial}` : ""}`} onClose={onClose}>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!history && !error && <Loader2 className="w-6 h-6 animate-spin text-[#C59F59] mx-auto" />}
      {history && (
        <div className="space-y-6">
          <section>
            <p className={labelCls}>Comodatos</p>
            {history.assignments.length === 0 ? (
              <p className="text-sm text-foreground/40">Nunca ha estado en comodato.</p>
            ) : (
              <ul className="space-y-2">
                {history.assignments.map((a: { id: string; start_date: string; end_date: string | null; monthly_commitment_kg: number | null; client: unknown }) => (
                  <li key={a.id} className="rounded-xl bg-[#fdfbf7] px-4 py-3 text-sm">
                    <p className="font-bold">{nameOf(a.client) ?? "Cliente"}</p>
                    <p className="text-xs text-foreground/50">
                      {fmtDate(a.start_date)} → {a.end_date ? fmtDate(a.end_date) : "actualmente"}
                      {a.monthly_commitment_kg ? ` · compromiso ${kg(Number(a.monthly_commitment_kg))}/mes` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <p className={labelCls}>Eventos</p>
            <ul className="space-y-3">
              {history.events.map((ev: { id: string; event_date: string; kind: string; description: string | null; cost: number | null; client: unknown }) => (
                <li key={ev.id} className="flex gap-3 text-sm">
                  <span className="text-xs text-foreground/40 w-24 shrink-0">{fmtDate(ev.event_date)}</span>
                  <span>
                    <span className="font-bold">{EVENT_LABELS[ev.kind] ?? ev.kind}</span>
                    {nameOf(ev.client) ? <span className="text-foreground/60"> · {nameOf(ev.client)}</span> : null}
                    {ev.description ? <span className="block text-foreground/60">{ev.description}</span> : null}
                    {ev.cost ? (
                      <span className="block text-xs text-foreground/40">
                        Costo {new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(Number(ev.cost))}
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </Modal>
  );
}
