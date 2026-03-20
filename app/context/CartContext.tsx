"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

export interface CartItem {
  id: string;
  nameKey: string;
  price: number;
  weight: string;
  grind: string;
  grindLevel?: string;
  image: string;
  quantity: number;
}

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
    const savedCart = localStorage.getItem("amantti_cart");
    if (savedCart) {
      try {
        setItems(JSON.parse(savedCart));
      } catch (e) {
        console.error("Failed to parse cart from localStorage", e);
      }
    }
  }, []);

  // Save to localStorage whenever items change
  useEffect(() => {
    localStorage.setItem("amantti_cart", JSON.stringify(items));
  }, [items]);

  const addItem = (newItem: Omit<CartItem, "quantity">) => {
    setItems((prevItems) => {
      const existingItemIndex = prevItems.findIndex(
        (item) =>
          item.id === newItem.id &&
          item.weight === newItem.weight &&
          item.grind === newItem.grind &&
          item.grindLevel === newItem.grindLevel
      );

      if (existingItemIndex > -1) {
        const updatedItems = [...prevItems];
        updatedItems[existingItemIndex].quantity += 1;
        return updatedItems;
      }

      return [...prevItems, { ...newItem, quantity: 1 }];
    });
  };

  const removeItem = (id: string, weight: string, grind: string, grindLevel?: string) => {
    setItems((prevItems) =>
      prevItems.filter(
        (item) =>
          !(
            item.id === id &&
            item.weight === weight &&
            item.grind === grind &&
            item.grindLevel === grindLevel
          )
      )
    );
  };

  const updateQuantity = (
    id: string,
    weight: string,
    grind: string,
    grindLevel: string | undefined,
    quantity: number
  ) => {
    if (quantity <= 0) {
      removeItem(id, weight, grind, grindLevel);
      return;
    }

    setItems((prevItems) =>
      prevItems.map((item) =>
        item.id === id &&
        item.weight === weight &&
        item.grind === grind &&
        item.grindLevel === grindLevel
          ? { ...item, quantity }
          : item
      )
    );
  };

  const clearCart = () => {
    setItems([]);
  };

  const itemCount = items.reduce((total, item) => total + item.quantity, 0);
  const subtotal = items.reduce((total, item) => total + item.price * item.quantity, 0);

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
