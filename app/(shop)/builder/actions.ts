'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function createSubscription(formData: FormData) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('User not authenticated')
  }

  const plan_id = formData.get('plan_id') as string
  const frequency = formData.get('frequency') as string
  const weight = formData.get('weight') as string
  const grind = formData.get('grind') as string
  const grind_level = formData.get('grind_level') as string

  const { error } = await supabase.from('subscriptions').insert({
    user_id: user.id,
    plan_id,
    frequency,
    weight,
    grind,
    grind_level: grind === 'ground' ? grind_level : null,
    status: 'active',
    next_delivery_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // Placeholder: next week
  })

  if (error) {
    console.error('Error creating subscription:', error)
    return { error: 'Failed to create subscription' }
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

  const { error } = await supabase
    .from('subscriptions')
    .delete()
    .eq('id', subscriptionId)

  if (error) {
    console.error('Error deleting subscription:', error)
    return { error: 'Failed to delete subscription' }
  }

  revalidatePath('/dashboard')
}
