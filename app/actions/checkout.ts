"use server";

import { createClient } from "@/utils/supabase/server";

export async function createPendingOrder(
  cartItems: any[], 
  shippingCost: number = 0,
  shippingInfoInput?: { address: string; city: string; state: string; details?: string }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  // Store prices include $10.000 COP base shipping per item.
  // Net product total = sum( Math.max(0, item.price - 10000) * item.quantity )
  let netItemsTotal = 0;
  for (const item of cartItems) {
    const netPrice = Math.max(0, item.price - 10000);
    netItemsTotal += netPrice * item.quantity;
  }
  const totalAmount = netItemsTotal + shippingCost;

  let contact_email = "guest@example.com";
  let contact_phone = "0000000000";
  let shipping_info: any = shippingInfoInput || { address: "None provided" };

  if (user) {
    // Attempt to pull user's real email from auth
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

  const { data: order, error } = await supabase
    .from('orders')
    .insert({
      user_id: user?.id || null,
      total_amount: totalAmount,
      shipping_info: shipping_info,
      contact_email: contact_email,
      contact_phone: contact_phone,
      status: 'pending' // Order is created as pending until ePayco confirms payment via Webhook
    })
    .select('id')
    .single();

  if (error || !order) {
    console.error("Order Creation Error:", error, JSON.stringify(error));
    return { success: false, error: "No se pudo crear el pedido en la base de datos." };
  }

  // Create order items
  const orderItemsData = cartItems.map(item => ({
    order_id: order.id,
    product_id: item.id || item.nameKey, // using nameKey as fallback ID if none exists
    weight: item.weight,
    grind: item.grind,
    grind_level: item.grindLevel || null,
    quantity: item.quantity,
    price_at_time: item.price
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
    contact_email 
  };
}
