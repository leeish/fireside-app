'use client'

import { useState } from 'react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const res = await fetch('/api/auth/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })

    if (!res.ok) {
      const body = await res.json()
      setError(body.error ?? 'Something went wrong')
      setLoading(false)
      return
    }

    setSent(true)
  }

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="w-full max-w-sm text-center space-y-3">
          <h1 className="text-2xl font-semibold text-stone-800">Check your email</h1>
          <p className="text-stone-500 text-sm">
            We sent a sign-in link to <strong>{email}</strong>. Click it to continue.
          </p>
          <button
            onClick={() => setSent(false)}
            className="text-sm text-amber-600 hover:underline"
          >
            Use a different email
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-stone-800">Fireside</h1>
          <p className="text-stone-500 text-sm mt-1">Your family story, told one question at a time.</p>
        </div>
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-stone-200 p-8 space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Email address</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoFocus
              className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
          >
            {loading ? 'Sending link…' : 'Send sign-in link'}
          </button>
        </form>
        <p className="text-center text-xs text-stone-400 mt-4">
          New or returning — same flow. No password needed.
        </p>
        <p className="text-center text-xs text-stone-400 mt-2">
          By signing in you agree to our{' '}
          <a href="/terms" className="underline hover:text-stone-600">Terms</a>
          {' '}and{' '}
          <a href="/privacy" className="underline hover:text-stone-600">Privacy Policy</a>.
        </p>
      </div>
    </div>
  )
}
