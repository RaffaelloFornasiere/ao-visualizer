import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchSummary } from '../api'
import { AccuracyBar, ErrorNotice, Loading, ScoreBadge } from '../components'
import { passStats, runScore } from '../stats'

export default function Group() {
  const { branch, '*': path } = useParams()
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchSummary(branch).then(setSummary).catch(setError)
  }, [branch])

  if (error) return <ErrorNotice error={error} />
  if (!summary) return <Loading>Loading report…</Loading>

  const runs = summary.runs
    .filter((r) => r.path.startsWith(`${path}/run_`))
    .sort((a, b) => a.run_index - b.run_index)
  if (runs.length === 0) return <ErrorNotice error={new Error(`No runs under ${path}`)} />

  const hasSpecific = runs.some((r) => r.specific != null)
  const { pass, total } = passStats(runs, 'specific')

  return (
    <>
      <h2 className="mono" style={{ overflowWrap: 'anywhere' }}>{path}</h2>
      <p>
        <AccuracyBar pass={pass} total={total} />
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
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
