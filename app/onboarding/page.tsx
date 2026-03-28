'use client'

import { useState } from 'react'
import ThemeToggle from '@/app/components/ThemeToggle'

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
      const res = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: name.trim(),
          onboardingProfile: { interests },
        }),
      })

      if (!res.ok) {
        const body = await res.json()
        setError(body.error ?? 'Something went wrong')
        setSaving(false)
        return
      }

      window.location.href = '/dashboard'
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unexpected error')
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="fixed top-4 right-4"><ThemeToggle /></div>
      <div className="w-full max-w-md">

        {/* Progress dots */}
        <div className="flex gap-1.5 mb-8">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors duration-500 ${i <= step ? 'bg-primary' : 'bg-border'}`}
            />
          ))}
        </div>

        <div
          className="bg-card rounded-3xl border border-border p-8"
          style={{ boxShadow: '0 10px 40px -10px rgba(93, 112, 82, 0.12)' }}
        >

          {step === 0 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-display font-semibold text-foreground">Welcome to Fire<em>side</em></h2>
                <p className="text-muted-fg text-sm mt-1">Let's get you set up in about 30 seconds.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">What should we call you?</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && canAdvance()) setStep(1) }}
                  placeholder="First name"
                  autoFocus
                  className="w-full h-12 px-5 border border-border rounded-full text-sm text-foreground placeholder:text-muted-fg/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all duration-300"
                style={{ backgroundColor: 'var(--fs-surface)' }}
                />
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-display font-semibold text-foreground">What's your life built around, {name}?</h2>
                <p className="text-muted-fg text-sm mt-1">Pick a few — we'll make sure to ask about these.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {INTERESTS.map(interest => (
                  <button
                    key={interest}
                    type="button"
                    onClick={() => toggleInterest(interest)}
                    className={`py-1.5 px-4 rounded-full text-sm border transition-all duration-300 ${
                      interests.includes(interest)
                        ? 'bg-primary text-white border-primary'
                        : 'border-border text-foreground/80 hover:border-primary/50 hover:text-foreground'
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
                className="flex-1 h-12 border-2 border-border text-foreground/80 text-sm font-medium rounded-full hover:border-primary/40 hover:bg-muted transition-all duration-300"
              >
                Back
              </button>
            )}
            {step < STEPS.length - 1 ? (
              <button
                type="button"
                onClick={() => setStep(s => s + 1)}
                disabled={!canAdvance()}
                className="flex-1 h-12 bg-primary hover:bg-primary/90 text-white text-sm font-semibold rounded-full hover:scale-105 active:scale-95 disabled:opacity-40 disabled:scale-100 transition-all duration-300"
              >
                Continue
              </button>
            ) : (
              <button
                type="button"
                onClick={finish}
                disabled={saving}
                className="flex-1 h-11 bg-primary hover:opacity-90 text-white text-sm font-medium rounded-full disabled:opacity-50 transition-all duration-300"
              >
                {saving ? 'Saving...' : 'Start my story'}
              </button>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
