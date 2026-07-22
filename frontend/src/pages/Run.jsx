import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchRun } from '../api'
import { ErrorNotice, Loading, RawMdToggle, ScoreBadge, TextBox } from '../components'
import { groupPath } from '../combos'

export default function Run() {
  const { branch, '*': path } = useParams()
  const [run, setRun] = useState(null)
  const [error, setError] = useState(null)
  const [mode, setMode] = useState(() => localStorage.getItem('ao_view_mode') || 'raw')

  useEffect(() => {
    setRun(null)
    fetchRun(branch, path).then(setRun).catch(setError)
  }, [branch, path])

  const changeMode = (m) => {
    setMode(m)
    localStorage.setItem('ao_view_mode', m)
  }

  if (error) return <ErrorNotice error={error} />
  if (!run) return <Loading>Loading run…</Loading>

  const inv = run.investigator ?? {}
  const judgeEntries = Object.entries(run.judges ?? {})

  return (
    <>
      <p className="crumb">
        <Link to={`/b/${branch}/g/${groupPath(path)}`}>← all runs of this combo</Link>
      </p>
      <h2 className="mono" style={{ overflowWrap: 'anywhere' }}>{path}</h2>

      <table className="meta-table" style={{ maxWidth: '46rem' }}>
        <tbody>
          <tr><td>Model</td><td>{run.model}</td></tr>
          <tr><td>Quirk</td><td>{run.quirk}</td></tr>
          <tr>
            <td>Combo</td>
            <td className="mono">
              {Object.entries(run.combo ?? {})
                .map(([k, v]) => `${k}=${v.join(',')}`)
                .join('  ')}
            </td>
          </tr>
          <tr>
            <td>Context prompts</td>
            <td className="mono">{(run.sampled_context_ids ?? []).join(', ')}</td>
          </tr>
          <tr>
            <td>Investigator</td>
            <td>
              <span className="mono">{inv.model}</span>
              {inv.usage && (
                <span style={{ color: 'var(--muted)', marginLeft: '0.6rem' }}>
                  {inv.usage.prompt_tokens} → {inv.usage.completion_tokens} tokens
                </span>
              )}
              {inv.finish_reason && inv.finish_reason !== 'stop' && (
                <span className="badge unknown" style={{ marginLeft: '0.6rem' }}>
                  finish: {inv.finish_reason}
                </span>
              )}
            </td>
          </tr>
        </tbody>
      </table>

      <h2>
        Identified quirk: <em>{run.identified_quirk || '(none)'}</em>
      </h2>
      <TextBox text={run.identified_description} mode="raw" tint="id" />

      {judgeEntries.map(([name, j]) => (
        <div key={name}>
          <h3>
            Judge: {name} <ScoreBadge score={j.score} />
          </h3>
          <div className="box pre" style={{ fontStyle: 'italic' }}>{j.reason}</div>
        </div>
      ))}

      <h3>Ground truth</h3>
      <TextBox text={run.ground_truth} mode="raw" tint="gt" />

      <h2 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        Investigator conversation
        <RawMdToggle mode={mode} onChange={changeMode} />
      </h2>

      <h3>System prompt</h3>
      <details className="collapsible">
        <summary>show</summary>
        <TextBox text={run.system_prompt} mode={mode} />
      </details>

      <h3>Input (verbalizations)</h3>
      <TextBox text={run.input} mode={mode} />

      <h3>Response</h3>
      <TextBox text={inv.output ?? ''} mode={mode} />
    </>
  )
}
