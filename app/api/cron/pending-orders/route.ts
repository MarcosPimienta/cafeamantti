import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendWhatsApp } from '@/utils/whatsapp';
import { buildPendingDeliveriesMessage, getPendingDeliveries } from '@/utils/orders/pendingDeliveries';

// Daily WhatsApp summary of orders still to deliver.
//
// Called by a scheduler (Vercel Cron, cron-job.org, GitHub Actions…) with
//   Authorization: Bearer <CRON_SECRET>
// Vercel Cron sends that header automatically when CRON_SECRET is set.
// `?force=1` also sends when nothing is pending (default: stay quiet).

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // No user session here: read orders with the service role.
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const pending = await getPendingDeliveries(supabaseAdmin);
    const force = new URL(req.url).searchParams.get('force') === '1';
    if (pending.length === 0 && !force) {
      return NextResponse.json({ sent: false, reason: 'Sin órdenes pendientes', pending: 0 });
    }

    const message = buildPendingDeliveriesMessage(pending);
    const result = await sendWhatsApp(message);

    await supabaseAdmin.from('notification_logs').insert({
      channel: 'whatsapp',
      kind: 'pending_deliveries',
      trigger: 'cron',
      recipients: result.recipients,
      message,
      success: result.success,
      error: result.error ?? null,
    });

    return NextResponse.json(
      { sent: result.success, pending: pending.length, recipients: result.recipients, error: result.error },
      { status: result.success ? 200 : 502 }
    );
  } catch (err) {
    console.error('cron pending-orders error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 });
  }
}
