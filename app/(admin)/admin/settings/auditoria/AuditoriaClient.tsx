"use client";

// Auditoría: the inventory audit log (inventory_audit_logs) told in words.
// Each entry says who did what to which product, with the before → after
// values the log has; clicking one shows the whole history of that record.

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { useTr } from "@/app/(admin)/AdminI18n";
import type { Translator } from "@/utils/i18n/translate";

export type AuditLog = {
  id: string;
  created_at: string;
  admin_id: string | null;
  action_type: "CREATE" | "UPDATE" | "DELETE" | string;
  entity_type: string;
  entity_id: string | null;
  inventory_id: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  details: Record<string, any> | null;
  profiles?: { first_name: string | null; last_name: string | null } | null;
};

type Products = Record<string, { name: string; code: string }>;

const AREA: Record<string, string> = {
  MOVEMENT: "Movimientos",
  TRILLA_BATCH: "Trilla",
  TOSTION_BATCH: "Tostión",
  COLD_BREW_BATCH: "Cold Brew",
  REPACK_BATCH: "Reempaque",
  TRANSFER: "Transferencias",
  WAREHOUSE: "Bodegas",
};

const VERB: Record<string, { label: string; chip: string }> = {
  CREATE: { label: "Creó", chip: "bg-emerald-50 text-emerald-800" },
  UPDATE: { label: "Cambió", chip: "bg-blue-50 text-blue-800" },
  DELETE: { label: "Eliminó", chip: "bg-red-50 text-red-700" },
};

/** Labels for the scalar detail fields the server writes. */
const FIELD: Record<string, string> = {
  qty: "Cantidad",
  reason: "Motivo",
  note: "Nota",
  unitCost: "Costo unitario",
  responsable: "Responsable",
  lote: "Lote",
  molienda: "Molienda",
  exit_kind: "Tipo de salida",
  exit_to: "Para quién",
  entryType: "Tipo de entrada",
  movement_date: "Fecha",
  sale_amount: "Valor de venta",
  thirdParty: "Tercero",
  inputQtyKg: "Entrada (kg)",
  outputQtyKg: "Salida (kg)",
  outputBottles: "Botellas",
  rendimientoPct: "Rendimiento %",
  inKg: "Entró (kg)",
  outKg: "Salió (kg)",
  sobranteKg: "Sobrante (kg)",
  sobranteDestino: "Sobrante a",
  date: "Fecha",
};

const BATCH_FIELD: Record<string, string> = { input: "Entrada (kg)", output: "Salida (kg)", date: "Fecha", notes: "Notas" };

type Diff = { field: string; from: string | null; to: string };

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "number") return v.toLocaleString("es-CO", { maximumFractionDigits: 3 });
  return String(v);
}

function personOf(l: AuditLog) {
  const n = [l.profiles?.first_name, l.profiles?.last_name].filter(Boolean).join(" ").trim();
  return n || "Sistema";
}

function isSensitive(l: AuditLog) {
  if (l.action_type === "DELETE") return true;
  const d = l.details ?? {};
  return l.action_type === "UPDATE" && ("unitCost" in d || ("old_quantity" in d && "new_quantity" in d && d.old_quantity !== d.new_quantity));
}

/** The entry as a sentence plus its before → after values. */
function describe(l: AuditLog, products: Products, tr: Translator, warehouses: Record<string, string> = {}): { text: string; diffs: Diff[] } {
  const d = l.details ?? {};
  const whName = (id: unknown) => (typeof id === "string" && warehouses[id]) || tr("otra bodega");
  const product = l.inventory_id ? products[l.inventory_id]?.name ?? tr("un producto") : tr("un producto");
  const q = (n: unknown) => fmt(Math.abs(Number(n)));
  const diffs: Diff[] = [];

  if (l.entity_type === "TRANSFER" && l.action_type === "CREATE") {
    if (d.molienda) diffs.push({ field: tr("Molienda"), from: null, to: fmt(d.molienda) });
    if (d.lote) diffs.push({ field: tr("Lote"), from: null, to: fmt(d.lote) });
    if (d.note) diffs.push({ field: tr("Nota"), from: null, to: fmt(d.note) });
    return { text: tr("Transfirió {qty} de {product}: {from} → {to}", { qty: q(d.qty), product, from: whName(d.from_warehouse), to: whName(d.to_warehouse) }), diffs };
  }

  if (l.entity_type === "WAREHOUSE") {
    const name = typeof d.name === "string" ? d.name : whName(l.entity_id);
    if (l.action_type === "CREATE") return { text: tr("Creó la bodega {name}", { name }), diffs };
    if (d.is_default === true) return { text: tr("Hizo de {name} la bodega principal", { name }), diffs };
    if (d.active === false) return { text: tr("Desactivó la bodega {name}", { name }), diffs };
    if (d.active === true) return { text: tr("Activó la bodega {name}", { name }), diffs };
    return { text: tr("Editó la bodega {name}", { name }), diffs };
  }

  if (l.entity_type === "MOVEMENT") {
    if (d.warehouse_id) diffs.push({ field: tr("Bodega"), from: null, to: whName(d.warehouse_id) });
    if (l.action_type === "CREATE") {
      for (const k of ["reason", "lote", "molienda", "exit_kind", "exit_to", "responsable", "unitCost"]) {
        if (d[k] !== undefined && d[k] !== null && d[k] !== "") diffs.push({ field: tr(FIELD[k]), from: null, to: fmt(d[k]) });
      }
      if (d.reason === "Saldo inicial") return { text: tr("Creó {product} con un saldo inicial de {qty}", { product, qty: q(d.qty) }), diffs: [] };
      return Number(d.qty) >= 0
        ? { text: tr("Registró una entrada de {qty} de {product}", { qty: q(d.qty), product }), diffs }
        : { text: tr("Registró una salida de {qty} de {product}", { qty: q(d.qty), product }), diffs };
    }
    if (l.action_type === "UPDATE") {
      if ("old_quantity" in d && "new_quantity" in d) diffs.push({ field: tr("Cantidad"), from: q(d.old_quantity), to: q(d.new_quantity) });
      if ("unitCost" in d) diffs.push({ field: tr("Costo unitario"), from: null, to: fmt(d.unitCost) });
      for (const k of ["reason", "movement_date", "molienda", "exit_kind", "exit_to", "responsable", "sale_amount"]) {
        if (d[k] !== undefined && d[k] !== null && d[k] !== "") diffs.push({ field: tr(FIELD[k]), from: null, to: fmt(d[k]) });
      }
      if (typeof d.note === "string") return { text: `${tr("Actualizó un movimiento de {product}", { product })}: ${d.note}`, diffs };
      if ("unitCost" in d && Object.keys(d).length === 1) return { text: tr("Cambió el costo unitario de una entrada de {product}", { product }), diffs };
      return { text: tr("Editó un movimiento de {product}", { product }), diffs };
    }
    if (l.action_type === "DELETE") {
      if ("old_quantity" in d) diffs.push({ field: tr("Cantidad"), from: q(d.old_quantity), to: "—" });
      if (d.note === "Reverted by order deletion") return { text: tr("Se eliminó un movimiento de {product} al borrar su pedido", { product }), diffs };
      return { text: tr("Eliminó un movimiento de {product}", { product }), diffs };
    }
  }

  if (l.entity_type === "TRILLA_BATCH" || l.entity_type === "TOSTION_BATCH") {
    const isTrilla = l.entity_type === "TRILLA_BATCH";
    if (l.action_type === "CREATE") {
      return {
        text: isTrilla
          ? tr("Registró una trilla: {in} kg de pergamino → {out} kg de verde", { in: fmt(d.inputQtyKg), out: fmt(d.outputQtyKg) })
          : tr("Registró una tostión: {in} kg de verde → {out} kg de tostado", { in: fmt(d.inputQtyKg), out: fmt(d.outputQtyKg) }),
        diffs: d.rendimientoPct != null ? [{ field: tr("Rendimiento %"), from: null, to: fmt(d.rendimientoPct) }] : [],
      };
    }
    if (l.action_type === "UPDATE" && d.before && d.after) {
      for (const k of Object.keys(BATCH_FIELD)) {
        if (fmt(d.before[k]) !== fmt(d.after[k])) diffs.push({ field: tr(BATCH_FIELD[k]), from: fmt(d.before[k]), to: fmt(d.after[k]) });
      }
      return { text: isTrilla ? tr("Corrigió un lote de trilla") : tr("Corrigió un lote de tostión"), diffs };
    }
    if (l.action_type === "DELETE") return { text: isTrilla ? tr("Eliminó un lote de trilla y revirtió su inventario") : tr("Eliminó un lote de tostión y revirtió su inventario"), diffs };
  }

  if (l.entity_type === "COLD_BREW_BATCH") {
    if (l.action_type === "CREATE")
      return { text: tr("Registró un lote de Cold Brew: {in} kg de tostado → {out} botellas", { in: fmt(d.inputQtyKg), out: fmt(d.outputBottles) }), diffs: d.lote ? [{ field: tr("Lote"), from: null, to: fmt(d.lote) }] : [] };
    if (l.action_type === "DELETE") return { text: tr("Eliminó un lote de Cold Brew y revirtió su inventario"), diffs };
  }

  if (l.entity_type === "REPACK_BATCH") {
    if (l.action_type === "CREATE")
      return { text: tr("Registró un reempaque: entraron {in} kg, salieron {out} kg", { in: fmt(d.inKg), out: fmt(d.outKg) }), diffs: d.sobranteKg ? [{ field: tr("Sobrante (kg)"), from: null, to: fmt(d.sobranteKg) }] : [] };
    if (l.action_type === "DELETE") return { text: tr("Revirtió un reempaque completo"), diffs };
  }

  return { text: `${tr(VERB[l.action_type]?.label ?? l.action_type)} · ${tr(AREA[l.entity_type] ?? l.entity_type)}`, diffs };
}

function dayKey(iso: string) {
  return iso.slice(0, 10);
}

export default function AuditoriaClient({
  logs,
  products,
  warehouses = {},
  productFilter,
}: {
  logs: AuditLog[];
  products: Products;
  warehouses?: Record<string, string>;
  productFilter: string | null;
}) {
  const tr = useTr();
  const locale = tr.locale === "en" ? "en-US" : "es-CO";
  const [action, setAction] = useState<"all" | "CREATE" | "UPDATE" | "DELETE" | "sensitive">("all");
  const [person, setPerson] = useState("all");
  const [area, setArea] = useState("all");
  const [search, setSearch] = useState("");
  const [product, setProduct] = useState<string | null>(productFilter);
  const [record, setRecord] = useState<string | null>(null);
  const [limit, setLimit] = useState(150);

  const people = useMemo(() => [...new Set(logs.map(personOf))].sort(), [logs]);
  const described = useMemo(() => logs.map((l) => ({ log: l, ...describe(l, products, tr, warehouses) })), [logs, products, tr, warehouses]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return described.filter(({ log, text, diffs }) => {
      if (product && log.inventory_id !== product) return false;
      if (action === "sensitive" ? !isSensitive(log) : action !== "all" && log.action_type !== action) return false;
      if (person !== "all" && personOf(log) !== person) return false;
      if (area !== "all" && log.entity_type !== area) return false;
      if (q && !(`${text} ${diffs.map((x) => `${x.field} ${x.from ?? ""} ${x.to}`).join(" ")}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [described, product, action, person, area, search]);

  const counts = useMemo(() => {
    const c = { all: 0, CREATE: 0, UPDATE: 0, DELETE: 0, sensitive: 0 };
    for (const { log } of described) {
      if (product && log.inventory_id !== product) continue;
      c.all += 1;
      if (log.action_type in c) c[log.action_type as "CREATE" | "UPDATE" | "DELETE"] += 1;
      if (isSensitive(log)) c.sensitive += 1;
    }
    return c;
  }, [described, product]);

  const days = useMemo(() => {
    const out: { key: string; label: string; items: typeof filtered }[] = [];
    for (const e of filtered.slice(0, limit)) {
      const key = dayKey(e.log.created_at);
      let g = out.find((d) => d.key === key);
      if (!g) {
        g = {
          key,
          label: new Date(e.log.created_at).toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
          items: [],
        };
        out.push(g);
      }
      g.items.push(e);
    }
    return out;
  }, [filtered, limit, locale]);

  const history = useMemo(
    () => (record ? described.filter((e) => e.log.entity_id === record).sort((a, b) => a.log.created_at.localeCompare(b.log.created_at)) : []),
    [described, record]
  );
  const recordLog = history[0]?.log ?? null;

  const chip = (active: boolean) =>
    `min-h-9 rounded-full border px-3 text-sm font-medium ${active ? "bg-foreground text-white border-foreground" : "bg-white border-foreground/15 hover:border-foreground/40"}`;
  const time = (iso: string) => new Date(iso).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/settings" className="text-sm text-foreground/70 hover:text-foreground">
          ← {tr("Ajustes")}
        </Link>
        <h1 className="mt-2 text-3xl font-serif text-foreground mb-1">{tr("Auditoría")}</h1>
        <p className="text-foreground/70">{tr("Quién cambió qué en el inventario, cuándo y con qué valores.")}</p>
      </div>

      <section aria-label={tr("Resumen")} className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card label={tr("Cambios registrados")} value={counts.all} />
        <Card label={tr("Ediciones")} value={counts.UPDATE} />
        <Card label={tr("Eliminaciones")} value={counts.DELETE} tone={counts.DELETE ? "red" : undefined} />
        <Card label={tr("Sensibles")} value={counts.sensitive} tone={counts.sensitive ? "amber" : undefined} hint={tr("Eliminaciones y cambios de cantidad o costo")} />
      </section>

      {product && (
        <p className="flex flex-wrap items-center gap-2 rounded-2xl bg-[#f3eee3] px-5 py-3 text-sm">
          {tr("Mostrando solo el historial de {product}", { product: products[product]?.name ?? product })}
          <button type="button" onClick={() => setProduct(null)} className="inline-flex items-center gap-1 font-semibold text-[#7A5B22] underline">
            <X aria-hidden="true" className="w-3.5 h-3.5" /> {tr("Ver todo")}
          </button>
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] items-start">
        <section aria-label={tr("Registro de cambios")} className="bg-white rounded-3xl border border-foreground/5 shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-foreground/5 px-5 py-4">
            {(
              [
                ["all", "Todo"],
                ["CREATE", "Creaciones"],
                ["UPDATE", "Ediciones"],
                ["DELETE", "Eliminaciones"],
                ["sensitive", "Sensibles"],
              ] as const
            ).map(([id, label]) => (
              <button key={id} type="button" aria-pressed={action === id} onClick={() => setAction(id)} className={chip(action === id)}>
                {id === "sensitive" ? "⚠️ " : ""}
                {tr(label)} <span className="tabular-nums opacity-70">{counts[id]}</span>
              </button>
            ))}
            <div className="ml-auto flex flex-wrap gap-2">
              <label htmlFor="aud-person" className="sr-only">{tr("Persona")}</label>
              <select id="aud-person" value={person} onChange={(e) => setPerson(e.target.value)} className="min-h-9 rounded-xl border border-foreground/15 bg-white px-3 text-sm">
                <option value="all">{tr("Todas las personas")}</option>
                {people.map((p) => (
                  <option key={p} value={p}>{p === "Sistema" ? tr("Sistema") : p}</option>
                ))}
              </select>
              <label htmlFor="aud-area" className="sr-only">{tr("Área")}</label>
              <select id="aud-area" value={area} onChange={(e) => setArea(e.target.value)} className="min-h-9 rounded-xl border border-foreground/15 bg-white px-3 text-sm">
                <option value="all">{tr("Todas las áreas")}</option>
                {Object.entries(AREA).map(([id, label]) => (
                  <option key={id} value={id}>{tr(label)}</option>
                ))}
              </select>
              <div className="relative">
                <label htmlFor="aud-search" className="sr-only">{tr("Buscar en el registro")}</label>
                <Search aria-hidden="true" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-foreground/50" />
                <input
                  id="aud-search"
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={tr("Buscar en el registro")}
                  className="min-h-9 w-52 rounded-xl border border-foreground/15 bg-white pl-9 pr-3 text-sm"
                />
              </div>
            </div>
          </div>

          {days.length === 0 && <p className="px-5 py-10 text-center text-sm text-foreground/60">{tr("Ningún cambio coincide con los filtros.")}</p>}
          {days.map((g) => (
            <div key={g.key}>
              <div className="bg-[#f5f2ea] px-5 py-2 text-sm font-semibold first-letter:uppercase border-b border-foreground/5">{g.label}</div>
              {g.items.map(({ log, text, diffs }) => {
                const v = VERB[log.action_type];
                const selected = record !== null && record === log.entity_id;
                const who = personOf(log);
                return (
                  <button
                    key={log.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setRecord(log.entity_id)}
                    className={`flex w-full items-start gap-3 border-b border-foreground/5 px-5 py-3.5 text-left transition-colors ${selected ? "bg-[#f3eee3]" : "bg-white hover:bg-[#fdfbf7]"}`}
                  >
                    <span aria-hidden="true" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#efebe3] text-xs font-bold text-foreground/80">
                      {initials(who)}
                    </span>
                    <span className="min-w-0 flex-1 space-y-1.5">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        {v && <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${v.chip}`}>{tr(v.label)}</span>}
                        <span className="text-xs text-foreground/70">
                          {who === "Sistema" ? tr("Sistema") : who} · {time(log.created_at)} · {tr(AREA[log.entity_type] ?? log.entity_type)}
                        </span>
                        {isSensitive(log) && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">⚠️ {tr("Sensible")}</span>}
                      </span>
                      <span className="block font-medium leading-snug">{text}</span>
                      {diffs.length > 0 && (
                        <span className="flex flex-wrap gap-1.5">
                          {diffs.map((x, i) => (
                            <span key={i} className="inline-flex items-center gap-1.5 rounded-lg bg-[#f9f7f0] px-2.5 py-1 text-xs tabular-nums">
                              <span className="text-foreground/70">{x.field}</span>
                              {x.from !== null && <span className="text-foreground/60 line-through">{x.from}</span>}
                              {x.from !== null && <span aria-hidden="true">→</span>}
                              <strong>{x.to}</strong>
                            </span>
                          ))}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
          {filtered.length > limit && (
            <div className="px-5 py-4 text-center">
              <button type="button" onClick={() => setLimit((n) => n + 150)} className="min-h-10 rounded-xl border border-foreground/15 px-4 text-sm font-medium hover:border-foreground/40">
                {tr("Mostrar más ({n} restantes)", { n: filtered.length - limit })}
              </button>
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <section aria-label={tr("Historial del registro")} className="bg-white rounded-3xl border border-foreground/5 shadow-sm overflow-hidden">
            <div className="border-b border-foreground/5 px-5 py-4">
              <p className="text-xs text-foreground/70">{tr("Historial del registro")}</p>
              <h2 className="font-serif text-lg">
                {recordLog
                  ? `${tr(AREA[recordLog.entity_type] ?? recordLog.entity_type)}${recordLog.inventory_id && products[recordLog.inventory_id] ? ` · ${products[recordLog.inventory_id].name}` : ""}`
                  : tr("Toca un cambio para ver toda la historia de ese registro")}
              </h2>
            </div>
            {history.length > 0 && (
              <ol className="px-5 py-4">
                {history.map(({ log, text, diffs }, i) => (
                  <li key={log.id} className="flex gap-3">
                    <span className="flex w-3 shrink-0 flex-col items-center">
                      <span className={`mt-1.5 h-3 w-3 rounded-full ${log.action_type === "DELETE" ? "bg-red-600" : log.action_type === "UPDATE" ? "bg-blue-600" : "bg-emerald-600"}`} />
                      {i < history.length - 1 && <span className="w-0.5 flex-1 bg-foreground/10" />}
                    </span>
                    <span className="min-w-0 flex-1 space-y-1 pb-4">
                      <span className="block text-xs text-foreground/70">
                        {personOf(log) === "Sistema" ? tr("Sistema") : personOf(log)} ·{" "}
                        {new Date(log.created_at).toLocaleString(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <span className="block text-sm font-semibold leading-snug">{text}</span>
                      {diffs.length > 0 && (
                        <span className="block overflow-hidden rounded-lg border border-foreground/10 text-xs">
                          {diffs.map((x, j) => (
                            <span key={j} className="grid grid-cols-3 gap-2 border-t border-foreground/5 px-2.5 py-1.5 tabular-nums first:border-t-0">
                              <span className="text-foreground/70">{x.field}</span>
                              <span className="text-foreground/60 line-through">{x.from ?? ""}</span>
                              <strong>{x.to}</strong>
                            </span>
                          ))}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            )}
            {recordLog?.inventory_id && (
              <div className="border-t border-foreground/5 bg-[#fdfbf7] px-5 py-3">
                <button
                  type="button"
                  onClick={() => setProduct(recordLog.inventory_id)}
                  className="text-sm font-semibold text-[#7A5B22] hover:underline"
                >
                  {tr("Ver todos los cambios de este producto")}
                </button>
              </div>
            )}
          </section>

          <section className="rounded-3xl border border-[#E6CF9E] bg-[#FBF3E2] px-5 py-4 text-sm space-y-2">
            <h2 className="font-semibold">💡 {tr("Qué queda registrado")}</h2>
            <p>{tr("Movimientos (crear, editar, eliminar), transferencias entre bodegas, cambios de bodegas y lotes de trilla, tostión, cold brew y reempaque. El registro no se puede modificar ni borrar.")}</p>
            <p className="text-foreground/70">
              {tr("Aún no se registran los cambios de configuración de productos («Se vende», stock mínimo).")}
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Card({ label, value, tone, hint }: { label: string; value: number; tone?: "red" | "amber"; hint?: string }) {
  const toneCls = tone === "red" ? "bg-red-50 border-red-100" : tone === "amber" ? "bg-amber-50 border-amber-100" : "bg-white border-foreground/5";
  return (
    <div className={`rounded-2xl border px-4 py-3 shadow-sm ${toneCls}`}>
      <p className="text-sm text-foreground/70">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value.toLocaleString("es-CO")}</p>
      {hint && <p className="text-xs text-foreground/60">{hint}</p>}
    </div>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}
