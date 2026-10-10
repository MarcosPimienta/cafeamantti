import { REFERENCE_OPTIONS } from "@/utils/maquila";
import { describe, it, expect } from "vitest";
import { buildMaquilaHtml, type MaquilaPdfData } from "../maquilaPdf";

const data: MaquilaPdfData = {
  title: "Propuesta de café con su marca",
  clientName: "Café <Okus> & Co",
  proposalDate: "2026-10-12",
  validUntil: "2026-11-12",
  intro: "Gracias por confiar en Amantti.\nEsta es nuestra propuesta.",
  conditions: "Pago 50/50\nEntrega en 8 días",
  minimumUnits: 200,
  settings: { merma_pct: 1, apply_iva: true, iva_pct: 19, design_fee: 1500000, design_cost: 600123, background_path: null, background_opacity: 0.5, ally_logo_path: null, option_prices: null },
  lines: [
    {
      id: "l1",
      presentation: "Bolsa 250 g",
      profile: "honey",
      coffee_cost_per_kg: 41234,
      grams: 250,
      units: 400,
      materials: [
        { code: "EMP-1", name: "Bolsa kraft", unit_cost: 1234, qty: 1, supplied_by: "amantti" },
        { code: null, name: "Etiqueta del cliente", unit_cost: 777, qty: 1, supplied_by: "cliente" },
      ],
      labor_per_unit: 456,
      price_per_unit: 22000,
      resale_price: null,
      options: { ...REFERENCE_OPTIONS },
    },
  ],
};
const flat = (s: string) => s.replace(/\s/g, " ");

describe("buildMaquilaHtml (client PDF)", () => {
  const html = buildMaquilaHtml(data);

  it("shows what we charge per bag, the suggested resale price, units and value", () => {
    expect(html).toContain("Café Honey · 250 g por unidad");
    expect(html).toContain("Precio por bolsa");
    expect(html).toContain("Precio de venta sugerido");
    expect(flat(html)).toContain("$ 22.000");
    expect(flat(html)).toContain("$ 48.000"); // our Honey 250 g store price
    expect(html).toContain("antes de IVA (19 %)");
    expect(flat(html)).toContain("$ 8.800.000"); // 22.000 × 400
    const other = buildMaquilaHtml({ ...data, lines: [{ ...data.lines[0], grams: 340 }] });
    expect(other).toContain("—");
  });

  it("describes how each bag is made, without option costs", () => {
    expect(html).toContain("Válvula · Frente y respaldo a 1 tinta");
    const custom = buildMaquilaHtml({
      ...data,
      settings: { ...data.settings, option_prices: { valvula: { price: 800, cost: 4519 }, peel_stick: { price: 600, cost: 4529 }, sticker: { price: 400, cost: 4539 }, cara: { price: 1000, cost: 4549 }, tinta_adicional: { price: 500, cost: 4559 } } },
      lines: [{ ...data.lines[0], options: { ...data.lines[0].options, peel_stick: true, tintas: 2, cara_trasera: false } }],
    });
    expect(custom).toContain("Válvula · Peel stick · Solo frente a 2 tintas");
    expect(custom).not.toMatch(/45[1-5]9/);
  });

  it("the design project is one more row of the table, and the total includes it", () => {
    expect(html).toContain("Proyecto de diseño de empaque");
    expect(html).toContain("Pago único, para todas las presentaciones");
    expect(html).not.toContain("Total diseño");
    expect(flat(html)).toContain("$ 1.500.000");
    expect(flat(html)).toContain("$ 10.300.000"); // subtotal: 8.800.000 + 1.500.000
    expect(flat(html)).toContain("$ 1.957.000"); // 19 % IVA
    expect(html).toContain("Total a pagar");
    expect(flat(html)).toContain("$ 12.257.000");
    const noDesign = flat(buildMaquilaHtml({ ...data, settings: { ...data.settings, design_fee: 0 } }));
    expect(noDesign).not.toContain("Proyecto de diseño");
    expect(noDesign).toContain("$ 10.472.000"); // 8.800.000 + IVA
  });

  it("lists the design concepts with their values under the design row", () => {
    const items = [
      { description: "Concepto gráfico de la marca", price: 700000 },
      { description: "Adaptación a las presentaciones", price: 500000 },
      { description: "Artes finales <para imprenta>", price: 300000 },
    ];
    const itemized = flat(buildMaquilaHtml({ ...data, settings: { ...data.settings, design_items: items } }));
    expect(itemized.replace(/<[^>]+>/g, "")).toContain("Concepto gráfico de la marca$ 700.000");
    expect(itemized.replace(/<[^>]+>/g, "")).toContain("Adaptación a las presentaciones$ 500.000");
    expect(itemized.replace(/<[^>]+>/g, "")).toContain("Artes finales &lt;para imprenta&gt;$ 300.000");
    expect(itemized).toContain("$ 1.500.000");
  });

  it("states the minimum per presentation (never below 200)", () => {
    expect(html).toContain("Pedido mínimo: 200 unidades por presentación");
    expect(buildMaquilaHtml({ ...data, minimumUnits: null })).toContain("Pedido mínimo: 200 unidades por presentación");
    expect(buildMaquilaHtml({ ...data, minimumUnits: 300 })).toContain("Pedido mínimo: 300 unidades por presentación");
  });

  it("asks the client only for their own supplies, not for coffee", () => {
    expect(html).toContain("Etiqueta del cliente (400 und.)");
    expect(html).not.toMatch(/Café tostado:/);
    const noSupplies = buildMaquilaHtml({ ...data, lines: [{ ...data.lines[0], materials: [data.lines[0].materials[0]] }] });
    expect(noSupplies).not.toContain("Lo que entrega el cliente");
  });

  it("never leaks costs, labor, margins or the design cost", () => {
    for (const secret of ["41.234", "41234", "1.234", "1234", "456", "777", "600.123", "600123", "Margen", "margen", "Costo", "costo"]) {
      expect(html).not.toContain(secret);
    }
  });

  it("adds up a supply used by several presentations", () => {
    const two = buildMaquilaHtml({ ...data, lines: [data.lines[0], { ...data.lines[0], id: "l2", presentation: "Bolsa 500 g", units: 150 }] });
    expect(two).toContain("Etiqueta del cliente (550 und.)");
    expect(two.match(/Etiqueta del cliente/g)).toHaveLength(1);
  });

  it("puts the background behind the content, repeated per page, at the chosen opacity", () => {
    const bg = buildMaquilaHtml({ ...data, backgroundImage: "/images/Main_Background.jpg", backgroundOpacity: 0.3 });
    expect(bg).toContain("background-image:url('/images/Main_Background.jpg')");
    expect(bg).toContain("background-size:794px 1123px; background-repeat:repeat-y");
    expect(bg).toContain("opacity:0.3");
    expect(buildMaquilaHtml({ ...data, backgroundImage: null })).not.toContain("background-image");
    expect(buildMaquilaHtml({ ...data, backgroundImage: "x.jpg", backgroundOpacity: 7 })).toContain("opacity:1;");
  });

  it("shows the client's logo next to Amantti's", () => {
    const withLogo = buildMaquilaHtml({ ...data, allyLogo: "https://x/logo.png?token=a&b=c" }, "amantti.png");
    expect(withLogo).toContain('src="https://x/logo.png?token=a&amp;b=c"');
    expect(withLogo.indexOf("amantti.png")).toBeLessThan(withLogo.indexOf("logo.png?token"));
  });

  it("escapes client-provided text", () => {
    expect(html).toContain("Café &lt;Okus&gt; &amp; Co");
    expect(html).not.toContain("<Okus>");
  });

  it("omits IVA, design and empty sections when not used", () => {
    const plain = buildMaquilaHtml({ ...data, settings: { ...data.settings, apply_iva: false, design_fee: 0 }, conditions: null, validUntil: null });
    expect(plain).not.toContain("IVA");
    expect(plain).not.toContain("Diseño de empaque");
    expect(plain).not.toContain("Condiciones");
    expect(plain).not.toContain("Válida hasta");
  });
});
