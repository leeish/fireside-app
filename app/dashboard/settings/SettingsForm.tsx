'use client'

import { useState } from 'react'
import Link from 'next/link'

type Props = {
  displayName: string
  email: string
  cadence: string
  isActive: boolean
  hasApiKey: boolean
  apiKeyStatus: string | null
  titleStyle: string
  pronouns: string | null
}

const PRONOUN_OPTIONS = [
  { value: 'he/him',   label: 'He/him' },
  { value: 'she/her',  label: 'She/her' },
  { value: 'they/them', label: 'They/them' },
]

const TITLE_STYLE_OPTIONS = [
  { value: 'simple',    label: 'Simple',    description: 'Plain language, no flourish — just what it\'s about' },
  { value: 'evocative', label: 'Evocative', description: 'Captures the heart of the memory with feeling' },
  { value: 'witty',     label: 'Witty',     description: 'A light touch of wordplay or dry humor' },
  { value: 'playful',   label: 'Playful',   description: 'Warm and approachable, like something you\'d say to a friend' },
  { value: 'poetic',    label: 'Poetic',    description: 'Imagery or metaphor that gives the title a timeless feel' },
]

const CADENCE_OPTIONS = [
  { value: 'weekly', label: 'Weekly', description: 'One prompt per week', premium: false },
  { value: 'few_per_week', label: 'Every few days', description: 'A prompt every 3 days', premium: true },
  { value: 'daily', label: 'Daily', description: 'A prompt every day', premium: true },
]

export default function SettingsForm({ displayName, email, cadence, isActive, hasApiKey, apiKeyStatus, titleStyle, pronouns }: Props) {
  const [name, setName] = useState(displayName)
  const [selectedCadence, setSelectedCadence] = useState(cadence)
  const [selectedTitleStyle, setSelectedTitleStyle] = useState(titleStyle)
  const [selectedPronouns, setSelectedPronouns] = useState<string | null>(pronouns)
  const [active, setActive] = useState(isActive)
  const [autosave, setAutosave] = useState(() => {
    if (typeof window === 'undefined') return true
    try {
      return localStorage.getItem('fireside_autosave') !== 'false'
    } catch {
      return true
    }
  })

  function toggleAutosave() {
    const next = !autosave
    setAutosave(next)
    localStorage.setItem('fireside_autosave', next ? 'true' : 'false')
  }
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const [apiKeyInput, setApiKeyInput] = useState('')
  const [savingKey, setSavingKey] = useState(false)
  const [keyError, setKeyError] = useState('')
  const [keySaved, setKeySaved] = useState(false)
  const [removingKey, setRemovingKey] = useState(false)
  const [localHasKey, setLocalHasKey] = useState(hasApiKey)
  const [localKeyStatus, setLocalKeyStatus] = useState(apiKeyStatus)

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    setError('')

    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        display_name: name.trim(),
        cadence: selectedCadence,
        is_active: active,
        title_style: selectedTitleStyle,
        pronouns: selectedPronouns,
      }),
    })

    if (!res.ok) {
      const body = await res.json()
      setError(body.error ?? 'Something went wrong')
    } else {
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    }
    setSaving(false)
  }

  async function handleSaveKey() {
    setSavingKey(true)
    setKeyError('')
    setKeySaved(false)
    const res = await fetch('/api/settings/api-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: apiKeyInput }),
    })
    if (!res.ok) {
      const body = await res.json()
      setKeyError(body.error ?? 'Something went wrong')
    } else {
      setLocalHasKey(true)
      setLocalKeyStatus('active')
      setApiKeyInput('')
      setKeySaved(true)
      setTimeout(() => setKeySaved(false), 3000)
    }
    setSavingKey(false)
  }

  async function handleRemoveKey() {
    setRemovingKey(true)
    const res = await fetch('/api/settings/api-key', { method: 'DELETE' })
    if (res.ok) {
      setLocalHasKey(false)
      setLocalKeyStatus(null)
    }
    setRemovingKey(false)
  }

  async function handleDelete() {
    setDeleting(true)
    setDeleteError('')

    const res = await fetch('/api/account', { method: 'DELETE' })

    if (!res.ok) {
      const body = await res.json()
      setDeleteError(body.error ?? 'Something went wrong')
      setDeleting(false)
      return
    }

    window.location.href = '/login'
  }

  return (
    <div className="space-y-5">

      {/* Account */}
      <section
        className="bg-card rounded-[2rem] border border-border/50 p-7 space-y-5"
        style={{ boxShadow: '0 4px 20px -4px rgba(93, 112, 82, 0.10)' }}
      >
        <h2 className="text-xs font-semibold text-muted-fg uppercase tracking-widest">Account</h2>
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Display name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full h-12 px-5 border border-border rounded-full text-sm text-foreground placeholder:text-muted-fg/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all duration-300"
            style={{ backgroundColor: 'var(--fs-surface)' }}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Email</label>
          <input
            type="email"
            value={email}
            disabled
            className="w-full h-12 px-5 border border-border rounded-full text-sm bg-muted text-muted-fg cursor-not-allowed"
          />
        </div>
      </section>

      {/* Delivery */}
      <section
        className="bg-card rounded-[2rem] border border-border/50 p-7 space-y-4"
        style={{ boxShadow: '0 4px 20px -4px rgba(93, 112, 82, 0.10)' }}
      >
        <h2 className="text-xs font-semibold text-muted-fg uppercase tracking-widest">Delivery</h2>

        <div className="space-y-2">
          {CADENCE_OPTIONS.map(opt => (
            <label
              key={opt.value}
              className={`flex items-center justify-between p-4 rounded-2xl border cursor-pointer transition-all duration-300 ${
                selectedCadence === opt.value
                  ? 'border-primary/40 bg-primary/5'
                  : 'border-border/60 hover:border-primary/30'
              }`}
            >
              <div className="flex items-center gap-3">
                <input
                  type="radio"
                  name="cadence"
                  value={opt.value}
                  checked={selectedCadence === opt.value}
                  onChange={() => setSelectedCadence(opt.value)}
                  className="accent-primary"
                />
                <div>
                  <span className="text-sm font-medium text-foreground">{opt.label}</span>
                  <p className="text-xs text-muted-fg">{opt.description}</p>
                </div>
              </div>
              {opt.premium && (
                <span className="text-xs font-semibold text-secondary bg-secondary/10 px-3 py-1 rounded-full">
                  Beta
                </span>
              )}
            </label>
          ))}
        </div>

        <div className="flex items-center justify-between gap-4 pt-4 border-t border-border/40">
          <div>
            <p className="text-sm font-medium text-foreground">Pause deliveries</p>
            <p className="text-xs text-muted-fg mt-0.5">No prompts will be sent while paused</p>
          </div>
          <button
            type="button"
            onClick={() => setActive(a => !a)}
            className={`relative inline-flex shrink-0 h-6 w-11 items-center rounded-full transition-colors duration-300 ${
              !active ? 'bg-primary' : 'bg-border'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-300 ${
                !active ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </section>

      {/* Writing */}
      <section
        className="bg-card rounded-[2rem] border border-border/50 p-7 space-y-4"
        style={{ boxShadow: '0 4px 20px -4px rgba(93, 112, 82, 0.10)' }}
      >
        <h2 className="text-xs font-semibold text-muted-fg uppercase tracking-widest">Writing</h2>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-foreground">Autosave drafts</p>
            <p className="text-xs text-muted-fg mt-0.5">Automatically saves your free entries every 15 seconds while you write</p>
          </div>
          <button
            type="button"
            onClick={toggleAutosave}
            className={`relative inline-flex shrink-0 h-6 w-11 items-center rounded-full transition-colors duration-300 ${
              autosave ? 'bg-primary' : 'bg-border'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-300 ${
                autosave ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
        <div className="pt-4 border-t border-border/40 space-y-3">
          <div>
            <p className="text-sm font-medium text-foreground">Conversation title style</p>
            <p className="text-xs text-muted-fg mt-0.5">How titles are auto-generated when a conversation settles</p>
          </div>
          <div className="space-y-2">
            {TITLE_STYLE_OPTIONS.map(opt => (
              <label
                key={opt.value}
                className={`flex items-center gap-3 p-3 rounded-2xl border cursor-pointer transition-all duration-300 ${
                  selectedTitleStyle === opt.value
                    ? 'border-primary/40 bg-primary/5'
                    : 'border-border/60 hover:border-primary/30'
                }`}
              >
                <input
                  type="radio"
                  name="title_style"
                  value={opt.value}
                  checked={selectedTitleStyle === opt.value}
                  onChange={() => setSelectedTitleStyle(opt.value)}
                  className="accent-primary shrink-0"
                />
                <div>
                  <span className="text-sm font-medium text-foreground">{opt.label}</span>
                  <p className="text-xs text-muted-fg">{opt.description}</p>
                </div>
              </label>
            ))}
          </div>
        </div>
        <div className="pt-4 border-t border-border/40 space-y-3">
          <div>
            <p className="text-sm font-medium text-foreground">Pronouns</p>
            <p className="text-xs text-muted-fg mt-0.5">Used when ghost-writing your story in third person</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {PRONOUN_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSelectedPronouns(selectedPronouns === opt.value ? null : opt.value)}
                className={`px-4 h-9 rounded-full border text-sm transition-all duration-200 ${
                  selectedPronouns === opt.value
                    ? 'border-primary/60 bg-primary/5 text-foreground font-medium'
                    : 'border-border/60 text-muted-fg hover:border-primary/30 hover:text-foreground'
                }`}
              >
                {opt.label}
              </button>
            ))}
            {selectedPronouns && (
              <button
                type="button"
                onClick={() => setSelectedPronouns(null)}
                className="px-4 h-9 rounded-full text-xs text-muted-fg/60 hover:text-muted-fg transition-colors duration-200"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Usage */}
      <section
        className="bg-card rounded-[2rem] border border-border/50 p-7"
        style={{ boxShadow: '0 4px 20px -4px rgba(93, 112, 82, 0.10)' }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xs font-semibold text-muted-fg uppercase tracking-widest">Usage</h2>
            <p className="text-sm text-muted-fg mt-1">View your token usage history and trends.</p>
          </div>
          <Link href="/dashboard/usage" className="text-sm font-medium text-primary hover:text-primary/80 transition-colors">
            View history →
          </Link>
        </div>
      </section>

      {/* Subscription */}
      <section
        className="bg-card rounded-[2rem] border border-border/50 p-7 space-y-3"
        style={{ boxShadow: '0 4px 20px -4px rgba(93, 112, 82, 0.10)' }}
      >
        <h2 className="text-xs font-semibold text-muted-fg uppercase tracking-widest">Subscription</h2>
        <div className="flex items-center justify-between p-4 rounded-2xl border border-primary/30 bg-primary/5">
          <div>
            <p className="text-sm font-medium text-foreground">Free</p>
            <p className="text-xs text-muted-fg">Beta access — all features included</p>
          </div>
          <span className="text-xs font-semibold text-primary bg-primary/10 px-3 py-1 rounded-full">Current plan</span>
        </div>
        <div className="flex items-center justify-between p-4 rounded-2xl border border-border/40 opacity-50 cursor-not-allowed">
          <div>
            <p className="text-sm font-medium text-foreground">Premium</p>
            <p className="text-xs text-muted-fg">Additional features and priority support</p>
          </div>
          <span className="text-xs font-medium text-muted-fg bg-muted px-3 py-1 rounded-full">Coming soon</span>
        </div>
      </section>

      {/* API Key */}
      <section
        className="bg-card rounded-[2rem] border border-border/50 p-7 space-y-4"
        style={{ boxShadow: '0 4px 20px -4px rgba(93, 112, 82, 0.10)' }}
      >
        <div>
          <h2 className="text-xs font-semibold text-muted-fg uppercase tracking-widest">API Key</h2>
          <p className="text-xs text-muted-fg mt-1">Use your own Anthropic API key to avoid shared platform limits.</p>
        </div>
        {localHasKey ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-sm text-foreground font-medium">API key saved</span>
              {localKeyStatus === 'active' && (
                <span className="text-xs font-medium text-green-700 bg-green-50 px-3 py-1 rounded-full">Active</span>
              )}
              {localKeyStatus === 'invalid' && (
                <span className="text-xs font-medium text-red-600 bg-red-50 px-3 py-1 rounded-full">Invalid — check your key</span>
              )}
              {localKeyStatus === 'quota_exceeded' && (
                <span className="text-xs font-medium text-amber-600 bg-amber-50 px-3 py-1 rounded-full">Out of credits — add funds to your Anthropic account</span>
              )}
            </div>
            <button
              type="button"
              onClick={handleRemoveKey}
              disabled={removingKey}
              className="h-9 px-5 border-2 border-border text-foreground/70 text-sm font-medium rounded-full hover:bg-muted disabled:opacity-50 transition-all duration-300"
            >
              {removingKey ? 'Removing...' : 'Remove key'}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <input
              type="password"
              value={apiKeyInput}
              onChange={e => setApiKeyInput(e.target.value)}
              placeholder="sk-ant-..."
              className="w-full h-12 px-5 border border-border rounded-full text-sm text-foreground placeholder:text-muted-fg/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all duration-300"
              style={{ backgroundColor: 'var(--fs-surface)' }}
            />
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleSaveKey}
                disabled={savingKey || !apiKeyInput.trim()}
                className="h-9 px-5 bg-primary hover:bg-primary/90 text-white text-sm font-medium rounded-full hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100 transition-all duration-300"
              >
                {savingKey ? 'Validating...' : 'Save key'}
              </button>
              {keySaved && <p className="text-sm text-primary font-medium">Saved</p>}
              {keyError && <p className="text-sm text-red-600">{keyError}</p>}
            </div>
          </div>
        )}
      </section>

      {/* Save */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="h-12 px-8 bg-primary hover:bg-primary/90 text-white text-sm font-semibold rounded-full hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100 transition-all duration-300"
          style={{ boxShadow: '0 4px 20px -2px rgba(93, 112, 82, 0.20)' }}
        >
          {saving ? 'Saving...' : 'Save changes'}
        </button>
        {saved && <p className="text-sm text-primary font-medium">Saved</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      {/* Danger zone */}
      <section
        className="bg-card rounded-[2rem] border border-red-200/60 p-7 space-y-4"
        style={{ boxShadow: '0 4px 20px -4px rgba(168, 84, 72, 0.08)' }}
      >
        <h2 className="text-xs font-semibold text-red-400 uppercase tracking-widest">Danger zone</h2>
        <p className="text-sm text-muted-fg">
          Permanently delete your account and all your story data. This cannot be undone.
        </p>
        {!showDeleteConfirm ? (
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="h-10 px-6 border-2 border-red-300 text-red-500 text-sm font-medium rounded-full hover:bg-red-50 transition-all duration-300"
          >
            Delete my account
          </button>
        ) : (
          <div className="space-y-4">
            <p className="text-sm font-medium text-foreground">Are you sure? All your entries and story data will be gone forever.</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="h-10 px-6 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-full hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100 transition-all duration-300"
              >
                {deleting ? 'Deleting...' : 'Yes, delete everything'}
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="h-10 px-6 border-2 border-border text-foreground/70 text-sm font-medium rounded-full hover:bg-muted transition-all duration-300"
              >
                Cancel
              </button>
            </div>
            {deleteError && <p className="text-sm text-red-600">{deleteError}</p>}
          </div>
        )}
      </section>

    </div>
  )
}
