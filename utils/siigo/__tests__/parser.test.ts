import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import {
  normalizeKey,
  cleanDocumentNumber,
  parseNumber,
  parseDate,
  detectColumnMapping,
  parseDelimitedText,
  parseUploadedFileBuffer,
  matchInventoryItem,
  processSiigoRows,
} from "../parser";
import type { ColumnMapping, InventoryLookupItem, ClientLookupItem } from "../types";

const inv = (id: string, product_code: string, product_name: string, current_stock = 10): InventoryLookupItem => ({
  id,
  product_code,
  product_name,
  category: "cafe",
  unit: "unidad",
  current_stock,
});

const INVENTORY = [
  inv("bulk", "CAFT-001", "Café Tostado KG"),
  inv("p250", "CAFT-250G", "Café Tostado 250g"),
  inv("p500", "CAFT-500G", "Café Tostado 500g"),
  inv("h250", "CAFT-HON-250G", "Café Tostado Honey 250g"),
  inv("cold", "CAFC-340ML", "Cold Brew 340ml"),
];

describe("normalizeKey", () => {
  it("lowercases, strips accents and punctuation, collapses spaces", () => {
    expect(normalizeKey("  Fecha de Elaboración ")).toBe("fecha de elaboracion");
    expect(normalizeKey("Vr. Unitario")).toBe("vr unitario");
    expect(normalizeKey("NIT/C.C.")).toBe("nit c c");
    expect(normalizeKey("")).toBe("");
  });
});

describe("cleanDocumentNumber", () => {
  it("removes dots and the NIT verification digit", () => {
    expect(cleanDocumentNumber("901.752.308-8")).toBe("901752308");
    expect(cleanDocumentNumber(1037654321)).toBe("1037654321");
    expect(cleanDocumentNumber(null)).toBe("");
  });
});

describe("parseNumber (Colombian formats)", () => {
  it.each([
    [15000, 15000],
    ["15000", 15000],
    ["$ 15.000,00", 15000],
    ["12.500,50", 12500.5],
    ["12,500.50", 12500.5],
    ["1.234.567", 1234567],
    ["12.500", 12500], // Colombian thousands separator, not 12.5
    ["1,234", 1234],
    ["1,5", 1.5],
    ["0.125", 0.125], // a fraction, not 125
    ["12.5", 12.5],
    ["", 0],
    [null, 0],
    ["abc", 0],
    [NaN, 0],
  ])("%j → %d", (input, expected) => {
    expect(parseNumber(input)).toBeCloseTo(expected as number, 6);
  });
});

describe("parseDate", () => {
  it.each([
    ["2026-09-30", "2026-09-30"],
    ["2026-09-30T10:00:00", "2026-09-30"],
    ["30/09/2026", "2026-09-30"],
    ["1/9/2026", "2026-09-01"],
    ["30-09-2026", "2026-09-30"],
    [46295, "2026-09-30"], // Excel serial date
  ])("%j → %s", (input, expected) => {
    expect(parseDate(input)).toBe(expected);
  });

  it("falls back to today for empty or unreadable values", () => {
    const today = new Date().toISOString().split("T")[0];
    expect(parseDate("")).toBe(today);
    expect(parseDate("no es fecha")).toBe(today);
  });
});

describe("detectColumnMapping", () => {
  it("maps a typical Siigo invoice export", () => {
    const m = detectColumnMapping([
      "Comprobante",
      "Fecha elaboración",
      "Identificación",
      "Nombre tercero",
      "Código producto",
      "Descripción",
      "Cantidad",
      "Valor unitario",
      "Valor total",
      "Observaciones",
    ]);
    expect(m).toMatchObject({
      invoice_number: "Comprobante",
      date: "Fecha elaboración",
      client_doc: "Identificación",
      client_name: "Nombre tercero",
      product_code: "Código producto",
      product_name: "Descripción",
      quantity: "Cantidad",
      unit_price: "Valor unitario",
      total_price: "Valor total",
      notes: "Observaciones",
    });
  });

  it("never assigns the same column to two fields", () => {
    const m = detectColumnMapping(["Total", "Valor", "Fecha"]);
    const used = Object.values(m).filter(Boolean);
    expect(new Set(used).size).toBe(used.length);
  });

  it("does not map blank or symbol-only headers to a field", () => {
    const m = detectColumnMapping(["#", "  ", "Fecha"]);
    expect(Object.values(m)).not.toContain("#");
    expect(Object.values(m)).not.toContain("  ");
    expect(m.date).toBe("Fecha");
  });
});

describe("parseDelimitedText", () => {
  it("detects the delimiter and respects quotes", () => {
    const csv = '﻿Factura;Producto;Total\nFV-1;"Café; 250g";"15.000"\n\nFV-2;"Dice ""hola""";20000\n';
    const { headers, rows } = parseDelimitedText(csv);
    expect(headers).toEqual(["Factura", "Producto", "Total"]);
    expect(rows).toEqual([
      { Factura: "FV-1", Producto: "Café; 250g", Total: "15.000" },
      { Factura: "FV-2", Producto: 'Dice "hola"', Total: "20000" },
    ]);
  });

  it("supports tabs and pipes and names empty headers", () => {
    expect(parseDelimitedText("a\t\tc\n1\t2\t3").headers).toEqual(["a", "Columna_2", "c"]);
    expect(parseDelimitedText("a|b\n1|2").rows).toEqual([{ a: "1", b: "2" }]);
  });

  it("returns nothing for an empty file", () => {
    expect(parseDelimitedText("\n\n")).toEqual({ headers: [], rows: [] });
  });
});

describe("parseUploadedFileBuffer", () => {
  it("reads the first sheet of an Excel file", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Factura", "Total"], ["FV-1", 15000]]), "Ventas");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const { headers, rows } = parseUploadedFileBuffer(buf, "ventas.XLSX");
    expect(headers).toEqual(["Factura", "Total"]);
    expect(rows[0]).toMatchObject({ Factura: "FV-1" });
  });

  it("reads CSV text files", () => {
    const buf = new TextEncoder().encode("a,b\n1,2").buffer;
    expect(parseUploadedFileBuffer(buf as ArrayBuffer, "x.csv").rows).toEqual([{ a: "1", b: "2" }]);
  });
});

describe("matchInventoryItem", () => {
  it("matches the exact product code first", () => {
    expect(matchInventoryItem("caft-250g", "", INVENTORY)?.id).toBe("p250");
  });

  it("matches a code embedded in a longer code", () => {
    expect(matchInventoryItem("PROD-CAFT-500G", "", INVENTORY)?.id).toBe("p500");
  });

  it("does not match short numeric Siigo codes by substring (003 is not CAFT-001)", () => {
    expect(matchInventoryItem("001", "", INVENTORY)).toBeNull();
    expect(matchInventoryItem("0041", "", INVENTORY)).toBeNull();
  });

  it("falls back to the product name, exact and then by shared words", () => {
    expect(matchInventoryItem("", "café tostado honey 250g", INVENTORY)?.id).toBe("h250");
    expect(matchInventoryItem("", "Cold Brew botella", INVENTORY)?.id).toBe("cold");
  });

  it("returns null when nothing is close enough", () => {
    expect(matchInventoryItem("", "Pocillo de cerámica", INVENTORY)).toBeNull();
    expect(matchInventoryItem("", "", INVENTORY)).toBeNull();
  });
});

describe("processSiigoRows", () => {
  const mapping: ColumnMapping = {
    invoice_number: "Factura",
    date: "Fecha",
    client_doc: "NIT",
    client_name: "Cliente",
    client_email: "",
    client_phone: "",
    client_city: "",
    client_address: "",
    product_code: "Código",
    product_name: "Producto",
    quantity: "Cantidad",
    unit_price: "Unitario",
    total_price: "Total",
    notes: "Notas",
  };
  const clients: ClientLookupItem[] = [
    { id: "c1", name: "Okus SAS", document_number: "901.111.222-3", email: "okus@x.co", phone: "300", address: "Cra 1", city: "Medellín", department: "Antioquia" },
  ];

  it("groups lines by invoice, sums totals, links CRM clients by document", () => {
    const rows = [
      { Factura: "FV-10", Fecha: "30/09/2026", NIT: "901111222", Cliente: "OKUS", Código: "CAFT-250G", Producto: "x", Cantidad: "2", Unitario: "15.000", Total: "", Notas: "Efectivo" },
      { Factura: "FV-10", Fecha: "30/09/2026", NIT: "901111222", Cliente: "OKUS", Código: "CAFT-500G", Producto: "y", Cantidad: "1", Unitario: "", Total: "28.000", Notas: "Efectivo" },
      { Factura: "FV-11", Fecha: "2026-09-29", NIT: "", Cliente: "okus sas", Código: "", Producto: "Pocillo", Cantidad: "1", Unitario: "5000", Total: "5000", Notas: "Nequi" },
    ];
    const orders = processSiigoRows(rows, mapping, INVENTORY, clients, new Set(["FV-11"]));
    expect(orders).toHaveLength(2);

    const [fv10, fv11] = orders;
    expect(fv10).toMatchObject({
      invoice_number: "FV-10",
      date: "2026-09-30",
      total_amount: 58000, // 2×15.000 + 28.000
      matched_client_id: "c1",
      client_name: "Okus SAS",
      client_email: "okus@x.co",
      is_new_client: false,
      already_exists: false,
      notes: "Efectivo", // not repeated per line
    });
    expect(fv10.items.map((i) => [i.matched_inventory_id, i.quantity, i.unit_price, i.total_price])).toEqual([
      ["p250", 2, 15000, 30000],
      ["p500", 1, 28000, 28000],
    ]);

    expect(fv11).toMatchObject({ matched_client_id: "c1", already_exists: true }); // matched by name
    expect(fv11.items[0].matched_inventory_id).toBeNull();
  });

  it("skips empty rows and invents keys for rows without an invoice number", () => {
    const rows = [
      { Factura: "", Producto: "Café Tostado 250g", Total: "15000", Cantidad: "1" },
      { Factura: "", Producto: "", Código: "", Total: "" },
      { Factura: "", Producto: "Café Tostado 500g", Total: "28000", Cantidad: "1" },
    ];
    const orders = processSiigoRows(rows, mapping, INVENTORY, [], new Set());
    expect(orders.map((o) => o.invoice_number)).toEqual(["SIIGO-DOC-1", "SIIGO-DOC-2"]);
    expect(orders.every((o) => o.is_new_client)).toBe(true);
  });

  it("never divides by zero for a zero quantity", () => {
    const [o] = processSiigoRows(
      [{ Factura: "FV-1", Producto: "Café Tostado 250g", Cantidad: "0", Total: "1000" }],
      mapping,
      INVENTORY,
      [],
      new Set()
    );
    expect(o.items[0].quantity).toBe(0.01);
    expect(Number.isFinite(o.items[0].unit_price)).toBe(true);
  });
});
