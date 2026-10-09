"use server";

import { createClient } from "@/utils/supabase/server";
import { storePrice, inventoryCodeFor, MAX_UNITS_PER_LINE } from "@/utils/pricing";
import { calculateOrderShippingAndTotal } from "@/utils/shipping";

/**
 * Creates the pending web order the customer is about to pay.
 *
 * Prices and shipping are recalculated here from the store price list and
 * the delivery address; whatever the browser sent for them is ignored, so
 * a tampered cart cannot lower what ePayco is asked to charge. The client
 * must use the returned `totalAmount` for the payment. Each line is linked
 * to its inventory product so stock moves when the payment is confirmed.
 */
export async function createPendingOrder(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cartItems: any[],
  /** @deprecated ignored: shipping is computed on the server. */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _clientShippingCost: number = 0,
  shippingInfoInput?: { address: string; city: string; state: string; details?: string }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!Array.isArray(cartItems) || cartItems.length === 0) {
    return { success: false, error: "El carrito está vacío." };
  }

  // ── Price every line from the store list ──
  const lines: { id: string; weight: string; grind: string | null; grindLevel: string | null; quantity: number; price: number }[] = [];
  for (const item of cartItems) {
    const price = storePrice(item?.id, item?.weight);
    const quantity = Number(item?.quantity);
    if (price === null) {
      return { success: false, error: "Uno de los productos del carrito ya no está disponible. Actualiza el carrito e intenta de nuevo." };
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_UNITS_PER_LINE) {
      return { success: false, error: "Cantidad inválida en el carrito." };
    }
    lines.push({
      id: item.id,
      weight: item.weight,
      grind: item.grind ?? null,
      grindLevel: item.grindLevel ?? null,
      quantity,
      price,
    });
  }

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
  const { totalAmount, shippingCost, shippingZone } = calculateOrderShippingAndTotal(
    lines,
    shipping_info?.state,
    shipping_info?.city
  );
  if (!shippingZone.isAvailable) {
    return { success: false, error: shippingZone.message || "Entregas disponibles solo en el Área Metropolitana." };
  }

  // ── Inventory links (so the paid order deducts stock) ──
  const codes = [...new Set(lines.map((l) => inventoryCodeFor(l.id, l.weight)).filter(Boolean))] as string[];
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
  let { data: order, error } = await supabase.from('orders').insert(orderRow).select('id').single();
  if (error && /source/.test(error.message)) {
    // Database without the orders.source column: never block a sale for it.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { source, ...withoutSource } = orderRow;
    ({ data: order, error } = await supabase.from('orders').insert(withoutSource).select('id').single());
  }

  if (error || !order) {
    console.error("Order Creation Error:", error, JSON.stringify(error));
    return { success: false, error: "No se pudo crear el pedido en la base de datos." };
  }

  const orderItemsData = lines.map((l) => ({
    order_id: order.id,
    product_id: l.id,
    inventory_id: inventoryIdByCode.get(inventoryCodeFor(l.id, l.weight) ?? "") ?? null,
    weight: l.weight,
    grind: l.grind,
    grind_level: l.grindLevel,
    quantity: l.quantity,
    price_at_time: l.price,
  }));

  const { error: itemsError } = await supabase
    .from('order_items')
    .insert(orderItemsData);

  if (itemsError) {
    console.error("Order Items Error:", itemsError);
    // Cleanup the orphaned order
    await supabase.from('orders').delete().eq('id', order.id);
    return { success: false, error: "Error guardando los productos del carrito." };
  }

  return {
    success: true,
    orderId: order.id,
    totalAmount,
    shippingCost,
    contact_email
  };
}
