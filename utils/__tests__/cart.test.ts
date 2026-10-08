import { describe, it, expect } from "vitest";
import { addToCart, removeFromCart, setCartQuantity, cartTotals, parseSavedCart, sameLine, type CartLine } from "../cart";

const coffee = { id: "premium", nameKey: "p.premium", price: 45000, weight: "250g", grind: "whole", image: "/p.png" };

describe("cart lines", () => {
  it("the same coffee in another grind or weight is another line", () => {
    expect(sameLine(coffee, { ...coffee })).toBe(true);
    expect(sameLine(coffee, { ...coffee, grind: "ground" })).toBe(false);
    expect(sameLine(coffee, { ...coffee, weight: "500g" })).toBe(false);
    expect(sameLine({ ...coffee, grindLevel: "fine" }, { ...coffee, grindLevel: "coarse" })).toBe(false);
  });

  it("adding twice increments the line by exactly one each time", () => {
    let cart: CartLine[] = [];
    cart = addToCart(cart, coffee);
    cart = addToCart(cart, coffee);
    cart = addToCart(cart, { ...coffee, grind: "ground" });
    expect(cart.map((l) => [l.grind, l.quantity])).toEqual([
      ["whole", 2],
      ["ground", 1],
    ]);
  });

  it("never mutates the previous state (React may run updaters twice)", () => {
    const before = addToCart([], coffee);
    const snapshot = JSON.stringify(before);
    addToCart(before, coffee);
    setCartQuantity(before, coffee, 7);
    removeFromCart(before, coffee);
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it("setting quantity to zero or less removes the line", () => {
    const cart = addToCart([], coffee);
    expect(setCartQuantity(cart, coffee, 3)[0].quantity).toBe(3);
    expect(setCartQuantity(cart, coffee, 0)).toEqual([]);
    expect(setCartQuantity(cart, coffee, -1)).toEqual([]);
  });

  it("removing only removes the matching line", () => {
    const cart = addToCart(addToCart([], coffee), { ...coffee, grind: "ground" });
    expect(removeFromCart(cart, coffee).map((l) => l.grind)).toEqual(["ground"]);
  });

  it("totals count units and money", () => {
    const cart = setCartQuantity(addToCart(addToCart([], coffee), { ...coffee, id: "honey", price: 52000 }), coffee, 2);
    expect(cartTotals(cart)).toEqual({ itemCount: 3, subtotal: 2 * 45000 + 52000 });
    expect(cartTotals([])).toEqual({ itemCount: 0, subtotal: 0 });
  });
});

describe("parseSavedCart", () => {
  it("restores a valid saved cart", () => {
    const cart = addToCart([], coffee);
    expect(parseSavedCart(JSON.stringify(cart))).toEqual(cart);
  });

  it("ignores corrupted or tampered storage instead of crashing", () => {
    expect(parseSavedCart(null)).toEqual([]);
    expect(parseSavedCart("{not json")).toEqual([]);
    expect(parseSavedCart('{"id":"x"}')).toEqual([]);
    expect(parseSavedCart(JSON.stringify([{ ...coffee, quantity: 0 }, { ...coffee, quantity: 2, price: "abc" }, null]))).toEqual([]);
  });
});
