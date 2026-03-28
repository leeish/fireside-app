'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Props = {
  displayName: string
  email: string
  cadence: string
  isActive: boolean
}

const CADENCE_OPTIONS = [
  { value: 'weekly', label: 'Weekly', description: 'One prompt per week', premium: false },
  { value: 'few_per_week', label: 'Every few days', description: 'A prompt every 3 days', premium: true },
  { value: 'daily', label: 'Daily', description: 'A prompt every day', premium: true },
]

export default function SettingsForm({ displayName, email, cadence, isActive }: Props) {
  const router = useRouter()
  const [name, setName] = useState(displayName)
  const [selectedCadence, setSelectedCadence] = useState(cadence)
  const [active, setActive] = useState(isActive)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

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
    <div className="space-y-8">

      {/* Account */}
      <section className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 space-y-4">
        <h2 className="text-sm font-semibold text-stone-500 uppercase tracking-wide">Account</h2>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Display name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Email</label>
          <input
            type="email"
            value={email}
            disabled
            className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm bg-stone-50 text-stone-400"
          />
        </div>
      </section>

      {/* Delivery */}
      <section className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 space-y-4">
        <h2 className="text-sm font-semibold text-stone-500 uppercase tracking-wide">Delivery</h2>

        <div className="space-y-2">
          {CADENCE_OPTIONS.map(opt => (
            <label
              key={opt.value}
              className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                selectedCadence === opt.value
                  ? 'border-amber-500 bg-amber-50'
                  : 'border-stone-200 hover:border-stone-300'
              }`}
            >
              <div className="flex items-center gap-3">
                <input
                  type="radio"
                  name="cadence"
                  value={opt.value}
                  checked={selectedCadence === opt.value}
                  onChange={() => setSelectedCadence(opt.value)}
                  className="accent-amber-600"
                />
                <div>
                  <span className="text-sm font-medium text-stone-800">{opt.label}</span>
                  <p className="text-xs text-stone-500">{opt.description}</p>
                </div>
              </div>
              {opt.premium && (
                <span className="text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                  Beta
                </span>
              )}
            </label>
          ))}
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-stone-100">
          <div>
            <p className="text-sm font-medium text-stone-800">Pause deliveries</p>
            <p className="text-xs text-stone-500">No prompts will be sent while paused</p>
          </div>
          <button
            type="button"
            onClick={() => setActive(a => !a)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              !active ? 'bg-amber-600' : 'bg-stone-300'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                !active ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </section>

      {/* Subscription */}
      <section className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 space-y-3">
        <h2 className="text-sm font-semibold text-stone-500 uppercase tracking-wide">Subscription</h2>
        <div className="flex items-center justify-between p-3 rounded-lg border border-amber-200 bg-amber-50">
          <div>
            <p className="text-sm font-medium text-stone-800">Free</p>
            <p className="text-xs text-stone-500">Beta access — all features included</p>
          </div>
          <span className="text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">Current plan</span>
        </div>
        <div className="flex items-center justify-between p-3 rounded-lg border border-stone-200 opacity-50 cursor-not-allowed">
          <div>
            <p className="text-sm font-medium text-stone-800">Premium</p>
            <p className="text-xs text-stone-500">Additional features and priority support</p>
          </div>
          <span className="text-xs font-medium text-stone-500 bg-stone-100 px-2 py-0.5 rounded-full">Coming soon</span>
        </div>
      </section>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving...' : 'Save changes'}
        </button>
        {saved && <p className="text-sm text-green-600">Saved</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      {/* Danger zone */}
      <section className="bg-white rounded-2xl border border-red-100 shadow-sm p-6 space-y-3">
        <h2 className="text-sm font-semibold text-red-500 uppercase tracking-wide">Danger zone</h2>
        <p className="text-sm text-stone-500">
          Permanently delete your account and all your story data. This cannot be undone.
        </p>
        {!showDeleteConfirm ? (
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="px-4 py-2 border border-red-300 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 transition-colors"
          >
            Delete my account
          </button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm font-medium text-stone-800">Are you sure? All your entries and story data will be gone forever.</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
              >
                {deleting ? 'Deleting...' : 'Yes, delete everything'}
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 border border-stone-300 text-stone-700 text-sm font-medium rounded-lg hover:bg-stone-50 transition-colors"
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
