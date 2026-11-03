import { describe, it, expect } from "vitest";
import { parseDavivienda, type TextItem } from "../davivienda";

// Invented movements laid out like Davivienda's "Informe del mes" PDF.
const header = (page: number, y: number): TextItem[] => [
  { page, x: 56, y, str: "Fecha" },
  { page, x: 126, y, str: "Valor" },
  { page, x: 197, y, str: "Doc." },
  { page, x: 302, y, str: "Clase de Movimiento" },
  { page, x: 502, y, str: "Oficina" },
];
const row = (page: number, y: number, dd: string, mm: string, value: string, sign: "+" | "-", doc: string, desc: string, office: string): TextItem[] => [
  { page, x: 52, y, str: dd },
  { page, x: 71, y, str: mm },
  { page, x: 140, y, str: `$ ${value}` },
  { page, x: 179, y, str: sign },
  { page, x: 197, y, str: doc },
  { page, x: 224, y, str: desc },
  { page, x: 451, y: y + 1, str: office },
];
const label = (y: number, text: string, value: string): TextItem[] => [
  { page: 1, x: 232, y, str: text },
  { page: 1, x: 345, y: y - 2, str: value },
];

const statement = (): TextItem[] => [
  { page: 1, x: 280, y: 712, str: "1234 5678 9012" },
  { page: 1, x: 405, y: 701, str: "INFORME DEL MES:" },
  { page: 1, x: 471, y: 701, str: "SEPTIEMBRE /2026" },
  ...label(565, "Saldo Anterior", "$1,000,000.00"),
  ...label(549, "Más Créditos", "$2,500,000.50"),
  ...label(534, "Menos Débitos", "$607,140.00"),
  ...label(519, "Nuevo Saldo", "$2,892,860.50"),
  ...header(1, 471),
  ...row(1, 457, "01", "09", "2,500,000.50", "+", "5757", "Abono ACH BANCOLOMBIA 900000001 CLIENTE UNO", "PROCESOS ACH"),
  ...row(1, 448, "02", "09", "7,140.00", "-", "0329", "Cobro Transf. Enviada Otra Entidad", "PORTAL PYMES"),
  ...row(1, 438, "02", "09", "600,000.00", "-", "0328", "Descuento Transferencia otra entidad BANCOLOMBIA MT", "PORTAL PYMES INTERBANCARI"),
  { page: 1, x: 224, y: 429, str: "FELC9999" },
  { page: 1, x: 190, y: 87, str: "Cualquier diferencia con el saldo, favor comunicarla a nuestra revisoría fiscal" },
];

describe("parseDavivienda", () => {
  it("reads the account, the month, the balances and every movement with its sign", () => {
    const s = parseDavivienda(statement());
    expect(s.problems).toEqual([]);
    expect(s).toMatchObject({ accountNumber: "1234 5678 9012", periodMonth: "2026-09-01", openingBalance: 1000000, closingBalance: 2892860.5 });
    expect(s.lines.map((l) => [l.date, l.amount, l.doc, l.office])).toEqual([
      ["2026-09-01", 2500000.5, "5757", "PROCESOS ACH"],
      ["2026-09-02", -7140, "0329", "PORTAL PYMES"],
      ["2026-09-02", -600000, "0328", "PORTAL PYMES INTERBANCARI"],
    ]);
  });

  it("joins a description that goes on in the row below, and not the page's footer", () => {
    const s = parseDavivienda(statement());
    expect(s.lines[2].description).toBe("Descuento Transferencia otra entidad BANCOLOMBIA MT FELC9999");
    expect(s.lines.some((l) => l.description.includes("revisoría"))).toBe(false);
  });

  it("reads the movements of every page", () => {
    const items = [...statement(), ...header(2, 659), ...row(2, 645, "30", "09", "1.00", "-", "0000", "Gravamen a los Movimientos Financieros", "0000")];
    const s = parseDavivienda(items);
    expect(s.lines).toHaveLength(4);
    expect(s.lines[3]).toMatchObject({ position: 4, date: "2026-09-30", amount: -1 });
    // That extra line is not in the totals printed on the first page.
    expect(s.problems).toContain("Los débitos leídos (607141) no suman lo del extracto (607140).");
  });

  it("says what is wrong with a file that is not a statement", () => {
    expect(parseDavivienda([{ page: 1, x: 10, y: 10, str: "Factura de venta" }]).problems).toEqual([
      "No encontré el número de cuenta en el extracto.",
      'No encontré el mes del extracto ("Informe del mes").',
      "No encontré el saldo anterior o el nuevo saldo.",
      "No encontré movimientos: ¿es un extracto de cuenta Davivienda en PDF?",
    ]);
  });
});
