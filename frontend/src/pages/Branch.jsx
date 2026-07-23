import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchSummary } from '../api'
import { AccuracyBar, ErrorNotice, Loading } from '../components'
import AccuracyChart from '../AccuracyChart'
import Filters, { applyFilters, defaultOff } from '../Filters'
import { buildStats, downloadStats } from '../exportStats'
import { aggregate, passStats } from '../stats'

function Cell({ runs, branch, mode }) {
  if (!runs || runs.length === 0) return <td className="num">—</td>
  const { pass, total } = passStats(runs, mode)
  const pct = total ? (100 * pass) / total : 0
  // Path prefix up to the layer: quirk/model/act_key/layer
  const prefix = runs[0].path.split('/').slice(0, 4).join('/')
  return (
    <td className="num">
      <Link to={`/b/${branch}/g/${prefix}`} title="Open runs for this model × layer">
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
  const [mode, setMode] = useState('both')
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

  return (
    <BranchView
      key={summary.run_name}
      {...{ summary, branch, mode, setMode, refreshing, load }}
    />
  )
}

function BranchView({ summary, branch, mode, setMode, refreshing, load }) {
  const { runs } = summary
  const [off, setOff] = useState(() => defaultOff(runs))
  const [agg, setAgg] = useState('max')
  const [view, setView] = useState('table')

  const hasSpecific = useMemo(() => runs.some((r) => r.specific != null), [runs])
  const filtered = useMemo(() => applyFilters(runs, off), [runs, off])

  // Column layout: one column per (act_key × layer) among the filtered runs;
  // verbalizer prompts are aggregated (drill into a cell for the split).
  const colSig = (r) => `${r.combo.act_key ?? ''}|${r.combo.layer ?? ''}`
  const combos = useMemo(() => {
    const seen = new Map()
    for (const r of filtered) {
      const sig = colSig(r)
      if (!seen.has(sig)) seen.set(sig, { sig, act: r.combo.act_key, layer: r.combo.layer })
    }
    const multiAct = new Set([...seen.values()].map((c) => c.act)).size > 1
    return [...seen.values()]
      .map((c) => ({
        ...c,
        label: multiAct ? `${c.act} · L${c.layer}` : `Layer ${c.layer}`,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))
  }, [filtered])

  // runsBy: model -> colSig -> runs
  const runsBy = useMemo(() => {
    const m = new Map()
    for (const r of filtered) {
      if (!m.has(r.model)) m.set(r.model, new Map())
      const per = m.get(r.model)
      const sig = colSig(r)
      if (!per.has(sig)) per.set(sig, [])
      per.get(sig).push(r)
    }
    return m
  }, [filtered])

  // Group by family first (config order), then plot_order within the family —
  // plot_order values repeat across families, so a global sort would interleave.
  const allModels = useMemo(() => {
    const familyRank = new Map()
    for (const m of summary.models)
      if (!familyRank.has(m.family)) familyRank.set(m.family, familyRank.size)
    return [...summary.models].sort(
      (a, b) =>
        familyRank.get(a.family) - familyRank.get(b.family) ||
        a.plot_order - b.plot_order ||
        a.name.localeCompare(b.name)
    )
  }, [summary.models])
  const models = useMemo(
    () => allModels.filter((m) => !off.model.has(m.name)),
    [allModels, off]
  )
  const runsByModel = useMemo(() => {
    const m = new Map()
    for (const r of filtered) {
      if (!m.has(r.model)) m.set(r.model, [])
      m.get(r.model).push(r)
    }
    return m
  }, [filtered])
  const quirks = [...new Set(models.map((m) => m.family))]
  const overall = passStats(filtered, mode)

  const exportJson = () =>
    downloadStats(
      buildStats({
        summary,
        filteredRuns: filtered,
        allRuns: runs,
        off,
        mode,
        models: allModels,
      }),
      `${summary.run_name}_stats.json`
    )

  return (
    <>
      <div className="tiles">
        <div className="tile">
          <div className="label">Runs (filtered)</div>
          <div className="value">{filtered.length}</div>
          <div className="sub">{models.length} models · {runs.length} total</div>
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
            <a
              href={`https://huggingface.co/datasets/${summary.hf_repo}/tree/${summary.run_name}`}
              target="_blank" rel="noreferrer"
              title="Open branch on HuggingFace"
            >
              {summary.sha?.slice(0, 8)} ↗
            </a>
          </div>
          <div className="sub mono">
            code: {summary.repo_commit ? summary.repo_commit.slice(0, 8) : 'unknown'}
            {summary.repo_commit?.endsWith('-dirty') ? ' (dirty)' : ''}
          </div>
        </div>
      </div>

      <Filters runs={runs} off={off} setOff={setOff} models={allModels}
               filteredCount={filtered.length} />

      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', margin: '0.75rem 0' }}>
        {hasSpecific && (
          <span className="toggle">
            {[['both', 'Both judges'], ['specific', 'Quirk judge'], ['generic', 'Generic judge']].map(([m, label]) => (
              <button key={m} className={mode === m ? 'active' : ''} onClick={() => setMode(m)}>
                {label}
              </button>
            ))}
          </span>
        )}
        <span className="toggle" title="Model aggregate: pool all layers, or keep each model's best layer">
          {[['mean', 'Mean'], ['max', 'Max layer']].map(([a, label]) => (
            <button key={a} className={agg === a ? 'active' : ''} onClick={() => setAgg(a)}>
              {label}
            </button>
          ))}
        </span>
        <button className="chip" onClick={exportJson}>Export stats (JSON)</button>
        <button className="chip" onClick={() => load(true)} disabled={refreshing}>
          {refreshing ? 'Refreshing…' : 'Refresh from HF'}
        </button>
      </div>

      <AccuracyChart models={models} runsByModel={runsByModel} mode={mode} agg={agg} />

      <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        Per-layer breakdown
        <span className="toggle">
          {[['table', 'Table'], ['plots', 'Plots']].map(([v, label]) => (
            <button key={v} className={view === v ? 'active' : ''} onClick={() => setView(v)}>
              {label}
            </button>
          ))}
        </span>
      </h2>
      {view === 'table' ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Model</th>
                {combos.map((c) => (
                  <th key={c.sig} className="num">{c.label}</th>
                ))}
                <th>Total ({agg === 'max' ? 'max layer' : 'mean'})</th>
              </tr>
            </thead>
            <tbody>
              {quirks.map((quirk) => (
                <QuirkRows
                  key={quirk}
                  quirk={quirk}
                  showHeader={quirks.length > 1}
                  models={models.filter((m) => m.family === quirk)}
                  {...{ combos, runsBy, branch, mode, agg }}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="layer-plots">
          {combos.map((c) => (
            <div className="layer-plot" key={c.sig}>
              <h3>{c.label}</h3>
              <AccuracyChart
                models={models}
                runsByModel={new Map(models.map((m) => [
                  m.name, runsBy.get(m.name)?.get(c.sig) ?? [],
                ]))}
                mode={mode}
              />
            </div>
          ))}
        </div>
      )}

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

function QuirkRows({ quirk, showHeader, models, combos, runsBy, branch, mode, agg }) {
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
        const { pass, total, layer } = aggregate(all, mode, agg)
        return (
          <tr key={m.name}>
            <td title={m.name}>{m.plot_label}</td>
            {combos.map((c) => (
              <Cell key={c.sig} runs={per.get(c.sig)} branch={branch} mode={mode} />
            ))}
            <td>
              <AccuracyBar pass={pass} total={total} />
              {layer != null && (
                <span style={{ color: 'var(--muted)', fontSize: '0.78rem', marginLeft: '0.4rem' }}>
                  L{layer}
                </span>
              )}
            </td>
          </tr>
        )
      })}
    </>
  )
}
