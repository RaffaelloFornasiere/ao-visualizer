import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchSummary } from '../api'
import { AccuracyBar, ErrorNotice, Loading, ScoreBadge } from '../components'
import { passStats } from '../stats'

// All runs under a path prefix — a full combo directory
// (quirk/model/act/layer/context/vp) or any ancestor, e.g. the per-layer
// links from the overview (quirk/model/act/layer).
export default function Group() {
  const { branch, '*': path } = useParams()
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchSummary(branch).then(setSummary).catch(setError)
  }, [branch])

  if (error) return <ErrorNotice error={error} />
  if (!summary) return <Loading>Loading report…</Loading>

  const runs = summary.runs.filter((r) => r.path.startsWith(`${path}/`))
  if (runs.length === 0) return <ErrorNotice error={new Error(`No runs under ${path}`)} />

  const vps = [...new Set(runs.map((r) => r.combo.verbalizer_prompt_tag))].sort()
  const showVp = vps.length > 1
  runs.sort(
    (a, b) =>
      (a.combo.verbalizer_prompt_tag ?? '').localeCompare(b.combo.verbalizer_prompt_tag ?? '') ||
      a.run_index - b.run_index
  )

  const hasSpecific = runs.some((r) => r.specific != null)
  const { pass, total } = passStats(runs, 'specific')

  return (
    <>
      <h2 className="mono" style={{ overflowWrap: 'anywhere' }}>{path}</h2>
      <p>
        <AccuracyBar pass={pass} total={total} />
        {showVp && (
          <span style={{ color: 'var(--text-2)', marginLeft: '1rem', fontSize: '0.85rem' }}>
            aggregated over {vps.join(', ')}
          </span>
        )}
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {showVp && <th>Verbalizer</th>}
              <th>Run</th>
              <th>Generic</th>
              {hasSpecific && <th>Quirk judge</th>}
              <th>Identified quirk</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.path}>
                {showVp && <td className="mono">{r.combo.verbalizer_prompt_tag}</td>}
                <td>
                  <Link to={`/b/${branch}/r/${r.path}`}>run_{r.run_index}</Link>
                </td>
                <td><ScoreBadge score={r.generic} /></td>
                {hasSpecific && (
                  <td>{r.specific != null ? <ScoreBadge score={r.specific} /> : '—'}</td>
                )}
                <td>{r.identified_quirk}</td>
                <td style={{ color: 'var(--text-2)' }}>
                  {r.description.length > 220
                    ? `${r.description.slice(0, 220)}…`
                    : r.description}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
