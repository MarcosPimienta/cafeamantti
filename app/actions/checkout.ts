"use server";

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { storePrice, storeCombo, inventoryCodeFor, MAX_UNITS_PER_LINE } from "@/utils/pricing";
import { calculateOrderShippingAndTotal } from "@/utils/shipping";

type Line = { id: string; weight: string; grind: string | null; grindLevel: string | null; quantity: number; price: number };
type Address = { address: string; city: string; state: string; details?: string };

/** Every cart line priced from the store list (never the browser's prices). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function priceLines(cartItems: any[]): { lines: Line[] } | { error: string } {
  if (!Array.isArray(cartItems) || cartItems.length === 0) return { error: "El carrito está vacío." };
  const lines: Line[] = [];
  for (const item of cartItems) {
    const price = storePrice(item?.id, item?.weight);
    const quantity = Number(item?.quantity);
    if (price === null) {
      return { error: "Uno de los productos del carrito ya no está disponible. Actualiza el carrito e intenta de nuevo." };
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_UNITS_PER_LINE) {
      return { error: "Cantidad inválida en el carrito." };
    }
    lines.push({ id: item.id, weight: item.weight, grind: item.grind ?? null, grindLevel: item.grindLevel ?? null, quantity, price });
  }
  return { lines };
}

/** Combos only sell while their products are in stock. */
async function comboStockProblem(lines: Line[]): Promise<string | null> {
  const need = new Map<string, number>();
  for (const l of lines) for (const u of storeCombo(l.id)?.units ?? []) need.set(u.code, (need.get(u.code) ?? 0) + l.quantity);
  if (!need.size) return null;
  const admin = createAdminClient();
  if (!admin) return null; // can't check: never block the sale for it
  const { data } = await admin.from("inventory").select("product_code, current_stock").in("product_code", [...need.keys()]);
  for (const [code, qty] of need) {
    const stock = Number((data ?? []).find((r) => r.product_code === code)?.current_stock ?? 0);
    if (stock < qty) return stock > 0 ? `Del combo solo quedan ${Math.floor(stock)} unidad(es).` : "El combo está agotado por ahora.";
  }
  return null;
}

/**
 * Creates the pending web order the customer is about to pay.
 *
 * Prices and shipping are recalculated here from the store price list and
 * the delivery address; whatever the browser sent for them is ignored, so
 * a tampered cart cannot lower what ePayco is asked to charge. The client
 * must use the returned `totalAmount` for the payment. Each line is linked
 * to its inventory product so stock moves when the payment is confirmed;
 * a combo goes in as its products.
 */
export async function createPendingOrder(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cartItems: any[],
  /** @deprecated ignored: shipping is computed on the server. */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _clientShippingCost: number = 0,
  shippingInfoInput?: Address
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const priced = priceLines(cartItems);
  if ("error" in priced) return { success: false, error: priced.error };
  const stockProblem = await comboStockProblem(priced.lines);
  if (stockProblem) return { success: false, error: stockProblem };

  let contact_email = "guest@example.com";
  let contact_phone = "0000000000";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let shipping_info: any = shippingInfoInput || { address: "None provided" };

  if (user) {
    contact_email = user.email || contact_email;

    const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    if (profile) {
      if (profile.phone_number || profile.phone) contact_phone = profile.phone_number || profile.phone;
      if (!shippingInfoInput && profile.address) {
        shipping_info = {
          address: profile.address,
          city: profile.city || "",
          state: profile.department || "",
          details: ""
        };
      }
    }
  }

  // ── Shipping and total, from the delivery address ──
  const lines = priced.lines;
  const { totalAmount, shippingCost, shippingZone } = calculateOrderShippingAndTotal(lines, shipping_info?.state, shipping_info?.city);
  if (!shippingZone.isAvailable) {
    return { success: false, error: shippingZone.message || "Entregas disponibles solo en el Área Metropolitana." };
  }

  // ── Order lines: a combo goes in as its products ──
  const items = lines.flatMap((l) => {
    const combo = storeCombo(l.id);
    if (!combo) return [{ product_id: l.id, code: inventoryCodeFor(l.id, l.weight), weight: l.weight, grind: l.grind, grind_level: l.grindLevel, quantity: l.quantity, price_at_time: l.price }];
    return combo.units.map((u) => ({ product_id: u.product_id, code: u.code, weight: u.weight, grind: u.grind, grind_level: null, quantity: l.quantity, price_at_time: u.price }));
  });

  // ── Inventory links (so the paid order deducts stock) ──
  const codes = [...new Set(items.map((i) => i.code).filter(Boolean))] as string[];
  const { data: invRows } = codes.length
    ? await supabase.from('inventory').select('id, product_code').in('product_code', codes)
    : { data: [] };
  const inventoryIdByCode = new Map(((invRows ?? []) as { id: string; product_code: string }[]).map((r) => [r.product_code, r.id]));

  const orderRow = {
    user_id: user?.id || null,
    total_amount: totalAmount,
    shipping_info: { ...shipping_info, shipping_cost: shippingCost },
    contact_email: contact_email,
    contact_phone: contact_phone,
    status: 'pending', // Order is created as pending until ePayco confirms payment via Webhook
    source: 'web',
  };
  let { data: created, error } = await supabase.from('orders').insert(orderRow).select('id').single();
  if (error && /source/.test(error.message)) {
    // Database without the orders.source column: never block a sale for it.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { source, ...withoutSource } = orderRow;
    ({ data: created, error } = await supabase.from('orders').insert(withoutSource).select('id').single());
  }

  if (error || !created) {
    console.error("Order Creation Error:", error, JSON.stringify(error));
    return { success: false, error: "No se pudo crear el pedido en la base de datos." };
  }

  const orderItemsData = items.map((i) => ({
    order_id: created.id,
    product_id: i.product_id,
    inventory_id: inventoryIdByCode.get(i.code ?? "") ?? null,
    weight: i.weight,
    grind: i.grind,
    grind_level: i.grind_level,
    quantity: i.quantity,
    price_at_time: i.price_at_time,
  }));

  const { error: itemsError } = await supabase
    .from('order_items')
    .insert(orderItemsData);

  if (itemsError) {
    console.error("Order Items Error:", itemsError);
    // Cleanup the orphaned order
    await supabase.from('orders').delete().eq('id', created.id);
    return { success: false, error: "Error guardando los productos del carrito." };
  }

  return {
    success: true,
    orderId: created.id,
    totalAmount,
    shippingCost,
    contact_email
  };
}
