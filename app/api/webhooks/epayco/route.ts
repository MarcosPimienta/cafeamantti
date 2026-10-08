import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

/**
 * ePayco posts its confirmation as a form (application/x-www-form-urlencoded);
 * accept JSON too.
 */
async function readPayload(req: Request): Promise<Record<string, string>> {
  const type = req.headers.get('content-type') || '';
  if (type.includes('application/json')) return await req.json();
  const text = await req.text();
  return Object.fromEntries(new URLSearchParams(text));
}

/** Amounts are compared in whole pesos; ePayco sends them as "93000.00". */
function sameAmount(a: unknown, b: unknown) {
  return Math.abs(Math.round(Number(a)) - Math.round(Number(b))) <= 1;
}

export async function POST(req: Request) {
  try {
    const data = await readPayload(req);

    const p_cust_id = process.env.P_CUST_ID_CLIENTE || '';
    const p_key = process.env.P_KEY || '';
    
    // ePayco webhook validation parameters
    const x_ref_payco = data.x_ref_payco;
    const x_transaction_id = data.x_transaction_id;
    const x_amount = data.x_amount;
    const x_currency_code = data.x_currency_code;
    const x_signature = data.x_signature;
    
    // Only ePayco can mark orders paid: the signature is mandatory. Without
    // keys configured nothing can be verified, so nothing is accepted.
    if (!p_cust_id || !p_key) {
      console.error('ePayco webhook: P_CUST_ID_CLIENTE / P_KEY not configured');
      return NextResponse.json({ error: 'Webhook no configurado' }, { status: 500 });
    }
    const expected = crypto.createHash('sha256')
      .update(`${p_cust_id}^${p_key}^${x_ref_payco}^${x_transaction_id}^${x_amount}^${x_currency_code}`)
      .digest('hex');
    const given = String(x_signature || '');
    if (
      given.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected))
    ) {
      console.error('Invalid ePayco Signature');
      return NextResponse.json({ error: 'Firma no válida' }, { status: 400 });
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
    
    // A payment only settles the order it was meant for: the amount must match.
    if (newStatus === 'paid') {
      const { data: order } = await supabaseAdmin
        .from('orders')
        .select('total_amount')
        .eq('id', orderId)
        .single();
      if (!order) {
        return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
      }
      if (!sameAmount(order.total_amount, x_amount)) {
        console.error(`ePayco amount mismatch for order ${orderId}: paid ${x_amount}, expected ${order.total_amount}`);
        return NextResponse.json({ error: 'El monto pagado no coincide con el pedido' }, { status: 400 });
      }
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

