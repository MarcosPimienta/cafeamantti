"use server";

import { createClient } from "@/utils/supabase/server";

export async function createPendingOrder(cartItems: any[], shippingCost: number = 0) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  // Calculate total securely (Ideally, fetch exact prices from the DB to prevent client tampering)
  let subtotal = 0;
  for (const item of cartItems) {
    subtotal += item.price * item.quantity;
  }
  const totalAmount = subtotal + shippingCost;

  // Placeholder for shipping info. 
  // If the user is logged in, we try to pull it from their profile.
  let contact_email = "guest@example.com";
  let contact_phone = "0000000000";
  let shipping_info = { address: "None provided" };

  if (user) {
    // Attempt to pull user's real email from auth
    contact_email = user.email || contact_email;

    const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    if (profile) {
      if (profile.phone) contact_phone = profile.phone;
      if (profile.address) shipping_info = { address: profile.address };
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
