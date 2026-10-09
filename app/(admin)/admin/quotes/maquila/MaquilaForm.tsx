"use client";

import React, { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Copy, FileDown, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { saveMaquilaProposal, type MaquilaProposalInput } from "./actions";
import MaquilaPreview from "./MaquilaPreview";
import type { MaquilaPdfData } from "@/utils/pdf/maquilaPdf";
import {
  calculateProposal,
  linesBelowCost,
  DEFAULT_CONDITIONS,
  DEFAULT_SETTINGS,
  type MaquilaLine,
  type MaterialLine,
  type MaquilaSettings,
} from "@/utils/maquila";

type Client = { id: string; name: string };
type PackagingItem = { product_code: string; product_name: string; standard_cost: number | null };

const labelCls = "block text-[10px] font-bold uppercase tracking-widest text-foreground/40 mb-1.5";
const inputCls =
  "w-full px-3 py-2.5 bg-white border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20";
const cop = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);
const pct = (n: number | null) => (n == null ? "—" : `${n.toLocaleString("es-CO", { maximumFractionDigits: 1 })} %`);
const today = () => new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
const inDays = (ymd: string, days: number) => new Date(Date.parse(`${ymd}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
const newId = () => `l_${Math.random().toString(36).slice(2, 9)}`;
const n = (v: string) => (v.trim() === "" ? 0 : Number(v.replace(",", ".")));

const blankLine = (): MaquilaLine => ({
  id: newId(),
  presentation: "",
  grams: 250,
  monthly_units: 0,
  materials: [],
  labor_per_unit: 0,
  target_margin_pct: 35,
  price_per_unit: null,
});

/* eslint-disable @typescript-eslint/no-explicit-any */
export default function MaquilaForm({
  clients,
  packaging,
  initial,
  sellerName,
}: {
  clients: Client[];
  packaging: PackagingItem[];
  initial?: any;
  sellerName?: string;
}) {
  /* eslint-enable @typescript-eslint/no-explicit-any */
  const router = useRouter();
  const [clientId, setClientId] = useState<string>(initial?.client_id ?? "");
  const [customClient, setCustomClient] = useState<string>(initial?.custom_client_name ?? "");
  const [title, setTitle] = useState<string>(initial?.title ?? "Propuesta de maquila de empaque");
  const [date, setDate] = useState<string>(initial?.proposal_date ?? today());
  const [validUntil, setValidUntil] = useState<string>(initial?.valid_until ?? inDays(today(), 30));
  const [status, setStatus] = useState<string>(initial?.status ?? "borrador");
  const [intro, setIntro] = useState<string>(
    initial?.intro ??
      "Gracias por considerar a Café Amantti para el empaque de su café. A continuación presentamos nuestra propuesta de servicio de empaque y etiquetado por unidad."
  );
  const [conditions, setConditions] = useState<string>(initial?.conditions ?? DEFAULT_CONDITIONS);
  const [minimumUnits, setMinimumUnits] = useState<string>(initial?.minimum_units != null ? String(initial.minimum_units) : "");
  const [settings, setSettings] = useState<MaquilaSettings>({ ...DEFAULT_SETTINGS, ...(initial?.settings ?? {}) });
  const [lines, setLines] = useState<MaquilaLine[]>(initial?.lines?.length ? initial.lines : [blankLine()]);
  const [notes, setNotes] = useState<string>(initial?.internal_notes ?? "");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isPending, startTransition] = useTransition();
  const [isPdf, setIsPdf] = useState(false);

  const calc = useMemo(() => calculateProposal(lines, settings), [lines, settings]);
  const belowCost = useMemo(() => linesBelowCost(lines, settings), [lines, settings]);
  const clientName = clientId ? clients.find((c) => c.id === clientId)?.name ?? "" : customClient;

  // What the client document shows; the preview and the PDF use the same data.
  const pdfData: MaquilaPdfData = useMemo(
    () => ({
      title,
      clientName: clientName || "Cliente",
      proposalDate: date,
      validUntil: validUntil || null,
      intro,
      conditions,
      minimumUnits: minimumUnits.trim() === "" ? null : Math.round(n(minimumUnits)),
      settings,
      lines,
      sellerName,
    }),
    [title, clientName, date, validUntil, intro, conditions, minimumUnits, settings, lines, sellerName]
  );

  const updateLine = (id: string, patch: Partial<MaquilaLine>) => setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const updateMaterial = (lineId: string, idx: number, patch: Partial<MaterialLine>) =>
    setLines((ls) => ls.map((l) => (l.id === lineId ? { ...l, materials: l.materials.map((m, i) => (i === idx ? { ...m, ...patch } : m)) } : l)));

  function payload(): MaquilaProposalInput {
    return {
      client_id: clientId || null,
      custom_client_name: clientId ? null : customClient,
      title,
      proposal_date: date,
      valid_until: validUntil || null,
      status,
      intro,
      conditions,
      minimum_units: minimumUnits.trim() === "" ? null : Math.round(n(minimumUnits)),
      settings,
      lines,
      internal_notes: notes,
    };
  }

  function save(thenPdf = false) {
    setError("");
    setNotice("");
    startTransition(async () => {
      try {
        const res = await saveMaquilaProposal(payload(), initial?.id);
        setNotice("✓ Propuesta guardada");
        if (thenPdf) await downloadPdf();
        if (!initial?.id) router.replace(`/admin/quotes/maquila/${res.id}`);
        else router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo guardar");
      }
    });
  }

  async function downloadPdf() {
    setIsPdf(true);
    try {
      const { generateMaquilaPDF } = await import("@/utils/pdf/maquilaPdf");
      const blob = await generateMaquilaPDF(pdfData);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Maquila_${(clientName || "Cliente").replace(/[^\w-]+/g, "_")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsPdf(false);
    }
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6 items-start">
      <div className="space-y-6">
        {/* Header */}
        <section className="bg-white rounded-3xl border border-foreground/5 shadow-sm p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="mq-client" className={labelCls}>Cliente *</label>
              <select id="mq-client" value={clientId} onChange={(e) => setClientId(e.target.value)} className={inputCls}>
                <option value="">— Cliente nuevo (escribir nombre) —</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              {!clientId && (
                <input
                  value={customClient}
                  onChange={(e) => setCustomClient(e.target.value)}
                  placeholder="Nombre del cliente o marca"
                  aria-label="Nombre del cliente"
                  className={`${inputCls} mt-2`}
                />
              )}
            </div>
            <div>
              <label htmlFor="mq-title" className={labelCls}>Título</label>
              <input id="mq-title" value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label htmlFor="mq-date" className={labelCls}>Fecha</label>
              <input id="mq-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label htmlFor="mq-valid" className={labelCls}>Válida hasta</label>
              <input id="mq-valid" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label htmlFor="mq-status" className={labelCls}>Estado</label>
              <select id="mq-status" value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
                <option value="borrador">Borrador</option>
                <option value="enviada">Enviada</option>
                <option value="aceptada">Aceptada</option>
                <option value="rechazada">Rechazada</option>
              </select>
            </div>
            <div>
              <label htmlFor="mq-min" className={labelCls}>Pedido mínimo (und.)</label>
              <input id="mq-min" inputMode="numeric" value={minimumUnits} onChange={(e) => setMinimumUnits(e.target.value.replace(/[^\d]/g, ""))} placeholder="Opcional" className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label htmlFor="mq-merma" className={labelCls}>Merma de empaque (%)</label>
              <input id="mq-merma" inputMode="decimal" value={settings.merma_pct} onChange={(e) => setSettings({ ...settings, merma_pct: n(e.target.value) })} className={inputCls} />
            </div>
            <label className="flex items-center gap-3 mt-6 cursor-pointer">
              <input type="checkbox" checked={settings.apply_iva} onChange={(e) => setSettings({ ...settings, apply_iva: e.target.checked })} className="w-4 h-4 accent-[#C59F59]" />
              <span className="text-sm">Cobrar IVA ({settings.iva_pct} %)</span>
            </label>
          </div>
        </section>

        {/* Presentations */}
        {lines.map((l, idx) => {
          const r = calc.lines[idx];
          return (
            <section key={l.id} className="bg-white rounded-3xl border border-foreground/5 shadow-sm p-6 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#C59F59]">Presentación {idx + 1}</p>
                <div className="flex gap-1">
                  <button type="button" onClick={() => setLines((ls) => [...ls.slice(0, idx + 1), { ...l, id: newId(), presentation: `${l.presentation} (copia)` }, ...ls.slice(idx + 1)])} className="p-2 rounded-lg text-foreground/40 hover:bg-foreground/5" aria-label="Duplicar presentación">
                    <Copy className="w-4 h-4" />
                  </button>
                  <button type="button" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.id !== l.id) : ls))} disabled={lines.length === 1} className="p-2 rounded-lg text-foreground/40 hover:text-red-500 hover:bg-red-50 disabled:opacity-30" aria-label="Quitar presentación">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr] gap-4">
                <div>
                  <label className={labelCls}>Presentación *</label>
                  <input value={l.presentation} onChange={(e) => updateLine(l.id, { presentation: e.target.value })} placeholder="Ej. Bolsa 250 g con válvula" aria-label="Nombre de la presentación" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Gramos por unidad</label>
                  <input inputMode="decimal" value={l.grams || ""} onChange={(e) => updateLine(l.id, { grams: n(e.target.value) })} aria-label="Gramos por unidad" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Unidades al mes</label>
                  <input inputMode="numeric" value={l.monthly_units || ""} onChange={(e) => updateLine(l.id, { monthly_units: n(e.target.value) })} aria-label="Unidades al mes" className={inputCls} />
                </div>
              </div>

              {/* Materials */}
              <div>
                <p className={labelCls}>Insumos por unidad</p>
                {l.materials.length > 0 && (
                  <div className="hidden md:grid grid-cols-[2fr_1fr_80px_140px_36px] gap-2 px-1 mb-1 text-[10px] font-bold uppercase tracking-widest text-foreground/30">
                    <span>Insumo</span>
                    <span>Costo unitario</span>
                    <span>Cant.</span>
                    <span>Lo aporta</span>
                    <span />
                  </div>
                )}
                <div className="space-y-2">
                  {l.materials.map((m, i) => (
                    <div key={i} className="grid grid-cols-2 md:grid-cols-[2fr_1fr_80px_140px_36px] gap-2 items-center">
                      <div className="col-span-2 md:col-span-1">
                        <input
                          list={`mq-pack-${l.id}`}
                          value={m.name}
                          onChange={(e) => {
                            const picked = packaging.find((p) => `${p.product_name} (${p.product_code})` === e.target.value);
                            updateMaterial(l.id, i, picked
                              ? { name: picked.product_name, code: picked.product_code, unit_cost: picked.standard_cost ?? m.unit_cost }
                              : { name: e.target.value, code: null });
                          }}
                          placeholder="Bolsa, etiqueta, válvula…"
                          aria-label="Insumo"
                          className={inputCls}
                        />
                      </div>
                      <input inputMode="decimal" value={m.unit_cost || ""} onChange={(e) => updateMaterial(l.id, i, { unit_cost: n(e.target.value) })} placeholder="Costo $" aria-label={`Costo de ${m.name || "insumo"}`} className={inputCls} disabled={m.supplied_by === "cliente"} />
                      <input inputMode="decimal" value={m.qty || ""} onChange={(e) => updateMaterial(l.id, i, { qty: n(e.target.value) })} aria-label={`Cantidad de ${m.name || "insumo"}`} className={inputCls} />
                      <select value={m.supplied_by} onChange={(e) => updateMaterial(l.id, i, { supplied_by: e.target.value as MaterialLine["supplied_by"] })} aria-label="Quién lo aporta" className={inputCls}>
                        <option value="amantti">Amantti</option>
                        <option value="cliente">El cliente</option>
                      </select>
                      <button type="button" onClick={() => updateLine(l.id, { materials: l.materials.filter((_, j) => j !== i) })} className="p-2 rounded-lg text-foreground/30 hover:text-red-500 hover:bg-red-50 justify-self-start" aria-label="Quitar insumo">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  <datalist id={`mq-pack-${l.id}`}>
                    {packaging.map((p) => (
                      <option key={p.product_code} value={`${p.product_name} (${p.product_code})`} />
                    ))}
                  </datalist>
                  <button type="button" onClick={() => updateLine(l.id, { materials: [...l.materials, { code: null, name: "", unit_cost: 0, qty: 1, supplied_by: "amantti" }] })} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-foreground/20 text-xs font-bold uppercase tracking-widest text-foreground/50 hover:bg-foreground/5">
                    <Plus className="w-3.5 h-3.5" /> Agregar insumo
                  </button>
                </div>
              </div>

              {/* Pricing */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-end">
                <div>
                  <label className={labelCls}>Mano de obra / und.</label>
                  <input inputMode="decimal" value={l.labor_per_unit || ""} onChange={(e) => updateLine(l.id, { labor_per_unit: n(e.target.value) })} aria-label="Mano de obra por unidad" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Margen objetivo (%)</label>
                  <input inputMode="decimal" value={l.target_margin_pct} onChange={(e) => updateLine(l.id, { target_margin_pct: n(e.target.value) })} aria-label="Margen objetivo" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Precio por unidad</label>
                  <input
                    inputMode="numeric"
                    value={l.price_per_unit ?? ""}
                    onChange={(e) => updateLine(l.id, { price_per_unit: e.target.value.trim() === "" ? null : n(e.target.value) })}
                    placeholder={`Sugerido ${cop(r?.suggested)}`}
                    aria-label="Precio por unidad"
                    className={inputCls}
                  />
                </div>
                <div className="rounded-xl bg-[#fdfbf7] px-3 py-2 text-xs">
                  <div className="text-foreground/50">Costo {cop(r?.cost)} · margen</div>
                  <div className={`font-bold text-sm ${r && r.price < r.cost ? "text-red-600" : r?.marginPct != null && r.marginPct < 20 ? "text-amber-600" : "text-emerald-700"}`}>
                    {pct(r?.marginPct ?? null)} · {cop(r?.price)}
                  </div>
                </div>
              </div>
            </section>
          );
        })}
        <button type="button" onClick={() => setLines((ls) => [...ls, blankLine()])} className="flex items-center gap-2 px-4 py-3 rounded-2xl border border-dashed border-foreground/20 text-xs font-bold uppercase tracking-widest text-foreground/60 hover:bg-white">
          <Plus className="w-4 h-4" /> Agregar presentación
        </button>

        {/* Texts */}
        <section className="bg-white rounded-3xl border border-foreground/5 shadow-sm p-6 space-y-4">
          <div>
            <label htmlFor="mq-intro" className={labelCls}>Introducción (PDF)</label>
            <textarea id="mq-intro" rows={3} value={intro} onChange={(e) => setIntro(e.target.value)} className={`${inputCls} resize-y`} />
          </div>
          <div>
            <label htmlFor="mq-cond" className={labelCls}>Condiciones (PDF, una por línea)</label>
            <textarea id="mq-cond" rows={6} value={conditions} onChange={(e) => setConditions(e.target.value)} className={`${inputCls} resize-y`} />
          </div>
          <div>
            <label htmlFor="mq-notes" className={labelCls}>Notas internas (no salen en el PDF)</label>
            <textarea id="mq-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inputCls} resize-y`} />
          </div>
        </section>
      </div>

      {/* Internal summary */}
      <aside className="xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:overflow-y-auto space-y-4 pb-2">
        <section className="bg-white rounded-3xl border border-foreground/5 shadow-sm p-6 space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-foreground/40">Resumen interno · mensual</p>
          <Row label="Unidades" value={calc.totals.units.toLocaleString("es-CO")} />
          <Row label="Café que trae el cliente" value={`${calc.totals.coffeeKg.toLocaleString("es-CO", { maximumFractionDigits: 1 })} kg`} />
          <hr className="border-foreground/5" />
          <Row label="Ingreso (sin IVA)" value={cop(calc.totals.subtotal)} />
          <Row label="Costo directo" value={cop(calc.totals.totalCost)} />
          <Row label="Utilidad" value={cop(calc.totals.profit)} strong />
          <Row label="Margen" value={pct(calc.totals.marginPct)} strong />
          {settings.apply_iva && (
            <>
              <hr className="border-foreground/5" />
              <Row label={`IVA ${settings.iva_pct} %`} value={cop(calc.totals.iva)} />
              <Row label="Total cliente" value={cop(calc.totals.total)} strong />
            </>
          )}
        </section>

        {belowCost.length > 0 && (
          <div className="flex items-start gap-2 px-4 py-3 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>Precio por debajo del costo en: {belowCost.join(", ")}.</span>
          </div>
        )}
        {error && <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-2xl">{error}</p>}
        {notice && <p className="text-sm text-emerald-700 bg-emerald-50 px-4 py-3 rounded-2xl">{notice}</p>}

        <div className="flex flex-col gap-2">
          <button type="button" onClick={() => save(false)} disabled={isPending} className="flex items-center justify-center gap-2 py-3 rounded-2xl bg-foreground text-background text-xs font-bold uppercase tracking-widest hover:bg-[#C59F59] disabled:opacity-60">
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar
          </button>
          <button type="button" onClick={() => save(true)} disabled={isPending || isPdf} className="flex items-center justify-center gap-2 py-3 rounded-2xl bg-[#C59F59] text-white text-xs font-bold uppercase tracking-widest hover:bg-[#b08d4f] disabled:opacity-60">
            {isPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />} Guardar y descargar PDF
          </button>
          <p className="text-[11px] text-foreground/40 text-center">El PDF muestra precios y condiciones; nunca costos ni márgenes.</p>
        </div>

        <MaquilaPreview data={pdfData} />
      </aside>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-foreground/50">{label}</span>
      <span className={strong ? "font-bold" : ""}>{value}</span>
    </div>
  );
}
