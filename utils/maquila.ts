// Economic proposal for maquila / marca blanca: Amantti supplies its roasted
// coffee (Premium, Honey or Chiroso), packs and labels it under the client's
// brand, and charges per packed unit, plus a one-time packaging design fee
// for the project. Pure math shared by the editor (internal view) and the
// client PDF.

import { COFFEE_PROFILES, PROFILE_LABELS, type CoffeeProfileId } from "@/app/(admin)/coffeeProfiles";

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
  /** Estimated units per month (for totals and coffee needed). */
  monthly_units: number;
  materials: MaterialLine[];
  /** Packing labor per unit (COP). */
  labor_per_unit: number;
  /** Margin over the client price used for the suggested price (0–95 %). */
  target_margin_pct: number;
  /** Agreed price per unit; null = use the suggested price. */
  price_per_unit: number | null;
};

export type MaquilaSettings = {
  /** Coffee lost while packing (%), a cost for Amantti. */
  merma_pct: number;
  /** Charge IVA on the service. */
  apply_iva: boolean;
  /** IVA rate (%). */
  iva_pct: number;
  /** One-time packaging design fee for the whole project (COP); 0 = none. */
  design_fee: number;
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
};

/** Background the other Amantti documents use. */
export const DEFAULT_BACKGROUND_URL = "/images/Main_Background.jpg";

/** Each presentation must be ordered in at least this many units. */
export const MIN_UNITS_PER_PRESENTATION = 200;

export const MAQUILA_PROFILES = COFFEE_PROFILES.map((p) => ({ id: p.id, label: PROFILE_LABELS[p.id] }));

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const isProfile = (v: unknown): v is CoffeeProfileId => COFFEE_PROFILES.some((p) => p.id === v);

/** Fills fields added after a proposal was saved (older proposals had no profile or design). */
export function normalizeLine(line: Partial<MaquilaLine> & { id: string }): MaquilaLine {
  return {
    presentation: "",
    grams: 250,
    monthly_units: 0,
    materials: [],
    labor_per_unit: 0,
    target_margin_pct: 35,
    price_per_unit: null,
    ...line,
    profile: isProfile(line.profile) ? line.profile : "premium",
    coffee_cost_per_kg: num(line.coffee_cost_per_kg),
  };
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

/** What one unit costs Amantti: its coffee, the materials it buys, and labor. */
export function unitCost(line: MaquilaLine, settings: MaquilaSettings = DEFAULT_SETTINGS) {
  const coffee = num(line.coffee_cost_per_kg) * coffeeKgPerUnit(line, settings);
  const materials = line.materials
    .filter((m) => m.supplied_by === "amantti")
    .reduce((s, m) => s + num(m.unit_cost) * num(m.qty), 0);
  const labor = num(line.labor_per_unit);
  return { coffee, materials, labor, total: coffee + materials + labor };
}

/** Price that leaves `margin` % of the price as profit: cost ÷ (1 − margin). */
export function suggestedPrice(line: MaquilaLine, settings: MaquilaSettings = DEFAULT_SETTINGS): number {
  const margin = Math.min(95, Math.max(0, num(line.target_margin_pct))) / 100;
  return roundPrice(unitCost(line, settings).total / (1 - margin));
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
  materialsCost: number;
  laborCost: number;
  suggested: number;
  price: number;
  /** Profit share of the price (%); null when the price is 0. */
  marginPct: number | null;
  revenue: number;
  totalCost: number;
  profit: number;
  /** Kg of roasted coffee Amantti needs for the month, with merma. */
  coffeeKg: number;
  /** Below the minimum order per presentation. */
  belowMinimum: boolean;
  /** Materials the client must deliver per month. */
  clientMaterials: { name: string; qty: number }[];
};

export function calculateLine(line: MaquilaLine, settings: MaquilaSettings = DEFAULT_SETTINGS): LineResult {
  const c = unitCost(line, settings);
  const suggested = suggestedPrice(line, settings);
  const price = line.price_per_unit != null && num(line.price_per_unit) > 0 ? num(line.price_per_unit) : suggested;
  const units = Math.max(0, num(line.monthly_units));
  return {
    id: line.id,
    presentation: line.presentation,
    profile: line.profile,
    profileLabel: PROFILE_LABELS[line.profile] ?? line.profile,
    grams: num(line.grams),
    units,
    cost: c.total,
    coffeeCost: c.coffee,
    materialsCost: c.materials,
    laborCost: c.labor,
    suggested,
    price,
    marginPct: price > 0 ? ((price - c.total) / price) * 100 : null,
    revenue: price * units,
    totalCost: c.total * units,
    profit: (price - c.total) * units,
    coffeeKg: units * coffeeKgPerUnit(line, settings),
    belowMinimum: units > 0 && units < MIN_UNITS_PER_PRESENTATION,
    clientMaterials: line.materials
      .filter((m) => m.supplied_by === "cliente" && num(m.qty) > 0)
      .map((m) => ({ name: m.name, qty: num(m.qty) * units })),
  };
}

export function calculateProposal(lines: MaquilaLine[], settings: MaquilaSettings = DEFAULT_SETTINGS) {
  const results = lines.map((l) => calculateLine(l, settings));
  const ivaRate = settings.apply_iva ? num(settings.iva_pct) / 100 : 0;

  const subtotal = results.reduce((s, r) => s + r.revenue, 0);
  const totalCost = results.reduce((s, r) => s + r.totalCost, 0);
  const profit = subtotal - totalCost;

  const designFee = Math.max(0, num(settings.design_fee));
  const designCost = Math.max(0, num(settings.design_cost));

  const coffeeKgByProfile: Partial<Record<CoffeeProfileId, number>> = {};
  for (const r of results) coffeeKgByProfile[r.profile] = (coffeeKgByProfile[r.profile] ?? 0) + r.coffeeKg;

  return {
    lines: results,
    totals: {
      units: results.reduce((s, r) => s + r.units, 0),
      coffeeKg: results.reduce((s, r) => s + r.coffeeKg, 0),
      coffeeKgByProfile,
      // Monthly service
      subtotal,
      iva: subtotal * ivaRate,
      total: subtotal * (1 + ivaRate),
      totalCost,
      profit,
      marginPct: subtotal > 0 ? (profit / subtotal) * 100 : null,
      // One-time design
      design: {
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
  return lines.map((l) => calculateLine(l, settings)).filter((r) => r.price < r.cost).map((r) => r.presentation);
}

/** Presentations estimated below the per-presentation minimum order. */
export function linesBelowMinimum(lines: MaquilaLine[], settings: MaquilaSettings = DEFAULT_SETTINGS): string[] {
  return lines.map((l) => calculateLine(l, settings)).filter((r) => r.belowMinimum).map((r) => r.presentation);
}

export const DEFAULT_CONDITIONS = [
  "Café de especialidad Amantti, tostado bajo pedido en el perfil elegido para cada presentación.",
  "El diseño de empaque se paga una sola vez al aprobar la propuesta e incluye hasta dos rondas de ajustes.",
  "Los insumos que aporta el cliente (indicados en \"Lo que entrega el cliente\") deben llegar antes de iniciar la producción.",
  "Tiempo de entrega: 8 días hábiles a partir de la aprobación del arte final y del anticipo.",
  "Forma de pago: 50 % al aprobar el pedido y 50 % contra entrega.",
  "Los precios no incluyen transporte del producto terminado.",
].join("\n");
