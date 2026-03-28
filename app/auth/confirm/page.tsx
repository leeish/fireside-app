'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// Handles implicit flow magic links where tokens arrive in the URL fragment.
// The server never sees fragments so this client page picks them up.

export default function ConfirmPage() {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()

    // getSession() causes the Supabase client to parse the fragment and establish the session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        router.replace('/dashboard')
      } else {
        router.replace('/login?error=auth')
      }
    })
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50">
      <p className="text-stone-400 text-sm">Signing you in...</p>
    </div>
  )
}
