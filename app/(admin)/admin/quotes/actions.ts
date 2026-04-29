'use server'

import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';

export async function getQuotes() {
  const supabase = await createClient();
  try {
    const { data, error } = await supabase
      .from('quotes')
      .select(`
        *,
        clients (
          name,
          document_number
        )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching quotes:', error);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error('Exception fetching quotes:', err);
    return [];
  }
}

export async function createQuote(quoteData: any, items: any[]) {
  const supabase = await createClient();
  
  try {
    // 1. Insert quote
    const { data: quote, error: quoteError } = await supabase
      .from('quotes')
      .insert({
        client_id: quoteData.client_id,
        status: quoteData.status,
        orientation: quoteData.orientation,
        total_amount: quoteData.total_amount,
        valid_until: quoteData.valid_until
      })
      .select()
      .single();

    if (quoteError) throw quoteError;

    // 2. Insert items
    const itemsToInsert = items.map(item => ({
      quote_id: quote.id,
      product_id: item.product_id || null,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total_price: item.total_price
    }));

    const { error: itemsError } = await supabase
      .from('quote_items')
      .insert(itemsToInsert);

    if (itemsError) throw itemsError;

    revalidatePath('/admin/quotes');
    return { success: true, id: quote.id };
  } catch (error: any) {
    console.error('Error creating quote:', error);
    return { success: false, error: error.message };
  }
}
