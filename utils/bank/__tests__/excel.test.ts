import { describe, it, expect } from "vitest";
import { cellDate, cellNumber, parseStatementRows } from "../excel";

// Invented movements, laid out like the October sheet: Crédito/Débito columns, totals at the end.
const sheet = () => [
  ["EMPRESA DE PRUEBA SAS — Extracto Davivienda Cuenta de Ahorros 1234 5678 9012", null, null, null, null, null, null],
  ["Octubre 2026"],
  [null, null, null, null, null, "Saldo anterior", 1000000],
  ["Fecha", "Doc.", "Clase de movimiento", "Oficina", "Crédito (+)", "Débito (−)", "Saldo", "Conciliado", "Referencia en libros"],
  [46297, "5752", "Pago A Llave De Comercio", "Redeban BreB", 40000, null, null],
  [46300, "4882", "Dcto por Transferencia de Fondos 396700034129 9017523088 Pago", "PORTAL PYMES", null, 200000, null],
  [46326, "0000", "Rendimientos Financieros.", "0000", 364.58, null, null],
  [null, null, null, null, null, null, null],
  [null, null, null, "Según extracto", 40364.58, 200000, 840364.58],
];

describe("parseStatementRows", () => {
  it("finds the table by its headers and reads every movement with its sign", () => {
    const s = parseStatementRows(sheet());
    expect(s.problems).toEqual([]);
    expect(s).toMatchObject({ accountNumber: "1234 5678 9012", periodMonth: "2026-10-01", openingBalance: 1000000, closingBalance: 840364.58 });
    expect(s.lines.map((l) => [l.date, l.amount, l.doc, l.office])).toEqual([
      ["2026-10-02", 40000, "5752", "Redeban BreB"],
      ["2026-10-05", -200000, "4882", "PORTAL PYMES"],
      ["2026-10-31", 364.58, "0000", "0000"],
    ]);
  });

  it("checks the movements against the sheet's own totals", () => {
    const rows = sheet();
    rows[5][5] = 210000;
    expect(parseStatementRows(rows).problems).toEqual([
      "Los débitos del archivo (210000) no suman lo del extracto (200000).",
      "El saldo anterior más los movimientos no da el nuevo saldo.",
    ]);
  });

  it("reads a single signed Valor column with text dates, and computes the closing balance when it isn't there", () => {
    const s = parseStatementRows([
      ["Cuenta 1234-5678-9012"],
      ["Saldo inicial", "$ 500.000,00"],
      ["Fecha", "Descripción", "Valor"],
      ["01/10/2026", "Abono ACH CLIENTE", "3,675,000.00+"],
      ["2026-10-02", "Cobro Transf. Enviada Otra Entidad", "7,140.00-"],
    ]);
    expect(s.problems).toEqual([]);
    expect(s.lines.map((l) => [l.date, l.amount])).toEqual([["2026-10-01", 3675000], ["2026-10-02", -7140]]);
    expect(s.closingBalance).toBe(4167860);
  });

  it("refuses a sheet with two months or no movements table", () => {
    const rows = sheet();
    rows[6][0] = 46330; // 4 nov
    expect(parseStatementRows(rows).problems).toContain("El archivo tiene movimientos de varios meses (2026-10, 2026-11): carga un extracto por mes.");
    expect(parseStatementRows([["Ventas por producto"], ["Producto", "Cantidad"]]).problems).toContain(
      "No encontré la tabla de movimientos: necesita columnas de Fecha, Descripción (o Clase de movimiento) y Crédito/Débito o Valor."
    );
  });
});

describe("cells", () => {
  it.each([[1234.5, 1234.5], ["1.234,50", 1234.5], ["$ 3,675,000.00+", 3675000], ["7,140.00-", -7140], ["(500)", -500], ["", null], ["abc", null]])("%s → %s", (v, n) => expect(cellNumber(v)).toBe(n));
  it("dates", () => {
    expect(cellDate(46297)).toBe("2026-10-02");
    expect(cellDate("2/10/2026")).toBe("2026-10-02");
    expect(cellDate("Totales")).toBeNull();
  });
});
