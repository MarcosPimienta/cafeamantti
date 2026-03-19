'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

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

  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const firstName = formData.get('firstName') as string
  const lastName = formData.get('lastName') as string
  const phone = formData.get('phone') as string
  const cedula = formData.get('cedula') as string
  const address = formData.get('address') as string
  
  const redirectTo = (formData.get('redirectTo') as string) || '/dashboard'

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        first_name: firstName,
        last_name: lastName,
        phone,
        cedula,
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
