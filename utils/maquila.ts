// Economic proposal for maquila / marca blanca: Amantti supplies its roasted
// coffee (Premium, Honey or Chiroso), packs and labels it under the client's
// brand, and charges per packed unit, plus a one-time packaging design fee
// for the project. Pure math shared by the editor (internal view) and the
// client PDF.

import { COFFEE_PROFILES, PROFILE_LABELS, type CoffeeProfileId } from "@/app/(admin)/coffeeProfiles";
import { STORE_PRICES, type StoreWeight } from "@/utils/pricing";

// ── Packaging options ─────────────────────────────────────────
//
// Each presentation picks how its bag is made. Amantti's own retail bags
// are the reference: printed at 1 ink on both faces, with valve, without
// sticker or peel stick. Their store price is the price we suggest the
// client resells at, and every difference from that bag adds or subtracts
// the option's price. What we charge comes from cost and target margin;
// the options' cost is part of that cost.

export type PackagingOptions = {
  valvula: boolean;
  peel_stick: boolean;
  sticker: boolean;
  /** Inks per printed face (1 = reference). */
  tintas: number;
  cara_frontal: boolean;
  cara_trasera: boolean;
};

/** Amantti's retail bag, whose store price is the reference. */
export const REFERENCE_OPTIONS: PackagingOptions = {
  valvula: true,
  peel_stick: false,
  sticker: false,
  tintas: 1,
  cara_frontal: true,
  cara_trasera: true,
};

export type OptionKey = "valvula" | "peel_stick" | "sticker" | "cara" | "tinta_adicional";

/** How much an option moves the suggested resale price, and what it costs Amantti, per unit. */
export type OptionPrice = { price: number; cost: number };
export type OptionPrices = Record<OptionKey, OptionPrice>;

export const OPTION_LABELS: Record<OptionKey, { label: string; hint: string }> = {
  valvula: { label: "Válvula", hint: "por bolsa" },
  peel_stick: { label: "Peel stick", hint: "cierre adhesivo, por bolsa" },
  sticker: { label: "Sticker", hint: "por bolsa" },
  cara: { label: "Cara impresa", hint: "por cara, a 1 tinta" },
  tinta_adicional: { label: "Tinta adicional", hint: "por tinta extra, por cara impresa" },
};

export const OPTION_KEYS = Object.keys(OPTION_LABELS) as OptionKey[];

export const DEFAULT_OPTION_PRICES: OptionPrices = {
  valvula: { price: 0, cost: 0 },
  peel_stick: { price: 0, cost: 0 },
  sticker: { price: 0, cost: 0 },
  cara: { price: 0, cost: 0 },
  tinta_adicional: { price: 0, cost: 0 },
};

export type MaterialLine = {
  /** Inventory code when picked from inventory; null for free text. */
  code: string | null;
  name: string;
  /** Cost of one material unit (COP). */
  unit_cost: number;
  /** Material units used per packed unit (e.g. 1 bag, 2 stickers). */
  qty: number;
  /** Who provides it: Amantti's cost, or the client's own supply. */
  supplied_by: "amantti" | "cliente";
};

export type MaquilaLine = {
  id: string;
  presentation: string;
  /** Amantti coffee profile packed in this presentation. */
  profile: CoffeeProfileId;
  /** Direct cost of the roasted coffee per kg (café + tostión), internal. */
  coffee_cost_per_kg: number;
  /** Coffee per packed unit, in grams. */
  grams: number;
  /** Units quoted for one order of this presentation (at least the minimum). */
  units: number;
  materials: MaterialLine[];
  /** Packing labor per unit (COP); older proposals only. */
  labor_per_unit: number;
  /** What we charge per bag; null = not set yet. */
  price_per_unit: number | null;
  /** Resale price suggested to the client; null = our reference price. */
  resale_price: number | null;
  /** How the bag is made (valve, print, sticker…). */
  options: PackagingOptions;
};

export type DesignItem = { description: string; price: number };

export type MaquilaSettings = {
  /** Coffee lost while packing (%), a cost for Amantti. */
  merma_pct: number;
  /** Charge IVA on the service. */
  apply_iva: boolean;
  /** IVA rate (%). */
  iva_pct: number;
  /** One-time packaging design fee for the whole project (COP); 0 = none. Sum of design_items when there are any. */
  design_fee: number;
  /** The design fee itemized for the client (concept + value). */
  design_items?: DesignItem[];
  /** What the design costs Amantti (designer, proofs), internal. */
  design_cost: number;
  /**
   * Document background, a path in the proposal-assets bucket.
   * null = Amantti's default background, "" = no background.
   */
  background_path: string | null;
  /** Background opacity, 0–1. */
  background_opacity: number;
  /** Client's logo (proposal-assets path), shown next to Amantti's; null = none. */
  ally_logo_path: string | null;
  /**
   * Option prices this proposal was quoted with (a copy of the general
   * table), so later changes to the table do not alter sent proposals.
   * null = use the general table.
   */
  option_prices: OptionPrices | null;
};

export const DEFAULT_SETTINGS: MaquilaSettings = {
  merma_pct: 1,
  apply_iva: true,
  iva_pct: 19,
  design_fee: 0,
  design_cost: 0,
  background_path: null,
  background_opacity: 0.5,
  ally_logo_path: null,
  option_prices: null,
};

/** Background the other Amantti documents use. */
export const DEFAULT_BACKGROUND_URL = "/images/Main_Background.jpg";

/** Each presentation must be ordered in at least this many units. */
export const MIN_UNITS_PER_PRESENTATION = 200;

export const MAQUILA_PROFILES = COFFEE_PROFILES.map((p) => ({ id: p.id, label: PROFILE_LABELS[p.id] }));

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const isProfile = (v: unknown): v is CoffeeProfileId => COFFEE_PROFILES.some((p) => p.id === v);

/** Fills fields added after a proposal was saved (older proposals had no profile or design). */
export function normalizeLine(line: Partial<MaquilaLine> & { id: string; monthly_units?: number }): MaquilaLine {
  // Proposals saved before quoting per order stored a monthly estimate.
  const { monthly_units, ...rest } = line;
  return {
    presentation: "",
    grams: 250,
    materials: [],
    labor_per_unit: 0,
    price_per_unit: null,
    resale_price: null,
    ...rest,
    units: num(rest.units ?? monthly_units ?? MIN_UNITS_PER_PRESENTATION),
    profile: isProfile(line.profile) ? line.profile : "premium",
    coffee_cost_per_kg: num(line.coffee_cost_per_kg),
    options: { ...REFERENCE_OPTIONS, ...(line.options ?? {}) },
  };
}

/** Option prices with every key present (older or partial tables). */
export function normalizeOptionPrices(p: Partial<Record<OptionKey, Partial<OptionPrice>>> | null | undefined): OptionPrices {
  const out = { ...DEFAULT_OPTION_PRICES };
  for (const k of OPTION_KEYS) out[k] = { price: num(p?.[k]?.price), cost: num(p?.[k]?.cost) };
  return out;
}

const pricesOf = (settings: MaquilaSettings) => normalizeOptionPrices(settings.option_prices);

/** Faces printed (0–2) and inks per printed face. */
export function printSpec(o: PackagingOptions) {
  const faces = (o.cara_frontal ? 1 : 0) + (o.cara_trasera ? 1 : 0);
  const inks = faces > 0 ? Math.max(1, Math.round(num(o.tintas))) : 0;
  return { faces, inks };
}

/** What the bag's options cost Amantti per unit. */
export function optionsCost(o: PackagingOptions, prices: OptionPrices): number {
  const { faces, inks } = printSpec(o);
  return (
    (o.valvula ? prices.valvula.cost : 0) +
    (o.peel_stick ? prices.peel_stick.cost : 0) +
    (o.sticker ? prices.sticker.cost : 0) +
    faces * prices.cara.cost +
    faces * Math.max(0, inks - 1) * prices.tinta_adicional.cost
  );
}

/** How much the options move the resale price away from the reference bag. */
export function optionsPriceDelta(o: PackagingOptions, prices: OptionPrices): number {
  const ref = printSpec(REFERENCE_OPTIONS);
  const { faces, inks } = printSpec(o);
  const flag = (on: boolean, refOn: boolean) => (on ? 1 : 0) - (refOn ? 1 : 0);
  return (
    flag(o.valvula, REFERENCE_OPTIONS.valvula) * prices.valvula.price +
    flag(o.peel_stick, REFERENCE_OPTIONS.peel_stick) * prices.peel_stick.price +
    flag(o.sticker, REFERENCE_OPTIONS.sticker) * prices.sticker.price +
    (faces - ref.faces) * prices.cara.price +
    (faces * Math.max(0, inks - 1) - ref.faces * Math.max(0, ref.inks - 1)) * prices.tinta_adicional.price
  );
}

/** The store size a presentation matches (250 g, 500 g, 2.5 kg), if any. */
export function referenceSizeOf(grams: number): StoreWeight | null {
  const g = num(grams);
  return g === 250 ? "250g" : g === 500 ? "500g" : g === 2500 ? "2.5kg" : null;
}

/**
 * Price we suggest the client resells at: Amantti's own product of the same
 * profile and size (store price, shipping included), adjusted by the
 * options. null when the size has no reference product.
 */
export function resalePrice(line: MaquilaLine, settings: MaquilaSettings = DEFAULT_SETTINGS): number | null {
  const size = referenceSizeOf(line.grams);
  if (!size) return null;
  const base = STORE_PRICES[line.profile]?.[size];
  if (base === undefined) return null;
  return roundPrice(base + optionsPriceDelta(line.options ?? REFERENCE_OPTIONS, pricesOf(settings)));
}

/** "Válvula · Peel stick · 2 tintas · Frente y respaldo" for the client document. */
export function describeOptions(o: PackagingOptions): string {
  const { faces, inks } = printSpec(o);
  const print =
    faces === 0
      ? "Sin impresión"
      : `${faces === 2 ? "Frente y respaldo" : o.cara_frontal ? "Solo frente" : "Solo respaldo"} a ${inks} ${inks === 1 ? "tinta" : "tintas"}`;
  return [o.valvula ? "Válvula" : "Sin válvula", o.peel_stick && "Peel stick", o.sticker && "Sticker", print].filter(Boolean).join(" · ");
}

export function normalizeSettings(s: Partial<MaquilaSettings> | null | undefined): MaquilaSettings {
  return { ...DEFAULT_SETTINGS, ...(s ?? {}) };
}

/** Prices are quoted in whole pesos, rounded up to the next $50. */
export function roundPrice(n: number): number {
  return n <= 0 ? 0 : Math.ceil(n / 50) * 50;
}

/** Kilos of roasted coffee one unit uses, including packing merma. */
export function coffeeKgPerUnit(line: MaquilaLine, settings: MaquilaSettings = DEFAULT_SETTINGS): number {
  const merma = Math.max(0, num(settings.merma_pct)) / 100;
  return (num(line.grams) / 1000) * (1 + merma);
}

/** What one unit costs Amantti: coffee, bag options, other materials it buys, and labor. */
export function unitCost(line: MaquilaLine, settings: MaquilaSettings = DEFAULT_SETTINGS) {
  const coffee = num(line.coffee_cost_per_kg) * coffeeKgPerUnit(line, settings);
  const options = optionsCost(line.options ?? REFERENCE_OPTIONS, pricesOf(settings));
  const materials = line.materials
    .filter((m) => m.supplied_by === "amantti")
    .reduce((s, m) => s + num(m.unit_cost) * num(m.qty), 0);
  const labor = num(line.labor_per_unit);
  return { coffee, options, materials, labor, total: coffee + options + materials + labor };
}

export type LineResult = {
  id: string;
  presentation: string;
  profile: CoffeeProfileId;
  profileLabel: string;
  grams: number;
  units: number;
  cost: number;
  coffeeCost: number;
  optionsCost: number;
  materialsCost: number;
  laborCost: number;
  /** What we charge per bag (0 = not set). */
  price: number;
  /** Resale price shown to the client: typed, or our reference; null = none. */
  resale: number | null;
  /** Our reference resale price for this bag; null for sizes without one. */
  referenceResale: number | null;
  /** Bag description for the client document. */
  optionsSummary: string;
  /** Profit share of the price (%); null when the price is 0. */
  marginPct: number | null;
  revenue: number;
  totalCost: number;
  profit: number;
  /** Kg of roasted coffee Amantti needs for the order, with merma. */
  coffeeKg: number;
  /** Below the minimum order per presentation. */
  belowMinimum: boolean;
  /** Materials the client must deliver for the order. */
  clientMaterials: { name: string; qty: number }[];
};

/** The minimum that applies: the proposal's, never below the house rule. */
export function effectiveMinimum(minimum?: number | null): number {
  return Math.max(MIN_UNITS_PER_PRESENTATION, num(minimum));
}

export function calculateLine(
  line: MaquilaLine,
  settings: MaquilaSettings = DEFAULT_SETTINGS,
  minimum: number | null = null
): LineResult {
  const c = unitCost(line, settings);
  const price = num(line.price_per_unit);
  const units = Math.max(0, num(line.units));
  const referenceResale = resalePrice(line, settings);
  const resale = num(line.resale_price) > 0 ? num(line.resale_price) : referenceResale;
  return {
    id: line.id,
    presentation: line.presentation,
    profile: line.profile,
    profileLabel: PROFILE_LABELS[line.profile] ?? line.profile,
    grams: num(line.grams),
    units,
    cost: c.total,
    coffeeCost: c.coffee,
    optionsCost: c.options,
    materialsCost: c.materials,
    laborCost: c.labor,
    price,
    resale,
    referenceResale,
    optionsSummary: describeOptions(line.options ?? REFERENCE_OPTIONS),
    marginPct: price > 0 ? ((price - c.total) / price) * 100 : null,
    revenue: price * units,
    totalCost: c.total * units,
    profit: (price - c.total) * units,
    coffeeKg: units * coffeeKgPerUnit(line, settings),
    belowMinimum: units < effectiveMinimum(minimum),
    clientMaterials: line.materials
      .filter((m) => m.supplied_by === "cliente" && num(m.qty) > 0)
      .map((m) => ({ name: m.name, qty: num(m.qty) * units })),
  };
}

/**
 * The design concepts the client sees. Proposals saved before itemizing
 * had one fee: it becomes a single "Proyecto de diseño de empaque" item.
 */
export function designItems(settings: MaquilaSettings): DesignItem[] {
  if (settings.design_items?.length) {
    return settings.design_items.map((i) => ({ description: i.description ?? "", price: Math.max(0, num(i.price)) }));
  }
  const fee = Math.max(0, num(settings.design_fee));
  return fee > 0 ? [{ description: "Proyecto de diseño de empaque", price: fee }] : [];
}

export function calculateProposal(lines: MaquilaLine[], settings: MaquilaSettings = DEFAULT_SETTINGS, minimum: number | null = null) {
  const results = lines.map((l) => calculateLine(l, settings, minimum));
  const ivaRate = settings.apply_iva ? num(settings.iva_pct) / 100 : 0;

  const subtotal = results.reduce((s, r) => s + r.revenue, 0);
  const totalCost = results.reduce((s, r) => s + r.totalCost, 0);
  const profit = subtotal - totalCost;

  const items = designItems(settings);
  const designFee = items.length ? items.reduce((s, i) => s + i.price, 0) : 0;
  const designCost = Math.max(0, num(settings.design_cost));

  const coffeeKgByProfile: Partial<Record<CoffeeProfileId, number>> = {};
  for (const r of results) coffeeKgByProfile[r.profile] = (coffeeKgByProfile[r.profile] ?? 0) + r.coffeeKg;

  return {
    lines: results,
    totals: {
      units: results.reduce((s, r) => s + r.units, 0),
      coffeeKg: results.reduce((s, r) => s + r.coffeeKg, 0),
      coffeeKgByProfile,
      // The order
      subtotal,
      iva: subtotal * ivaRate,
      total: subtotal * (1 + ivaRate),
      totalCost,
      profit,
      marginPct: subtotal > 0 ? (profit / subtotal) * 100 : null,
      // One-time design
      design: {
        items,
        fee: designFee,
        iva: designFee * ivaRate,
        total: designFee * (1 + ivaRate),
        cost: designCost,
        profit: designFee - designCost,
      },
    },
  };
}

/** Lines whose agreed price does not cover their cost (to warn before sending). */
export function linesBelowCost(lines: MaquilaLine[], settings: MaquilaSettings = DEFAULT_SETTINGS): string[] {
  return lines.map((l) => calculateLine(l, settings)).filter((r) => r.price > 0 && r.price < r.cost).map((r) => r.presentation);
}

/** Presentations without a price per bag yet. */
export function linesWithoutPrice(lines: MaquilaLine[]): string[] {
  return lines.filter((l) => !(num(l.price_per_unit) > 0)).map((l) => l.presentation || "Sin nombre");
}

/** Presentations quoted below the per-presentation minimum order. */
export function linesBelowMinimum(lines: MaquilaLine[], settings: MaquilaSettings = DEFAULT_SETTINGS, minimum: number | null = null): string[] {
  return lines.map((l) => calculateLine(l, settings, minimum)).filter((r) => r.belowMinimum).map((r) => r.presentation);
}

export const DEFAULT_CONDITIONS = [
  "Café de especialidad Amantti, tostado bajo pedido en el perfil elegido para cada presentación.",
  "El diseño de empaque se paga una sola vez al aprobar la propuesta e incluye hasta dos rondas de ajustes.",
  "Los insumos que aporta el cliente (indicados en \"Lo que entrega el cliente\") deben llegar antes de iniciar la producción.",
  "Tiempo de entrega: 8 días hábiles a partir de la aprobación del arte final y del anticipo.",
  "Forma de pago: 50 % al aprobar el pedido y 50 % contra entrega.",
  "Los precios no incluyen transporte del producto terminado.",
].join("\n");
