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
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
            </svg>
          </div>
          <h2 className="text-2xl font-display font-semibold text-foreground">Check your inbox</h2>
          <p className="text-muted-fg text-sm leading-relaxed">
            We sent a sign-in link to <span className="text-foreground font-medium">{email}</span>. Click it to continue.
          </p>
          <button
            onClick={() => setSent(false)}
            className="text-sm text-primary hover:opacity-70 transition-opacity duration-300"
          >
            Use a different email
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">

        <div className="text-center mb-10">
          <h1 className="text-4xl font-display font-semibold text-foreground tracking-tight">
            Fire<em>side</em>
          </h1>
          <p className="text-muted-fg text-sm mt-2 leading-relaxed">
            Your family story, told one question at a time.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-card rounded-3xl border border-border p-8 space-y-5"
          style={{ boxShadow: '0 10px 40px -10px rgba(93, 112, 82, 0.12)' }}
        >
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Email address</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoFocus
              className="w-full h-12 px-5 bg-white/50 border border-border rounded-full text-sm text-foreground placeholder:text-muted-fg/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all duration-300"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 bg-primary hover:bg-primary/90 text-white text-sm font-semibold rounded-full hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100 transition-all duration-300"
            style={{ boxShadow: '0 4px 20px -2px rgba(93, 112, 82, 0.20)' }}
          >
            {loading ? 'Sending link...' : 'Send sign-in link'}
          </button>
        </form>

        <p className="text-center text-xs text-muted-fg mt-5">
          New or returning — same flow. No password needed.
        </p>
        <p className="text-center text-xs text-muted-fg/70 mt-2">
          By signing in you agree to our{' '}
          <a href="/terms" className="underline hover:text-foreground transition-colors duration-300">Terms</a>
          {' '}and{' '}
          <a href="/privacy" className="underline hover:text-foreground transition-colors duration-300">Privacy Policy</a>.
        </p>

      </div>
    </div>
  )
}
