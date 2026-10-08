"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import {
  addToCart,
  removeFromCart,
  setCartQuantity,
  cartTotals,
  parseSavedCart,
  type CartLine,
} from "@/utils/cart";

export type CartItem = CartLine;

interface CartContextType {
  items: CartItem[];
  addItem: (item: Omit<CartItem, "quantity">) => void;
  removeItem: (id: string, weight: string, grind: string, grindLevel?: string) => void;
  updateQuantity: (id: string, weight: string, grind: string, grindLevel: string | undefined, quantity: number) => void;
  clearCart: () => void;
  itemCount: number;
  subtotal: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  // Load from localStorage on mount
  useEffect(() => {
    const saved = parseSavedCart(localStorage.getItem("amantti_cart"));
    if (saved.length) setItems(saved);
  }, []);

  // Save to localStorage whenever items change
  useEffect(() => {
    localStorage.setItem("amantti_cart", JSON.stringify(items));
  }, [items]);

  const addItem = (newItem: Omit<CartItem, "quantity">) => {
    setItems((prev) => addToCart(prev, newItem));
  };

  const removeItem = (id: string, weight: string, grind: string, grindLevel?: string) => {
    setItems((prev) => removeFromCart(prev, { id, weight, grind, grindLevel }));
  };

  const updateQuantity = (
    id: string,
    weight: string,
    grind: string,
    grindLevel: string | undefined,
    quantity: number
  ) => {
    setItems((prev) => setCartQuantity(prev, { id, weight, grind, grindLevel }, quantity));
  };

  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  const { itemCount, subtotal } = cartTotals(items);

  return (
    <CartContext.Provider
      value={{
        items,
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
        itemCount,
        subtotal,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}
