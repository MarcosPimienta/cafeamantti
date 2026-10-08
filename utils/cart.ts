// Pure cart operations used by CartContext. A cart line is identified by
// product + weight + grind + grind level: the same coffee in another grind is
// another line. Every operation returns a new array (never mutates), which
// React state updaters require — they may run twice in development.

export interface CartLine {
  id: string;
  nameKey: string;
  price: number;
  weight: string;
  grind: string;
  grindLevel?: string;
  image: string;
  quantity: number;
}

export type LineKey = Pick<CartLine, "id" | "weight" | "grind" | "grindLevel">;

export function sameLine(a: LineKey, b: LineKey): boolean {
  return a.id === b.id && a.weight === b.weight && a.grind === b.grind && a.grindLevel === b.grindLevel;
}

/** Adds one unit: increments an existing line or appends a new one. */
export function addToCart(items: CartLine[], item: Omit<CartLine, "quantity">): CartLine[] {
  const exists = items.some((i) => sameLine(i, item));
  return exists
    ? items.map((i) => (sameLine(i, item) ? { ...i, quantity: i.quantity + 1 } : i))
    : [...items, { ...item, quantity: 1 }];
}

export function removeFromCart(items: CartLine[], key: LineKey): CartLine[] {
  return items.filter((i) => !sameLine(i, key));
}

/** Sets a line's quantity; zero or less removes it. */
export function setCartQuantity(items: CartLine[], key: LineKey, quantity: number): CartLine[] {
  if (quantity <= 0) return removeFromCart(items, key);
  return items.map((i) => (sameLine(i, key) ? { ...i, quantity } : i));
}

export function cartTotals(items: CartLine[]) {
  return {
    itemCount: items.reduce((total, i) => total + i.quantity, 0),
    subtotal: items.reduce((total, i) => total + i.price * i.quantity, 0),
  };
}

/** Reads a saved cart, ignoring anything that is not a list of lines. */
export function parseSavedCart(raw: string | null): CartLine[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((i) => i && typeof i.id === "string" && Number(i.quantity) > 0 && Number.isFinite(Number(i.price)))
      : [];
  } catch {
    return [];
  }
}
