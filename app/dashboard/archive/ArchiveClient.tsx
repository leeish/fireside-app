'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Conversation = {
  id: string
  topic: string | null
  opened_at: string
  settled_at: string | null
}

export default function ArchiveClient({ conversations }: { conversations: Conversation[] }) {
  const router = useRouter()
  const [items, setItems] = useState(conversations)
  const [pending, setPending] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  async function handleRestore(id: string) {
    setPending(id)
    const res = await fetch(`/api/conversation/${id}/restore`, { method: 'PATCH' })
    if (res.ok) {
      setItems(prev => prev.filter(c => c.id !== id))
      router.refresh()
    }
    setPending(null)
  }

  async function handleDelete(id: string) {
    setPending(id)
    const res = await fetch(`/api/conversation/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setItems(prev => prev.filter(c => c.id !== id))
    }
    setPending(null)
    setConfirmDelete(null)
  }

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-fg text-center py-16 font-display italic">
        Nothing archived yet.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {items.map(conv => {
        const openedDate = new Date(conv.opened_at).toLocaleDateString('en-US', {
          month: 'short', day: 'numeric', year: 'numeric',
        })
        const isConfirming = confirmDelete === conv.id
        const isBusy = pending === conv.id

        return (
          <div
            key={conv.id}
            className="bg-card border border-border/50 rounded-2xl px-5 py-4"
            style={{ boxShadow: '0 2px 12px -4px rgba(93, 112, 82, 0.08)' }}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground/80 leading-snug line-clamp-2">
                  {conv.topic ?? 'Untitled'}
                </p>
                <p className="text-xs text-muted-fg mt-1">{openedDate}</p>
              </div>

              {!isConfirming && (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleRestore(conv.id)}
                    disabled={isBusy}
                    className="text-xs text-primary hover:text-primary/80 font-medium disabled:opacity-50 transition-colors duration-300"
                  >
                    {isBusy ? 'Restoring...' : 'Restore'}
                  </button>
                  <span className="text-border">|</span>
                  <button
                    onClick={() => setConfirmDelete(conv.id)}
                    disabled={isBusy}
                    className="text-xs text-muted-fg hover:text-red-500 disabled:opacity-50 transition-colors duration-300"
                  >
                    Delete forever
                  </button>
                </div>
              )}
            </div>

            {isConfirming && (
              <div className="mt-3 pt-3 border-t border-border/40">
                <p className="text-xs text-foreground/70 mb-3">
                  This will permanently erase all turns and entries. Insights already woven into your narrative graph will remain. This cannot be undone.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleDelete(conv.id)}
                    disabled={isBusy}
                    className="px-4 h-8 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded-full disabled:opacity-50 transition-colors duration-300"
                  >
                    {isBusy ? 'Deleting...' : 'Yes, delete permanently'}
                  </button>
                  <button
                    onClick={() => setConfirmDelete(null)}
                    disabled={isBusy}
                    className="px-4 h-8 border border-border text-xs text-muted-fg hover:text-foreground rounded-full disabled:opacity-50 transition-colors duration-300"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
