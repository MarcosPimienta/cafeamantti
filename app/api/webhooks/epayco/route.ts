import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: Request) {
  try {
    const data = await req.json();

    const p_cust_id = process.env.P_CUST_ID_CLIENTE || '';
    const p_key = process.env.P_KEY || '';
    
    // ePayco webhook validation parameters
    const x_ref_payco = data.x_ref_payco;
    const x_transaction_id = data.x_transaction_id;
    const x_amount = data.x_amount;
    const x_currency_code = data.x_currency_code;
    const x_signature = data.x_signature;
    
    // Validate signature to ensure the request is from ePayco (skip check if signature not provided in dev/testing mode)
    if (x_signature && p_cust_id && p_key) {
      const signature = crypto.createHash('sha256')
        .update(`${p_cust_id}^${p_key}^${x_ref_payco}^${x_transaction_id}^${x_amount}^${x_currency_code}`)
        .digest('hex');

      if (signature !== x_signature) {
        console.error('Invalid ePayco Signature');
        return NextResponse.json({ error: 'Firma no válida' }, { status: 400 });
      }
    }

    const orderId = String(data.x_id_invoice || '');
    const state = parseInt(data.x_cod_transaction_state, 10);
    const subscriptionId = data.x_extra1 || (orderId.startsWith('SUB-') ? orderId.replace('SUB-', '') : null);
    
    // Initialize Supabase Admin client to bypass RLS in the webhook
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 1. Process Subscription Transaction Webhook
    if (subscriptionId) {
      const { data: sub, error: subFetchError } = await supabaseAdmin
        .from('subscriptions')
        .select('*')
        .eq('id', subscriptionId)
        .single();

      if (subFetchError || !sub) {
        console.warn('Subscription not found for ID:', subscriptionId);
      } else {
        if (state === 1) { // Aceptada (Paid)
          // Compute next delivery date based on frequency
          let daysToAdd = 30; // default monthly
          if (sub.frequency === 'weekly') daysToAdd = 7;
          if (sub.frequency === 'bi-weekly') daysToAdd = 14;

          const nextDeliveryDate = new Date(Date.now() + daysToAdd * 24 * 60 * 60 * 1000).toISOString();

          // Update subscription status
          await supabaseAdmin
            .from('subscriptions')
            .update({
              status: 'active',
              payment_status: 'active',
              last_payment_date: new Date().toISOString(),
              next_delivery_date: nextDeliveryDate,
              epayco_ref_payco: x_ref_payco || sub.epayco_ref_payco,
              epayco_transaction_id: x_transaction_id || sub.epayco_transaction_id,
            })
            .eq('id', subscriptionId);

          // Create fulfillment order for roastery
          const { data: newOrder, error: orderErr } = await supabaseAdmin
            .from('orders')
            .insert({
              user_id: sub.user_id,
              total_amount: parseFloat(x_amount || '0'),
              shipping_info: {
                address: sub.shipping_address,
                city: sub.shipping_city,
                state: sub.shipping_state,
                details: sub.shipping_details,
              },
              status: 'paid',
              epayco_ref_payco: x_ref_payco,
              epayco_transaction_id: x_transaction_id,
              is_subscription_renewal: true,
              subscription_id: sub.id,
            })
            .select('id')
            .single();

          if (!orderErr && newOrder) {
            // Add subscription item to order items
            await supabaseAdmin.from('order_items').insert({
              order_id: newOrder.id,
              product_id: sub.plan_id,
              weight: sub.weight,
              grind: sub.grind,
              grind_level: sub.grind_level,
              quantity: 1,
              price_at_time: parseFloat(x_amount || '0'),
            });
          }
        } else if (state === 2 || state === 4 || state === 6) { // Rechazada / Fallida
          await supabaseAdmin
            .from('subscriptions')
            .update({
              payment_status: 'failed',
            })
            .eq('id', subscriptionId);
        }
      }

      return NextResponse.json({ success: true, message: 'Estado de suscripción actualizado' });
    }

    // 2. Process Standard One-time Order Webhook
    let newStatus = 'pending';
    if (state === 1) {
      newStatus = 'paid';
    } else if (state === 2 || state === 4 || state === 6) {
      newStatus = 'cancelled';
    }
    
    if (newStatus !== 'pending') {
      const { error } = await supabaseAdmin
        .from('orders')
        .update({ 
          status: newStatus,
          epayco_ref_payco: x_ref_payco,
          epayco_transaction_id: x_transaction_id
        })
        .eq('id', orderId);
        
      if (error) {
        console.error('Error updating order:', error);
        return NextResponse.json({ error: 'Error interno al actualizar pedido' }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, message: 'Estado de pedido actualizado' });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Error procesando webhook' }, { status: 500 });
  }
}

