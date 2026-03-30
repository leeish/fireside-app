'use client'

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts'

type WeeklyDataPoint = {
  week: string
  tokens: number
  cost: number
}

export default function UsageChart({ data }: { data: WeeklyDataPoint[] }) {
  if (data.length === 0) {
    return (
      <p className="text-sm text-muted-fg italic text-center py-8">No usage data yet.</p>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 4, right: 48, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          dataKey="week"
          tick={{ fontSize: 11, fill: 'var(--muted-fg)' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          yAxisId="tokens"
          orientation="left"
          tick={{ fontSize: 11, fill: 'var(--muted-fg)' }}
          axisLine={false}
          tickLine={false}
          width={48}
          tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
        />
        <YAxis
          yAxisId="cost"
          orientation="right"
          tick={{ fontSize: 11, fill: 'var(--muted-fg)' }}
          axisLine={false}
          tickLine={false}
          width={52}
          tickFormatter={(v: number) => `$${v.toFixed(2)}`}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: '0.75rem',
            fontSize: '12px',
          }}
          formatter={(value, name) => {
            if (name === 'tokens') return [typeof value === 'number' ? value.toLocaleString() : value, 'Tokens']
            if (name === 'cost') return [typeof value === 'number' ? `$${value.toFixed(4)}` : value, 'Cost']
            return [value, name]
          }}
        />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
        />
        <Line
          yAxisId="tokens"
          type="monotone"
          dataKey="tokens"
          name="tokens"
          stroke="var(--primary)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
        <Line
          yAxisId="cost"
          type="monotone"
          dataKey="cost"
          name="cost"
          stroke="var(--secondary)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
