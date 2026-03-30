'use client'

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'

type WeeklyDataPoint = {
  week: string
  tokens: number
}

export default function UsageChart({ data }: { data: WeeklyDataPoint[] }) {
  if (data.length === 0) {
    return (
      <p className="text-sm text-muted-fg italic text-center py-8">No usage data yet.</p>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          dataKey="week"
          tick={{ fontSize: 11, fill: 'var(--muted-fg)' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: 'var(--muted-fg)' }}
          axisLine={false}
          tickLine={false}
          width={48}
          tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: '0.75rem',
            fontSize: '12px',
          }}
          formatter={(value: number) => [value.toLocaleString(), 'Tokens']}
        />
        <Line
          type="monotone"
          dataKey="tokens"
          stroke="var(--primary)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
