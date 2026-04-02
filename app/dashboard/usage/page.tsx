import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import UsageChart from './UsageChart'
import UsageTable from './UsageTable'
import ConversationCostTable from './ConversationCostTable'
import TabSwitcher from './TabSwitcher'
import { Suspense } from 'react'

const PAGE_SIZE = 25

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>

function getWeekLabel(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

type PricingRow = { model: string; input_per_1m: number; output_per_1m: number }

function getCost(
  inputTokens: number,
  outputTokens: number,
  model: string,
  pricing: PricingRow[],
  cacheCreationTokens = 0,
  cacheReadTokens = 0,
): number {
  const p = pricing.find(r => r.model === model)
  if (!p) return 0
  return (
    inputTokens / 1_000_000 * Number(p.input_per_1m) +
    cacheCreationTokens / 1_000_000 * Number(p.input_per_1m) * 1.25 +
    cacheReadTokens / 1_000_000 * Number(p.input_per_1m) * 0.1 +
    outputTokens / 1_000_000 * Number(p.output_per_1m)
  )
}

function aggregateByWeek(
  rows: { created_at: string; input_tokens: number; output_tokens: number; model: string; cache_creation_tokens: number | null; cache_read_tokens: number | null }[],
  pricing: PricingRow[],
) {
  const buckets: Record<string, { tokens: number; cost: number; date: Date }> = {}

  for (const row of rows) {
    const d = new Date(row.created_at)
    const day = d.getDay()
    const weekStart = new Date(d)
    weekStart.setDate(d.getDate() - day)
    weekStart.setHours(0, 0, 0, 0)
    const key = weekStart.toISOString()
    const cacheCreate = row.cache_creation_tokens ?? 0
    const cacheRead = row.cache_read_tokens ?? 0
    if (!buckets[key]) buckets[key] = { tokens: 0, cost: 0, date: weekStart }
    buckets[key].tokens += row.input_tokens + row.output_tokens + cacheCreate + cacheRead
    buckets[key].cost += getCost(row.input_tokens, row.output_tokens, row.model, pricing, cacheCreate, cacheRead)
  }

  return Object.values(buckets)
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map(b => ({ week: getWeekLabel(b.date), tokens: b.tokens, cost: parseFloat(b.cost.toFixed(4)) }))
}

export default async function UsagePage({ searchParams }: { searchParams: SearchParams }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const view = String(params.view ?? 'records')
  const page = Math.max(1, parseInt(String(params.page ?? '1'), 10))
  const sort = String(params.sort ?? 'created_at')
  const dir = (params.dir === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc'
  const fn = params.fn ? String(params.fn) : undefined
  const purpose = params.purpose ? String(params.purpose) : undefined
  const from = params.from ? String(params.from) : undefined
  const to = params.to ? String(params.to) : undefined

  const threeMonthsAgo = new Date()
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)

  // Pricing — global reference data, no user filter
  const { data: pricingRows } = await supabase
    .from('model_pricing')
    .select('model, input_per_1m, output_per_1m')
    .is('active_to', null)

  const pricing: PricingRow[] = (pricingRows ?? []).map(r => ({
    model: r.model,
    input_per_1m: Number(r.input_per_1m),
    output_per_1m: Number(r.output_per_1m),
  }))

  // Chart data — last 3 months, lightweight columns only
  const { data: chartRows } = await supabase
    .from('token_usage')
    .select('created_at, input_tokens, output_tokens, model, cache_creation_tokens, cache_read_tokens')
    .eq('user_id', user.id)
    .gte('created_at', threeMonthsAgo.toISOString())

  const weeklyData = aggregateByWeek(chartRows ?? [], pricing)

  // ── Records view ──────────────────────────────────────────────────
  let tableRows: ReturnType<typeof Array.prototype.map> | null = null
  let count: number | null = null

  if (view === 'records') {
    const offset = (page - 1) * PAGE_SIZE
    let query = supabase
      .from('token_usage')
      .select('id, created_at, model, inngest_function, purpose, input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens', { count: 'exact' })
      .eq('user_id', user.id)

    if (fn) query = query.ilike('inngest_function', `%${fn}%`)
    if (purpose) query = query.ilike('purpose', `%${purpose}%`)
    if (from) query = query.gte('created_at', new Date(from).toISOString())
    if (to) {
      const toDate = new Date(to)
      toDate.setDate(toDate.getDate() + 1)
      query = query.lt('created_at', toDate.toISOString())
    }

    const result = await query
      .order(sort, { ascending: dir === 'asc' })
      .range(offset, offset + PAGE_SIZE - 1)

    tableRows = result.data
    count = result.count
  }

  // ── Conversations view ────────────────────────────────────────────
  let conversationRows: Array<{
    id: string; topic: string; opened_at: string
    totalInput: number; totalOutput: number; totalCacheW: number; totalCacheR: number; totalCost: number
  }> = []

  if (view === 'conversations') {
    const [{ data: convUsage }, { data: conversations }] = await Promise.all([
      supabase
        .from('token_usage')
        .select('conversation_id, model, input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens')
        .eq('user_id', user.id)
        .not('conversation_id', 'is', null),
      supabase
        .from('conversations')
        .select('id, topic, opened_at')
        .eq('user_id', user.id),
    ])

    const accMap = new Map<string, { totalInput: number; totalOutput: number; totalCacheW: number; totalCacheR: number; totalCost: number }>()
    for (const row of convUsage ?? []) {
      const id = row.conversation_id!
      if (!accMap.has(id)) accMap.set(id, { totalInput: 0, totalOutput: 0, totalCacheW: 0, totalCacheR: 0, totalCost: 0 })
      const acc = accMap.get(id)!
      const cw = row.cache_creation_tokens ?? 0
      const cr = row.cache_read_tokens ?? 0
      acc.totalInput += row.input_tokens
      acc.totalOutput += row.output_tokens
      acc.totalCacheW += cw
      acc.totalCacheR += cr
      acc.totalCost += getCost(row.input_tokens, row.output_tokens, row.model, pricing, cw, cr)
    }

    conversationRows = (conversations ?? [])
      .filter(c => accMap.has(c.id))
      .map(c => ({ ...c, ...accMap.get(c.id)! }))
      .sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime())
  }

  return (
    <div className="w-full px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-display font-semibold text-foreground">Usage</h1>
        <p className="text-muted-fg text-sm mt-1">Your token consumption over time.</p>
      </div>

      {/* Chart */}
      <section
        className="bg-card rounded-[2rem] border border-border/50 p-7 mb-5"
        style={{ boxShadow: '0 4px 20px -4px rgba(93, 112, 82, 0.10)' }}
      >
        <h2 className="text-xs font-semibold text-muted-fg uppercase tracking-widest mb-4">Weekly usage — last 3 months</h2>
        <UsageChart data={weeklyData} />
      </section>

      {/* Tabs + Table */}
      <section
        className="bg-card rounded-[2rem] border border-border/50 p-7"
        style={{ boxShadow: '0 4px 20px -4px rgba(93, 112, 82, 0.10)' }}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xs font-semibold text-muted-fg uppercase tracking-widest">
            {view === 'conversations' ? 'By conversation' : 'All records'}
          </h2>
          <Suspense>
            <TabSwitcher activeView={view} />
          </Suspense>
        </div>

        {view === 'conversations' ? (
          <ConversationCostTable rows={conversationRows} />
        ) : (
          <Suspense>
            <UsageTable
              rows={(tableRows ?? []).map((r: any) => ({ ...r, cost: getCost(r.input_tokens, r.output_tokens, r.model, pricing, r.cache_creation_tokens ?? 0, r.cache_read_tokens ?? 0) }))}
              totalCount={count ?? 0}
              page={page}
              pageSize={PAGE_SIZE}
              sort={sort}
              dir={dir}
              filters={{ fn, purpose, from, to }}
            />
          </Suspense>
        )}
      </section>
    </div>
  )
}
