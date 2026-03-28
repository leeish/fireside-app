import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SettingsForm from './SettingsForm'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('display_name, cadence, is_active')
    .eq('id', user.id)
    .single()

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="max-w-xl mx-auto px-4 py-10">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-stone-800">Settings</h1>
            <p className="text-stone-500 text-sm mt-1">Manage your account and delivery preferences.</p>
          </div>
          <a href="/dashboard" className="text-sm text-amber-600 hover:underline">Back to dashboard</a>
        </div>
        <SettingsForm
          displayName={profile?.display_name ?? ''}
          email={user.email ?? ''}
          cadence={profile?.cadence ?? 'weekly'}
          isActive={profile?.is_active ?? true}
        />
      </div>
    </div>
  )
}
