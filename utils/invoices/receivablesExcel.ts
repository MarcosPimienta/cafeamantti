// The receivables statement as Excel sheets: a summary by client and sede
// (like the statement the team used to build by hand) and one sheet of
// invoices per sede (one client) or per client (all clients).

import type { Cell, Column, TableSheet } from "@/utils/excel/workbook";
import type { Bucketed, ClientGroup, ReceivableLine } from "./receivables";

export const COMPANY_HEADER = "ALMA TRADING GROUP SAS — NIT 901.752.308-8";

export type SiteInfo = { name: string; address?: string | null; city?: string | null };

const BUCKET_LABEL: Record<ReceivableLine["bucket"], string> = { vencido: "Vencida", hoy: "Vence hoy", por_vencer: "Por vencer" };

const SUMMARY_COLUMNS: Column[] = [
  { header: "#", width: 5, format: "int" },
  { header: "Empresa", width: 30 },
  { header: "NIT", width: 14 },
  { header: "Sede", width: 28 },
  { header: "Dirección", width: 40 },
  { header: "N° facturas", width: 11, format: "int" },
  { header: "Total facturado", width: 15, format: "money" },
  { header: "Abonos", width: 13, format: "money" },
  { header: "Saldo", width: 14, format: "money" },
  { header: "Vencido", width: 13, format: "money" },
  { header: "Vence hoy", width: 13, format: "money" },
  { header: "Por vencer", width: 13, format: "money" },
];

const DETAIL_COLUMNS: Column[] = [
  { header: "Factura", width: 14 },
  { header: "Sede", width: 26 },
  { header: "Fecha", width: 12, format: "date" },
  { header: "Vence", width: 12, format: "date" },
  { header: "Días vencida", width: 12, format: "int" },
  { header: "Estado", width: 12 },
  { header: "Total facturado", width: 15, format: "money" },
  { header: "Abonos", width: 13, format: "money" },
  { header: "Saldo", width: 14, format: "money" },
];

const amounts = (t: Bucketed): Cell[] => [t.count, t.billed, t.paid, t.balance, t.vencido, t.hoy, t.por_vencer];
const where = (s: SiteInfo | undefined) => (s ? [s.address, s.city].filter(Boolean).join(", ") : "");
export const siteName = (siteId: string | null, sites: Map<string, SiteInfo>) => (siteId ? sites.get(siteId)?.name ?? "Sede" : "Sin sede identificada");

const RECEIPT_COLUMNS: Column[] = [
  { header: "Fecha", width: 12, format: "date" },
  { header: "Recibo", width: 14 },
  { header: "Cliente", width: 30 },
  { header: "Sede", width: 26 },
  { header: "Facturas", width: 40 },
  { header: "Medio", width: 10 },
  { header: "Valor", width: 15, format: "money" },
];

/** The deposits (recibos de caja) up to the cutoff, as their own sheet. */
export function receiptsSheet(
  receipts: { receipt_date: string; siigo_name: string | null; customer_name: string; site_id: string | null; method: string; amount: number; items: { name: string; value: number }[] }[],
  sites: Map<string, SiteInfo>,
  cutoff: string,
  scope: string
): TableSheet {
  const rows: Cell[][] = receipts.map((r) => [
    r.receipt_date,
    r.siigo_name ?? "",
    r.customer_name,
    r.site_id ? siteName(r.site_id, sites) : "",
    r.items.map((i) => `${i.name}: ${Math.round(i.value).toLocaleString("es-CO")}`).join(" · "),
    r.method === "cash" ? "Caja" : "Banco",
    Number(r.amount),
  ]);
  const total = receipts.reduce((s, r) => s + Number(r.amount), 0);
  return {
    name: "Abonos",
    title: [[COMPANY_HEADER], [`Abonos recibidos — ${scope}`], ["Fecha de corte", cutoff]],
    columns: RECEIPT_COLUMNS,
    rows,
    totals: ["TOTAL", "", "", "", "", "", Math.round(total * 100) / 100],
  };
}

/** Excel tab names: at most 31 characters, none of []:*?/\, and unique. */
function tabName(name: string, used: Set<string>): string {
  const base = name.replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 28) || "Hoja";
  let tab = base;
  for (let i = 2; used.has(tab.toLowerCase()); i++) tab = `${base.slice(0, 26)} ${i}`;
  used.add(tab.toLowerCase());
  return tab;
}

export function receivablesSheets(opts: { clients: ClientGroup[]; totals: Bucketed; sites: Map<string, SiteInfo>; cutoff: string; scope: string }): TableSheet[] {
  const { clients, totals, sites, cutoff, scope } = opts;
  const title: Cell[][] = [[COMPANY_HEADER], [`Estado de cuenta — ${scope}`], ["Fecha de corte", cutoff]];
  const rows: Cell[][] = [];
  let n = 0;
  for (const c of clients) {
    for (const s of c.sites) {
      const info = s.siteId ? sites.get(s.siteId) : undefined;
      rows.push([s.siteId ? ++n : "—", c.name, c.identification ?? "", siteName(s.siteId, sites), where(info), ...amounts(s.totals)]);
    }
    if (clients.length > 1 || c.sites.length > 1) rows.push(["", `SUBTOTAL ${c.name}`, "", "", "", ...amounts(c.totals)]);
  }
  const used = new Set<string>(["resumen general"]);
  const sheets: TableSheet[] = [{ name: "Resumen General", title, columns: SUMMARY_COLUMNS, rows, totals: ["", "TOTAL GENERAL", "", "", "", ...amounts(totals)] }];

  const detail = (l: ReceivableLine): Cell[] => [
    l.invoice.name,
    siteName(l.invoice.site_id ?? null, sites),
    l.invoice.issue_date ?? "",
    l.invoice.due_date ?? "",
    l.daysOverdue,
    BUCKET_LABEL[l.bucket],
    l.billed,
    l.paid,
    l.balance,
  ];
  const sum = (t: Bucketed): Cell[] => ["TOTAL", "", "", "", "", "", t.billed, t.paid, t.balance];
  if (clients.length === 1) {
    // One client: a sheet per sede.
    for (const s of clients[0].sites) {
      const name = siteName(s.siteId, sites);
      sheets.push({ name: tabName(name, used), title: [...title, ["Sede", name], ["Dirección", where(s.siteId ? sites.get(s.siteId) : undefined)]], columns: DETAIL_COLUMNS, rows: s.lines.map(detail), totals: sum(s.totals) });
    }
  } else {
    // All clients: a sheet per client.
    for (const c of clients) {
      const lines = c.sites.flatMap((s) => s.lines);
      sheets.push({ name: tabName(c.name, used), title: [...title, ["Cliente", `${c.name}${c.identification ? ` — NIT ${c.identification}` : ""}`]], columns: DETAIL_COLUMNS, rows: lines.map(detail), totals: sum(c.totals) });
    }
  }
  return sheets;
}
