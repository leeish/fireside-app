import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SettingsForm from './SettingsForm'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('display_name, cadence, is_active, anthropic_api_key, anthropic_api_key_status, title_style, pronouns')
    .eq('id', user.id)
    .single()

  return (
    <div className="max-w-xl mx-auto px-4 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-display font-semibold text-foreground">Settings</h1>
        <p className="text-muted-fg text-sm mt-1">Manage your account and delivery preferences.</p>
      </div>
      <SettingsForm
        displayName={profile?.display_name ?? ''}
        email={user.email ?? ''}
        cadence={profile?.cadence ?? 'weekly'}
        isActive={profile?.is_active ?? true}
        hasApiKey={!!profile?.anthropic_api_key}
        apiKeyStatus={profile?.anthropic_api_key_status ?? null}
        titleStyle={profile?.title_style ?? 'simple'}
        pronouns={profile?.pronouns ?? null}
      />
    </div>
  )
}
