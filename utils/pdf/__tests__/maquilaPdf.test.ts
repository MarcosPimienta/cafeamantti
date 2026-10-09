import { describe, it, expect } from "vitest";
import { buildMaquilaHtml, type MaquilaPdfData } from "../maquilaPdf";

const data: MaquilaPdfData = {
  title: "Propuesta de maquila de empaque",
  clientName: "Café <Okus> & Co",
  proposalDate: "2026-10-12",
  validUntil: "2026-11-12",
  intro: "Gracias por confiar en Amantti.\nEsta es nuestra propuesta.",
  conditions: "Pago 50/50\nEntrega en 5 días",
  minimumUnits: 200,
  settings: { merma_pct: 1, apply_iva: true, iva_pct: 19 },
  lines: [
    {
      id: "l1",
      presentation: "Bolsa 250 g",
      grams: 250,
      monthly_units: 400,
      materials: [
        { code: "EMP-1", name: "Bolsa kraft", unit_cost: 1234, qty: 1, supplied_by: "amantti" },
        { code: null, name: "Etiqueta del cliente", unit_cost: 777, qty: 1, supplied_by: "cliente" },
      ],
      labor_per_unit: 456,
      target_margin_pct: 40,
      price_per_unit: 2900,
    },
  ],
};

describe("buildMaquilaHtml (client PDF)", () => {
  const html = buildMaquilaHtml(data);

  it("shows prices, monthly value, IVA and total", () => {
    expect(html).toContain("Bolsa 250 g");
    expect(html.replace(/\s/g, " ")).toContain("$ 2.900"); // price per unit
    expect(html.replace(/\s/g, " ")).toContain("$ 1.160.000"); // 2.900 × 400
    expect(html).toContain("IVA (19 %)");
    expect(html.replace(/\s/g, " ")).toContain("$ 1.380.400"); // total with IVA
    expect(html).toContain("Pedido mínimo: 200 unidades");
  });

  it("tells the client what to deliver: coffee with merma and their own supplies", () => {
    expect(html).toContain("101 kg"); // 400 × 0.25 × 1.01
    expect(html).toContain("Etiqueta del cliente (400 und.)");
  });

  it("never leaks costs, labor or margins", () => {
    for (const secret of ["1.234", "1234", "456", "777", "40 %", "Margen", "margen", "Costo", "costo"]) {
      expect(html).not.toContain(secret);
    }
  });

  it("a supply used by several presentations is listed once, added up", () => {
    const two = buildMaquilaHtml({ ...data, lines: [data.lines[0], { ...data.lines[0], id: "l2", presentation: "Bolsa 500 g", monthly_units: 150 }] });
    expect(two).toContain("Etiqueta del cliente (550 und.)");
    expect(two.match(/Etiqueta del cliente/g)).toHaveLength(1);
  });

  it("escapes client-provided text", () => {
    expect(html).toContain("Café &lt;Okus&gt; &amp; Co");
    expect(html).not.toContain("<Okus>");
  });

  it("omits IVA and empty sections when not used", () => {
    const plain = buildMaquilaHtml({ ...data, settings: { ...data.settings, apply_iva: false }, conditions: null, minimumUnits: null, validUntil: null });
    expect(plain).not.toContain("IVA");
    expect(plain).not.toContain("Condiciones");
    expect(plain).not.toContain("Pedido mínimo");
    expect(plain).not.toContain("Válida hasta");
  });
});
