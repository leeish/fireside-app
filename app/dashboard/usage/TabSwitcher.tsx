'use client'

import { useRouter } from 'next/navigation'

type Props = { activeView: string }

export default function TabSwitcher({ activeView }: Props) {
  const router = useRouter()

  return (
    <div className="flex gap-1 bg-muted/40 rounded-full p-1">
      {[
        { key: 'records', label: 'All records' },
        { key: 'conversations', label: 'By conversation' },
      ].map(tab => (
        <button
          key={tab.key}
          onClick={() => router.push(`/dashboard/usage?view=${tab.key}`)}
          className={`px-4 py-1.5 text-xs font-medium rounded-full transition-all ${
            activeView === tab.key
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-fg hover:text-foreground'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
