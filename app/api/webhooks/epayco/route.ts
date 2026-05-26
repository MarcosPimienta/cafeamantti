import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: Request) {
  try {
    const data = await req.json();

    const p_cust_id = process.env.EPAYCO_P_CUST_ID || '';
    const p_key = process.env.EPAYCO_P_KEY || '';
    
    // ePayco webhook validation parameters
    const x_ref_payco = data.x_ref_payco;
    const x_transaction_id = data.x_transaction_id;
    const x_amount = data.x_amount;
    const x_currency_code = data.x_currency_code;
    const x_signature = data.x_signature;
    
    // Validate signature to ensure the request is from ePayco
    const signature = crypto.createHash('sha256')
      .update(`${p_cust_id}^${p_key}^${x_ref_payco}^${x_transaction_id}^${x_amount}^${x_currency_code}`)
      .digest('hex');

    if (signature !== x_signature) {
      console.error('Invalid ePayco Signature');
      return NextResponse.json({ error: 'Firma no válida' }, { status: 400 });
    }

    const orderId = data.x_id_invoice; 
    const state = parseInt(data.x_cod_transaction_state, 10);
    
    // state: 1 (Aceptada), 2 (Rechazada), 3 (Pendiente), 4 (Fallida), 6 (Reversada)
    let newStatus = 'pending';
    if (state === 1) {
      newStatus = 'paid';
    } else if (state === 2 || state === 4 || state === 6) {
      newStatus = 'cancelled';
    }
    
    // Initialize Supabase Admin client to bypass RLS in the webhook
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    if (newStatus !== 'pending') {
      const { error } = await supabaseAdmin
        .from('orders')
        .update({ status: newStatus })
        .eq('id', orderId);
        
      if (error) {
        console.error('Error updating order:', error);
        return NextResponse.json({ error: 'Error interno al actualizar pedido' }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, message: 'Estado actualizado' });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Error procesando webhook' }, { status: 500 });
  }
}
