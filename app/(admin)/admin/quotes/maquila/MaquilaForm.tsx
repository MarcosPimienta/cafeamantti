"use client";

import React, { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Copy, FileDown, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { saveMaquilaOptionPrices, saveMaquilaProposal, type MaquilaProposalInput } from "./actions";
import MaquilaPreview from "./MaquilaPreview";
import BrandIdentityPanel from "../proposals/new/BrandIdentityPanel";
import type { MaquilaPdfData } from "@/utils/pdf/maquilaPdf";
import {
  calculateProposal,
  linesBelowCost,
  linesBelowMinimum,
  normalizeLine,
  normalizeSettings,
  DEFAULT_CONDITIONS,
  DEFAULT_BACKGROUND_URL,
  MAQUILA_PROFILES,
  effectiveMinimum,
  MIN_UNITS_PER_PRESENTATION,
  OPTION_KEYS,
  OPTION_LABELS,
  REFERENCE_OPTIONS,
  normalizeOptionPrices,
  referenceSizeOf,
  type MaquilaLine,
  type OptionPrices,
  type PackagingOptions,
  type MaterialLine,
  type MaquilaSettings,
} from "@/utils/maquila";
import type { CoffeeProfileId } from "@/app/(admin)/coffeeProfiles";

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

const blankLine = (costs: Partial<Record<CoffeeProfileId, number>>): MaquilaLine => ({
  id: newId(),
  presentation: "",
  profile: "premium",
  coffee_cost_per_kg: costs.premium ?? 0,
  grams: 250,
  units: MIN_UNITS_PER_PRESENTATION,
  materials: [],
  labor_per_unit: 0,
  target_margin_pct: 35,
  price_per_unit: null,
  options: { ...REFERENCE_OPTIONS },
});

const sameOptionPrices = (a: OptionPrices, b: OptionPrices) => OPTION_KEYS.every((k) => a[k].price === b[k].price && a[k].cost === b[k].cost);

/* eslint-disable @typescript-eslint/no-explicit-any */
export default function MaquilaForm({
  clients,
  packaging,
  coffeeCostPerKg = {},
  optionPrices: generalOptionPrices,
  initial,
  initialAssetUrls,
  sellerName,
}: {
  /** Signed URLs for the saved background and client logo (they expire, so they are not stored). */
  initialAssetUrls?: { background?: string | null; allyLogo?: string | null };
  clients: Client[];
  packaging: PackagingItem[];
  /** Direct cost per kg of each profile (café + tostión), from Inventario → Costos. */
  coffeeCostPerKg?: Partial<Record<CoffeeProfileId, number>>;
  /** General price table of bag options (valve, peel stick, print…). */
  optionPrices?: OptionPrices;
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
      "Gracias por considerar a Café Amantti. Le proponemos nuestro café de especialidad, tostado y empacado con su marca, en los perfiles y presentaciones que se detallan a continuación."
  );
  const [conditions, setConditions] = useState<string>(initial?.conditions ?? DEFAULT_CONDITIONS);
  const [minimumUnits, setMinimumUnits] = useState<string>(String(initial?.minimum_units ?? MIN_UNITS_PER_PRESENTATION));
  const [generalPrices, setGeneralPrices] = useState<OptionPrices>(normalizeOptionPrices(generalOptionPrices));
  // A saved proposal keeps the option prices it was quoted with; a new one starts from the general table.
  const [settings, setSettings] = useState<MaquilaSettings>(() => {
    const st = normalizeSettings(initial?.settings);
    return { ...st, option_prices: normalizeOptionPrices(st.option_prices ?? generalOptionPrices) };
  });
  const prices = normalizeOptionPrices(settings.option_prices);
  const [savingPrices, startSavingPrices] = useTransition();
  const [backgroundUrl, setBackgroundUrl] = useState<string>(initialAssetUrls?.background ?? "");
  const [allyLogoUrl, setAllyLogoUrl] = useState<string>(initialAssetUrls?.allyLogo ?? "");
  // null path = Amantti's default background; "" = none; otherwise an uploaded image.
  const effectiveBackground =
    settings.background_path === null ? DEFAULT_BACKGROUND_URL : settings.background_path === "" ? null : backgroundUrl || null;
  const [lines, setLines] = useState<MaquilaLine[]>(
    initial?.lines?.length ? initial.lines.map(normalizeLine) : [blankLine(coffeeCostPerKg)]
  );
  const [notes, setNotes] = useState<string>(initial?.internal_notes ?? "");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isPending, startTransition] = useTransition();
  const [isPdf, setIsPdf] = useState(false);

  const minimumNum = minimumUnits.trim() === "" ? null : Math.round(n(minimumUnits));
  const minimum = effectiveMinimum(minimumNum);
  const calc = useMemo(() => calculateProposal(lines, settings, minimumNum), [lines, settings, minimumNum]);
  const belowCost = useMemo(() => linesBelowCost(lines, settings), [lines, settings]);
  const belowMinimum = useMemo(() => linesBelowMinimum(lines, settings, minimumNum), [lines, settings, minimumNum]);
  const minimumInvalid = minimumUnits.trim() !== "" && n(minimumUnits) < MIN_UNITS_PER_PRESENTATION;
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
      minimumUnits: minimumNum,
      settings,
      lines,
      sellerName,
      backgroundImage: effectiveBackground,
      backgroundOpacity: settings.background_opacity,
      allyLogo: allyLogoUrl || null,
    }),
    [title, clientName, date, validUntil, intro, conditions, minimumNum, settings, lines, sellerName, effectiveBackground, allyLogoUrl]
  );

  const updateLine = (id: string, patch: Partial<MaquilaLine>) => setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const updateOptions = (id: string, patch: Partial<PackagingOptions>) =>
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, options: { ...l.options, ...patch } } : l)));
  const setOptionPrice = (key: (typeof OPTION_KEYS)[number], field: "price" | "cost", value: number) =>
    setSettings((st) => {
      const cur = normalizeOptionPrices(st.option_prices);
      return { ...st, option_prices: { ...cur, [key]: { ...cur[key], [field]: value } } };
    });

  function saveAsGeneral() {
    setError("");
    setNotice("");
    startSavingPrices(async () => {
      try {
        await saveMaquilaOptionPrices(prices);
        setGeneralPrices(prices);
        setNotice("✓ Tabla general de opciones actualizada");
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo guardar la tabla");
      }
    });
  }

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
    if (belowMinimum.length) {
      setError(`El pedido mínimo es de ${minimum.toLocaleString("es-CO")} unidades por presentación: revisa ${belowMinimum.join(", ")}.`);
      return;
    }
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
              <label htmlFor="mq-min" className={labelCls}>Mínimo por presentación</label>
              <input id="mq-min" inputMode="numeric" value={minimumUnits} onChange={(e) => setMinimumUnits(e.target.value.replace(/[^\d]/g, ""))} placeholder={String(MIN_UNITS_PER_PRESENTATION)} className={`${inputCls} ${minimumInvalid ? "border-red-300" : ""}`} />
              {minimumInvalid && <p className="text-[11px] text-red-600 mt-1">No puede ser menor a {MIN_UNITS_PER_PRESENTATION}.</p>}
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
          <div className="rounded-2xl bg-[#fdfbf7] border border-foreground/5 p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#C59F59] mb-3">Diseño de empaque · pago único por proyecto</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="mq-design-fee" className={labelCls}>Valor al cliente</label>
                <input id="mq-design-fee" inputMode="numeric" value={settings.design_fee || ""} onChange={(e) => setSettings({ ...settings, design_fee: n(e.target.value) })} placeholder="0 = sin diseño" className={inputCls} />
              </div>
              <div>
                <label htmlFor="mq-design-cost" className={labelCls}>Costo interno (diseñador, pruebas)</label>
                <input id="mq-design-cost" inputMode="numeric" value={settings.design_cost || ""} onChange={(e) => setSettings({ ...settings, design_cost: n(e.target.value) })} placeholder="No sale en el PDF" className={inputCls} />
              </div>
            </div>
          </div>
          <details className="rounded-2xl bg-[#fdfbf7] border border-foreground/5 p-4 group">
            <summary className="cursor-pointer text-[10px] font-bold uppercase tracking-widest text-[#C59F59] list-none flex items-center justify-between gap-2">
              <span>Precios de opciones de empaque · por unidad</span>
              <span className="text-foreground/40 normal-case tracking-normal font-normal">
                {sameOptionPrices(prices, generalPrices) ? "Tabla general" : "Modificados en esta propuesta"}
              </span>
            </summary>
            <p className="text-[11px] text-foreground/50 mt-3">
              El precio de venta sugerido al cliente parte de nuestra bolsa (1 tinta en frente y respaldo, con válvula, sin sticker ni peel stick) al precio de la tienda con envío.
              Cada diferencia suma o resta su ajuste a ese precio; el costo interno entra al costo por bolsa, y con él a lo que le cobramos.
            </p>
            <div className="hidden sm:grid grid-cols-[1fr_120px_120px] gap-2 mt-3 px-1 text-[10px] font-bold uppercase tracking-widest text-foreground/30">
              <span>Opción</span>
              <span>Ajuste precio venta</span>
              <span>Costo interno</span>
            </div>
            <div className="space-y-2 mt-1">
              {OPTION_KEYS.map((k) => (
                <div key={k} className="grid grid-cols-2 sm:grid-cols-[1fr_120px_120px] gap-2 items-center">
                  <div className="col-span-2 sm:col-span-1 text-sm">
                    {OPTION_LABELS[k].label} <span className="text-[11px] text-foreground/40">· {OPTION_LABELS[k].hint}</span>
                  </div>
                  <input inputMode="numeric" value={prices[k].price || ""} onChange={(e) => setOptionPrice(k, "price", n(e.target.value))} placeholder="$ 0" aria-label={`Ajuste al precio de venta de ${OPTION_LABELS[k].label}`} className={inputCls} />
                  <input inputMode="numeric" value={prices[k].cost || ""} onChange={(e) => setOptionPrice(k, "cost", n(e.target.value))} placeholder="$ 0" aria-label={`Costo interno de ${OPTION_LABELS[k].label}`} className={inputCls} />
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-3 mt-3">
              <button type="button" onClick={saveAsGeneral} disabled={savingPrices || sameOptionPrices(prices, generalPrices)} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-foreground text-background text-[11px] font-bold uppercase tracking-widest hover:bg-[#C59F59] disabled:opacity-40">
                {savingPrices ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Guardar como tabla general
              </button>
              {!sameOptionPrices(prices, generalPrices) && (
                <button type="button" onClick={() => setSettings((st) => ({ ...st, option_prices: generalPrices }))} className="text-xs font-bold text-[#C59F59] hover:underline">
                  Usar la tabla general
                </button>
              )}
            </div>
          </details>
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
                  <label className={labelCls}>Unidades del pedido</label>
                  <input inputMode="numeric" value={l.units || ""} onChange={(e) => updateLine(l.id, { units: Math.round(n(e.target.value.replace(/[^\d]/g, ""))) })} placeholder={String(minimum)} aria-label="Unidades del pedido" className={`${inputCls} ${r?.belowMinimum ? "border-red-300" : ""}`} />
                  <p className={`text-[11px] mt-1 ${r?.belowMinimum ? "text-red-600" : "text-foreground/40"}`}>Mínimo {minimum.toLocaleString("es-CO")} und.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-4">
                <div>
                  <p className={labelCls}>Perfil de café</p>
                  <div className="grid grid-cols-3 gap-2" role="group" aria-label="Perfil de café">
                    {MAQUILA_PROFILES.map((pr) => (
                      <button
                        key={pr.id}
                        type="button"
                        aria-pressed={l.profile === pr.id}
                        onClick={() =>
                          updateLine(l.id, {
                            profile: pr.id,
                            // Follow the profile's cost unless there is none on record.
                            coffee_cost_per_kg: coffeeCostPerKg[pr.id] ?? l.coffee_cost_per_kg,
                          })
                        }
                        className={`px-3 py-2.5 rounded-xl border text-xs font-bold ${l.profile === pr.id ? "bg-[#C59F59] text-white border-[#C59F59]" : "bg-white text-foreground/60 border-foreground/10"}`}
                      >
                        {pr.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Costo café tostado / kg</label>
                  <input inputMode="numeric" value={l.coffee_cost_per_kg || ""} onChange={(e) => updateLine(l.id, { coffee_cost_per_kg: n(e.target.value) })} aria-label="Costo del café tostado por kg" placeholder="$ / kg" className={inputCls} />
                  <p className="text-[11px] text-foreground/40 mt-1">
                    {coffeeCostPerKg[l.profile] !== undefined
                      ? `De Inventario → Costos: ${cop(coffeeCostPerKg[l.profile]!)}`
                      : "Sin costo en Inventario → Costos: escríbelo a mano."}
                  </p>
                </div>
              </div>

              {/* Bag options */}
              <div>
                <p className={labelCls}>Empaque</p>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Opciones de empaque">
                  {(
                    [
                      ["valvula", "Válvula"],
                      ["peel_stick", "Peel stick"],
                      ["sticker", "Sticker"],
                      ["cara_frontal", "Cara frontal"],
                      ["cara_trasera", "Cara trasera"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold cursor-pointer ${l.options[key] ? "bg-[#C59F59]/10 border-[#C59F59]/40 text-foreground" : "bg-white border-foreground/10 text-foreground/50"}`}>
                      <input type="checkbox" checked={l.options[key]} onChange={(e) => updateOptions(l.id, { [key]: e.target.checked })} className="w-4 h-4 accent-[#C59F59]" />
                      {label}
                    </label>
                  ))}
                  <label className={`flex items-center gap-2 px-3 py-1 rounded-xl border border-foreground/10 bg-white text-xs font-bold ${l.options.cara_frontal || l.options.cara_trasera ? "" : "opacity-40"}`}>
                    # Tintas
                    <select value={l.options.tintas} onChange={(e) => updateOptions(l.id, { tintas: Number(e.target.value) })} disabled={!l.options.cara_frontal && !l.options.cara_trasera} aria-label="Número de tintas por cara" className="bg-transparent py-1 focus:outline-none">
                      {[1, 2, 3, 4, 5, 6, 7, 8].map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <p className={`text-[11px] mt-1.5 ${r?.resale != null && r.price >= r.resale ? "text-red-600" : "text-foreground/40"}`}>
                  {r?.resale != null
                    ? `Precio de venta sugerido al cliente (como nuestro ${MAQUILA_PROFILES.find((pr) => pr.id === l.profile)?.label} ${{ "250g": "250 g", "500g": "500 g", "2.5kg": "2,5 kg" }[referenceSizeOf(l.grams)!]}, con estas opciones): ${cop(r.resale)} · al cliente le queda ${pct(r.clientMarginPct)}`
                    : `Sin producto de referencia para ${l.grams || 0} g (solo 250 g, 500 g y 2,5 kg): el PDF no muestra precio de venta sugerido.`}
                </p>
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
                  <div className="text-foreground/50" title={r ? `Café ${cop(r.coffeeCost)} · opciones de empaque ${cop(r.optionsCost)} · insumos ${cop(r.materialsCost)} · mano de obra ${cop(r.laborCost)}` : ""}>
                    Costo {cop(r?.cost)} · margen
                  </div>
                  <div className={`font-bold text-sm ${r && r.price < r.cost ? "text-red-600" : r?.marginPct != null && r.marginPct < 20 ? "text-amber-600" : "text-emerald-700"}`}>
                    {pct(r?.marginPct ?? null)} · {cop(r?.price)}
                  </div>
                </div>
              </div>
            </section>
          );
        })}
        <button type="button" onClick={() => setLines((ls) => [...ls, blankLine(coffeeCostPerKg)])} className="flex items-center gap-2 px-4 py-3 rounded-2xl border border-dashed border-foreground/20 text-xs font-bold uppercase tracking-widest text-foreground/60 hover:bg-white">
          <Plus className="w-4 h-4" /> Agregar presentación
        </button>

        {/* Look of the document */}
        <section className="space-y-2">
          <BrandIdentityPanel
            allyLogoUrl={settings.ally_logo_path ?? ""}
            allyLogoSignedUrl={allyLogoUrl}
            backgroundImageUrl={settings.background_path === null ? DEFAULT_BACKGROUND_URL : settings.background_path}
            backgroundSignedUrl={effectiveBackground ?? ""}
            backgroundOpacity={settings.background_opacity}
            onAllyLogoChange={(path, signed) => {
              setSettings((st) => ({ ...st, ally_logo_path: path || null }));
              setAllyLogoUrl(signed);
            }}
            onBackgroundChange={(path, signed) => {
              setSettings((st) => ({ ...st, background_path: path }));
              setBackgroundUrl(signed);
            }}
            onOpacityChange={(o) => setSettings((st) => ({ ...st, background_opacity: o }))}
          />
          {settings.background_path !== null && (
            <button
              type="button"
              onClick={() => {
                setSettings((st) => ({ ...st, background_path: null }));
                setBackgroundUrl("");
              }}
              className="text-xs font-bold text-[#C59F59] hover:underline px-1"
            >
              Usar el fondo de Amantti
            </button>
          )}
        </section>

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
          <p className="text-[10px] font-bold uppercase tracking-widest text-foreground/40">Resumen interno · por pedido</p>
          <Row label="Unidades" value={calc.totals.units.toLocaleString("es-CO")} />
          {MAQUILA_PROFILES.filter((pr) => calc.totals.coffeeKgByProfile[pr.id]).map((pr) => (
            <Row key={pr.id} label={`Café ${pr.label} a tostar`} value={`${calc.totals.coffeeKgByProfile[pr.id]!.toLocaleString("es-CO", { maximumFractionDigits: 1 })} kg`} />
          ))}
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
          {calc.totals.design.fee > 0 && (
            <>
              <hr className="border-foreground/5" />
              <p className="text-[10px] font-bold uppercase tracking-widest text-foreground/40 pt-1">Diseño · pago único</p>
              <Row label="Valor (sin IVA)" value={cop(calc.totals.design.fee)} />
              <Row label="Costo" value={cop(calc.totals.design.cost)} />
              <Row label="Utilidad diseño" value={cop(calc.totals.design.profit)} strong />
            </>
          )}
        </section>

        {belowCost.length > 0 && (
          <div className="flex items-start gap-2 px-4 py-3 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>Precio por debajo del costo en: {belowCost.join(", ")}.</span>
          </div>
        )}
        {belowMinimum.length > 0 && (
          <div className="flex items-start gap-2 px-4 py-3 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>No se puede guardar: el pedido mínimo es de {minimum.toLocaleString("es-CO")} und. por presentación ({belowMinimum.join(", ")}).</span>
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
