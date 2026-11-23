"use client";

import React, { useEffect, useMemo, useState, useTransition } from "react";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Radar,
  Edit2,
  ExternalLink,
  History,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Truck,
  X,
} from "lucide-react";
import {
  checkTrackingNow,
  createShipment,
  deleteShipment,
  getLogisticsData,
  getShipmentEvents,
  updateShipment,
  updateShipmentStatus,
  type ShipmentInput,
} from "./actions";
import {
  CARRIERS,
  CARRIER_ORDER,
  STATUS_LABELS,
  defaultScope,
  isClosed,
  isLate,
  statusOptions,
  summarize,
  trackingUrl,
  type Carrier,
  type Scope,
  type ShipmentStatus,
} from "@/utils/shipments";
import { useTr } from "@/app/(admin)/AdminI18n";

type Data = Awaited<ReturnType<typeof getLogisticsData>>;
type Shipment = {
  id: string;
  carrier: Carrier;
  scope: Scope;
  direction: "salida" | "entrada";
  tracking_number: string | null;
  status: ShipmentStatus;
  client_id: string | null;
  order_id: string | null;
  recipient_name: string | null;
  recipient_phone: string | null;
  address: string | null;
  origin_city: string | null;
  destination_city: string | null;
  destination_country: string;
  contents: string | null;
  packages: number | null;
  weight_kg: number | null;
  declared_value: number | null;
  cost: number | null;
  currency: "COP" | "USD" | "EUR";
  paid_by: "nosotros" | "cliente";
  ship_date: string | null;
  estimated_date: string | null;
  delivered_date: string | null;
  notes: string | null;
  carrier_status_text: string | null;
  last_checked_at: string | null;
  last_check_error: string | null;
  client: { id: string; name: string } | null;
  order: { id: string; created_at: string; siigo_invoice: string | null } | null;
};

const labelCls = "block text-[10px] font-bold uppercase tracking-widest text-foreground/40 mb-1.5";
const inputCls =
  "w-full px-3 py-2.5 bg-white border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20";

const STATUS_STYLE: Record<ShipmentStatus, string> = {
  preparando: "bg-foreground/5 text-foreground/60",
  en_transito: "bg-sky-50 text-sky-700",
  en_aduana: "bg-violet-50 text-violet-700",
  en_reparto: "bg-[#C59F59]/15 text-[#9a7a3c]",
  entregado: "bg-emerald-50 text-emerald-700",
  novedad: "bg-red-50 text-red-700",
  devuelto: "bg-amber-50 text-amber-700",
  cancelado: "bg-foreground/5 text-foreground/40",
};

const CARRIER_STYLE: Record<Carrier, string> = {
  servientrega: "bg-emerald-600 text-white",
  coordinadora: "bg-sky-700 text-white",
  dhl: "bg-yellow-400 text-red-700",
  fedex: "bg-violet-700 text-white",
  otro: "bg-foreground/10 text-foreground/70",
};

const fmtDate = (ymd: string | null) => {
  if (!ymd) return "—";
  const [y, m, d] = ymd.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-CO", { day: "numeric", month: "short" });
};
const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const money = (n: number, currency = "COP") =>
  currency === "COP" ? `$${Math.round(n).toLocaleString("es-CO")}` : `${currency} ${n.toLocaleString("es-CO", { maximumFractionDigits: 2 })}`;

type View = "abiertos" | "nacional" | "internacional" | "problemas" | "cerrados";
type Dialog =
  | { kind: "form"; shipment?: Shipment }
  | { kind: "status"; shipment: Shipment }
  | { kind: "history"; shipment: Shipment };

/** Shipments by carrier and guía: where each package is and what needs follow-up. */
export default function LogisticsClient() {
  const tr = useTr();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [view, setView] = useState<View>("abiertos");
  const [carrier, setCarrier] = useState<Carrier | "">("");
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState("");
  const [checking, setChecking] = useState(false);
  const [checkMsg, setCheckMsg] = useState("");

  async function checkNow() {
    setChecking(true);
    setCheckMsg("");
    try {
      const r = await checkTrackingNow();
      setCheckMsg(tr("{c} consultados · {u} cambiaron de estado · {e} con error", { c: r.checked, u: r.updated.length, e: r.errors.length }));
      load();
    } catch (err) {
      setCheckMsg(err instanceof Error ? tr.msg(err.message) : tr("No se pudo consultar"));
    } finally {
      setChecking(false);
    }
  }
  const [isPending, startTransition] = useTransition();

  function load() {
    startTransition(async () => {
      try {
        setData(await getLogisticsData());
        setError("");
      } catch (err) {
        setError(err instanceof Error ? err.message : tr("No se pudieron cargar los envíos"));
      }
    });
  }
  useEffect(() => {
    load();
  }, []);

  const shipments = useMemo(() => (data?.shipments ?? []) as unknown as Shipment[], [data]);
  const today = data?.today ?? "";
  const summary = summarize(shipments, today);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return shipments.filter((s) => {
      if (view === "abiertos" && isClosed(s.status)) return false;
      if (view === "nacional" && (isClosed(s.status) || s.scope !== "nacional")) return false;
      if (view === "internacional" && (isClosed(s.status) || s.scope !== "internacional")) return false;
      if (view === "problemas" && !(s.status === "novedad" || isLate(s, today))) return false;
      if (view === "cerrados" && !isClosed(s.status)) return false;
      if (carrier && s.carrier !== carrier) return false;
      if (!term) return true;
      return [s.tracking_number, s.client?.name, s.recipient_name, s.destination_city, s.destination_country, s.contents, s.order?.siigo_invoice, s.notes]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [shipments, view, carrier, search, today]);

  // Opens the carrier's page and copies the guía, in case the page doesn't take it from the link.
  function track(s: Shipment) {
    const url = trackingUrl(s.carrier, s.tracking_number);
    if (s.tracking_number) {
      navigator.clipboard?.writeText(s.tracking_number).then(() => {
        setCopied(s.id);
        setTimeout(() => setCopied(""), 2500);
      }).catch(() => {});
    }
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }

  async function remove(s: Shipment) {
    if (!window.confirm(tr("¿Eliminar este envío y su historial?"))) return;
    try {
      await deleteShipment(s.id);
      load();
    } catch (err) {
      alert(err instanceof Error ? tr.msg(err.message) : tr("No se pudo eliminar"));
    }
  }

  if (error) return <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl">{tr.msg(error)}</p>;
  if (!data) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 text-[#C59F59] animate-spin" />
      </div>
    );
  }

  const costText = Object.entries(summary.costoMes).map(([cur, n]) => money(n, cur)).join(" + ") || "$0";

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-serif mb-1">{tr("Logística")}</h1>
          <p className="text-foreground/60 text-sm">{tr("Envíos nacionales e internacionales: guía, transportadora, estado y novedades.")}</p>
        </div>
        <div className="flex gap-2">
          {data.autoCarriers.length > 0 && (
            <button
              onClick={checkNow}
              disabled={checking || !data.migrated}
              title={tr("Se consulta solo cada 8 horas; esto lo hace ahora")}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-foreground/10 bg-white hover:bg-foreground/5 text-xs font-bold disabled:opacity-50"
            >
              {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Radar className="w-4 h-4 text-[#C59F59]" />}
              {tr("Consultar ahora")}
            </button>
          )}
          <button onClick={load} className="p-2.5 rounded-xl border border-foreground/10 bg-white hover:bg-foreground/5" aria-label={tr("Recargar")}>
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4 text-foreground/50" />}
          </button>
          <button
            onClick={() => setDialog({ kind: "form" })}
            disabled={!data.migrated}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-foreground text-background hover:bg-[#C59F59] hover:text-white text-xs font-bold uppercase tracking-widest disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />{" "}{tr("Nuevo envío")}
          </button>
        </div>
      </div>

      <p className="text-xs text-foreground/50 -mt-3">
        {data.autoCarriers.length > 0
          ? tr("Consulta automática cada 8 horas: {list}. Las demás transportadoras se actualizan a mano.", { list: data.autoCarriers.map((c) => CARRIERS[c].label).join(", ") })
          : tr("La consulta automática aún no tiene credenciales de ninguna transportadora: los estados se actualizan a mano.")}
        {checkMsg && <span className="ml-2 font-semibold text-foreground/70">{checkMsg}</span>}
      </p>

      {!data.migrated && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          {tr("Falta aplicar la migración")}{" "}<code className="font-mono">20261121000000_shipments.sql</code>{" "}{tr("en Supabase.")}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi label={tr("En curso")} value={summary.abiertos} hint={tr("{n} nacionales · {i} internacionales", { n: summary.nacionales, i: summary.internacionales })} active={view === "abiertos"} onClick={() => setView("abiertos")} />
        <Kpi label={tr("Novedades / atrasados")} value={summary.novedades + summary.atrasados} hint={tr("{n} novedades · {a} atrasados", { n: summary.novedades, a: summary.atrasados })} active={view === "problemas"} onClick={() => setView("problemas")} warn={summary.novedades + summary.atrasados > 0} />
        <Kpi label={tr("Entregados este mes")} value={summary.entregadosMes} hint={summary.diasPromedio != null ? tr("{d} días en promedio", { d: summary.diasPromedio }) : undefined} active={view === "cerrados"} onClick={() => setView("cerrados")} />
        <Kpi label={tr("Flete del mes")} value={costText} hint={tr("Lo que pagamos nosotros")} />
        <Kpi label={tr("Internacionales en curso")} value={summary.internacionales} active={view === "internacional"} onClick={() => setView("internacional")} />
      </div>

      <div className="flex flex-col md:flex-row gap-3 md:items-center">
        <div className="flex gap-1 p-1 bg-foreground/5 rounded-xl overflow-x-auto">
          {(
            [
              ["abiertos", "En curso"],
              ["nacional", "Nacionales"],
              ["internacional", "Internacionales"],
              ["problemas", "Con novedad"],
              ["cerrados", "Cerrados"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap ${view === key ? "bg-white shadow-sm text-foreground" : "text-foreground/50"}`}
            >
              {tr(label)}
            </button>
          ))}
        </div>
        <select value={carrier} onChange={(e) => setCarrier(e.target.value as Carrier | "")} className={`${inputCls} md:w-48`} aria-label={tr("Transportadora")}>
          <option value="">{tr("Todas las transportadoras")}</option>
          {CARRIER_ORDER.map((c) => (
            <option key={c} value={c}>{tr(CARRIERS[c].label)}</option>
          ))}
        </select>
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-foreground/40" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tr("Buscar guía, cliente, ciudad…")}
            aria-label={tr("Buscar envíos")}
            className={`${inputCls} pl-10`}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-3xl border border-foreground/5 shadow-sm text-center py-16">
          <Truck className="w-12 h-12 text-foreground/20 mx-auto mb-3" />
          <p className="font-serif text-foreground/50">{tr("No hay envíos en esta vista.")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((s) => {
            const late = isLate(s, today);
            const who = s.client?.name || s.recipient_name || tr("Sin destinatario");
            const place = [s.destination_city, s.scope === "internacional" ? s.destination_country : null].filter(Boolean).join(", ");
            return (
              <article key={s.id} className="bg-white rounded-3xl border border-foreground/5 shadow-sm p-5 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${CARRIER_STYLE[s.carrier]}`}>{tr(CARRIERS[s.carrier].label)}</span>
                    <span className="text-foreground/40" title={s.direction === "entrada" ? tr("Entrante") : tr("Saliente")}>
                      {s.direction === "entrada" ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                    </span>
                  </div>
                  <div className="flex flex-wrap justify-end gap-1">
                    {late && <span className="px-2 py-1 rounded-lg text-[10px] font-bold bg-red-50 text-red-700">{tr("Atrasado")}</span>}
                    <span className={`px-2 py-1 rounded-lg text-[10px] font-bold ${STATUS_STYLE[s.status]}`}>{tr(STATUS_LABELS[s.status])}</span>
                  </div>
                </div>

                <div className="min-w-0">
                  <h3 className="font-bold leading-snug truncate">{who}</h3>
                  <p className="text-xs text-foreground/50 mt-0.5 truncate">
                    {place || tr("Sin ciudad de destino")}
                    {s.order?.siigo_invoice ? ` · ${s.order.siigo_invoice}` : ""}
                  </p>
                </div>

                {s.tracking_number ? (
                  <button
                    type="button"
                    onClick={() => track(s)}
                    className="self-start flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#fdfbf7] border border-foreground/10 hover:border-[#C59F59] text-sm font-mono"
                    title={trackingUrl(s.carrier, s.tracking_number) ? tr("Abrir rastreo (copia la guía)") : tr("Copiar guía")}
                  >
                    {s.tracking_number}
                    {trackingUrl(s.carrier, s.tracking_number) && <ExternalLink className="w-3.5 h-3.5 text-[#C59F59]" />}
                    {copied === s.id && <span className="text-[10px] font-sans font-bold text-emerald-600">{tr("Copiada")}</span>}
                  </button>
                ) : (
                  <p className="text-xs text-amber-700">{tr("Sin número de guía")}</p>
                )}
                {s.last_checked_at && !isClosed(s.status) && (
                  <p className={`text-[11px] -mt-1 ${s.last_check_error ? "text-amber-700" : "text-foreground/50"}`}>
                    {s.last_check_error
                      ? tr.msg(s.last_check_error)
                      : `${s.carrier_status_text ?? ""}${s.carrier_status_text ? " · " : ""}${tr("revisado {when}", { when: fmtDateTime(s.last_checked_at) })}`}
                  </p>
                )}

                <dl className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <dt className="text-foreground/40">{tr("Enviado")}</dt>
                    <dd className="font-semibold">{fmtDate(s.ship_date)}</dd>
                  </div>
                  <div>
                    <dt className="text-foreground/40">{s.delivered_date ? tr("Entregado") : tr("Estimado")}</dt>
                    <dd className={`font-semibold ${late ? "text-red-600" : ""}`}>{fmtDate(s.delivered_date ?? s.estimated_date)}</dd>
                  </div>
                  <div>
                    <dt className="text-foreground/40">{tr("Flete")}</dt>
                    <dd className="font-semibold">
                      {s.cost != null ? money(Number(s.cost), s.currency) : "—"}
                      {s.paid_by === "cliente" && <span className="block text-[10px] font-normal text-foreground/50">{tr("Paga el cliente")}</span>}
                    </dd>
                  </div>
                </dl>

                {s.contents && <p className="text-xs text-foreground/60 line-clamp-2">{s.contents}</p>}

                <div className="flex flex-wrap gap-2 mt-auto pt-2 border-t border-foreground/5">
                  <button onClick={() => setDialog({ kind: "status", shipment: s })} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-[#C59F59] text-white hover:bg-[#b08d4f]">
                    <Truck className="w-3.5 h-3.5" />{tr("Cambiar estado")}
                  </button>
                  <IconButton label={tr("Historial")} onClick={() => setDialog({ kind: "history", shipment: s })}><History className="w-4 h-4" /></IconButton>
                  <IconButton label={tr("Editar")} onClick={() => setDialog({ kind: "form", shipment: s })}><Edit2 className="w-4 h-4" /></IconButton>
                  <IconButton label={tr("Eliminar")} onClick={() => remove(s)} danger><Trash2 className="w-4 h-4" /></IconButton>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {dialog?.kind === "form" && <ShipmentForm data={data} shipment={dialog.shipment} onClose={() => setDialog(null)} onDone={load} />}
      {dialog?.kind === "status" && <StatusDialog shipment={dialog.shipment} today={data.today} onClose={() => setDialog(null)} onDone={load} />}
      {dialog?.kind === "history" && <HistoryDialog shipment={dialog.shipment} onClose={() => setDialog(null)} />}
    </div>
  );
}

function Kpi({ label, value, hint, active, onClick, warn }: { label: string; value: React.ReactNode; hint?: string; active?: boolean; onClick?: () => void; warn?: boolean }) {
  const cls = `text-left bg-white rounded-2xl border p-4 shadow-sm ${active ? "border-[#C59F59] ring-2 ring-[#C59F59]/20" : "border-foreground/5"}`;
  const body = (
    <>
      <p className="text-[10px] font-bold uppercase tracking-widest text-foreground/40">{label}</p>
      <p className={`text-2xl font-serif font-bold mt-1 ${warn ? "text-red-600" : ""}`}>{value}</p>
      {hint && <p className="text-[11px] text-foreground/50 mt-0.5">{hint}</p>}
    </>
  );
  return onClick ? <button onClick={onClick} className={cls}>{body}</button> : <div className={cls}>{body}</div>;
}

function IconButton({ children, label, onClick, danger }: { children: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`p-2 rounded-xl border border-foreground/10 ${danger ? "text-red-400 hover:text-red-600 hover:bg-red-50" : "text-foreground/50 hover:bg-foreground/5"}`}
    >
      {children}
    </button>
  );
}

function Modal({ title, subtitle, onClose, children, wide }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  const tr = useTr();
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className={`bg-white w-full ${wide ? "max-w-2xl" : "max-w-lg"} rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[95vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={title}
      >
        <div className="px-6 pt-6 pb-4 border-b border-foreground/5 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-serif">{title}</h3>
            {subtitle && <p className="text-xs text-foreground/50 mt-1">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-foreground/5" aria-label={tr("Cerrar")}>
            <X className="w-5 h-5 text-foreground/40" />
          </button>
        </div>
        <div className="p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </div>
  );
}

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

function Footer({ isPending, error, label }: { isPending: boolean; error: string; label: string }) {
  const tr = useTr();
  return (
    <>
      {error && <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl">{tr.msg(error)}</p>}
      <button
        type="submit"
        disabled={isPending}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-white text-sm font-bold uppercase tracking-widest disabled:opacity-60 bg-[#C59F59] hover:bg-[#b08d4f]"
      >
        {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
        {label}
      </button>
    </>
  );
}

function Field({ id, label, children, className = "" }: { id: string; label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label htmlFor={id} className={labelCls}>{label}</label>
      {children}
    </div>
  );
}

const str = (v: unknown) => (v == null ? "" : String(v));
const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(/\./g, "").replace(",", ".")));

function ShipmentForm({ data, shipment, onClose, onDone }: { data: Data; shipment?: Shipment; onClose: () => void; onDone: () => void }) {
  const tr = useTr();
  const s = shipment;
  const [f, setF] = useState({
    carrier: (s?.carrier ?? "servientrega") as Carrier,
    scope: (s?.scope ?? "nacional") as Scope,
    direction: s?.direction ?? "salida",
    trackingNumber: str(s?.tracking_number),
    clientId: str(s?.client_id),
    orderId: str(s?.order_id),
    recipientName: str(s?.recipient_name),
    recipientPhone: str(s?.recipient_phone),
    address: str(s?.address),
    originCity: str(s?.origin_city ?? "Medellín"),
    destinationCity: str(s?.destination_city),
    destinationCountry: str(s?.destination_country ?? "Colombia"),
    contents: str(s?.contents),
    packages: str(s?.packages ?? 1),
    weightKg: str(s?.weight_kg),
    declaredValue: str(s?.declared_value),
    cost: str(s?.cost),
    currency: s?.currency ?? "COP",
    paidBy: s?.paid_by ?? "nosotros",
    shipDate: str(s?.ship_date ?? data.today),
    estimatedDate: str(s?.estimated_date),
    notes: str(s?.notes),
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const { error, isPending, submit } = useSubmit(onDone, onClose);
  const intl = f.scope === "internacional";
  const clientOrders = data.orders.filter((o) => !f.clientId || o.client_id === f.clientId);

  function pickCarrier(c: Carrier) {
    // "Otro" keeps whatever type was chosen; the four carriers set their own.
    setF({ ...f, carrier: c, scope: c === "otro" ? f.scope : defaultScope(c) });
  }

  function pickClient(id: string) {
    const client = data.clients.find((c) => c.id === id);
    const order = data.orders.find((o) => o.id === f.orderId);
    setF({
      ...f,
      clientId: id,
      orderId: order && order.client_id === id ? f.orderId : "",
      recipientName: f.recipientName || client?.name || "",
      destinationCity: f.destinationCity || client?.city || "",
    });
  }

  const input: ShipmentInput = {
    carrier: f.carrier,
    scope: f.scope,
    direction: f.direction as "salida" | "entrada",
    trackingNumber: f.trackingNumber,
    clientId: f.clientId || null,
    orderId: f.orderId || null,
    recipientName: f.recipientName,
    recipientPhone: f.recipientPhone,
    address: f.address,
    originCity: f.originCity,
    destinationCity: f.destinationCity,
    destinationCountry: intl ? f.destinationCountry : "Colombia",
    contents: f.contents,
    packages: num(f.packages),
    weightKg: num(f.weightKg),
    declaredValue: num(f.declaredValue),
    cost: num(f.cost),
    currency: f.currency as "COP" | "USD" | "EUR",
    paidBy: f.paidBy as "nosotros" | "cliente",
    shipDate: f.shipDate || null,
    estimatedDate: f.estimatedDate || null,
    notes: f.notes,
  };

  return (
    <Modal title={s ? tr("Editar envío") : tr("Nuevo envío")} onClose={onClose} wide>
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          submit(() => (s ? updateShipment(s.id, input) : createShipment(input)));
        }}
      >
        <div>
          <p className={labelCls}>{tr("Transportadora *")}</p>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {CARRIER_ORDER.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => pickCarrier(c)}
                className={`py-2.5 rounded-xl text-xs font-bold border ${f.carrier === c ? "border-[#C59F59] ring-2 ring-[#C59F59]/20 bg-[#fdfbf7]" : "border-foreground/10 text-foreground/60"}`}
              >
                {tr(CARRIERS[c].label)}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field id="sh-guia" label={tr("Número de guía")} className="sm:col-span-1">
            <input id="sh-guia" value={f.trackingNumber} onChange={set("trackingNumber")} placeholder={tr("Puedes agregarla después")} className={`${inputCls} font-mono`} />
          </Field>
          <Field id="sh-scope" label={tr("Tipo")}>
            <select id="sh-scope" value={f.scope} onChange={set("scope")} className={inputCls}>
              <option value="nacional">{tr("Nacional")}</option>
              <option value="internacional">{tr("Internacional")}</option>
            </select>
          </Field>
          <Field id="sh-dir" label={tr("Sentido")}>
            <select id="sh-dir" value={f.direction} onChange={set("direction")} className={inputCls}>
              <option value="salida">{tr("Lo enviamos nosotros")}</option>
              <option value="entrada">{tr("Lo recibimos (muestras, insumos)")}</option>
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field id="sh-client" label={tr("Cliente (opcional)")}>
            <select id="sh-client" value={f.clientId} onChange={(e) => pickClient(e.target.value)} className={inputCls}>
              <option value="">{tr("Sin cliente del CRM")}</option>
              {data.clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>
          <Field id="sh-order" label={tr("Pedido (opcional)")}>
            <select id="sh-order" value={f.orderId} onChange={set("orderId")} className={inputCls} disabled={!f.clientId}>
              <option value="">{f.clientId ? tr("Sin pedido") : tr("Elige primero el cliente")}</option>
              {clientOrders.map((o) => (
                <option key={o.id} value={o.id}>
                  {fmtDate(o.created_at)}{o.siigo_invoice ? ` · ${o.siigo_invoice}` : ""}{o.total_amount ? ` · ${money(Number(o.total_amount))}` : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field id="sh-rname" label={tr("Destinatario")}>
            <input id="sh-rname" value={f.recipientName} onChange={set("recipientName")} className={inputCls} />
          </Field>
          <Field id="sh-rphone" label={tr("Teléfono")}>
            <input id="sh-rphone" value={f.recipientPhone} onChange={set("recipientPhone")} className={inputCls} inputMode="tel" />
          </Field>
          <Field id="sh-origin" label={tr("Ciudad de origen")}>
            <input id="sh-origin" value={f.originCity} onChange={set("originCity")} className={inputCls} />
          </Field>
          <Field id="sh-dest" label={tr("Ciudad de destino")}>
            <input id="sh-dest" value={f.destinationCity} onChange={set("destinationCity")} className={inputCls} />
          </Field>
          {intl && (
            <Field id="sh-country" label={tr("País de destino")}>
              <input id="sh-country" value={f.destinationCountry} onChange={set("destinationCountry")} className={inputCls} />
            </Field>
          )}
          <Field id="sh-addr" label={tr("Dirección")} className={intl ? "" : "sm:col-span-2"}>
            <input id="sh-addr" value={f.address} onChange={set("address")} className={inputCls} />
          </Field>
        </div>

        <Field id="sh-contents" label={tr("Contenido")}>
          <input id="sh-contents" value={f.contents} onChange={set("contents")} placeholder={tr("Ej. 4 bolsas Premium 2,5 kg")} className={inputCls} />
        </Field>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Field id="sh-pk" label={tr("Paquetes")}>
            <input id="sh-pk" value={f.packages} onChange={set("packages")} inputMode="numeric" className={inputCls} />
          </Field>
          <Field id="sh-kg" label={tr("Peso (kg)")}>
            <input id="sh-kg" value={f.weightKg} onChange={set("weightKg")} inputMode="decimal" className={inputCls} />
          </Field>
          <Field id="sh-decl" label={tr("Valor declarado")}>
            <input id="sh-decl" value={f.declaredValue} onChange={set("declaredValue")} inputMode="decimal" className={inputCls} />
          </Field>
          <Field id="sh-cost" label={tr("Costo del flete")}>
            <input id="sh-cost" value={f.cost} onChange={set("cost")} inputMode="decimal" className={inputCls} />
          </Field>
          <Field id="sh-cur" label={tr("Moneda")}>
            <select id="sh-cur" value={f.currency} onChange={set("currency")} className={inputCls}>
              <option value="COP">COP</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
          </Field>
          <Field id="sh-paid" label={tr("Paga el flete")} className="col-span-1 sm:col-span-3">
            <select id="sh-paid" value={f.paidBy} onChange={set("paidBy")} className={inputCls}>
              <option value="nosotros">{tr("Nosotros")}</option>
              <option value="cliente">{tr("El cliente (contra entrega / al cobro)")}</option>
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field id="sh-date" label={tr("Fecha de envío")}>
            <input id="sh-date" type="date" value={f.shipDate} onChange={set("shipDate")} className={inputCls} />
          </Field>
          <Field id="sh-eta" label={tr("Entrega estimada")}>
            <input id="sh-eta" type="date" value={f.estimatedDate} onChange={set("estimatedDate")} className={inputCls} />
          </Field>
        </div>

        <Field id="sh-notes" label={tr("Notas")}>
          <textarea id="sh-notes" value={f.notes} onChange={set("notes")} rows={2} className={`${inputCls} resize-y`} />
        </Field>

        <Footer isPending={isPending} error={error} label={s ? tr("Guardar cambios") : tr("Registrar envío")} />
      </form>
    </Modal>
  );
}

function StatusDialog({ shipment, today, onClose, onDone }: { shipment: Shipment; today: string; onClose: () => void; onDone: () => void }) {
  const tr = useTr();
  const options = statusOptions(shipment.scope).filter((st) => st !== shipment.status);
  const [status, setStatus] = useState<ShipmentStatus | "">(options[0] ?? "");
  const [date, setDate] = useState(today);
  const [description, setDescription] = useState("");
  const { error, isPending, submit } = useSubmit(onDone, onClose);
  return (
    <Modal
      title={tr("Cambiar estado")}
      subtitle={`${tr(CARRIERS[shipment.carrier].label)}${shipment.tracking_number ? ` · ${shipment.tracking_number}` : ""} · ${tr("Ahora:")} ${tr(STATUS_LABELS[shipment.status])}`}
      onClose={onClose}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit(() => updateShipmentStatus({ id: shipment.id, status: status || null, date, description }));
        }}
      >
        <div>
          <p className={labelCls}>{tr("Nuevo estado")}</p>
          <div className="grid grid-cols-2 gap-2">
            {options.map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatus(st)}
                className={`py-2.5 rounded-xl text-xs font-bold border ${status === st ? "border-[#C59F59] ring-2 ring-[#C59F59]/20" : "border-foreground/10"} ${STATUS_STYLE[st]}`}
              >
                {tr(STATUS_LABELS[st])}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setStatus("")}
              className={`py-2.5 rounded-xl text-xs font-bold border ${status === "" ? "border-[#C59F59] ring-2 ring-[#C59F59]/20" : "border-foreground/10"} text-foreground/60`}
            >
              {tr("Solo nota")}
            </button>
          </div>
        </div>
        <Field id="st-date" label={tr("Fecha")}>
          <input id="st-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
        </Field>
        <Field id="st-desc" label={status === "novedad" ? tr("¿Qué pasó? *") : tr("Nota")}>
          <textarea
            id="st-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            required={status === "novedad" || status === ""}
            placeholder={tr("Ej. Dirección errada, el cliente no estaba, retenido en aduana…")}
            className={`${inputCls} resize-y`}
          />
        </Field>
        <Footer isPending={isPending} error={error} label={tr("Guardar")} />
      </form>
    </Modal>
  );
}

function HistoryDialog({ shipment, onClose }: { shipment: Shipment; onClose: () => void }) {
  const tr = useTr();
  const [events, setEvents] = useState<{ id: string; event_date: string; status: ShipmentStatus | null; description: string | null; location?: string | null; source?: string }[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    getShipmentEvents(shipment.id)
      .then((e) => setEvents(e as typeof events))
      .catch((err) => setError(err instanceof Error ? err.message : tr("No se pudo cargar el historial")));
  }, [shipment.id]);
  return (
    <Modal title={tr("Historial del envío")} subtitle={`${tr(CARRIERS[shipment.carrier].label)}${shipment.tracking_number ? ` · ${shipment.tracking_number}` : ""}`} onClose={onClose}>
      {error && <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl">{tr.msg(error)}</p>}
      {!events && !error && <Loader2 className="w-6 h-6 text-[#C59F59] animate-spin mx-auto" />}
      {events && (
        <ol className="space-y-3">
          {events.map((e) => (
            <li key={e.id} className="flex gap-3">
              <span className="text-xs text-foreground/40 w-16 shrink-0 pt-0.5">{fmtDate(e.event_date)}</span>
              <div className="min-w-0">
                {e.status && <span className={`inline-block px-2 py-0.5 rounded-lg text-[10px] font-bold mb-1 ${STATUS_STYLE[e.status]}`}>{tr(STATUS_LABELS[e.status])}</span>}
                {e.description && <p className="text-sm text-foreground/70">{e.description}</p>}
                {(e.location || e.source === "transportadora") && (
                  <p className="text-[11px] text-foreground/40">
                    {[e.location, e.source === "transportadora" ? tr(CARRIERS[shipment.carrier].label) : null].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
            </li>
          ))}
          {events.length === 0 && <p className="text-sm text-foreground/50">{tr("Sin movimientos.")}</p>}
        </ol>
      )}
      {shipment.notes && (
        <p className="mt-5 text-xs text-foreground/60 bg-[#fdfbf7] rounded-xl px-3 py-2">
          <strong>{tr("Notas:")}</strong> {shipment.notes}
        </p>
      )}
    </Modal>
  );
}
