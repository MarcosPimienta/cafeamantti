'use server';

// IVA choices for the manual order forms: Siigo's active IVA taxes (5%,
// 19%…), the general one and whether prices already include it.

import { createClient } from '@/utils/supabase/server';
import { checkIsAdmin } from '../../actions';
import { getSiigoClient, siigoConfigFromEnv } from '@/utils/siigo/api';
import { loadSiigoSettings } from '@/utils/siigo/server';
import type { TaxOption } from '@/utils/orders/tax';

export async function getOrderTaxSetup(): Promise<{ options: TaxOption[]; generalTaxId: number | null; pricesIncludeTax: boolean; error: string | null }> {
  if (!(await checkIsAdmin())) throw new Error('Unauthorized');
  const supabase = await createClient();
  const settings = await loadSiigoSettings(supabase);
  const base = { generalTaxId: settings.sales_tax_id ?? null, pricesIncludeTax: settings.manual_prices_include_tax !== false };
  if (!siigoConfigFromEnv()) return { ...base, options: [], error: 'Siigo no está configurado en el servidor.' };
  try {
    const taxes = await getSiigoClient().request<{ id: number; name: string; type?: string; percentage?: number; active?: boolean }[]>('GET', '/v1/taxes');
    const options = (taxes ?? [])
      .filter((t) => t.type === 'IVA' && t.active !== false)
      .map((t) => ({ id: t.id, name: t.name, rate: Number(t.percentage ?? 0) }))
      .sort((a, b) => a.rate - b.rate);
    return { ...base, options, error: null };
  } catch (err) {
    return { ...base, options: [], error: err instanceof Error ? err.message : String(err) };
  }
}
