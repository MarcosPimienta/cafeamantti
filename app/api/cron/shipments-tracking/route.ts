import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { syncOpenShipments } from '@/utils/shipmentTracking';

// Checks the status of every shipment not yet delivered with its carrier
// (DHL, FedEx) and stores the new scans. Runs every 8 hours from GitHub
// Actions (.github/workflows/shipments-tracking.yml): the Vercel Hobby plan
// only allows daily crons.
//
//   Authorization: Bearer <CRON_SECRET>

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // No user session here: the service role reads and writes the shipments.
  const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  try {
    const summary = await syncOpenShipments(supabaseAdmin);
    return NextResponse.json(summary);
  } catch (err) {
    console.error('cron shipments-tracking error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 });
  }
}
