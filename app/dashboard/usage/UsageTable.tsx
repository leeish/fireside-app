'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'

type TokenUsageRow = {
  id: string
  created_at: string
  model: string
  inngest_function: string
  purpose: string
  input_tokens: number
  output_tokens: number
  cost: number
}

type Props = {
  rows: TokenUsageRow[]
  totalCount: number
  page: number
  pageSize: number
  sort: string
  dir: 'asc' | 'desc'
  filters: { fn?: string; purpose?: string; from?: string; to?: string }
}

const COLUMNS: { key: string; label: string; sortable: boolean }[] = [
  { key: 'created_at', label: 'Date', sortable: true },
  { key: 'model', label: 'Model', sortable: true },
  { key: 'inngest_function', label: 'Function', sortable: true },
  { key: 'purpose', label: 'Purpose', sortable: false },
  { key: 'input_tokens', label: 'Input', sortable: true },
  { key: 'output_tokens', label: 'Output', sortable: true },
  { key: 'cost', label: 'Cost', sortable: false },
]

export default function UsageTable({ rows, totalCount, page, pageSize, sort, dir, filters }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const updateParams = useCallback((updates: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString())
    for (const [k, v] of Object.entries(updates)) {
      if (v === undefined || v === '') {
        params.delete(k)
      } else {
        params.set(k, v)
      }
    }
    router.push(`/dashboard/usage?${params.toString()}`)
  }, [router, searchParams])

  function handleSort(col: string) {
    if (sort === col) {
      updateParams({ sort: col, dir: dir === 'asc' ? 'desc' : 'asc', page: '1' })
    } else {
      updateParams({ sort: col, dir: 'desc', page: '1' })
    }
  }

  const totalPages = Math.ceil(totalCount / pageSize)

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Filter by function..."
          defaultValue={filters.fn ?? ''}
          onBlur={e => updateParams({ fn: e.target.value, page: '1' })}
          onKeyDown={e => { if (e.key === 'Enter') updateParams({ fn: (e.target as HTMLInputElement).value, page: '1' }) }}
          className="h-9 px-4 text-sm border border-border rounded-full focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
          style={{ backgroundColor: 'var(--fs-surface)' }}
        />
        <input
          type="text"
          placeholder="Filter by purpose..."
          defaultValue={filters.purpose ?? ''}
          onBlur={e => updateParams({ purpose: e.target.value, page: '1' })}
          onKeyDown={e => { if (e.key === 'Enter') updateParams({ purpose: (e.target as HTMLInputElement).value, page: '1' }) }}
          className="h-9 px-4 text-sm border border-border rounded-full focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
          style={{ backgroundColor: 'var(--fs-surface)' }}
        />
        <input
          type="date"
          defaultValue={filters.from ?? ''}
          onBlur={e => updateParams({ from: e.target.value, page: '1' })}
          className="h-9 px-4 text-sm border border-border rounded-full focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
          style={{ backgroundColor: 'var(--fs-surface)' }}
        />
        <input
          type="date"
          defaultValue={filters.to ?? ''}
          onBlur={e => updateParams({ to: e.target.value, page: '1' })}
          className="h-9 px-4 text-sm border border-border rounded-full focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
          style={{ backgroundColor: 'var(--fs-surface)' }}
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-border/50">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/50 bg-muted/30">
              {COLUMNS.map(col => (
                <th
                  key={col.key}
                  className={`px-4 py-3 text-left text-xs font-semibold text-muted-fg uppercase tracking-wider ${col.sortable ? 'cursor-pointer hover:text-foreground transition-colors' : ''}`}
                  onClick={col.sortable ? () => handleSort(col.key) : undefined}
                >
                  {col.label}
                  {sort === col.key && (
                    <span className="ml-1">{dir === 'asc' ? '↑' : '↓'}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-fg italic">
                  No usage records found.
                </td>
              </tr>
            ) : (
              rows.map(row => (
                <tr key={row.id} className="border-b border-border/30 last:border-0 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 text-xs text-muted-fg whitespace-nowrap">
                    {new Date(row.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                  <td className="px-4 py-3 text-xs text-foreground">{row.model}</td>
                  <td className="px-4 py-3 text-xs text-foreground">{row.inngest_function}</td>
                  <td className="px-4 py-3 text-xs text-muted-fg">{row.purpose}</td>
                  <td className="px-4 py-3 text-xs text-foreground text-right">{row.input_tokens.toLocaleString()}</td>
                  <td className="px-4 py-3 text-xs text-foreground text-right">{row.output_tokens.toLocaleString()}</td>
                  <td className="px-4 py-3 text-xs text-muted-fg text-right">${row.cost.toFixed(5)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-fg">
            Page {page} of {totalPages} &middot; {totalCount.toLocaleString()} records
          </p>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => updateParams({ page: String(page - 1) })}
              className="h-8 px-4 text-xs border border-border rounded-full disabled:opacity-40 hover:border-primary/40 transition-all"
            >
              Previous
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => updateParams({ page: String(page + 1) })}
              className="h-8 px-4 text-xs border border-border rounded-full disabled:opacity-40 hover:border-primary/40 transition-all"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
