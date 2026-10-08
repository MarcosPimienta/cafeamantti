// Quote totals: subtotal, a flat discount spread over every line, and IVA
// per line at its own rate (0, 5 or 19 %). Pure so it can be tested.

export type QuoteLine = { total_price: number | string; iva_rate?: number | string | null };

export function computeQuoteTotals(items: QuoteLine[], discount: number | string = 0) {
  const subtotal = items.reduce((sum, item) => sum + (Number(item.total_price) || 0), 0);
  const discountVal = Number(discount) || 0;
  const baseAmount = Math.max(0, subtotal - discountVal);
  // The discount lowers every line's taxable base in proportion.
  const discountFactor = subtotal > 0 ? baseAmount / subtotal : 1;

  let tax5 = 0;
  let tax19 = 0;
  for (const item of items) {
    const taxBase = (Number(item.total_price) || 0) * discountFactor;
    const rate = Number(item.iva_rate) || 0;
    if (rate === 5) tax5 += taxBase * 0.05;
    else if (rate === 19) tax19 += taxBase * 0.19;
  }

  const taxAmount = tax5 + tax19;
  return {
    subtotal,
    discount: discountVal,
    baseAmount,
    tax5,
    tax19,
    taxAmount,
    applyIva: taxAmount > 0,
    /** Highest rate present, stored on the quote header. */
    ivaRate: tax19 > 0 ? 19 : tax5 > 0 ? 5 : 0,
    totalAmount: baseAmount + taxAmount,
  };
}
