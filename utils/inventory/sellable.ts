// Which inventory items can go on an order. Plain module: used by server
// actions and client components alike.

/** Codes that are sold by default (roasted coffee, cold brew, instant). */
const SELLABLE_PREFIXES = ["CAFT-", "CAFC-", "CAFS-"];

export function isSellableByDefault(productCode: string | null | undefined): boolean {
  return !!productCode && SELLABLE_PREFIXES.some((p) => productCode.startsWith(p));
}

/**
 * Uses the per-product `is_sellable` flag, falling back to the code rule
 * when the column is not there yet (migration not applied).
 */
export function isSellable(item: { product_code?: string | null; is_sellable?: boolean | null }): boolean {
  return typeof item.is_sellable === "boolean" ? item.is_sellable : isSellableByDefault(item.product_code);
}
