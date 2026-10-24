// The store's price list, shared by the browser (to show prices) and the
// server (to charge them). The server never trusts a price sent by the
// browser: it recomputes every line from product id + weight here.

export type StoreProfile = "premium" | "honey" | "chiroso";
export type StoreWeight = "250g" | "500g" | "2.5kg";

/** Product and plan ids used across the store, builder and subscriptions. */
const PROFILE_BY_ID: Record<string, StoreProfile> = {
  firma: "premium",
  essential: "premium",
  traditional: "premium",
  honey: "honey",
  alchemy: "honey",
  microlot: "chiroso",
  microl: "chiroso",
  curator: "chiroso",
};

/** Retail price per bag (COP, includes $10.000 of base shipping). */
export const STORE_PRICES: Record<StoreProfile, Record<StoreWeight, number>> = {
  premium: { "250g": 35000, "500g": 63000, "2.5kg": 165000 },
  honey: { "250g": 48000, "500g": 86400, "2.5kg": 240000 },
  chiroso: { "250g": 65000, "500g": 117000, "2.5kg": 320000 },
};

/** Sizes the online store actually sells per profile. */
export const STORE_AVAILABLE: Record<StoreProfile, StoreWeight[]> = {
  premium: ["250g", "500g", "2.5kg"],
  honey: ["250g", "500g"],
  chiroso: ["250g", "500g"],
};

// ── Combos (equipment + coffee) ─────────────────────────────

/** Weight a combo line carries in the cart (it has no bag size of its own). */
export const COMBO_WEIGHT = "combo";

export type StoreCombo = {
  name: string;
  /** What the customer pays (COP, IVA included, shipping free). */
  price: number;
  /** Most combos the store sells (the offer's "only 20 units"); counted on paid orders. */
  maxUnits: number;
  /**
   * What the order carries, one line per inventory product, adding up to
   * `price`. An `onDemand` product isn't stocked: the supplier ships each
   * sale (IMUSA for the KRUPS machine), so orders never move its stock.
   */
  units: { code: string; product_id: string; weight: string; grind: string | null; price: number; onDemand?: boolean }[];
};

/**
 * Combos the store sells. Each one is charged as one cart line but goes
 * into the order as its products, so stock moves for each one and each is
 * invoiced with its own IVA (machine 19 %, coffee 5 %).
 */
export const STORE_COMBOS: Record<string, StoreCombo> = {
  "krups-coffee-crush": {
    name: "Combo KRUPS Coffee Crush Experience",
    price: 1588000,
    maxUnits: 20,
    units: [
      { code: "EQP-KRUPS-CC", product_id: "krups-coffee-crush", weight: "unidad", grind: null, price: 1535000, onDemand: true },
      // The 500 g Premium bag, at its price without the base shipping (the combo ships free).
      { code: "CAFT-500G", product_id: "firma", weight: "500g", grind: "whole", price: 53000 },
    ],
  },
};

/** Products sold without stock: the supplier ships each sale. */
export const ON_DEMAND_CODES: ReadonlySet<string> = new Set(Object.values(STORE_COMBOS).flatMap((c) => c.units.filter((u) => u.onDemand).map((u) => u.code)));

export function storeCombo(id: string | null | undefined): StoreCombo | null {
  return (id && STORE_COMBOS[id]) || null;
}

export function storeProfileOf(id: string | null | undefined): StoreProfile | null {
  return (id && PROFILE_BY_ID[id]) || null;
}

function isWeight(w: string | null | undefined): w is StoreWeight {
  return w === "250g" || w === "500g" || w === "2.5kg";
}

/**
 * Price of a product/plan in a size, or null when the store does not sell
 * it. This is what the server charges.
 */
export function storePrice(id: string | null | undefined, weight: string | null | undefined): number | null {
  const combo = storeCombo(id);
  if (combo) return weight === COMBO_WEIGHT ? combo.price : null;
  const profile = storeProfileOf(id);
  if (!profile || !isWeight(weight) || !STORE_AVAILABLE[profile].includes(weight)) return null;
  return STORE_PRICES[profile][weight];
}

/**
 * Display price used by the builder and product pages. Same table, but it
 * prices every size (subscriptions offer sizes the shop does not) and
 * falls back to the cheapest bag, as the UI always did.
 */
export function calculateCoffeePrice(planOrProdId: string, weight: string): number {
  const profile = storeProfileOf(planOrProdId);
  if (!profile || !isWeight(weight)) return STORE_PRICES.premium["250g"];
  return STORE_PRICES[profile][weight];
}

const CODE_PROFILE: Record<StoreProfile, string> = { premium: "", honey: "HON-", chiroso: "MIC-" };
const CODE_SIZE: Record<StoreWeight, string> = { "250g": "250G", "500g": "500G", "2.5kg": "2K5" };

/** Inventory code a store line draws stock from: firma 250g → CAFT-250G. */
export function inventoryCodeFor(id: string | null | undefined, weight: string | null | undefined): string | null {
  const profile = storeProfileOf(id);
  if (!profile || !isWeight(weight)) return null;
  return `CAFT-${CODE_PROFILE[profile]}${CODE_SIZE[weight]}`;
}

/** Most units of one line a single web order may carry. */
export const MAX_UNITS_PER_LINE = 50;
