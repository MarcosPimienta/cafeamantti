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

describe("MaquilaForm bag options", () => {
  it("starts with the reference bag at the store price and moves it with each option", () => {
    render(<MaquilaForm clients={[]} packaging={[]} coffeeCostPerKg={{ premium: 40000 }} optionPrices={P} />);
    const price = screen.getByLabelText("Precio por unidad") as HTMLInputElement;
    expect(price.placeholder).toMatch(/35\.000/);
    expect(screen.getByText(/Precio de referencia \(Premium 250 g/)).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Cara trasera"));
    expect(price.placeholder).toMatch(/34\.000/);
    fireEvent.click(screen.getByLabelText("Peel stick"));
    expect(price.placeholder).toMatch(/34\.600/);
    fireEvent.change(screen.getByLabelText("Número de tintas por cara"), { target: { value: "2" } });
    expect(price.placeholder).toMatch(/35\.100/);
  });

  it("sizes without a reference product fall back to the target margin", () => {
    render(<MaquilaForm clients={[]} packaging={[]} coffeeCostPerKg={{ premium: 40000 }} optionPrices={P} />);
    fireEvent.change(screen.getByLabelText("Gramos por unidad"), { target: { value: "340" } });
    expect(screen.getByText(/Sin producto de referencia para 340 g/)).toBeTruthy();
  });
});
