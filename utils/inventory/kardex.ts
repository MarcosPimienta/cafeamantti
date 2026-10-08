// Kardex (tarjeta de inventario) math. Pure: the server actions fetch the
// movements; these functions order them and compute balances.
//
// Movement quantities are stored signed (salidas negative), so every balance
// is a running sum.

export type KardexMovementBase = {
  id: string;
  quantity: number | string;
  movement_date: string | null;
  created_at: string;
};

type SaleIncome = { gross_amount: number | string | null; concept?: string | null } | null;
type WithIncome = { income?: SaleIncome | SaleIncome[] };

/**
 * Effective day of a movement. movement_date is a DATE; rows written before
 * it existed (and plain ajustes) fall back to created_at.
 */
export function movementDay(m: { movement_date: string | null; created_at: string }): string {
  return m.movement_date ?? m.created_at.slice(0, 10);
}

/** Chronological order: by effective day, then by creation time. */
export function compareMovements(
  a: { movement_date: string | null; created_at: string },
  b: { movement_date: string | null; created_at: string }
): number {
  const da = movementDay(a);
  const db = movementDay(b);
  return da === db ? a.created_at.localeCompare(b.created_at) : da.localeCompare(db);
}

function saleOf(m: WithIncome): { amount: number | null; concept: string | null } {
  const inc = Array.isArray(m.income) ? m.income[0] : m.income;
  return {
    amount: inc?.gross_amount != null ? Number(inc.gross_amount) : null,
    concept: inc?.concept ?? null,
  };
}

export type KardexPeriod = { from?: string | null; to?: string | null };

/**
 * One product's card: opening balance before `from`, every movement inside
 * the period with its running balance, and the closing balance at `to`.
 * `ledgerTotal` is the whole-history sum, to reconcile with stored stock.
 */
export function buildProductKardex<M extends KardexMovementBase & WithIncome>(movements: M[], period: KardexPeriod = {}) {
  const sorted = [...movements].sort(compareMovements);

  let opening = 0;
  let balance = 0;
  let entradas = 0;
  let salidas = 0;
  let ventasCobradas = 0;
  const rows: (Omit<M, "income"> & {
    date: string;
    entrada: number;
    salida: number;
    saldo: number;
    sale_amount: number | null;
    sale_concept: string | null;
  })[] = [];

  for (const m of sorted) {
    const qty = Number(m.quantity) || 0;
    const day = movementDay(m);
    if (period.from && day < period.from) {
      opening += qty;
      balance += qty;
      continue;
    }
    if (period.to && day > period.to) break;

    balance += qty;
    if (qty >= 0) entradas += qty;
    else salidas += -qty;
    const sale = saleOf(m);
    if (sale.amount !== null) ventasCobradas += sale.amount;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { income, ...rest } = m;
    rows.push({
      ...rest,
      date: day,
      entrada: qty >= 0 ? qty : 0,
      salida: qty < 0 ? -qty : 0,
      saldo: balance,
      sale_amount: sale.amount,
      sale_concept: sale.concept,
    });
  }

  const ledgerTotal = sorted.reduce((sum, m) => sum + (Number(m.quantity) || 0), 0);

  return {
    rows,
    summary: { opening, entradas, salidas, closing: balance, ventasCobradas, count: rows.length },
    ledgerTotal,
  };
}

export type GeneralKardexMovement = KardexMovementBase &
  WithIncome & {
    inventory_id: string;
    type: string;
    tab_source: string | null;
    reason: string | null;
    lote: string | null;
    molienda: string | null;
    responsable: string | null;
    income_id: string | null;
  };

export type GeneralKardexItem = {
  id: string;
  product_code: string;
  product_name: string;
  category: string;
  unit: string;
  /** Stock the system has stored for the item, to reconcile with the ledger. */
  systemStock: number;
};

/** A ledger that differs from stored stock by more than this is a descuadre. */
export const RECONCILE_EPS = 0.0005;

/**
 * Every product's inventario inicial, entradas, salidas and inventario final
 * for the period, plus the movement history with each product's running
 * balance. Quantities are never summed across products (different units).
 */
export function buildGeneralKardex(items: GeneralKardexItem[], movements: GeneralKardexMovement[], period: KardexPeriod = {}) {
  const sorted = [...movements].sort(compareMovements);

  const blank = () => ({ opening: 0, entradas: 0, salidas: 0, ventasCobradas: 0, movimientos: 0, ledgerTotal: 0 });
  const byProduct = new Map<string, ReturnType<typeof blank>>();
  const running = new Map<string, number>();
  const history: {
    id: string;
    inventory_id: string;
    date: string;
    type: string;
    tab_source: string | null;
    reason: string | null;
    lote: string | null;
    molienda: string | null;
    responsable: string | null;
    income_id: string | null;
    entrada: number;
    salida: number;
    saldo: number;
    sale_amount: number | null;
  }[] = [];

  for (const m of sorted) {
    const qty = Number(m.quantity) || 0;
    const day = movementDay(m);
    if (!byProduct.has(m.inventory_id)) byProduct.set(m.inventory_id, blank());
    const p = byProduct.get(m.inventory_id)!;
    p.ledgerTotal += qty;

    if (period.to && day > period.to) continue;
    const saldo = (running.get(m.inventory_id) ?? 0) + qty;
    running.set(m.inventory_id, saldo);

    if (period.from && day < period.from) {
      p.opening += qty;
      continue;
    }

    if (qty >= 0) p.entradas += qty;
    else p.salidas += -qty;
    p.movimientos += 1;
    const sale = saleOf(m);
    if (sale.amount !== null) p.ventasCobradas += sale.amount;

    history.push({
      id: m.id,
      inventory_id: m.inventory_id,
      date: day,
      type: m.type,
      tab_source: m.tab_source,
      reason: m.reason,
      lote: m.lote,
      molienda: m.molienda,
      responsable: m.responsable,
      income_id: m.income_id,
      entrada: qty >= 0 ? qty : 0,
      salida: qty < 0 ? -qty : 0,
      saldo,
      sale_amount: sale.amount,
    });
  }

  const products = items.map((it) => {
    const p = byProduct.get(it.id) ?? blank();
    return {
      id: it.id,
      product_code: it.product_code,
      product_name: it.product_name,
      category: it.category,
      unit: it.unit,
      opening: p.opening,
      entradas: p.entradas,
      salidas: p.salidas,
      closing: p.opening + p.entradas - p.salidas,
      movimientos: p.movimientos,
      ventasCobradas: p.ventasCobradas,
      difference: it.systemStock - p.ledgerTotal,
    };
  });

  return {
    products,
    history,
    summary: {
      productos: products.length,
      productosConMovimiento: products.filter((p) => p.movimientos > 0).length,
      movimientos: history.length,
      ventasCobradas: products.reduce((sum, p) => sum + p.ventasCobradas, 0),
      descuadres: products.filter((p) => Math.abs(p.difference) > RECONCILE_EPS).length,
    },
  };
}
