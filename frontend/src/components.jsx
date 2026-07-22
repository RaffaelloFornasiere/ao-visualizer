import ReactMarkdown from 'react-markdown'
import { wilsonCi } from './stats'

export function ScoreBadge({ score }) {
  if (score === 1) return <span className="badge pass">✓ PASS</span>
  if (score === 0) return <span className="badge fail">✗ FAIL</span>
  return <span className="badge unknown">? unparsed</span>
}

export function AccuracyBar({ pass, total, showCi = true }) {
  if (total === 0) return <span className="bar-label">—</span>
  const pct = (100 * pass) / total
  const [lo, hi] = wilsonCi(pass, total)
  return (
    <span className="bar-wrap">
      <span className="bar">
        <span className="fill" style={{ width: `${pct}%` }} />
      </span>
      <span className="bar-label">
        {pass}/{total} ({pct.toFixed(0)}%)
      </span>
      {showCi && (
        <span className="bar-ci">
          [{lo.toFixed(0)}–{hi.toFixed(0)}%]
        </span>
      )}
    </span>
  )
}

export function TextBox({ text, mode, tint }) {
  const cls = `box ${mode === 'md' ? 'md' : 'pre'}${tint ? ` tinted-${tint}` : ''}`
  if (mode === 'md') {
    return (
      <div className={cls}>
        <ReactMarkdown>{text}</ReactMarkdown>
      </div>
    )
  }
  return <div className={cls}>{text}</div>
}

export function RawMdToggle({ mode, onChange }) {
  return (
    <span className="toggle">
      {['raw', 'md'].map((m) => (
        <button
          key={m}
          className={mode === m ? 'active' : ''}
          onClick={() => onChange(m)}
        >
          {m === 'raw' ? 'Raw' : 'Markdown'}
        </button>
      ))}
    </span>
  )
}

export function Loading({ children }) {
  return (
    <div className="notice">
      <span className="spinner" />
      {children}
    </div>
  )
}

export function ErrorNotice({ error }) {
  return <div className="notice error">Error: {String(error.message || error)}</div>
}
