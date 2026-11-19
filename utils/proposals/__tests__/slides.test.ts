import { describe, it, expect } from "vitest";
import { autoLayout, buildSlides, parseProduct, parseText, type ProposalBlock, type ProposalData } from "../slides";

const text = (id: string, title: string, body: string, extra: Partial<ProposalBlock> = {}): ProposalBlock => ({ id, type: "rich-text", title, text: body, ...extra });

describe("reading a text block", () => {
  it("separates paragraphs from bullet lists and keeps the short line above a list as its heading", () => {
    const out = parseText("Precios antes de IVA.\n\nKits navideños\n• Pedido mínimo de 24 kits.\n• Envío incluido.\n\nCafé y aromáticas\n- Según consumo.");
    expect(out.paragraphs).toEqual(["Precios antes de IVA."]);
    expect(out.groups).toEqual([
      { heading: "Kits navideños", items: ["Pedido mínimo de 24 kits.", "Envío incluido."] },
      { heading: "Café y aromáticas", items: ["Según consumo."] },
    ]);
  });

  it("keeps a list together across blank lines between its bullets", () => {
    expect(parseText("Tres líneas:\n\n• Café\n\n• Aromáticas\n\n• Kits").groups).toEqual([{ items: ["Café", "Aromáticas", "Kits"] }]);
  });

  it("reads numbered lists too", () => {
    expect(parseText("1. Definir.\n2. Probar.").groups[0].items).toEqual(["Definir.", "Probar."]);
  });
});

describe("reading a price row", () => {
  it("takes name, detail, volume note and tax from a kit row", () => {
    const p = parseProduct({
      item: "Kit Clásico: Café Amantti 250 g (grano o molido) + frasco de galletas, en caja de madera con cinta. Desde 120 kits: $56.000 c/u",
      cost: 59000,
      pvp: 0,
    });
    expect(p).toMatchObject({ name: "Kit Clásico", detail: "Café Amantti 250 g (grano o molido) + frasco de galletas, en caja de madera con cinta", note: "Desde 120 kits: $56.000 c/u", price: 59000, photo: "/images/Kit_Clasico.jpg" });
    expect(parseProduct({ item: "Kit Premium: dos cafés", cost: 1, pvp: 0 }).photo).toBe("/images/Kit_Premium.jpg");
    expect(parseProduct({ item: "Kit Ejecutivo", cost: 1, pvp: 0 })).toMatchObject({ art: "gift", photo: undefined });
  });

  it("shortens the coffee name and reads the parenthesis and the IVA", () => {
    const p = parseProduct({ item: "Café Amantti institucional 2,5 kg (grano o molido), tostión más oscura y sabor intenso · IVA 5 %", cost: 125000, pvp: 0 });
    expect(p).toMatchObject({ name: "Institucional 2,5 kg", detail: "Grano o molido, tostión más oscura y sabor intenso", tax: "IVA 5 %", roast: "dark", photo: "/images/Institucional_Greca.jpg" });
    expect(parseProduct({ item: "Café Amantti Premium 2,5 kg (grano o molido)", cost: 1, pvp: 0 })).toMatchObject({ name: "Premium 2,5 kg", detail: "Grano o molido", roast: "medium", photo: "/images/Premium_Krups.jpg", focus: "40%" });
    expect(parseProduct({ item: "Café Amantti Especial 250 g", cost: 1, pvp: 0 }).photo).toBe("/images/Chemex_Especial_Bag.jpg");
    expect(parseProduct({ item: "Café Amantti Honey 250 g", cost: 1, pvp: 0 }).photo).toBe("/images/Honey_FrenchPress.jpg");
  });

  it("keeps names that would be empty or odd without the brand", () => {
    expect(parseProduct({ item: "Café Amantti 250g", cost: 1, pvp: 0 }).name).toBe("Café Amantti 250g");
    expect(parseProduct({ item: "Aromáticas surtidas (Caja de 60 unidades)", cost: 1, pvp: 0 })).toMatchObject({ name: "Aromáticas surtidas", detail: "Caja de 60 unidades", photo: "/images/Aromaticas_Oficina.jpg" });
  });

  it("an uploaded photo wins over the drawn art", () => {
    expect(parseProduct({ item: "Kit Detalle", cost: 1, pvp: 0, imageUrl: "https://x/kit.png" })).toMatchObject({ photo: "https://x/kit.png", art: undefined });
  });
});

describe("choosing the layout", () => {
  it("text alone gets a photo beside it; 2–4 bullets become columns; long lists stay a list", () => {
    expect(autoLayout(text("a", "Quiénes somos", "Amantti es café especial."), false)).toBe("split");
    expect(autoLayout(text("a", "Lo que proponemos", "Tres líneas:\n\n• Café\n• Aromáticas\n• Kits"), false)).toBe("columns");
    expect(autoLayout(text("a", "Condiciones", "Antes de IVA.\n\nKits\n• a\n• b"), false)).toBe("list");
    expect(autoLayout(text("a", "Pasos", "• a\n• b\n• c\n• d\n• e"), false)).toBe("list");
  });

  it("the last short text closes the deck", () => {
    expect(autoLayout(text("a", "Siguiente paso", "Agendemos una degustación."), true)).toBe("close");
    expect(autoLayout(text("a", "Siguiente paso", "x".repeat(600)), true)).toBe("split");
  });
});

describe("building the deck", () => {
  const data: ProposalData = {
    clientName: "Sunteca",
    date: "18 de noviembre de 2026",
    title: "Café, aromáticas y kits navideños",
    subtitle: "Café Amantti × Sunteca",
    allyLogoUrl: "https://signed/logo.png",
    backgroundImageUrl: "/images/Main_Background.jpg",
    content: [
      text("1", "Presentación", "Amantti es café especial."),
      { id: "2", type: "price-table", title: "Café", showPvp: false, items: [{ item: "Café Amantti Premium 2,5 kg", cost: 160000, pvp: 0 }, { item: "", cost: 0, pvp: 0 }] },
      { id: "3", type: "price-table", title: "Muchos", items: Array.from({ length: 6 }, (_, i) => ({ item: `P${i}`, cost: 1, pvp: 2 })) },
      text("4", "", ""),
      text("5", "Siguiente paso", "Agendemos una degustación.", { layout: "split", imageUrl: "https://signed/foto.jpg" }),
    ],
  };

  it("opens with the cover, gives each block a slide and skips empty blocks", () => {
    const slides = buildSlides(data);
    expect(slides.map((s) => s.kind)).toEqual(["cover", "split", "products", "table", "split"]);
    expect(slides[0]).toMatchObject({ kind: "cover", clientName: "Sunteca", allyLogoUrl: "https://signed/logo.png", photo: "/images/Chemex_Especial_Bag.jpg" });
  });

  it("a forced layout and an uploaded photo win; price rows without text are left out", () => {
    const slides = buildSlides(data);
    expect(slides[4]).toMatchObject({ kind: "split", photo: "https://signed/foto.jpg" });
    expect(slides[2]).toMatchObject({ kind: "products", showPvp: false });
    if (slides[2].kind === "products") expect(slides[2].products).toHaveLength(1);
    expect(slides[3]).toMatchObject({ kind: "table", showPvp: true });
  });

  it("a custom background becomes the cover photo", () => {
    expect(buildSlides({ ...data, backgroundImageUrl: "https://signed/bg.jpg" })[0]).toMatchObject({ photo: "https://signed/bg.jpg" });
  });
});
