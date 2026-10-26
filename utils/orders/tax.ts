// IVA of manual order lines. Pure functions, shared by the order forms and
// the server actions.

export type TaxOption = { id: number; name: string; rate: number };
export type TaxedLine = { price: number; quantity: number; tax_id?: number | null; tax_rate?: number | null };

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The IVA a product starts with: its own (inventory.sales_tax_id; 0 = none),
 * else the general one from Ajustes → Siigo.
 */
export function defaultTaxId(productTaxId: number | null | undefined, generalTaxId: number | null | undefined): number {
  if (productTaxId === 0) return 0;
  return productTaxId ?? generalTaxId ?? 0;
}

export function rateOf(taxId: number | null | undefined, options: TaxOption[]): number {
  if (!taxId) return 0;
  return options.find((o) => o.id === taxId)?.rate ?? 0;
}

/**
 * Subtotal (before IVA), IVA and total of order lines. With prices that
 * include IVA the IVA is inside each price; otherwise it goes on top.
 */
export function orderTaxTotals(lines: TaxedLine[], pricesIncludeTax: boolean) {
  let subtotal = 0;
  let iva = 0;
  for (const l of lines) {
    const amount = round2((Number(l.price) || 0) * (Number(l.quantity) || 0));
    const rate = Number(l.tax_rate) || 0;
    if (pricesIncludeTax) {
      const inside = rate ? round2((amount * rate) / (100 + rate)) : 0;
      subtotal += amount - inside;
      iva += inside;
    } else {
      subtotal += amount;
      iva += round2((amount * rate) / 100);
    }
  }
  subtotal = round2(subtotal);
  iva = round2(iva);
  return { subtotal, iva, total: round2(subtotal + iva) };
}

/** Whether an order's prices include IVA: its own choice, else Ajustes → Siigo (manual orders). */
export function pricesIncludeTax(orderChoice: boolean | null | undefined, manualPricesIncludeTax: boolean | null | undefined): boolean {
  return orderChoice ?? manualPricesIncludeTax !== false;
}
