'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function getSubscription(id: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    console.error('Error fetching subscription:', error)
    return null
  }
  return data
}

export async function upsertSubscription(formData: FormData, subscriptionId?: string | null) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('User not authenticated')
  }

  const plan_id = formData.get('plan_id') as string
  const frequency = formData.get('frequency') as string
  const weight = formData.get('weight') as string
  const grind = formData.get('grind') as string
  const grind_level = formData.get('grind_level') as string
  
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
        updated_at: new Date().toISOString()
      })
      .eq('id', subscriptionId)
      .eq('user_id', user.id);
  } else {
    result = await supabase
      .from('subscriptions')
      .insert({
        ...subscriptionData,
        next_delivery_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });
  }

  if (result.error) {
    console.error('Error in upsertSubscription:', result.error)
    return { error: result.error.message }
  }

  revalidatePath('/dashboard')
  redirect('/dashboard')
}

export async function updateSubscriptionStatus(subscriptionId: string, status: 'active' | 'paused' | 'cancelled') {
  const supabase = await createClient()

  const { error } = await supabase
    .from('subscriptions')
    .update({ status })
    .eq('id', subscriptionId)

  if (error) {
    console.error('Error updating subscription status:', error)
    return { error: 'Failed to update status' }
  }

  revalidatePath('/dashboard')
}

export async function deleteSubscription(subscriptionId: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  console.log('[DEBUG] Attempting to delete subscription:', { 
    subscriptionId, 
    userId: user?.id 
  })

  const { error, count } = await supabase
    .from('subscriptions')
    .delete({ count: 'exact' })
    .eq('id', subscriptionId)

  console.log('[DEBUG] Delete operation result:', { error, count })

  if (error) {
    console.error('Error deleting subscription:', error)
    return { error: 'Failed to delete subscription' }
  }

  revalidatePath('/dashboard')
}
