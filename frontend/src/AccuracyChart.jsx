import { useMemo, useState } from 'react'
import { passStats, wilsonCi } from './stats'

// Categorical palette (fixed slot order; family = identity).
const FAMILY_COLORS = [
  '#2a78d6', '#eb6834', '#1baf7a', '#eda100',
  '#e87ba4', '#008300', '#4a3aa7', '#e34948',
]

const BAR_W = 34
const BAR_GAP = 10
const FAMILY_GAP = 28
const PLOT_H = 190
const TOP_PAD = 34
const LABEL_H = 96
const LEFT_PAD = 42

// Per-model accuracy bars grouped by quirk family, with Wilson 95% whiskers
// and act_key toggles — the successor of the old HTML index chart.
export default function AccuracyChart({ models, runsByModel, mode }) {
  const actKeys = useMemo(() => {
    const s = new Set()
    for (const runs of runsByModel.values())
      for (const r of runs) if (r.combo.act_key) s.add(r.combo.act_key)
    return [...s].sort()
  }, [runsByModel])
  const [activeActs, setActiveActs] = useState(null) // null = all

  const active = activeActs ?? new Set(actKeys)
  const toggle = (ak) => {
    const next = new Set(active)
    if (next.has(ak)) next.delete(ak)
    else next.add(ak)
    setActiveActs(next)
  }

  const quirks = [...new Set(models.map((m) => m.quirk))]
  const colorOf = Object.fromEntries(
    quirks.map((q, i) => [q, FAMILY_COLORS[i % FAMILY_COLORS.length]])
  )

  const bars = models.map((m) => {
    const runs = (runsByModel.get(m.name) ?? []).filter(
      (r) => !r.combo.act_key || active.has(r.combo.act_key)
    )
    return { ...m, ...passStats(runs, mode) }
  })

  // Layout with family gaps
  let x = LEFT_PAD
  let prev = null
  const placed = []
  const famSpan = new Map()
  for (const b of bars) {
    if (prev && b.quirk !== prev) x += FAMILY_GAP
    placed.push({ ...b, x })
    if (!famSpan.has(b.quirk)) famSpan.set(b.quirk, [x, x])
    famSpan.get(b.quirk)[1] = x + BAR_W
    x += BAR_W + BAR_GAP
    prev = b.quirk
  }
  const width = Math.max(x + 10, 360)
  const height = TOP_PAD + PLOT_H + LABEL_H

  const yOf = (pct) => TOP_PAD + PLOT_H - (pct / 100) * PLOT_H

  return (
    <div>
      {actKeys.length > 1 && (
        <div style={{ margin: '0.4rem 0' }}>
          <span style={{ color: 'var(--text-2)', fontSize: '0.85rem', marginRight: '0.5rem' }}>
            act_key:
          </span>
          <span className="toggle">
            {actKeys.map((ak) => (
              <button key={ak} className={active.has(ak) ? 'active' : ''} onClick={() => toggle(ak)}>
                {ak}
              </button>
            ))}
          </span>
        </div>
      )}
      <div style={{ overflowX: 'auto' }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{ width: '100%', maxWidth: `${width}px`, height: 'auto', display: 'block' }}
          role="img"
          aria-label="Per-model identification accuracy"
        >
          {[0, 25, 50, 75, 100].map((pct) => (
            <g key={pct}>
              <line
                x1={LEFT_PAD - 6} y1={yOf(pct)} x2={width - 6} y2={yOf(pct)}
                stroke="var(--grid)" strokeWidth="1"
              />
              <text x={LEFT_PAD - 10} y={yOf(pct) + 3.5} textAnchor="end"
                    fontSize="10" fill="var(--muted)">
                {pct}%
              </text>
            </g>
          ))}

          {placed.map((b) => {
            const pct = b.total ? (100 * b.pass) / b.total : 0
            const [lo, hi] = wilsonCi(b.pass, b.total)
            const cx = b.x + BAR_W / 2
            const color = colorOf[b.quirk]
            const labelY = TOP_PAD + PLOT_H + 12
            return (
              <g key={b.name}>
                {b.total > 0 ? (
                  <>
                    <rect
                      x={b.x} y={yOf(pct)} width={BAR_W}
                      height={(pct / 100) * PLOT_H}
                      fill={color} rx="4"
                    >
                      <title>
                        {`${b.plot_label}: ${b.pass}/${b.total} (${pct.toFixed(0)}%), 95% CI ${lo.toFixed(0)}–${hi.toFixed(0)}%`}
                      </title>
                    </rect>
                    <line x1={cx} y1={yOf(hi)} x2={cx} y2={yOf(lo)}
                          stroke="var(--text)" strokeWidth="1.5" opacity="0.6" />
                    <line x1={cx - 4} y1={yOf(hi)} x2={cx + 4} y2={yOf(hi)}
                          stroke="var(--text)" strokeWidth="1.5" opacity="0.6" />
                    <line x1={cx - 4} y1={yOf(lo)} x2={cx + 4} y2={yOf(lo)}
                          stroke="var(--text)" strokeWidth="1.5" opacity="0.6" />
                    <text x={cx} y={yOf(hi) - 6} textAnchor="middle" fontSize="10.5"
                          fontWeight="600" fill="var(--text)">
                      {pct.toFixed(0)}%
                    </text>
                  </>
                ) : (
                  <text x={cx} y={yOf(0) - 5} textAnchor="middle" fontSize="9" fill="var(--muted)">
                    N/A
                  </text>
                )}
                <text
                  x={cx} y={labelY} fontSize="10" fill="var(--text-2)"
                  transform={`rotate(40 ${cx} ${labelY})`}
                >
                  {b.plot_label}
                </text>
              </g>
            )
          })}

          {[...famSpan.entries()].map(([quirk, [x0, x1]]) =>
            quirks.length > 1 ? (
              <text key={quirk} x={(x0 + x1) / 2} y={height - 4} textAnchor="middle"
                    fontSize="11.5" fontWeight="600" fill="var(--text)">
                {quirk}
              </text>
            ) : null
          )}
        </svg>
      </div>
    </div>
  )
}
