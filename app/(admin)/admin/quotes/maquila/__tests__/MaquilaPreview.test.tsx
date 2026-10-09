// @vitest-environment jsdom
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import MaquilaPreview from "../MaquilaPreview";
import type { MaquilaPdfData } from "@/utils/pdf/maquilaPdf";

const data: MaquilaPdfData = {
  title: "Propuesta de maquila de empaque",
  clientName: "Tostadora La Loma",
  proposalDate: "2026-10-12",
  validUntil: null,
  intro: "Hola",
  conditions: "Pago 50/50",
  minimumUnits: null,
  settings: { merma_pct: 1, apply_iva: true, iva_pct: 19, design_fee: 0, design_cost: 0, background_path: null, background_opacity: 0.5, ally_logo_path: null },
  lines: [
    {
      id: "a",
      presentation: "Bolsa 250 g",
      profile: "premium",
      coffee_cost_per_kg: 41234,
      grams: 250,
      monthly_units: 100,
      materials: [{ code: null, name: "Bolsa", unit_cost: 1234, qty: 1, supplied_by: "amantti" }],
      labor_per_unit: 400,
      target_margin_pct: 35,
      price_per_unit: 2500,
    },
  ],
};

const srcdoc = () => (screen.getAllByTitle("Vista previa del documento")[0] as HTMLIFrameElement).getAttribute("srcdoc") ?? "";

describe("MaquilaPreview", () => {
  it("renders the same client document the PDF uses, without costs", () => {
    render(<MaquilaPreview data={data} />);
    expect(srcdoc()).toContain("Tostadora La Loma");
    expect(srcdoc().replace(/\s/g, " ")).toContain("$ 2.500");
    expect(srcdoc()).not.toContain("1.234");
    expect(srcdoc()).toContain('src="/images/logo-amantti.png"');
  });

  it("follows the form as it changes", () => {
    const { rerender } = render(<MaquilaPreview data={data} />);
    rerender(<MaquilaPreview data={{ ...data, clientName: "Café Okus" }} />);
    expect(srcdoc()).toContain("Café Okus");
  });

  it("opens and closes a full-size view", () => {
    render(<MaquilaPreview data={data} />);
    fireEvent.click(screen.getByText("Ver en grande"));
    expect(screen.getByRole("dialog", { name: "Vista previa del PDF" })).toBeTruthy();
    expect(screen.getAllByTitle("Vista previa del documento")).toHaveLength(2);
    fireEvent.click(screen.getByLabelText("Cerrar vista previa"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
