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
        client_id: quoteData.client_id || null,
        status: quoteData.status,
        orientation: quoteData.orientation,
        total_amount: quoteData.total_amount,
        valid_until: quoteData.valid_until,
        discount_amount: quoteData.discount_amount || 0,
        apply_iva: quoteData.apply_iva || false,
        iva_rate: quoteData.iva_rate || 0,
        tax_amount: quoteData.tax_amount || 0,
        custom_client_name: quoteData.custom_client_name || null,
        custom_client_document: quoteData.custom_client_document || null,
        custom_client_email: quoteData.custom_client_email || null,
        custom_client_phone: quoteData.custom_client_phone || null
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
      iva_rate: item.iva_rate || 0,
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

export async function getQuoteById(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('quotes')
    .select(`
      *,
      clients (
        name,
        document_number
      ),
      quote_items (*)
    `)
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching quote:', error);
    return null;
  }
  return data;
}

export async function updateQuote(id: string, quoteData: any, items: any[]) {
  const supabase = await createClient();
  
  try {
    // 1. Update quote
    const { error: quoteError } = await supabase
      .from('quotes')
      .update({
        client_id: quoteData.client_id || null,
        status: quoteData.status,
        orientation: quoteData.orientation,
        total_amount: quoteData.total_amount,
        valid_until: quoteData.valid_until,
        discount_amount: quoteData.discount_amount || 0,
        apply_iva: quoteData.apply_iva || false,
        iva_rate: quoteData.iva_rate || 0,
        tax_amount: quoteData.tax_amount || 0,
        custom_client_name: quoteData.custom_client_name || null,
        custom_client_document: quoteData.custom_client_document || null,
        custom_client_email: quoteData.custom_client_email || null,
        custom_client_phone: quoteData.custom_client_phone || null
      })
      .eq('id', id);

    if (quoteError) throw quoteError;

    // 2. Delete old items
    const { error: deleteError } = await supabase
      .from('quote_items')
      .delete()
      .eq('quote_id', id);

    if (deleteError) throw deleteError;

    // 3. Insert new items
    const itemsToInsert = items.map(item => ({
      quote_id: id,
      product_id: item.product_id || null,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
      iva_rate: item.iva_rate || 0,
      total_price: item.total_price
    }));

    const { error: itemsError } = await supabase
      .from('quote_items')
      .insert(itemsToInsert);

    if (itemsError) throw itemsError;

    revalidatePath('/admin/quotes');
    return { success: true, id };
  } catch (error: any) {
    console.error('Error updating quote:', error);
    return { success: false, error: error.message };
  }
}

export async function deleteQuote(id: string) {
  const supabase = await createClient();
  
  try {
    const { error } = await supabase
      .from('quotes')
      .delete()
      .eq('id', id);

    if (error) throw error;

    revalidatePath('/admin/quotes');
    return { success: true };
  } catch (error: any) {
    console.error('Error deleting quote:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================
// PROPOSALS ACTIONS
// ============================================================

export async function getProposals() {
  const supabase = await createClient();
  try {
    const { data, error } = await supabase
      .from('proposals')
      .select(`
        *,
        clients (
          name,
          document_number
        )
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Error fetching proposals:', err);
    return [];
  }
}

export async function getProposalById(id: string) {
  const supabase = await createClient();
  try {
    const { data, error } = await supabase
      .from('proposals')
      .select(`
        *,
        clients (
          name,
          document_number,
          document_type,
          email,
          phone
        )
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  } catch (err) {
    console.error('Error fetching proposal:', err);
    return null;
  }
}

export async function createProposal(data: any) {
  const supabase = await createClient();
  try {
    const { data: proposal, error } = await supabase
      .from('proposals')
      .insert({
        client_id: data.client_id || null,
        custom_client_name: data.custom_client_name || null,
        custom_client_document: data.custom_client_document || null,
        custom_client_email: data.custom_client_email || null,
        custom_client_phone: data.custom_client_phone || null,
        title: data.title,
        subtitle: data.subtitle,
        content: data.content,
        status: data.status || 'Borrador',
        ally_logo_url: data.ally_logo_url || null,
        background_image_url: data.background_image_url || null,
        background_opacity: data.background_opacity ?? 0.15
      })
      .select()
      .single();

    if (error) throw error;

    revalidatePath('/admin/quotes');
    return { success: true, id: proposal.id };
  } catch (err: any) {
    console.error('Error creating proposal:', err);
    return { success: false, error: err.message };
  }
}

export async function updateProposal(id: string, data: any) {
  const supabase = await createClient();
  try {
    const { error } = await supabase
      .from('proposals')
      .update({
        client_id: data.client_id || null,
        custom_client_name: data.custom_client_name || null,
        custom_client_document: data.custom_client_document || null,
        custom_client_email: data.custom_client_email || null,
        custom_client_phone: data.custom_client_phone || null,
        title: data.title,
        subtitle: data.subtitle,
        content: data.content,
        status: data.status,
        ally_logo_url: data.ally_logo_url || null,
        background_image_url: data.background_image_url || null,
        background_opacity: data.background_opacity ?? 0.15
      })
      .eq('id', id);

    if (error) throw error;

    revalidatePath('/admin/quotes');
    return { success: true, id };
  } catch (err: any) {
    console.error('Error updating proposal:', err);
    return { success: false, error: err.message };
  }
}

export async function deleteProposal(id: string) {
  const supabase = await createClient();
  try {
    const { error } = await supabase
      .from('proposals')
      .delete()
      .eq('id', id);

    if (error) throw error;

    revalidatePath('/admin/quotes');
    return { success: true };
  } catch (err: any) {
    console.error('Error deleting proposal:', err);
    return { success: false, error: err.message };
  }
}

// ============================================================
// COFFEE TECH SHEETS ACTIONS
// ============================================================

export interface CoffeeTechSheetData {
  id?: string;
  title: string;
  subtitle?: string;
  history_title?: string;
  history_text?: string;
  origin?: string;
  farm_name?: string;
  location?: string;
  altitude?: string;
  variety?: string;
  process?: string;
  roast_level?: string;
  sca_score?: number;
  sensory_profile?: string;
  acidity?: string;
  body?: string;
  sweetness?: string;
  image_url?: string;
  logo_url?: string;
  primary_color?: string;
  bg_color?: string;
  status?: string;
}

export async function getTechSheets() {
  const supabase = await createClient();
  try {
    const { data, error } = await supabase
      .from('coffee_tech_sheets')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Error fetching coffee_tech_sheets:', err);
    return [];
  }
}

export async function getTechSheetById(id: string) {
  const supabase = await createClient();
  try {
    const { data, error } = await supabase
      .from('coffee_tech_sheets')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  } catch (err) {
    console.error('Error fetching tech sheet:', err);
    return null;
  }
}

export async function createTechSheet(data: CoffeeTechSheetData) {
  const supabase = await createClient();
  try {
    const { data: sheet, error } = await supabase
      .from('coffee_tech_sheets')
      .insert({
        title: data.title,
        subtitle: data.subtitle || 'FICHA TÉCNICA',
        history_title: data.history_title || 'Historia',
        history_text: data.history_text || '',
        origin: data.origin || '',
        farm_name: data.farm_name || '',
        location: data.location || '',
        altitude: data.altitude || '',
        variety: data.variety || '',
        process: data.process || '',
        roast_level: data.roast_level || '',
        sca_score: data.sca_score || null,
        sensory_profile: data.sensory_profile || '',
        acidity: data.acidity || '',
        body: data.body || '',
        sweetness: data.sweetness || '',
        image_url: data.image_url || null,
        logo_url: data.logo_url || null,
        primary_color: data.primary_color || '#717861',
        bg_color: data.bg_color || '#f2f0eb',
        status: data.status || 'Publicado'
      })
      .select()
      .single();

    if (error) throw error;

    revalidatePath('/admin/quotes');
    return { success: true, id: sheet.id };
  } catch (err: any) {
    console.error('Error creating tech sheet:', err);
    return { success: false, error: err.message };
  }
}

export async function updateTechSheet(id: string, data: CoffeeTechSheetData) {
  const supabase = await createClient();
  try {
    const { error } = await supabase
      .from('coffee_tech_sheets')
      .update({
        title: data.title,
        subtitle: data.subtitle || 'FICHA TÉCNICA',
        history_title: data.history_title || 'Historia',
        history_text: data.history_text || '',
        origin: data.origin || '',
        farm_name: data.farm_name || '',
        location: data.location || '',
        altitude: data.altitude || '',
        variety: data.variety || '',
        process: data.process || '',
        roast_level: data.roast_level || '',
        sca_score: data.sca_score || null,
        sensory_profile: data.sensory_profile || '',
        acidity: data.acidity || '',
        body: data.body || '',
        sweetness: data.sweetness || '',
        image_url: data.image_url || null,
        logo_url: data.logo_url || null,
        primary_color: data.primary_color || '#717861',
        bg_color: data.bg_color || '#f2f0eb',
        status: data.status || 'Publicado'
      })
      .eq('id', id);

    if (error) throw error;

    revalidatePath('/admin/quotes');
    return { success: true, id };
  } catch (err: any) {
    console.error('Error updating tech sheet:', err);
    return { success: false, error: err.message };
  }
}

export async function deleteTechSheet(id: string) {
  const supabase = await createClient();
  try {
    const { error } = await supabase
      .from('coffee_tech_sheets')
      .delete()
      .eq('id', id);

    if (error) throw error;

    revalidatePath('/admin/quotes');
    return { success: true };
  } catch (err: any) {
    console.error('Error deleting tech sheet:', err);
    return { success: false, error: err.message };
  }
}


