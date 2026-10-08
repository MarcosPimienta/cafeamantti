// Direct cost per kg of each roasted reference — tostado, empacado y
// despachado. Pure: the server action gathers prices, batches, receipts and
// orders; this turns them into a cost sheet. Only direct costs (coffee,
// toll roasting, packaging, dispatch); no overhead.
//
//   café      = blended $/kg verde ÷ roast yield
//               verde comes bought as verde, or as pergamino ÷ trilla yield;
//               the blend follows how the verde actually arrived.
//   tostión   = maquila $/kg (÷ roast yield when charged on verde)
//   empaque   = cost of the reference's packaging recipe ÷ kg per unit
//               (default recipe: its bag + the profile sticker)
//   despacho  = average dispatch cost ÷ average kg per order

import {
  COFFEE_PROFILES,
  unitWeightKg,
  type CoffeeProfileId,
} from "@/app/(admin)/coffeeProfiles";
import { packagingFor, type PackagingLine, type PackagingRecipes } from "./packaging";

export type CostSettings = {
  roasting_fee_per_kg: number;
  roasting_fee_basis: "verde" | "tostado";
  dispatch_cost_per_order: number;
  /** null = measure it from real orders. */
  dispatch_kg_per_order: number | null;
  default_roast_yield: number;
  default_trilla_yield: number;
};

export const DEFAULT_COST_SETTINGS: CostSettings = {
  roasting_fee_per_kg: 0,
  roasting_fee_basis: "verde",
  dispatch_cost_per_order: 0,
  dispatch_kg_per_order: null,
  default_roast_yield: 0.82,
  default_trilla_yield: 0.8,
};

export type CostItem = {
  id: string;
  product_code: string;
  product_name: string;
  /** $ per stock unit ($/kg for coffee materials, $/unidad for packaging). */
  standard_cost: number | null;
};

export type ProductionBatch = {
  process_type: string;
  input_code: string;
  output_code: string;
  input_kg: number;
  output_kg: number;
};

/** A coffee line actually sold (paid order) — used for kg/order and price/kg. */
export type SoldLine = { order_id: string; product_code: string; quantity: number; revenue: number };

export type CostingInput = {
  items: CostItem[];
  settings: CostSettings;
  batches: ProductionBatch[];
  /** Kg of verde bought directly (Entradas of CAFV-*), by product code. */
  verdePurchasedKg: Record<string, number>;
  soldLines: SoldLine[];
  /** Saved packaging recipes; references without one use the default. */
  recipes?: PackagingRecipes;
};

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Profile of any coffee code (pergamino, verde or tostado). */
export function profileOfCoffeeCode(code: string | null | undefined): CoffeeProfileId | null {
  if (!code || !/^(CAFT|CAFV|CAPG)-/.test(code)) return null;
  for (const p of COFFEE_PROFILES) if (p.marker && code.includes(p.marker)) return p.id;
  return "premium";
}

/** Code of a profile's raw material: CAFV-001, CAFV-HON-001, CAPG-MIC-001… */
export function materialCode(prefix: "CAFV" | "CAPG", profile: CoffeeProfileId): string {
  const marker = COFFEE_PROFILES.find((p) => p.id === profile)?.marker;
  return marker ? `${prefix}${marker}001` : `${prefix}-001`;
}

export type MeasuredYield = { value: number; source: "real" | "default"; batches: number };

/**
 * Weighted yield (kg out ÷ kg in) of a process for one profile. Falls back to
 * all profiles' batches, then to the configured default.
 */
export function measureYield(
  batches: ProductionBatch[],
  process: "tostion" | "trilla",
  profile: CoffeeProfileId,
  fallback: number
): MeasuredYield {
  const ofProcess = batches.filter((b) => b.process_type === process && n(b.input_kg) > 0 && n(b.output_kg) > 0);
  const own = ofProcess.filter((b) => profileOfCoffeeCode(b.output_code) === profile);
  const pool = own.length ? own : ofProcess;
  if (!pool.length) return { value: fallback, source: "default", batches: 0 };
  const inKg = pool.reduce((s, b) => s + n(b.input_kg), 0);
  const outKg = pool.reduce((s, b) => s + n(b.output_kg), 0);
  return { value: outKg / inKg, source: "real", batches: pool.length };
}

/**
 * Share of a profile's verde that came from pergamino (trilla output) rather
 * than bought as verde. null when nothing arrived either way.
 */
export function pergaminoShare(
  batches: ProductionBatch[],
  verdePurchasedKg: Record<string, number>,
  profile: CoffeeProfileId
): number | null {
  const fromTrilla = batches
    .filter((b) => b.process_type === "trilla" && profileOfCoffeeCode(b.output_code) === profile)
    .reduce((s, b) => s + n(b.output_kg), 0);
  const bought = n(verdePurchasedKg[materialCode("CAFV", profile)]);
  const total = fromTrilla + bought;
  return total > 0 ? fromTrilla / total : null;
}

/** Average kilos of coffee per paid order (orders with at least one coffee line). */
export function averageKgPerOrder(lines: SoldLine[]): number | null {
  const perOrder = new Map<string, number>();
  for (const l of lines) {
    const w = unitWeightKg(l.product_code);
    if (w === null || n(l.quantity) <= 0) continue;
    perOrder.set(l.order_id, (perOrder.get(l.order_id) ?? 0) + n(l.quantity) * w);
  }
  if (!perOrder.size) return null;
  return [...perOrder.values()].reduce((s, v) => s + v, 0) / perOrder.size;
}

/** Revenue ÷ kg for one reference across the sold lines. */
export function salePricePerKg(lines: SoldLine[], productCode: string): number | null {
  const w = unitWeightKg(productCode);
  if (w === null) return null;
  let kg = 0;
  let revenue = 0;
  for (const l of lines) {
    if (l.product_code !== productCode || n(l.quantity) <= 0) continue;
    kg += n(l.quantity) * w;
    revenue += n(l.revenue);
  }
  return kg > 0 ? revenue / kg : null;
}

export type CostLine = {
  product_code: string;
  product_name: string;
  profile: CoffeeProfileId;
  kgPerUnit: number;
  /** $/kg of roasted coffee for each component; null = a price is missing. */
  cafe: number | null;
  tostion: number;
  empaque: number | null;
  /** What packing one unit consumes, and whether it is a saved recipe. */
  packaging: PackagingLine[];
  customPackaging: boolean;
  despacho: number | null;
  costPerKg: number | null;
  costPerUnit: number | null;
  /** Average selling price per kg in the sales window (null = no sales). */
  salePerKg: number | null;
  marginPct: number | null;
  /** Human-readable reasons the cost is incomplete. */
  missing: string[];
};

export type CostSheet = {
  lines: CostLine[];
  yields: Record<CoffeeProfileId, { tostion: MeasuredYield; trilla: MeasuredYield; pergaminoShare: number | null }>;
  dispatch: { kgPerOrder: number | null; source: "manual" | "real" | "none"; costPerKg: number | null };
};

/**
 * Cost of a profile's green coffee per kg of verde, blending the verde bought
 * as such with the verde obtained from pergamino. When only one price is
 * known it is used alone; when the mix is unknown the two are averaged.
 */
export function greenCostPerKg(
  verdePrice: number | null,
  pergaminoPrice: number | null,
  trillaYield: number,
  share: number | null
): number | null {
  const viaPergamino = pergaminoPrice !== null ? pergaminoPrice / trillaYield : null;
  if (verdePrice === null && viaPergamino === null) return null;
  if (verdePrice === null) return viaPergamino;
  if (viaPergamino === null) return verdePrice;
  const s = share ?? 0.5;
  return s * viaPergamino + (1 - s) * verdePrice;
}

export function buildCostSheet(input: CostingInput): CostSheet {
  const { items, settings, batches, verdePurchasedKg, soldLines, recipes = {} } = input;
  const byCode = new Map(items.map((i) => [i.product_code, i]));
  const priceOf = (code: string) => {
    const c = byCode.get(code)?.standard_cost;
    return c === null || c === undefined ? null : n(c);
  };

  const yields = Object.fromEntries(
    COFFEE_PROFILES.map((p) => [
      p.id,
      {
        tostion: measureYield(batches, "tostion", p.id, n(settings.default_roast_yield) || DEFAULT_COST_SETTINGS.default_roast_yield),
        trilla: measureYield(batches, "trilla", p.id, n(settings.default_trilla_yield) || DEFAULT_COST_SETTINGS.default_trilla_yield),
        pergaminoShare: pergaminoShare(batches, verdePurchasedKg, p.id),
      },
    ])
  ) as CostSheet["yields"];

  const measuredKg = averageKgPerOrder(soldLines);
  const kgPerOrder = settings.dispatch_kg_per_order ?? measuredKg;
  const dispatchSource: CostSheet["dispatch"]["source"] =
    settings.dispatch_kg_per_order != null ? "manual" : measuredKg !== null ? "real" : "none";
  const dispatchCost = n(settings.dispatch_cost_per_order);
  const dispatchPerKg = dispatchCost === 0 ? 0 : kgPerOrder ? dispatchCost / kgPerOrder : null;

  const lines: CostLine[] = [];
  for (const item of items) {
    const w = unitWeightKg(item.product_code);
    const profile = profileOfCoffeeCode(item.product_code);
    if (w === null || !profile || !item.product_code.startsWith("CAFT-")) continue;

    const y = yields[profile];
    const missing: string[] = [];

    const green = greenCostPerKg(
      priceOf(materialCode("CAFV", profile)),
      priceOf(materialCode("CAPG", profile)),
      y.trilla.value,
      y.pergaminoShare
    );
    if (green === null) missing.push(`Precio del café verde o pergamino (${materialCode("CAFV", profile)} / ${materialCode("CAPG", profile)})`);
    const cafe = green === null ? null : green / y.tostion.value;

    const fee = n(settings.roasting_fee_per_kg);
    const tostion = settings.roasting_fee_basis === "verde" ? fee / y.tostion.value : fee;

    const recipe = packagingFor(item.product_code, recipes);
    // The default recipe skips items the inventory does not stock; a saved
    // recipe was chosen on purpose, so every line must be priced.
    const packaging = recipe.custom ? recipe.lines : recipe.lines.filter((l) => byCode.has(l.code));
    let empaque: number | null = 0;
    for (const { code, qty } of packaging) {
      const price = priceOf(code);
      if (price === null) {
        missing.push(`Costo de ${byCode.get(code)?.product_name ?? code} (${code})`);
        empaque = null;
      } else if (empaque !== null) {
        empaque += (price * qty) / w;
      }
    }

    if (dispatchPerKg === null) missing.push("Kg promedio por despacho (no hay órdenes para medirlo)");

    const parts = [cafe, tostion, empaque, dispatchPerKg];
    const costPerKg = parts.every((p) => p !== null) ? (parts as number[]).reduce((s, p) => s + p, 0) : null;
    const salePerKg = salePricePerKg(soldLines, item.product_code);

    lines.push({
      product_code: item.product_code,
      product_name: item.product_name,
      profile,
      kgPerUnit: w,
      cafe,
      tostion,
      empaque,
      packaging,
      customPackaging: recipe.custom,
      despacho: dispatchPerKg,
      costPerKg,
      costPerUnit: costPerKg === null ? null : costPerKg * w,
      salePerKg,
      marginPct: costPerKg !== null && salePerKg ? ((salePerKg - costPerKg) / salePerKg) * 100 : null,
      missing,
    });
  }

  const profileOrder = COFFEE_PROFILES.map((p) => p.id);
  lines.sort((a, b) =>
    a.profile === b.profile ? a.kgPerUnit - b.kgPerUnit : profileOrder.indexOf(a.profile) - profileOrder.indexOf(b.profile)
  );

  return {
    lines,
    yields,
    dispatch: { kgPerOrder: kgPerOrder ?? null, source: dispatchSource, costPerKg: dispatchPerKg },
  };
}
