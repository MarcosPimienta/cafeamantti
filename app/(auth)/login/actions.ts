'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

import { z } from 'zod'

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  firstName: z.string().min(2).transform(val => val.replace(/<[^>]*>?/gm, '')),
  lastName: z.string().min(2).transform(val => val.replace(/<[^>]*>?/gm, '')),
  phone: z.string().regex(/^(\+57)?\s?\d{10}$/),
  address: z.string().min(5).transform(val => val.replace(/<[^>]*>?/gm, '')),
})

export async function login(formData: FormData) {
  const supabase = await createClient()

  const data = {
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  }

  const redirectTo = (formData.get('redirectTo') as string) || '/dashboard'

  const { error } = await supabase.auth.signInWithPassword(data)

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/', 'layout')
  redirect(redirectTo)
}

export async function signup(formData: FormData) {
  const supabase = await createClient()

  const rawData = {
    email: formData.get('email') as string,
    password: formData.get('password') as string,
    firstName: formData.get('firstName') as string,
    lastName: formData.get('lastName') as string,
    phone: formData.get('phone') as string,
    address: formData.get('address') as string,
    website: formData.get('website') as string,
  }

  // Honeypot check
  if (rawData.website) {
    // If the honeypot field is filled, silently ignore to trick the bot
    const redirectTo = (formData.get('redirectTo') as string) || '/dashboard'
    redirect(redirectTo)
  }

  // Server-side validation and sanitization
  const result = signupSchema.safeParse(rawData)
  if (!result.success) {
    const errorMsg = result.error.issues[0].message
    redirect(`/login?error=${encodeURIComponent(errorMsg)}`)
  }

  const { email, password, firstName, lastName, phone, address } = result.data
  
  const redirectTo = (formData.get('redirectTo') as string) || '/dashboard'

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        first_name: firstName,
        last_name: lastName,
        phone,
        address,
      }
    }
  })

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/', 'layout')
  redirect(redirectTo)
}
export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/')
}
