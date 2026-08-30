'use server'

import { createClient } from '@/utils/supabase/server'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'

const emailSchema = z.object({
  email: z.string().email({ message: 'Ingresa un correo electrónico válido' }),
})

const passwordSchema = z.object({
  password: z.string().min(6, { message: 'La contraseña debe tener al menos 6 caracteres' }),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Las contraseñas no coinciden',
  path: ['confirmPassword'],
})

export async function requestPasswordReset(prevState: any, formData: FormData) {
  const email = formData.get('email') as string
  const website = formData.get('website') as string // honeypot

  if (website) {
    // Silently ignore bots
    return { success: true }
  }

  const result = emailSchema.safeParse({ email })
  if (!result.success) {
    return { error: result.error.issues[0].message }
  }

  const headersList = await headers()
  const host = headersList.get('x-forwarded-host') || headersList.get('host') || 'localhost:3000'
  const protocol = headersList.get('x-forwarded-proto') || (process.env.NODE_ENV === 'production' ? 'https' : 'http')
  const origin = `${protocol}://${host}`

  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(result.data.email, {
    redirectTo: `${origin}/auth/callback?next=/recovery/reset-password`,
  })

  if (error) {
    return { error: error.message }
  }

  return { success: true }
}

export async function updatePassword(prevState: any, formData: FormData) {
  const password = formData.get('password') as string
  const confirmPassword = formData.get('confirmPassword') as string

  const result = passwordSchema.safeParse({ password, confirmPassword })
  if (!result.success) {
    return { error: result.error.issues[0].message }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({
    password: result.data.password,
  })

  if (error) {
    return { error: error.message }
  }

  redirect('/dashboard')
}
