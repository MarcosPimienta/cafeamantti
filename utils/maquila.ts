// Economic proposal for maquila de empaque: the client brings its roasted
// coffee and Amantti packs and labels it, charging per packed unit. Pure
// math shared by the editor (internal view) and the client PDF.

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
  /** Coffee lost while packing (%), added to what the client must deliver. */
  merma_pct: number;
  /** Charge IVA on the service. */
  apply_iva: boolean;
  /** IVA rate (%), 19 for services in Colombia. */
  iva_pct: number;
};

export const DEFAULT_SETTINGS: MaquilaSettings = { merma_pct: 1, apply_iva: true, iva_pct: 19 };

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Prices are quoted in whole pesos, rounded up to the next $50. */
export function roundPrice(n: number): number {
  return n <= 0 ? 0 : Math.ceil(n / 50) * 50;
}

/** Cost of what Amantti provides per unit (materials it buys + labor). */
export function unitCost(line: MaquilaLine): { materials: number; labor: number; total: number } {
  const materials = line.materials
    .filter((m) => m.supplied_by === "amantti")
    .reduce((s, m) => s + num(m.unit_cost) * num(m.qty), 0);
  const labor = num(line.labor_per_unit);
  return { materials, labor, total: materials + labor };
}

/** Price that leaves `margin` % of the price as profit: cost ÷ (1 − margin). */
export function suggestedPrice(line: MaquilaLine): number {
  const margin = Math.min(95, Math.max(0, num(line.target_margin_pct))) / 100;
  return roundPrice(unitCost(line).total / (1 - margin));
}

export type LineResult = {
  id: string;
  presentation: string;
  grams: number;
  units: number;
  cost: number;
  materialsCost: number;
  laborCost: number;
  suggested: number;
  price: number;
  /** Profit share of the price (%); null when the price is 0. */
  marginPct: number | null;
  revenue: number;
  totalCost: number;
  profit: number;
  /** Kg of roasted coffee the client must deliver for the month, with merma. */
  coffeeKg: number;
  /** Materials the client must deliver per month. */
  clientMaterials: { name: string; qty: number }[];
};

export function calculateLine(line: MaquilaLine, settings: MaquilaSettings = DEFAULT_SETTINGS): LineResult {
  const c = unitCost(line);
  const suggested = suggestedPrice(line);
  const price = line.price_per_unit != null && num(line.price_per_unit) > 0 ? num(line.price_per_unit) : suggested;
  const units = Math.max(0, num(line.monthly_units));
  const merma = Math.max(0, num(settings.merma_pct)) / 100;
  return {
    id: line.id,
    presentation: line.presentation,
    grams: num(line.grams),
    units,
    cost: c.total,
    materialsCost: c.materials,
    laborCost: c.labor,
    suggested,
    price,
    marginPct: price > 0 ? ((price - c.total) / price) * 100 : null,
    revenue: price * units,
    totalCost: c.total * units,
    profit: (price - c.total) * units,
    coffeeKg: (units * num(line.grams) * (1 + merma)) / 1000,
    clientMaterials: line.materials
      .filter((m) => m.supplied_by === "cliente" && num(m.qty) > 0)
      .map((m) => ({ name: m.name, qty: num(m.qty) * units })),
  };
}

export function calculateProposal(lines: MaquilaLine[], settings: MaquilaSettings = DEFAULT_SETTINGS) {
  const results = lines.map((l) => calculateLine(l, settings));
  const subtotal = results.reduce((s, r) => s + r.revenue, 0);
  const iva = settings.apply_iva ? (subtotal * num(settings.iva_pct)) / 100 : 0;
  const totalCost = results.reduce((s, r) => s + r.totalCost, 0);
  const profit = subtotal - totalCost;
  return {
    lines: results,
    totals: {
      units: results.reduce((s, r) => s + r.units, 0),
      coffeeKg: results.reduce((s, r) => s + r.coffeeKg, 0),
      subtotal,
      iva,
      total: subtotal + iva,
      totalCost,
      profit,
      marginPct: subtotal > 0 ? (profit / subtotal) * 100 : null,
    },
  };
}

/** Lines whose agreed price does not cover their cost (to warn before sending). */
export function linesBelowCost(lines: MaquilaLine[], settings: MaquilaSettings = DEFAULT_SETTINGS): string[] {
  return lines.map((l) => calculateLine(l, settings)).filter((r) => r.price < r.cost).map((r) => r.presentation);
}

export const DEFAULT_CONDITIONS = [
  "El cliente entrega el café tostado (en grano o molido) en las instalaciones de Amantti.",
  "Los insumos que aporta el cliente (indicados en \"Lo que entrega el cliente\") deben llegar junto con el café.",
  "Tiempo de entrega: 5 días hábiles a partir de la recepción del café y los insumos.",
  "Se cobra por unidad empacada y etiquetada. Pedido mínimo según lo indicado en la propuesta.",
  "Forma de pago: 50 % al aprobar el pedido y 50 % contra entrega.",
  "Los precios no incluyen transporte del producto terminado.",
].join("\n");
