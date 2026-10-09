// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: () => {}, refresh: () => {} }) }));
vi.mock("../actions", () => ({ saveMaquilaProposal: vi.fn(), saveMaquilaOptionPrices: vi.fn() }));
vi.mock("../MaquilaPreview", () => ({ default: () => null }));
vi.mock("../../proposals/new/BrandIdentityPanel", () => ({ default: () => null }));

import MaquilaForm from "../MaquilaForm";

const P = {
  valvula: { price: 800, cost: 450 },
  peel_stick: { price: 600, cost: 250 },
  sticker: { price: 400, cost: 150 },
  cara: { price: 1000, cost: 350 },
  tinta_adicional: { price: 500, cost: 120 },
};

describe("MaquilaForm prices", () => {
  const setup = () => render(<MaquilaForm clients={[]} packaging={[]} coffeeCostPerKg={{ premium: 40000 }} optionPrices={P} />);

  it("two fields: what I charge per bag and the suggested resale price; no margin", () => {
    setup();
    expect(screen.getByLabelText("Lo que cobro por bolsa")).toBeTruthy();
    expect(screen.queryByLabelText("Margen objetivo")).toBeNull();
    expect(screen.queryByText(/margen/i)).toBeNull();
  });

  it("the resale field shows our reference price for the bag, moving with each option", () => {
    setup();
    const resale = screen.getByLabelText("Precio de venta sugerido") as HTMLInputElement;
    expect(resale.placeholder).toMatch(/35\.000/);
    fireEvent.click(screen.getByLabelText("Cara trasera"));
    expect(resale.placeholder).toMatch(/34\.000/);
    fireEvent.click(screen.getByLabelText("Peel stick"));
    expect(resale.placeholder).toMatch(/34\.600/);
    fireEvent.change(screen.getByLabelText("Número de tintas por cara"), { target: { value: "2" } });
    expect(resale.placeholder).toMatch(/35\.100/);
    fireEvent.change(resale, { target: { value: "39900" } });
    expect(screen.getByText(/Nuestro precio con este empaque/)).toBeTruthy();
  });

  it("warns when the price per bag is below cost", () => {
    setup();
    fireEvent.change(screen.getByLabelText("Lo que cobro por bolsa"), { target: { value: "5000" } });
    expect(screen.getByText(/Por debajo del costo/)).toBeTruthy();
  });

  it("does not save without a price per bag", () => {
    setup();
    fireEvent.change(screen.getByLabelText("Nombre de la presentación"), { target: { value: "Bolsa 250" } });
    fireEvent.click(screen.getByText("Guardar"));
    expect(screen.getByText(/Escribe lo que cobras por bolsa en: Bolsa 250/)).toBeTruthy();
  });

  it("design is itemized in concepts and the total is their sum", () => {
    setup();
    fireEvent.click(screen.getByText("Agregar concepto"));
    fireEvent.click(screen.getByText("Agregar concepto"));
    const concepts = screen.getAllByLabelText("Concepto de diseño");
    fireEvent.change(concepts[0], { target: { value: "Etiqueta 250 g" } });
    fireEvent.change(screen.getByLabelText("Valor de Etiqueta 250 g"), { target: { value: "700000" } });
    fireEvent.change(concepts[1], { target: { value: "Ajustes" } });
    fireEvent.change(screen.getByLabelText("Valor de Ajustes"), { target: { value: "100000" } });
    expect(screen.getByText(/Total diseño/).textContent).toMatch(/800\.000/);
    fireEvent.click(screen.getAllByLabelText("Quitar concepto")[1]);
    expect(screen.getByText(/Total diseño/).textContent).toMatch(/700\.000/);
  });
});
