'use client'

/**
 * Recharts visualisations for the admin reports page.
 *
 * Exported components:
 *  - {@link ReceiptBarChart}  — bar chart of receipt counts per magazine or branch
 *  - {@link TimelineLineChart} — multi-line chart of receipts per period per branch
 */

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts'
import type { ReceiptSummaryRow, TimelineDataPoint } from '@/types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Hex colour palette used for chart series.
 * Approximations of the project's oklch greens and accents, chosen to work
 * with recharts which requires hex / rgb values.
 */
const CHART_COLORS = ['#2d7a4f', '#3b6dcc', '#cc6b2e', '#9b3dba', '#6b9e2e']

/** Primary chart green — matches the project's oklch(0.38 0.082 156) branding. */
const PRIMARY_GREEN = '#2d7a4f'

// ---------------------------------------------------------------------------
// ReceiptBarChart
// ---------------------------------------------------------------------------

/**
 * Props for {@link ReceiptBarChart}.
 */
export interface ReceiptBarChartProps {
  /** Rows from the receipt summary report. */
  data: ReceiptSummaryRow[]
  /**
   * When true the user has filtered to a single branch, so the X-axis shows
   * individual magazine names.  When false (all branches) the data is
   * aggregated by branch name.
   */
  singleBranch: boolean
}

/**
 * Bar chart rendering receipt counts.
 *
 * - Single-branch view: one bar per magazine (X = magazine name).
 * - All-branches view: one bar per branch (X = branch name, Y = total receipts).
 *
 * Returns null when `data` is empty so the caller can skip rendering entirely.
 *
 * @param props - {@link ReceiptBarChartProps}
 */
export function ReceiptBarChart({ data, singleBranch }: ReceiptBarChartProps) {
  if (!data || data.length === 0) return null

  if (singleBranch) {
    // One bar per magazine row — X is magazine name, Y is receiptCount.
    const chartData = data.map((row) => ({
      name: row.magazineName,
      receipts: row.receiptCount,
    }))

    return (
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 40 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e0d8" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: '#6b6356' }}
            angle={-30}
            textAnchor="end"
            interval={0}
          />
          <YAxis tick={{ fontSize: 11, fill: '#6b6356' }} allowDecimals={false} />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 6, borderColor: '#d6cfc5' }}
          />
          <Bar dataKey="receipts" fill={PRIMARY_GREEN} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    )
  }

  // All-branches view — aggregate receiptCount by branchName.
  const branchTotals = new Map<string, number>()
  for (const row of data) {
    branchTotals.set(row.branchName, (branchTotals.get(row.branchName) ?? 0) + row.receiptCount)
  }
  const chartData = Array.from(branchTotals.entries()).map(([name, receipts]) => ({
    name,
    receipts,
  }))

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 40 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e0d8" />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 11, fill: '#6b6356' }}
          angle={-30}
          textAnchor="end"
          interval={0}
        />
        <YAxis tick={{ fontSize: 11, fill: '#6b6356' }} allowDecimals={false} />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 6, borderColor: '#d6cfc5' }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="receipts" name="Total Receipts" fill={PRIMARY_GREEN} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// ---------------------------------------------------------------------------
// TimelineLineChart
// ---------------------------------------------------------------------------

/**
 * Props for {@link TimelineLineChart}.
 */
export interface TimelineLineChartProps {
  /** Raw timeline data points — one row per (period, branch) combination. */
  data: TimelineDataPoint[]
  /** Whether the periods are weekly or monthly buckets (used for axis labels). */
  bucketType: 'weekly' | 'monthly'
}

/**
 * Multi-line chart showing receipt counts over time, one line per branch.
 *
 * Transforms the flat `TimelineDataPoint[]` into a pivot structure keyed by
 * period, with each unique branch name as a separate numeric key.  One
 * `<Line>` is rendered per branch, cycling through {@link CHART_COLORS}.
 *
 * Returns null when `data` is empty.
 *
 * @param props - {@link TimelineLineChartProps}
 */
export function TimelineLineChart({ data, bucketType: _bucketType }: TimelineLineChartProps) {
  if (!data || data.length === 0) return null

  // Collect unique branches in the order they first appear.
  const branchOrder: string[] = []
  const seenBranches = new Set<string>()
  for (const point of data) {
    if (!seenBranches.has(point.branchName)) {
      seenBranches.add(point.branchName)
      branchOrder.push(point.branchName)
    }
  }

  // Pivot: one object per period with branch names as numeric keys.
  const periodMap = new Map<string, Record<string, number>>()
  for (const point of data) {
    if (!periodMap.has(point.period)) {
      periodMap.set(point.period, { period: point.period as unknown as number })
    }
    // Safe: we are building a dynamic object intentionally.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    periodMap.get(point.period)![point.branchName] = point.count
  }
  const chartData = Array.from(periodMap.values())

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 40 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e0d8" />
        <XAxis
          dataKey="period"
          tick={{ fontSize: 11, fill: '#6b6356' }}
          angle={-30}
          textAnchor="end"
          interval={0}
        />
        <YAxis tick={{ fontSize: 11, fill: '#6b6356' }} allowDecimals={false} />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 6, borderColor: '#d6cfc5' }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {branchOrder.map((branch, idx) => (
          <Line
            key={branch}
            type="monotone"
            dataKey={branch}
            stroke={CHART_COLORS[idx % CHART_COLORS.length]}
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
