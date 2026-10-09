// @vitest-environment jsdom
import React, { useState } from "react";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import QuantityInput from "../QuantityInput";

function Harness({ baseUnit, initial = "", allowNegative = false }: { baseUnit: string; initial?: string; allowNegative?: boolean }) {
  const [value, setValue] = useState(initial);
  return (
    <div>
      <QuantityInput ariaLabel="qty" value={value} onChange={setValue} baseUnit={baseUnit} allowNegative={allowNegative} />
      <output data-testid="saved">{value}</output>
      <button onClick={() => setValue("")}>reset</button>
      <button onClick={() => setValue("2.5")}>auto</button>
    </div>
  );
}

const field = () => screen.getByLabelText("qty") as HTMLInputElement;
const saved = () => screen.getByTestId("saved").textContent;
const type = (v: string) => fireEvent.change(field(), { target: { value: v } });

describe("QuantityInput", () => {
  it("for a kg item, typing grams saves kilos", () => {
    render(<Harness baseUnit="kg" />);
    fireEvent.click(screen.getByRole("button", { name: "g" }));
    type("250");
    expect(saved()).toBe("0.25");
    expect(screen.getByText("= 0,25 kg en inventario")).toBeTruthy();
  });

  it("typing kilos saves kilos, with comma decimals", () => {
    render(<Harness baseUnit="kg" />);
    type("1,5");
    expect(saved()).toBe("1.5");
  });

  it("switching unit keeps the same amount", () => {
    render(<Harness baseUnit="kg" />);
    type("0.75");
    fireEvent.click(screen.getByRole("button", { name: "g" }));
    expect(field().value).toBe("750");
    expect(saved()).toBe("0.75");
  });

  it("for a gram item, typing kilos saves grams", () => {
    render(<Harness baseUnit="g" />);
    fireEvent.click(screen.getByRole("button", { name: "kg" }));
    type("1.2");
    expect(saved()).toBe("1200");
  });

  it("follows outside changes: form reset and auto-calculated values", () => {
    render(<Harness baseUnit="kg" />);
    fireEvent.click(screen.getByRole("button", { name: "g" }));
    type("500");
    fireEvent.click(screen.getByText("reset"));
    expect(field().value).toBe("");
    fireEvent.click(screen.getByText("auto")); // 2.5 kg shown in grams
    expect(field().value).toBe("2500");
  });

  it("non-weight items get a plain field with no unit switch", () => {
    render(<Harness baseUnit="unidad" />);
    expect(screen.queryByRole("button", { name: "g" })).toBeNull();
    type("12");
    expect(saved()).toBe("12");
  });

  it("ignores letters; negatives only where allowed (adjustments)", () => {
    render(<Harness baseUnit="kg" />);
    type("abc");
    expect(field().value).toBe("");
    type("-2");
    expect(field().value).toBe("");
  });

  it("adjustments can subtract grams", () => {
    render(<Harness baseUnit="kg" allowNegative />);
    fireEvent.click(screen.getByRole("button", { name: "g" }));
    type("-300");
    expect(saved()).toBe("-0.3");
  });
});
