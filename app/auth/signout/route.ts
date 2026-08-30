import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  await supabase.auth.signOut()

  const { origin } = new URL(request.url)
  revalidatePath('/', 'layout')
  return NextResponse.redirect(`${origin}/login`, {
    status: 302,
  })
}
