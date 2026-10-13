import { describe, it, expect } from "vitest";
import { translate, translateMessage, translator, isLocale } from "../translate";

describe("translate", () => {
  it("Spanish is the text as written; English comes from the dictionary", () => {
    expect(translate("es", "Guardar")).toBe("Guardar");
    expect(translate("en", "Guardar")).toBe("Save");
  });

  it("fills placeholders in both languages", () => {
    expect(translate("es", "Mínimo {minimum} und.", { minimum: 200 })).toBe("Mínimo 200 und.");
    expect(translate("en", "Mínimo {minimum} und.", { minimum: 200 })).toBe("Minimum 200 units");
  });

  it("an unknown text stays as written (never blank)", () => {
    expect(translate("en", "Texto que no existe")).toBe("Texto que no existe");
  });

  it("a translator knows its language and translates finished messages", () => {
    const tr = translator("en");
    expect(tr.locale).toBe("en");
    expect(tr("Guardar")).toBe("Save");
    expect(tr.msg("Guardar")).toBe("Save");
  });

  it("only es and en are languages", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("fr")).toBe(false);
  });
});

describe("translateMessage (texts that arrive already written)", () => {
  it("matches templates and carries the values over", () => {
    expect(translateMessage("en", "Mínimo 300 und.")).toBe("Minimum 300 units");
    expect(translateMessage("en", "Precio por debajo del costo en: Bolsa 250, Bolsa 500.")).toBe("Price below cost in: Bolsa 250, Bolsa 500.");
  });

  it("translates each part of a message joined with ·", () => {
    expect(translateMessage("en", "Guardar · Cancelar")).toBe("Save · Cancel");
  });

  it("leaves unknown messages and Spanish untouched", () => {
    expect(translateMessage("en", "Error 503 inesperado")).toBe("Error 503 inesperado");
    expect(translateMessage("es", "Guardar")).toBe("Guardar");
    expect(translateMessage("en", null)).toBe("");
  });
});

describe("real server messages and stored reasons", () => {
  it("validation and Siigo problems", () => {
    expect(translateMessage("en", "Escribe lo que cobras por bolsa en Bolsa 250.")).toBe("Enter what you charge per bag for Bolsa 250.");
    expect(translateMessage("en", "\"Café Instantáneo 500g\" (CAFS-500G) no está vinculado a un producto de Siigo: vincúlalo o créalo en Ajustes → Siigo → Productos.")).toBe(
      "\"Café Instantáneo 500g\" (CAFS-500G) is not linked to a Siigo product: link or create it in Settings → Siigo → Products."
    );
    expect(translateMessage("en", "Elige el tipo de factura de venta en Ajustes → Siigo. · Elige el vendedor en Ajustes → Siigo.")).toBe(
      "Choose the sales invoice type in Settings → Siigo. · Choose the seller in Settings → Siigo."
    );
  });

  it("movement reasons with and without notes", () => {
    expect(translateMessage("en", "Trilla → Café Verde")).toBe("Hulling → green coffee");
    expect(translateMessage("en", "Trilla → Café Verde — Finca La Esperanza")).toBe("Hulling → green coffee — Finca La Esperanza");
    expect(translateMessage("en", "Orden Web #5d8da452")).toBe("Web order #5d8da452");
    expect(translateMessage("en", "Venta Siigo #FV-2-9")).toBe("Siigo sale #FV-2-9");
  });
});
