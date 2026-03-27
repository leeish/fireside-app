'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const INTERESTS = [
  'Family history', 'Music', 'Sports', 'Outdoors & hiking', 'Travel', 'Reading',
  'Cooking', 'Service & volunteering', 'Business', 'Art & creativity', 'Technology',
]

const STEPS = ['Welcome', 'Your story']

export default function OnboardingPage() {
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [interests, setInterests] = useState<string[]>([])

  function toggleInterest(interest: string) {
    setInterests(prev =>
      prev.includes(interest) ? prev.filter(i => i !== interest) : [...prev, interest]
    )
  }

  function canAdvance() {
    if (step === 0) return name.trim().length > 0
    return true
  }

  async function finish() {
    setSaving(true)
    setError('')
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setError('Session expired. Please sign in again.'); setSaving(false); return }

      // Upsert — creates the row if the auth trigger didn't, updates if it did
      const { error } = await supabase
        .from('users')
        .upsert({
          id: user.id,
          email: user.email!,
          display_name: name.trim(),
          onboarding_profile: { interests },
        }, { onConflict: 'id' })

      if (error) { setError(error.message); setSaving(false); return }

      window.location.href = '/dashboard'
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unexpected error')
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">

        {/* Progress */}
        <div className="flex gap-1.5 mb-8">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? 'bg-amber-600' : 'bg-stone-200'}`}
            />
          ))}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-8">

          {step === 0 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-semibold text-stone-800">Welcome to Fireside</h2>
                <p className="text-stone-500 text-sm mt-1">Let's get you set up in about 30 seconds.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">What should we call you?</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && canAdvance()) setStep(1) }}
                  placeholder="First name"
                  autoFocus
                  className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-semibold text-stone-800">What's your life built around, {name}?</h2>
                <p className="text-stone-500 text-sm mt-1">Pick a few — we'll make sure to ask about these.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {INTERESTS.map(interest => (
                  <button
                    key={interest}
                    type="button"
                    onClick={() => toggleInterest(interest)}
                    className={`py-1.5 px-3 rounded-full text-sm border transition-colors ${
                      interests.includes(interest)
                        ? 'bg-amber-600 text-white border-amber-600'
                        : 'border-stone-300 text-stone-700 hover:border-amber-400'
                    }`}
                  >
                    {interest}
                  </button>
                ))}
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
          )}

          <div className="flex gap-3 mt-8">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep(s => s - 1)}
                className="flex-1 py-2 border border-stone-300 text-stone-700 text-sm font-medium rounded-lg hover:bg-stone-50 transition-colors"
              >
                Back
              </button>
            )}
            {step < STEPS.length - 1 ? (
              <button
                type="button"
                onClick={() => setStep(s => s + 1)}
                disabled={!canAdvance()}
                className="flex-1 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg disabled:opacity-40 transition-colors"
              >
                Continue
              </button>
            ) : (
              <button
                type="button"
                onClick={finish}
                disabled={saving}
                className="flex-1 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving…' : 'Start my story'}
              </button>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
