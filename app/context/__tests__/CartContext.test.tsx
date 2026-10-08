// @vitest-environment jsdom
import React, { StrictMode } from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { CartProvider, useCart } from "../CartContext";

const coffee = { id: "premium", nameKey: "p.premium", price: 45000, weight: "250g", grind: "whole", image: "/p.png" };

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <StrictMode>
    <CartProvider>{children}</CartProvider>
  </StrictMode>
);

beforeEach(() => localStorage.clear());

describe("CartProvider", () => {
  it("adds exactly one unit per click, even under StrictMode", () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => result.current.addItem(coffee));
    act(() => result.current.addItem(coffee));
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].quantity).toBe(2);
    expect(result.current.itemCount).toBe(2);
    expect(result.current.subtotal).toBe(90000);
  });

  it("persists to and restores from localStorage", () => {
    const first = renderHook(() => useCart(), { wrapper });
    act(() => first.result.current.addItem(coffee));
    first.unmount();
    expect(JSON.parse(localStorage.getItem("amantti_cart")!)).toHaveLength(1);

    const second = renderHook(() => useCart(), { wrapper });
    expect(second.result.current.itemCount).toBe(1);
  });

  it("survives a corrupted saved cart", () => {
    localStorage.setItem("amantti_cart", "{oops");
    const { result } = renderHook(() => useCart(), { wrapper });
    expect(result.current.items).toEqual([]);
  });

  it("updateQuantity to 0 removes; clearCart empties", () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => result.current.addItem(coffee));
    act(() => result.current.addItem({ ...coffee, grind: "ground" }));
    act(() => result.current.updateQuantity(coffee.id, coffee.weight, coffee.grind, undefined, 0));
    expect(result.current.items.map((i) => i.grind)).toEqual(["ground"]);
    act(() => result.current.clearCart());
    expect(result.current.items).toEqual([]);
  });

  it("useCart outside the provider fails loudly", () => {
    expect(() => renderHook(() => useCart())).toThrow(/within a CartProvider/);
  });
});
