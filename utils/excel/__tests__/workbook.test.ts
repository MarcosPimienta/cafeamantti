import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { buildWorkbook, excelDate } from "../workbook";

const roundTrip = (wb: XLSX.WorkBook) => XLSX.read(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }), { type: "buffer", cellNF: true, cellStyles: true });

describe("buildWorkbook", () => {
  const wb = roundTrip(
    buildWorkbook([
      {
        name: "Gastos con un nombre larguísimo de más de 31 letras",
        title: [["Libro de gastos"], ["Periodo", "2026-09-01 a 2026-09-30"]],
        columns: [
          { header: "Fecha", format: "date" },
          { header: "Concepto", width: 40 },
          { header: "Valor", format: "money" },
        ],
        rows: [
          ["2026-09-30", "Máquina", 1340000],
          ["2026-09-01", "Internet", 99900],
        ],
        totals: ["Total", "", 1439900],
      },
    ])
  );
  const ws = wb.Sheets[wb.SheetNames[0]];

  it("cuts the sheet name to Excel's 31 characters", () => {
    expect(wb.SheetNames[0]).toHaveLength(31);
  });

  it("puts the title, a blank line, the header, the rows and the totals", () => {
    expect(ws.A1.v).toBe("Libro de gastos");
    expect(ws.B2.v).toBe("2026-09-01 a 2026-09-30");
    expect(ws.A4.v).toBe("Fecha");
    expect(ws.B5.v).toBe("Máquina");
    expect(ws.A7.v).toBe("Total");
    expect(ws.C7.v).toBe(1439900);
  });

  it("money stays a number (formatted) and dates are real Excel dates", () => {
    expect(ws.C5).toMatchObject({ t: "n", v: 1340000 });
    expect(ws.C5.z).toBe("#,##0");
    expect(ws.A5).toMatchObject({ t: "n", v: excelDate("2026-09-30") });
    expect(ws.A5.z).toBe("yyyy-mm-dd");
    expect(ws.A7.v).toBe("Total"); // text in a date column is left alone
  });

  it("adds a filter on the header row and column widths", () => {
    expect(ws["!autofilter"]?.ref).toBe("A4:C6");
    expect(ws["!cols"]?.[1]?.wch).toBe(40);
  });
});

describe("excelDate", () => {
  it("counts days from Excel's epoch without time zone shifts", () => {
    expect(excelDate("1900-03-01")).toBe(61);
    expect(excelDate("2026-01-01")).toBe(46023);
    expect(excelDate("no es fecha")).toBeNull();
  });
});
