'use client'

type ConversationCostRow = {
  id: string
  topic: string
  opened_at: string
  totalInput: number
  totalOutput: number
  totalCacheW: number
  totalCacheR: number
  totalCost: number
}

type Props = {
  rows: ConversationCostRow[]
}

export default function ConversationCostTable({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-fg italic">No conversation data found.</p>
    )
  }

  const totalCost = rows.reduce((sum, r) => sum + r.totalCost, 0)
  const avgCost = totalCost / rows.length

  return (
    <div className="space-y-4">
      <div className="flex gap-6 text-sm">
        <span className="text-muted-fg">
          <span className="font-semibold text-foreground">{rows.length}</span> conversations
        </span>
        <span className="text-muted-fg">
          avg cost <span className="font-semibold text-foreground">${avgCost.toFixed(4)}</span>
        </span>
        <span className="text-muted-fg">
          total <span className="font-semibold text-foreground">${totalCost.toFixed(4)}</span>
        </span>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border/50">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/50 bg-muted/30">
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-fg uppercase tracking-wider">Date</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-fg uppercase tracking-wider">Topic</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-muted-fg uppercase tracking-wider">Input</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-muted-fg uppercase tracking-wider">Output</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-muted-fg uppercase tracking-wider">Cache W</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-muted-fg uppercase tracking-wider">Cache R</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-muted-fg uppercase tracking-wider">Cost</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.id} className="border-b border-border/30 last:border-0 hover:bg-muted/20 transition-colors">
                <td className="px-4 py-3 text-xs text-muted-fg whitespace-nowrap">
                  {new Date(row.opened_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </td>
                <td className="px-4 py-3 text-xs text-foreground max-w-xs truncate">{row.topic}</td>
                <td className="px-4 py-3 text-xs text-foreground text-right">{row.totalInput.toLocaleString()}</td>
                <td className="px-4 py-3 text-xs text-foreground text-right">{row.totalOutput.toLocaleString()}</td>
                <td className="px-4 py-3 text-xs text-muted-fg text-right">{row.totalCacheW.toLocaleString() || '—'}</td>
                <td className="px-4 py-3 text-xs text-muted-fg text-right">{row.totalCacheR.toLocaleString() || '—'}</td>
                <td className="px-4 py-3 text-xs text-foreground text-right font-medium">${row.totalCost.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
