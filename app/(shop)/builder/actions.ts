'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function getSubscription(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error) {
    console.error('Error fetching subscription:', error)
    return null
  }
  return data
}

export async function getSubscriptionStock() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('inventory')
    .select('id, product_code, product_name, current_stock')
    .in('category', ['cafe'])

  if (error) {
    console.error('Error fetching inventory stock:', error)
    return {}
  }

  const stockMap: Record<string, number> = {}
  for (const item of data || []) {
    stockMap[item.product_code] = Number(item.current_stock || 0)
    stockMap[item.id] = Number(item.current_stock || 0)
  }
  return stockMap
}

export async function upsertSubscription(formData: FormData, subscriptionId?: string | null) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'User not authenticated' }
  }

  const plan_id = formData.get('plan_id') as string
  const frequency = formData.get('frequency') as string
  const weight = formData.get('weight') as string
  const grind = formData.get('grind') as string
  const grind_level = formData.get('grind_level') as string
  const custom_items_raw = formData.get('custom_items') as string
  
  let custom_items: any[] = [];
  if (custom_items_raw) {
    try {
      custom_items = JSON.parse(custom_items_raw);
    } catch (e) {
      console.error('Failed to parse custom_items:', e);
    }
  }

  const shipping_state = formData.get('shipping_state') as string
  const shipping_city = formData.get('shipping_city') as string
  const shipping_address = formData.get('shipping_address') as string
  const shipping_details = formData.get('shipping_details') as string

  const subscriptionData = {
    user_id: user.id,
    plan_id,
    frequency,
    weight,
    grind,
    grind_level: grind === 'ground' ? grind_level : null,
    custom_items,
    shipping_state,
    shipping_city,
    shipping_address,
    shipping_details,
    status: 'active',
  };

  let result;
  if (subscriptionId) {
    result = await supabase
      .from('subscriptions')
      .update({
        ...subscriptionData,
        payment_status: 'pending',
        updated_at: new Date().toISOString()
      })
      .eq('id', subscriptionId)
      .eq('user_id', user.id)
      .select('id')
      .single();
  } else {
    result = await supabase
      .from('subscriptions')
      .insert({
        ...subscriptionData,
        payment_status: 'pending',
        next_delivery_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select('id')
      .single();
  }

  if (result.error) {
    console.error('Error in upsertSubscription:', result.error)
    return { error: result.error.message }
  }

  revalidatePath('/dashboard')
  return { success: true, subscriptionId: result.data?.id || subscriptionId }
}

export async function updateSubscriptionStatus(subscriptionId: string, status: 'active' | 'paused' | 'cancelled') {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'User not authenticated' }
  }

  const { error } = await supabase
    .from('subscriptions')
    .update({ status })
    .eq('id', subscriptionId)
    .eq('user_id', user.id)

  if (error) {
    console.error('Error updating subscription status:', error)
    return { error: 'Failed to update status' }
  }

  revalidatePath('/dashboard')
}

export async function deleteSubscription(subscriptionId: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return { error: 'User not authenticated' }
  }

  console.log('[DEBUG] Attempting to delete subscription:', { 
    subscriptionId, 
    userId: user.id 
  })

  const { error, count } = await supabase
    .from('subscriptions')
    .delete({ count: 'exact' })
    .eq('id', subscriptionId)
    .eq('user_id', user.id)

  console.log('[DEBUG] Delete operation result:', { error, count })

  if (error) {
    console.error('Error deleting subscription:', error)
    return { error: 'Failed to delete subscription' }
  }

  revalidatePath('/dashboard')
}
