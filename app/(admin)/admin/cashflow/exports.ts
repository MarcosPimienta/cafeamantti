// What each Excel export of Flujo de Caja contains. Pure: takes the rows
// the screen already has and returns the sheets; utils/excel/workbook
// turns them into the file.

import type { Cell, TableSheet } from "@/utils/excel/workbook";
import type { FixedAssetRow } from "./calculations";
import { ASSET_USES, type AssetUse } from "./types";

const TYPE_LABEL: Record<string, string> = {
  OPEX: "OPEX · gasto operativo",
  COGS: "COGS · costo de ventas",
  CAPEX: "CAPEX · activo fijo",
};

const num = (v: unknown) => Number(v ?? 0) || 0;
const useLabel = (u: AssetUse | null | undefined) => (u && ASSET_USES[u] ? ASSET_USES[u].label : "");
const dateOf = (r: { cashflow?: { date?: string } | null; date?: string; created_at?: string }) =>
  r.cashflow?.date ?? r.date ?? r.created_at?.slice(0, 10) ?? "";

export type ExportFilters = { from?: string; to?: string; category?: string; search?: string };

function filterLines(f: ExportFilters): Cell[][] {
  return [
    ["Periodo", `${f.from || "Inicio"} a ${f.to || "hoy"}`],
    ...(f.category ? [["Categoría", f.category]] : []),
    ...(f.search ? [["Concepto contiene", f.search]] : []),
  ];
}

/** Adds up `value` per key, keeping the first-seen order. */
function groupSum<T>(rows: T[], key: (r: T) => string, values: ((r: T) => number)[]) {
  const out = new Map<string, number[]>();
  for (const r of rows) {
    const k = key(r);
    const acc = out.get(k) ?? [0, ...values.map(() => 0)];
    acc[0] += 1;
    values.forEach((v, i) => (acc[i + 1] += v(r)));
    out.set(k, acc);
  }
  return [...out];
}

// ── Libro de gastos ─────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
export function expenseLedger(expenses: any[], filters: ExportFilters, generatedAt: string): TableSheet[] {
  const rows = [...expenses].sort((a, b) => dateOf(a).localeCompare(dateOf(b)));
  const net = (e: any) => num(e.net_amount ?? e.amount);
  const tax = (e: any) => num(e.tax_amount);
  const total = (e: any) => num(e.amount);

  const ledger: TableSheet = {
    name: "Gastos",
    title: [["Libro de gastos · Café Amantti"], ...filterLines(filters), ["Generado", generatedAt]],
    columns: [
      { header: "Fecha", format: "date", width: 12 },
      { header: "Concepto", width: 48 },
      { header: "Categoría", width: 42 },
      { header: "Tipo", width: 24 },
      { header: "Valor neto", format: "money", width: 14 },
      { header: "IVA", format: "money", width: 12 },
      { header: "Total pagado", format: "money", width: 14 },
      { header: "Activo: qué es", width: 20 },
      { header: "Activo: destino", width: 16 },
      { header: "Activo: puesta en uso", format: "date", width: 14 },
      { header: "Activo: vida útil (meses)", format: "int", width: 12 },
      { header: "Activo: valor residual", format: "money", width: 14 },
      { header: "Soporte", width: 9 },
      { header: "ID", width: 38 },
    ],
    rows: rows.map((e) => {
      const capex = e.expense_type === "CAPEX";
      return [
        dateOf(e),
        e.concept ?? "",
        e.category ?? "",
        TYPE_LABEL[e.expense_type] ?? e.expense_type ?? "",
        net(e),
        tax(e),
        total(e),
        capex ? e.asset_kind ?? "" : "",
        capex ? useLabel(e.asset_use) : "",
        capex ? e.in_service_date ?? dateOf(e) : "",
        capex ? num(e.depreciation_months) || null : null,
        capex ? num(e.residual_value) : null,
        e.image_url ? "Sí" : "No",
        e.id ?? "",
      ];
    }),
    totals: ["Total", `${rows.length} gastos`, "", "", rows.reduce((s, e) => s + net(e), 0), rows.reduce((s, e) => s + tax(e), 0), rows.reduce((s, e) => s + total(e), 0)],
  };

  const byCategory = groupSum(rows, (e) => `${e.category ?? ""}\u0000${e.expense_type ?? ""}`, [net, tax, total]);
  const summary: TableSheet = {
    name: "Resumen por categoría",
    title: [["Gastos por categoría"], ...filterLines(filters)],
    columns: [
      { header: "Categoría", width: 42 },
      { header: "Tipo", width: 24 },
      { header: "Gastos", format: "int", width: 9 },
      { header: "Valor neto", format: "money", width: 14 },
      { header: "IVA", format: "money", width: 12 },
      { header: "Total pagado", format: "money", width: 14 },
    ],
    rows: byCategory
      .sort((a, b) => b[1][1] - a[1][1])
      .map(([k, [count, n, t, tot]]) => {
        const [category, type] = k.split("\u0000");
        return [category, TYPE_LABEL[type] ?? type, count, n, t, tot];
      }),
    totals: ["Total", "", rows.length, rows.reduce((s, e) => s + net(e), 0), rows.reduce((s, e) => s + tax(e), 0), rows.reduce((s, e) => s + total(e), 0)],
  };

  return [ledger, summary];
}

// ── Libro de ingresos ───────────────────────────────────────

function incomeOrigin(i: any) {
  if (i.type === "auto") return "Venta web (automática)";
  if (i.from_salida) return "Salida de inventario";
  return "Manual";
}

export function incomeLedger(incomes: any[], filters: ExportFilters, generatedAt: string): TableSheet[] {
  const rows = [...incomes].sort((a, b) => dateOf(a).localeCompare(dateOf(b)));
  const gross = (i: any) => num(i.gross_amount ?? i.amount);
  const fee = (i: any) => num(i.fee_amount);
  const ship = (i: any) => num(i.shipping_cost);
  const tax = (i: any) => num(i.tax_amount);
  const net = (i: any) => num(i.net_revenue ?? gross(i) - fee(i) - ship(i) - tax(i));
  const sums = (f: (i: any) => number) => rows.reduce((s, i) => s + f(i), 0);

  const ledger: TableSheet = {
    name: "Ingresos",
    title: [["Libro de ingresos · Café Amantti"], ...filterLines(filters), ["Generado", generatedAt]],
    columns: [
      { header: "Fecha", format: "date", width: 12 },
      { header: "Concepto", width: 44 },
      { header: "Categoría", width: 18 },
      { header: "Origen", width: 22 },
      { header: "Producto", width: 30 },
      { header: "Cantidad", width: 10 },
      { header: "Bruto", format: "money", width: 14 },
      { header: "Comisión pasarela", format: "money", width: 14 },
      { header: "Envío", format: "money", width: 12 },
      { header: "IVA", format: "money", width: 12 },
      { header: "Neto", format: "money", width: 14 },
      { header: "ID", width: 38 },
    ],
    rows: rows.map((i) => [
      dateOf(i),
      i.concept ?? "",
      i.category ?? "",
      incomeOrigin(i),
      i.inventory ? `${i.inventory.product_name} (${i.inventory.product_code})` : "",
      i.quantity_sold != null ? `${num(i.quantity_sold)} ${i.inventory?.unit ?? ""}`.trim() : "",
      gross(i),
      fee(i),
      ship(i),
      tax(i),
      net(i),
      i.id ?? "",
    ]),
    totals: ["Total", `${rows.length} ingresos`, "", "", "", "", sums(gross), sums(fee), sums(ship), sums(tax), sums(net)],
  };

  const byCategory = groupSum(rows, (i) => `${i.category ?? ""}\u0000${incomeOrigin(i)}`, [gross, fee, ship, tax, net]);
  const summary: TableSheet = {
    name: "Resumen por categoría",
    title: [["Ingresos por categoría"], ...filterLines(filters)],
    columns: [
      { header: "Categoría", width: 18 },
      { header: "Origen", width: 22 },
      { header: "Ingresos", format: "int", width: 9 },
      { header: "Bruto", format: "money", width: 14 },
      { header: "Comisión pasarela", format: "money", width: 14 },
      { header: "Envío", format: "money", width: 12 },
      { header: "IVA", format: "money", width: 12 },
      { header: "Neto", format: "money", width: 14 },
    ],
    rows: byCategory
      .sort((a, b) => b[1][1] - a[1][1])
      .map(([k, vals]) => [...k.split("\u0000"), ...vals]),
    totals: ["Total", "", rows.length, sums(gross), sums(fee), sums(ship), sums(tax), sums(net)],
  };

  return [ledger, summary];
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ── Registro de activos fijos ───────────────────────────────

const STATUS_LABEL: Record<FixedAssetRow["status"], string> = {
  por_iniciar: "Por iniciar",
  depreciando: "Depreciando",
  depreciado: "Totalmente depreciado",
};

export function fixedAssetSheets(register: FixedAssetRow[], asOf: string, generatedAt: string): TableSheet[] {
  const sums = (f: (r: FixedAssetRow) => number, rows = register) => rows.reduce((s, r) => s + f(r), 0);

  const detail: TableSheet = {
    name: "Activos fijos",
    title: [
      ["Registro de activos fijos y depreciación · Café Amantti"],
      ["Fecha de corte", asOf],
      ["Método", "Línea recta: (costo − valor residual) ÷ vida útil, por meses completos desde el mes de puesta en uso"],
      ["Generado", generatedAt],
    ],
    columns: [
      { header: "Clase (PUC)", width: 40 },
      { header: "Qué es", width: 20 },
      { header: "Concepto", width: 44 },
      { header: "Destino", width: 16 },
      { header: "Fecha de compra", format: "date", width: 12 },
      { header: "Puesta en uso", format: "date", width: 12 },
      { header: "Último mes", width: 11 },
      { header: "Costo", format: "money", width: 14 },
      { header: "Valor residual", format: "money", width: 14 },
      { header: "Vida útil (meses)", format: "int", width: 10 },
      { header: "Cuota mensual", format: "money", width: 13 },
      { header: "Meses depreciados", format: "int", width: 10 },
      { header: "Depreciación acumulada", format: "money", width: 15 },
      { header: "Valor en libros", format: "money", width: 14 },
      { header: "Estado", width: 20 },
      { header: "ID", width: 38 },
    ],
    rows: register.map((r) => [
      r.category,
      r.asset_kind ?? "",
      r.concept,
      useLabel(r.asset_use) || "Sin destino",
      r.purchase_date ?? "",
      r.start_date,
      r.last_month,
      r.cost,
      r.residual_value,
      r.months,
      r.monthly_quota,
      r.months_elapsed,
      r.accumulated,
      r.book_value,
      STATUS_LABEL[r.status],
      r.id,
    ]),
    totals: ["Total", `${register.length} activos`, "", "", "", "", "", sums((r) => r.cost), sums((r) => r.residual_value), null, null, null, sums((r) => r.accumulated), sums((r) => r.book_value)],
  };

  const byClass = groupSum(register, (r) => r.category, [(r) => r.cost, (r) => r.accumulated, (r) => r.book_value, (r) => r.current_month_quota]);
  const summary: TableSheet = {
    name: "Resumen por clase",
    title: [["Activos fijos por clase"], ["Fecha de corte", asOf]],
    columns: [
      { header: "Clase (PUC)", width: 40 },
      { header: "Activos", format: "int", width: 9 },
      { header: "Costo", format: "money", width: 14 },
      { header: "Depreciación acumulada", format: "money", width: 15 },
      { header: "Valor en libros", format: "money", width: 14 },
      { header: "Depreciación del mes de corte", format: "money", width: 16 },
    ],
    rows: byClass.map(([k, vals]) => [k, ...vals]),
    totals: ["Total", register.length, sums((r) => r.cost), sums((r) => r.accumulated), sums((r) => r.book_value), sums((r) => r.current_month_quota)],
  };

  return [detail, summary];
}
