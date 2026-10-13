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
  linesWithoutPrice,
  designItems,
  type DesignItem,
  normalizeLine,
  normalizeSettings,
  DOCUMENT_DEFAULTS,
  swapDefault,
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
import { useTr } from "@/app/(admin)/AdminI18n";
import { translate, type Locale } from "@/utils/i18n/translate";

type Client = { id: string; name: string };
type PackagingItem = { product_code: string; product_name: string; standard_cost: number | null };

const labelCls = "block text-[10px] font-bold uppercase tracking-widest text-foreground/40 mb-1.5";
const inputCls =
  "w-full px-3 py-2.5 bg-white border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20";
const cop = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);
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
  price_per_unit: null,
  resale_price: null,
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
  const tr = useTr();
  /* eslint-enable @typescript-eslint/no-explicit-any */
  const router = useRouter();
  const [clientId, setClientId] = useState<string>(initial?.client_id ?? "");
  const [customClient, setCustomClient] = useState<string>(initial?.custom_client_name ?? "");
  // New proposals start in the admin's language; saved ones keep theirs.
  const initialDocLang: Locale = initial?.settings?.doc_lang ?? (initial ? "es" : tr.locale);
  const [title, setTitle] = useState<string>(initial?.title ?? DOCUMENT_DEFAULTS[initialDocLang].title);
  const [date, setDate] = useState<string>(initial?.proposal_date ?? today());
  const [validUntil, setValidUntil] = useState<string>(initial?.valid_until ?? inDays(today(), 30));
  const [status, setStatus] = useState<string>(initial?.status ?? "borrador");
  const [intro, setIntro] = useState<string>(initial?.intro ?? DOCUMENT_DEFAULTS[initialDocLang].intro);
  const [conditions, setConditions] = useState<string>(initial?.conditions ?? DOCUMENT_DEFAULTS[initialDocLang].conditions);
  const [minimumUnits, setMinimumUnits] = useState<string>(String(initial?.minimum_units ?? MIN_UNITS_PER_PRESENTATION));
  const [generalPrices, setGeneralPrices] = useState<OptionPrices>(normalizeOptionPrices(generalOptionPrices));
  // A saved proposal keeps the option prices it was quoted with; a new one starts from the general table.
  const [settings, setSettings] = useState<MaquilaSettings>(() => {
    const st = normalizeSettings(initial?.settings);
    return { ...st, option_prices: normalizeOptionPrices(st.option_prices ?? generalOptionPrices), design_items: designItems(st) };
  });
  const prices = normalizeOptionPrices(settings.option_prices);
  const docLang: Locale = settings.doc_lang ?? initialDocLang;
  /** Switch the document's language; texts still at their default follow it. */
  const changeDocLang = (to: Locale) => {
    if (to === docLang) return;
    setTitle((t) => swapDefault("title", t, docLang, to));
    setIntro((t) => swapDefault("intro", t, docLang, to));
    setConditions((t) => swapDefault("conditions", t, docLang, to));
    setSettings((st) => ({ ...st, doc_lang: to }));
  };
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
      clientName: clientName || translate(docLang, "Cliente"),
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
      lang: docLang,
    }),
    [title, clientName, date, validUntil, intro, conditions, minimumNum, settings, lines, sellerName, effectiveBackground, allyLogoUrl, docLang]
  );

  const updateLine = (id: string, patch: Partial<MaquilaLine>) => setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  // The design fee is always the sum of its concepts.
  const setDesignItems = (items: DesignItem[]) =>
    setSettings((st) => ({ ...st, design_items: items, design_fee: items.reduce((sum, i) => sum + i.price, 0) }));
  const updateDesignItem = (idx: number, patch: Partial<DesignItem>) =>
    setDesignItems((settings.design_items ?? []).map((it, i) => (i === idx ? { ...it, ...patch } : it)));

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
        const res = await saveMaquilaOptionPrices(prices);
        if (!res.success) throw new Error(res.error);
        setGeneralPrices(prices);
        setNotice(tr("✓ Tabla general de opciones actualizada"));
      } catch (err) {
        setError(err instanceof Error ? err.message : tr("No se pudo guardar la tabla"));
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
    const noPrice = linesWithoutPrice(lines);
    if (noPrice.length) {
      setError(tr("Escribe lo que cobras por bolsa en: {noPrice}.", { noPrice: noPrice.join(", ") }));
      return;
    }
    if (belowMinimum.length) {
      setError(tr("El pedido mínimo es de {minimum} unidades por presentación: revisa {belowMinimum}.", { minimum: minimum.toLocaleString("es-CO"), belowMinimum: belowMinimum.join(", ") }));
      return;
    }
    startTransition(async () => {
      try {
        const res = await saveMaquilaProposal(payload(), initial?.id);
        if (!res.success) throw new Error(res.error);
        setNotice(tr("✓ Propuesta guardada"));
        if (thenPdf) await downloadPdf();
        if (!initial?.id) router.replace(`/admin/quotes/maquila/${res.id}`);
        else router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : tr("No se pudo guardar"));
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
              <label htmlFor="mq-client" className={labelCls}>{tr("Cliente *")}</label>
              <select id="mq-client" value={clientId} onChange={(e) => setClientId(e.target.value)} className={inputCls}>
                <option value="">{tr("— Cliente nuevo (escribir nombre) —")}</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              {!clientId && (
                <input
                  value={customClient}
                  onChange={(e) => setCustomClient(e.target.value)}
                  placeholder={tr("Nombre del cliente o marca")}
                  aria-label={tr("Nombre del cliente")}
                  className={`${inputCls} mt-2`}
                />
              )}
            </div>
            <div>
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="mq-title" className={labelCls}>{tr("Título")}</label>
                <div className="flex items-center gap-1 mb-1.5" role="group" aria-label={tr("Idioma del documento")}>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-foreground/40 mr-1">{tr("Idioma del documento")}</span>
                  {(["es", "en"] as const).map((l) => (
                    <button key={l} type="button" aria-pressed={docLang === l} onClick={() => changeDocLang(l)}
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${docLang === l ? "bg-[#C59F59] text-white" : "text-foreground/50 hover:bg-foreground/5"}`}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <input id="mq-title" value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label htmlFor="mq-date" className={labelCls}>{tr("Fecha")}</label>
              <input id="mq-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label htmlFor="mq-valid" className={labelCls}>{tr("Válida hasta")}</label>
              <input id="mq-valid" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label htmlFor="mq-status" className={labelCls}>{tr("Estado")}</label>
              <select id="mq-status" value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
                <option value="borrador">{tr("Borrador")}</option>
                <option value="enviada">{tr("Enviada")}</option>
                <option value="aceptada">{tr("Aceptada")}</option>
                <option value="rechazada">{tr("Rechazada")}</option>
              </select>
            </div>
            <div>
              <label htmlFor="mq-min" className={labelCls}>{tr("Mínimo por presentación")}</label>
              <input id="mq-min" inputMode="numeric" value={minimumUnits} onChange={(e) => setMinimumUnits(e.target.value.replace(/[^\d]/g, ""))} placeholder={String(MIN_UNITS_PER_PRESENTATION)} className={`${inputCls} ${minimumInvalid ? "border-red-300" : ""}`} />
              {minimumInvalid && <p className="text-[11px] text-red-600 mt-1">{tr("No puede ser menor a {MIN_UNITS_PER_PRESENTATION}.", { MIN_UNITS_PER_PRESENTATION: MIN_UNITS_PER_PRESENTATION })}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label htmlFor="mq-merma" className={labelCls}>{tr("Merma de empaque (%)")}</label>
              <input id="mq-merma" inputMode="decimal" value={settings.merma_pct} onChange={(e) => setSettings({ ...settings, merma_pct: n(e.target.value) })} className={inputCls} />
            </div>
            <label className="flex items-center gap-3 mt-6 cursor-pointer">
              <input type="checkbox" checked={settings.apply_iva} onChange={(e) => setSettings({ ...settings, apply_iva: e.target.checked })} className="w-4 h-4 accent-[#C59F59]" />
              <span className="text-sm">{tr("Cobrar IVA ({iva_pct} %)", { iva_pct: settings.iva_pct })}</span>
            </label>
          </div>
          <div className="rounded-2xl bg-[#fdfbf7] border border-foreground/5 p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#C59F59] mb-3">{tr("Diseño de empaque · pago único por proyecto")}</p>
            <p className="text-[11px] text-foreground/50 mb-3">{tr("Un solo proyecto del que salen todas las presentaciones. Desglósalo en las etapas o entregables que verá el cliente.")}</p>
            <p className={labelCls}>{tr("Conceptos del proyecto que ve el cliente")}</p>
            <div className="space-y-2 mb-4">
              {(settings.design_items ?? []).map((it, i) => (
                <div key={i} className="grid grid-cols-[1fr_130px_36px] gap-2 items-center">
                  <input value={it.description} onChange={(e) => updateDesignItem(i, { description: e.target.value })} placeholder={tr("Ej. Concepto gráfico, adaptación a las presentaciones, artes finales…")} aria-label={tr("Concepto de diseño")} className={inputCls} />
                  <input inputMode="numeric" value={it.price || ""} onChange={(e) => updateDesignItem(i, { price: n(e.target.value.replace(/[^\d]/g, "")) })} placeholder={tr("$ valor")} aria-label={`Valor de ${it.description || "concepto"}`} className={inputCls} />
                  <button type="button" onClick={() => setDesignItems((settings.design_items ?? []).filter((_, j) => j !== i))} className="p-2 rounded-lg text-foreground/30 hover:text-red-500 hover:bg-red-50" aria-label={tr("Quitar concepto")}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <button type="button" onClick={() => setDesignItems([...(settings.design_items ?? []), { description: "", price: 0 }])} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-foreground/20 text-xs font-bold uppercase tracking-widest text-foreground/50 hover:bg-foreground/5">
                  <Plus className="w-3.5 h-3.5" />{" "}{tr("Agregar concepto")}
                </button>
                <span className="text-sm">
                  {settings.design_items?.length ? <>{tr("Total diseño (sin IVA):")}{" "}<strong>{cop(settings.design_fee)}</strong></> : <span className="text-foreground/40">{tr("Sin diseño")}</span>}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="mq-design-cost" className={labelCls}>{tr("Costo interno (diseñador, pruebas)")}</label>
                <input id="mq-design-cost" inputMode="numeric" value={settings.design_cost || ""} onChange={(e) => setSettings({ ...settings, design_cost: n(e.target.value) })} placeholder={tr("No sale en el PDF")} className={inputCls} />
              </div>
            </div>
          </div>
          <details className="rounded-2xl bg-[#fdfbf7] border border-foreground/5 p-4 group">
            <summary className="cursor-pointer text-[10px] font-bold uppercase tracking-widest text-[#C59F59] list-none flex items-center justify-between gap-2">
              <span>{tr("Precios de opciones de empaque · por unidad")}</span>
              <span className="text-foreground/40 normal-case tracking-normal font-normal">
                {sameOptionPrices(prices, generalPrices) ? tr("Tabla general") : tr("Modificados en esta propuesta")}
              </span>
            </summary>
            <p className="text-[11px] text-foreground/50 mt-3">
              {tr("El precio de venta sugerido al cliente parte de nuestra bolsa (1 tinta en frente y respaldo, con válvula, sin sticker ni peel stick) al precio de la tienda con envío. Cada diferencia suma o resta su ajuste a ese precio; el costo interno entra al costo por bolsa, y con él a lo que le cobramos.")}
            </p>
            <div className="hidden sm:grid grid-cols-[1fr_120px_120px] gap-2 mt-3 px-1 text-[10px] font-bold uppercase tracking-widest text-foreground/30">
              <span>{tr("Opción")}</span>
              <span>{tr("Ajuste precio venta")}</span>
              <span>{tr("Costo interno")}</span>
            </div>
            <div className="space-y-2 mt-1">
              {OPTION_KEYS.map((k) => (
                <div key={k} className="grid grid-cols-2 sm:grid-cols-[1fr_120px_120px] gap-2 items-center">
                  <div className="col-span-2 sm:col-span-1 text-sm">
                    {tr(OPTION_LABELS[k].label)} <span className="text-[11px] text-foreground/40">· {tr(OPTION_LABELS[k].hint)}</span>
                  </div>
                  <input inputMode="numeric" value={prices[k].price || ""} onChange={(e) => setOptionPrice(k, "price", n(e.target.value))} placeholder="$ 0" aria-label={tr("Ajuste al precio de venta de {label}", { label: OPTION_LABELS[k].label })} className={inputCls} />
                  <input inputMode="numeric" value={prices[k].cost || ""} onChange={(e) => setOptionPrice(k, "cost", n(e.target.value))} placeholder="$ 0" aria-label={tr("Costo interno de {label}", { label: OPTION_LABELS[k].label })} className={inputCls} />
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-3 mt-3">
              <button type="button" onClick={saveAsGeneral} disabled={savingPrices || sameOptionPrices(prices, generalPrices)} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-foreground text-background text-[11px] font-bold uppercase tracking-widest hover:bg-[#C59F59] disabled:opacity-40">
                {savingPrices ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}{" "}{tr("Guardar como tabla general")}
              </button>
              {!sameOptionPrices(prices, generalPrices) && (
                <button type="button" onClick={() => setSettings((st) => ({ ...st, option_prices: generalPrices }))} className="text-xs font-bold text-[#C59F59] hover:underline">
                  {tr("Usar la tabla general")}
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
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#C59F59]">{tr("Presentación {v}", { v: idx + 1 })}</p>
                <div className="flex gap-1">
                  <button type="button" onClick={() => setLines((ls) => [...ls.slice(0, idx + 1), { ...l, id: newId(), presentation: `${l.presentation} (copia)` }, ...ls.slice(idx + 1)])} className="p-2 rounded-lg text-foreground/40 hover:bg-foreground/5" aria-label={tr("Duplicar presentación")}>
                    <Copy className="w-4 h-4" />
                  </button>
                  <button type="button" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.id !== l.id) : ls))} disabled={lines.length === 1} className="p-2 rounded-lg text-foreground/40 hover:text-red-500 hover:bg-red-50 disabled:opacity-30" aria-label={tr("Quitar presentación")}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr] gap-4">
                <div>
                  <label className={labelCls}>{tr("Presentación *")}</label>
                  <input value={l.presentation} onChange={(e) => updateLine(l.id, { presentation: e.target.value })} placeholder={tr("Ej. Bolsa 250 g con válvula")} aria-label={tr("Nombre de la presentación")} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>{tr("Gramos por unidad")}</label>
                  <input inputMode="decimal" value={l.grams || ""} onChange={(e) => updateLine(l.id, { grams: n(e.target.value) })} aria-label={tr("Gramos por unidad")} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>{tr("Unidades del pedido")}</label>
                  <input inputMode="numeric" value={l.units || ""} onChange={(e) => updateLine(l.id, { units: Math.round(n(e.target.value.replace(/[^\d]/g, ""))) })} placeholder={String(minimum)} aria-label={tr("Unidades del pedido")} className={`${inputCls} ${r?.belowMinimum ? "border-red-300" : ""}`} />
                  <p className={`text-[11px] mt-1 ${r?.belowMinimum ? "text-red-600" : "text-foreground/40"}`}>{tr("Mínimo {minimum} und.", { minimum: minimum.toLocaleString("es-CO") })}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-4">
                <div>
                  <p className={labelCls}>{tr("Perfil de café")}</p>
                  <div className="grid grid-cols-3 gap-2" role="group" aria-label={tr("Perfil de café")}>
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
                        {tr(pr.label)}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className={labelCls}>{tr("Costo café tostado / kg")}</label>
                  <input inputMode="numeric" value={l.coffee_cost_per_kg || ""} onChange={(e) => updateLine(l.id, { coffee_cost_per_kg: n(e.target.value) })} aria-label={tr("Costo del café tostado por kg")} placeholder={tr("$ / kg")} className={inputCls} />
                  <p className="text-[11px] text-foreground/40 mt-1">
                    {coffeeCostPerKg[l.profile] !== undefined
                      ? tr("De Inventario → Costos: {cop}", { cop: cop(coffeeCostPerKg[l.profile]!) })
                      : tr("Sin costo en Inventario → Costos: escríbelo a mano.")}
                  </p>
                </div>
              </div>

              {/* Bag options */}
              <div>
                <p className={labelCls}>{tr("Empaque")}</p>
                <div className="flex flex-wrap gap-2" role="group" aria-label={tr("Opciones de empaque")}>
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
                      {tr(label)}
                    </label>
                  ))}
                  <label className={`flex items-center gap-2 px-3 py-1 rounded-xl border border-foreground/10 bg-white text-xs font-bold ${l.options.cara_frontal || l.options.cara_trasera ? "" : "opacity-40"}`}>
                    {tr("# Tintas")}
                    <select value={l.options.tintas} onChange={(e) => updateOptions(l.id, { tintas: Number(e.target.value) })} disabled={!l.options.cara_frontal && !l.options.cara_trasera} aria-label={tr("Número de tintas por cara")} className="bg-transparent py-1 focus:outline-none">
                      {[1, 2, 3, 4, 5, 6, 7, 8].map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              {/* Materials */}
              <div>
                <p className={labelCls}>{tr("Insumos por unidad")}</p>
                {l.materials.length > 0 && (
                  <div className="hidden md:grid grid-cols-[2fr_1fr_80px_140px_36px] gap-2 px-1 mb-1 text-[10px] font-bold uppercase tracking-widest text-foreground/30">
                    <span>{tr("Insumo")}</span>
                    <span>{tr("Costo unitario")}</span>
                    <span>{tr("Cant.")}</span>
                    <span>{tr("Lo aporta")}</span>
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
                          placeholder={tr("Bolsa, etiqueta, válvula…")}
                          aria-label={tr("Insumo")}
                          className={inputCls}
                        />
                      </div>
                      <input inputMode="decimal" value={m.unit_cost || ""} onChange={(e) => updateMaterial(l.id, i, { unit_cost: n(e.target.value) })} placeholder={tr("Costo $")} aria-label={`Costo de ${m.name || "insumo"}`} className={inputCls} disabled={m.supplied_by === "cliente"} />
                      <input inputMode="decimal" value={m.qty || ""} onChange={(e) => updateMaterial(l.id, i, { qty: n(e.target.value) })} aria-label={`Cantidad de ${m.name || "insumo"}`} className={inputCls} />
                      <select value={m.supplied_by} onChange={(e) => updateMaterial(l.id, i, { supplied_by: e.target.value as MaterialLine["supplied_by"] })} aria-label={tr("Quién lo aporta")} className={inputCls}>
                        <option value="amantti">{tr("Amantti")}</option>
                        <option value="cliente">{tr("El cliente")}</option>
                      </select>
                      <button type="button" onClick={() => updateLine(l.id, { materials: l.materials.filter((_, j) => j !== i) })} className="p-2 rounded-lg text-foreground/30 hover:text-red-500 hover:bg-red-50 justify-self-start" aria-label={tr("Quitar insumo")}>
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
                    <Plus className="w-3.5 h-3.5" />{" "}{tr("Agregar insumo")}
                  </button>
                </div>
              </div>

              {/* Pricing */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>{tr("Lo que cobro por bolsa *")}</label>
                  <input
                    inputMode="numeric"
                    value={l.price_per_unit ?? ""}
                    onChange={(e) => updateLine(l.id, { price_per_unit: e.target.value.trim() === "" ? null : n(e.target.value.replace(/[^\d]/g, "")) })}
                    placeholder={tr("$ por bolsa")}
                    aria-label={tr("Lo que cobro por bolsa")}
                    className={`${inputCls} ${r && r.price > 0 && r.price < r.cost ? "border-red-300" : ""}`}
                  />
                  {r && r.price > 0 && r.price < r.cost && <p className="text-[11px] text-red-600 mt-1">{tr("Por debajo del costo ({cop}).", { cop: cop(r.cost) })}</p>}
                </div>
                <div>
                  <label className={labelCls}>{tr("Precio de venta sugerido")}</label>
                  <input
                    inputMode="numeric"
                    value={l.resale_price ?? ""}
                    onChange={(e) => updateLine(l.id, { resale_price: e.target.value.trim() === "" ? null : n(e.target.value.replace(/[^\d]/g, "")) })}
                    placeholder={r?.referenceResale != null ? tr("{cop} (nuestro precio)", { cop: cop(r.referenceResale) }) : tr("$ por bolsa")}
                    aria-label={tr("Precio de venta sugerido")}
                    className={inputCls}
                  />
                  <p className="text-[11px] text-foreground/40 mt-1">
                    {r?.referenceResale != null
                      ? l.resale_price == null
                        ? tr("Vacío = nuestro {label} {v} con este empaque.", { label: MAQUILA_PROFILES.find((pr) => pr.id === l.profile)?.label, v: { "250g": "250 g", "500g": "500 g", "2.5kg": "2,5 kg" }[referenceSizeOf(l.grams)!] })
                        : tr("Nuestro precio con este empaque: {cop}.", { cop: cop(r.referenceResale) })
                      : tr("Vacío = no sale en el PDF.")}
                  </p>
                </div>
              </div>
            </section>
          );
        })}
        <button type="button" onClick={() => setLines((ls) => [...ls, blankLine(coffeeCostPerKg)])} className="flex items-center gap-2 px-4 py-3 rounded-2xl border border-dashed border-foreground/20 text-xs font-bold uppercase tracking-widest text-foreground/60 hover:bg-white">
          <Plus className="w-4 h-4" />{" "}{tr("Agregar presentación")}
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
              {tr("Usar el fondo de Amantti")}
            </button>
          )}
        </section>

        {/* Texts */}
        <section className="bg-white rounded-3xl border border-foreground/5 shadow-sm p-6 space-y-4">
          <div>
            <label htmlFor="mq-intro" className={labelCls}>{tr("Introducción (PDF)")}</label>
            <textarea id="mq-intro" rows={3} value={intro} onChange={(e) => setIntro(e.target.value)} className={`${inputCls} resize-y`} />
          </div>
          <div>
            <label htmlFor="mq-cond" className={labelCls}>{tr("Condiciones (PDF, una por línea)")}</label>
            <textarea id="mq-cond" rows={6} value={conditions} onChange={(e) => setConditions(e.target.value)} className={`${inputCls} resize-y`} />
          </div>
          <div>
            <label htmlFor="mq-notes" className={labelCls}>{tr("Notas internas (no salen en el PDF)")}</label>
            <textarea id="mq-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inputCls} resize-y`} />
          </div>
        </section>
      </div>

      {/* Internal summary */}
      <aside className="xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:overflow-y-auto space-y-4 pb-2">
        <section className="bg-white rounded-3xl border border-foreground/5 shadow-sm p-6 space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-foreground/40">{tr("Resumen interno · por pedido")}</p>
          <Row label={tr("Unidades")} value={calc.totals.units.toLocaleString("es-CO")} />
          {MAQUILA_PROFILES.filter((pr) => calc.totals.coffeeKgByProfile[pr.id]).map((pr) => (
            <Row key={pr.id} label={tr("Café {label} a tostar", { label: pr.label })} value={`${calc.totals.coffeeKgByProfile[pr.id]!.toLocaleString("es-CO", { maximumFractionDigits: 1 })} kg`} />
          ))}
          <hr className="border-foreground/5" />
          <Row label={tr("Ingreso (sin IVA)")} value={cop(calc.totals.subtotal)} />
          <Row label={tr("Costo directo")} value={cop(calc.totals.totalCost)} />
          <Row label={tr("Utilidad")} value={cop(calc.totals.profit)} strong />
          {settings.apply_iva && (
            <>
              <hr className="border-foreground/5" />
              <Row label={tr("IVA {iva_pct} %", { iva_pct: settings.iva_pct })} value={cop(calc.totals.iva)} />
              <Row label={tr("Total cliente")} value={cop(calc.totals.total)} strong />
            </>
          )}
          {calc.totals.design.fee > 0 && (
            <>
              <hr className="border-foreground/5" />
              <p className="text-[10px] font-bold uppercase tracking-widest text-foreground/40 pt-1">{tr("Diseño · pago único")}</p>
              <Row label={tr("Valor (sin IVA)")} value={cop(calc.totals.design.fee)} />
              <Row label={tr("Costo")} value={cop(calc.totals.design.cost)} />
              <Row label={tr("Utilidad diseño")} value={cop(calc.totals.design.profit)} strong />
            </>
          )}
        </section>

        {belowCost.length > 0 && (
          <div className="flex items-start gap-2 px-4 py-3 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{tr("Precio por debajo del costo en: {belowCost}.", { belowCost: belowCost.join(", ") })}</span>
          </div>
        )}
        {belowMinimum.length > 0 && (
          <div className="flex items-start gap-2 px-4 py-3 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{tr("No se puede guardar: el pedido mínimo es de {minimum} und. por presentación ({belowMinimum}).", { minimum: minimum.toLocaleString("es-CO"), belowMinimum: belowMinimum.join(", ") })}</span>
          </div>
        )}
        {error && <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-2xl">{tr.msg(error)}</p>}
        {notice && <p className="text-sm text-emerald-700 bg-emerald-50 px-4 py-3 rounded-2xl">{tr.msg(notice)}</p>}

        <div className="flex flex-col gap-2">
          <button type="button" onClick={() => save(false)} disabled={isPending} className="flex items-center justify-center gap-2 py-3 rounded-2xl bg-foreground text-background text-xs font-bold uppercase tracking-widest hover:bg-[#C59F59] disabled:opacity-60">
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}{" "}{tr("Guardar")}
          </button>
          <button type="button" onClick={() => save(true)} disabled={isPending || isPdf} className="flex items-center justify-center gap-2 py-3 rounded-2xl bg-[#C59F59] text-white text-xs font-bold uppercase tracking-widest hover:bg-[#b08d4f] disabled:opacity-60">
            {isPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}{" "}{tr("Guardar y descargar PDF")}
          </button>
          <p className="text-[11px] text-foreground/40 text-center">{tr("El PDF muestra precios y condiciones; nunca costos ni márgenes.")}</p>
        </div>

        <MaquilaPreview data={pdfData} />
      </aside>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  const tr = useTr();
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-foreground/50">{tr(label)}</span>
      <span className={strong ? "font-bold" : ""}>{value}</span>
    </div>
  );
}
