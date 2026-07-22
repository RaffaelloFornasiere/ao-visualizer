import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchSummary } from '../api'
import { AccuracyBar, ErrorNotice, Loading } from '../components'
import AccuracyChart from '../AccuracyChart'
import { comboLabel, comboSig, groupPath } from '../combos'
import { passStats } from '../stats'

function Cell({ runs, branch, mode }) {
  if (!runs || runs.length === 0) return <td className="num">—</td>
  const { pass, total } = passStats(runs, mode)
  const pct = total ? (100 * pass) / total : 0
  const target = `/b/${branch}/g/${groupPath(runs[0].path)}`
  return (
    <td className="num">
      <Link to={target} title="Open runs for this combo">
        <span className="cell-frac">{pass}/{total}</span>
        <span className="mini-bar">
          <span className="fill" style={{ width: `${pct}%` }} />
        </span>
      </Link>
    </td>
  )
}

export default function Branch() {
  const { branch } = useParams()
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState(null)
  const [mode, setMode] = useState('specific')
  const [refreshing, setRefreshing] = useState(false)

  const load = (fresh) => {
    if (fresh) setRefreshing(true)
    fetchSummary(branch, { fresh })
      .then(setSummary)
      .catch(setError)
      .finally(() => setRefreshing(false))
  }
  useEffect(() => load(false), [branch])

  if (error) return <ErrorNotice error={error} />
  if (!summary)
    return (
      <Loading>
        Loading report for <b>{branch}</b> — first load downloads it from
        HuggingFace and can take a minute…
      </Loading>
    )

  return <BranchView {...{ summary, branch, mode, setMode, refreshing, load }} />
}

function BranchView({ summary, branch, mode, setMode, refreshing, load }) {
  const { runs } = summary

  const hasSpecific = useMemo(() => runs.some((r) => r.specific != null), [runs])

  // Column layout: unique combos, ordered by label.
  const combos = useMemo(() => {
    const seen = new Map()
    for (const r of runs) {
      const sig = comboSig(r.combo)
      if (!seen.has(sig)) seen.set(sig, { sig, label: comboLabel(r.combo) })
    }
    return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label))
  }, [runs])

  // runsBy: model -> sig -> runs
  const runsBy = useMemo(() => {
    const m = new Map()
    for (const r of runs) {
      if (!m.has(r.model)) m.set(r.model, new Map())
      const per = m.get(r.model)
      const sig = comboSig(r.combo)
      if (!per.has(sig)) per.set(sig, [])
      per.get(sig).push(r)
    }
    return m
  }, [runs])

  const models = useMemo(
    () => [...summary.models].sort((a, b) => a.plot_order - b.plot_order),
    [summary.models]
  )
  const runsByModel = useMemo(() => {
    const m = new Map()
    for (const r of runs) {
      if (!m.has(r.model)) m.set(r.model, [])
      m.get(r.model).push(r)
    }
    return m
  }, [runs])
  const quirks = [...new Set(models.map((m) => m.quirk))]
  const overall = passStats(runs, mode)

  return (
    <>
      <div className="tiles">
        <div className="tile">
          <div className="label">Runs</div>
          <div className="value">{runs.length}</div>
          <div className="sub">{models.length} models</div>
        </div>
        <div className="tile">
          <div className="label">Overall accuracy</div>
          <div className="value">
            {overall.total ? `${((100 * overall.pass) / overall.total).toFixed(0)}%` : '—'}
          </div>
          <div className="sub">{overall.pass}/{overall.total} pass</div>
        </div>
        <div className="tile">
          <div className="label">Investigator</div>
          <div className="value" style={{ fontSize: '0.9rem' }}>{summary.investigator_model}</div>
          <div className="sub">judge: {summary.judge_model}</div>
        </div>
        <div className="tile">
          <div className="label">Report</div>
          <div className="value mono" style={{ fontSize: '0.9rem' }}>
            {summary.sha?.slice(0, 8)}
          </div>
          <div className="sub mono">
            code: {summary.repo_commit ? summary.repo_commit.slice(0, 8) : 'unknown'}
            {summary.repo_commit?.endsWith('-dirty') ? ' (dirty)' : ''}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', margin: '0.75rem 0' }}>
        {hasSpecific && (
          <span className="toggle">
            {[['specific', 'Quirk judge'], ['generic', 'Generic judge']].map(([m, label]) => (
              <button key={m} className={mode === m ? 'active' : ''} onClick={() => setMode(m)}>
                {label}
              </button>
            ))}
          </span>
        )}
        <button className="toggle" style={{ cursor: 'pointer', padding: '0.2rem 0.7rem' }}
                onClick={() => load(true)} disabled={refreshing}>
          {refreshing ? 'Refreshing…' : 'Refresh from HF'}
        </button>
      </div>

      <AccuracyChart models={models} runsByModel={runsByModel} mode={mode} />

      <h2>Per-combo breakdown</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Model</th>
              {combos.map((c) => (
                <th key={c.sig} className="num">{c.label}</th>
              ))}
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {quirks.map((quirk) => (
              <QuirkRows
                key={quirk}
                quirk={quirk}
                showHeader={quirks.length > 1}
                models={models.filter((m) => m.quirk === quirk)}
                {...{ combos, runsBy, branch, mode }}
              />
            ))}
          </tbody>
        </table>
      </div>

      <h2>Ground truth</h2>
      {Object.entries(summary.quirks).map(([name, desc]) => (
        <details key={name} className="collapsible">
          <summary>{name}</summary>
          <div className="box pre">{desc}</div>
        </details>
      ))}
    </>
  )
}

function QuirkRows({ quirk, showHeader, models, combos, runsBy, branch, mode }) {
  return (
    <>
      {showHeader && (
        <tr className="section-row">
          <td colSpan={combos.length + 2}>{quirk}</td>
        </tr>
      )}
      {models.map((m) => {
        const per = runsBy.get(m.name) ?? new Map()
        const all = [...per.values()].flat()
        const { pass, total } = passStats(all, mode)
        return (
          <tr key={m.name}>
            <td title={m.name}>{m.plot_label}</td>
            {combos.map((c) => (
              <Cell key={c.sig} runs={per.get(c.sig)} branch={branch} mode={mode} />
            ))}
            <td>
              <AccuracyBar pass={pass} total={total} />
            </td>
          </tr>
        )
      })}
    </>
  )
}
