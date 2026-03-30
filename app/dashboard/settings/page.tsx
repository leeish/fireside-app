import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SettingsForm from './SettingsForm'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const [
    { data: profile },
    { data: recentUsage },
    { data: monthUsage },
    { data: pricing },
  ] = await Promise.all([
    supabase.from('users').select('display_name, cadence, is_active').eq('id', user.id).single(),
    supabase.from('token_usage').select('id, inngest_function, model, input_tokens, output_tokens, purpose, created_at, conversation_id').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20),
    supabase.from('token_usage').select('input_tokens, output_tokens, model').eq('user_id', user.id).gte('created_at', monthStart),
    supabase.from('model_pricing').select('model, input_per_1m, output_per_1m').is('active_to', null),
  ])

  function getCost(inputTokens: number, outputTokens: number, model: string): number {
    const p = (pricing ?? []).find(r => r.model === model)
    if (!p) return 0
    return (inputTokens / 1_000_000 * Number(p.input_per_1m)) + (outputTokens / 1_000_000 * Number(p.output_per_1m))
  }

  const monthTotalTokens = (monthUsage ?? []).reduce((sum, r) => sum + r.input_tokens + r.output_tokens, 0)
  const monthTotalCost = (monthUsage ?? []).reduce((sum, r) => sum + getCost(r.input_tokens, r.output_tokens, r.model), 0)

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
        recentUsage={(recentUsage ?? []).map(r => ({ ...r, cost: getCost(r.input_tokens, r.output_tokens, r.model) }))}
        monthTotalTokens={monthTotalTokens}
        monthTotalCost={monthTotalCost}
      />
    </div>
  )
}
