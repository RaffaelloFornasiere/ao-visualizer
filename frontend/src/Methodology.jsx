import { useState } from 'react'
import { fetchVerbalizations } from './api'
import { ErrorNotice, Loading } from './components'

// Methodology view for a run: for each sampled context prompt, shows which
// tokens each probe type extracted activations from, the (reconstructed)
// verbalizer prompt those activations were injected into, and the generated
// verbalizations. Lazy-loads on first expand — the first request per model
// downloads its ~10 MB verbalizer split server-side.

const PROBES = [
  ['tokens', 'Per token'],
  ['segment', 'Segment'],
  ['full_seq', 'Full sequence'],
]

const MAX_PH = 24 // placeholder chips shown before collapsing to a count

const clean = (t) => t.replace(/\n/g, '⏎')

function probeSpan(ctx, probe) {
  if (probe === 'tokens') {
    const { start, responses } = ctx.token_probes
    return [start, start + responses.length]
  }
  if (probe === 'segment') return [ctx.segment.start, ctx.segment.end]
  return [0, ctx.num_tokens]
}

function TokenLine({ ctx, probe }) {
  const [s, e] = probeSpan(ctx, probe)
  if (!ctx.aligned) {
    return (
      <>
        <div className="box pre">{ctx.context_prompt}</div>
        <p className="method-note">
          Tokenization mismatch (expected {ctx.num_tokens} tokens) — showing raw
          text; probed positions {s}–{e - 1}.
        </p>
      </>
    )
  }
  return (
    <div className="tokline">
      {ctx.tokens.map((t, i) => (
        <span key={i} className={`tok${i >= s && i < e ? ' hl' : ''}`}
              title={`token ${i}`}>
          {clean(t)}
        </span>
      ))}
    </div>
  )
}

function VerbalizerPrompt({ data, ctx, probe }) {
  const [s, e] = probeSpan(ctx, probe)
  const n = probe === 'tokens' ? 1 : e - s
  const shown = Math.min(n, MAX_PH)
  return (
    <div className="box pre">
      Layer: {data.layer}{'\n'}
      {Array.from({ length: shown }, (_, i) => (
        <span key={i} className="tok ph">{data.special_token}</span>
      ))}
      {n > shown && <span className="method-note"> …×{n} </span>}
      {'\n'}
      {data.verbalizer_prompt}
    </div>
  )
}

function Responses({ ctx, probe }) {
  if (probe === 'tokens') {
    const { start, responses } = ctx.token_probes
    return (
      <table className="tok-resp-table">
        <tbody>
          {responses.map((r, j) => (
            <tr key={j}>
              <td>
                {ctx.aligned
                  ? <span className="tok hl">{clean(ctx.tokens[start + j])}</span>
                  : <span className="tok">#{start + j}</span>}
              </td>
              <td>{r ?? <span className="method-note">(no response)</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }
  const responses = probe === 'segment' ? ctx.segment.responses : ctx.full_seq.responses
  return (
    <div className="resp-list">
      {responses.map((r, j) => (
        <div key={j} className="resp">{r}</div>
      ))}
    </div>
  )
}

const PROBE_DESC = (ctx, probe) => {
  const [s, e] = probeSpan(ctx, probe)
  if (probe === 'tokens')
    return `one probe per token over the last ${e - s} positions (${s}–${e - 1}) — each row below is one probe`
  if (probe === 'segment')
    return `${ctx.segment.responses.length} repeated probes, each over tokens ${s}–${e - 1} together`
  return `${ctx.full_seq.responses.length} repeated probes, each over all ${ctx.num_tokens} tokens`
}

export default function Methodology({ branch, path }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [started, setStarted] = useState(false)
  const [ctxIdx, setCtxIdx] = useState(0)
  const [probe, setProbe] = useState('tokens')

  const load = () => {
    if (started) return
    setStarted(true)
    fetchVerbalizations(branch, path).then(setData).catch(setError)
  }

  return (
    <details className="collapsible" onToggle={(ev) => ev.target.open && load()}>
      <summary>Extraction &amp; verbalization (methodology)</summary>
      {error && <ErrorNotice error={error} />}
      {started && !data && !error && (
        <Loading>Loading verbalizer data — first load per model fetches its split from HF…</Loading>
      )}
      {data && (() => {
        const ctx = data.contexts[Math.min(ctxIdx, data.contexts.length - 1)]
        return (
          <div className="method">
            <div className="method-controls">
              <span className="toggle">
                {data.contexts.map((c, i) => (
                  <button key={c.context_id} className={i === ctxIdx ? 'active' : ''}
                          onClick={() => setCtxIdx(i)}>
                    {c.context_id}
                  </button>
                ))}
              </span>
              <span className="toggle">
                {PROBES.map(([p, label]) => (
                  <button key={p} className={probe === p ? 'active' : ''}
                          onClick={() => setProbe(p)}>
                    {label}
                  </button>
                ))}
              </span>
            </div>

            <h4>
              Context prompt <span className="method-note">
                ({data.act_key} activations at layer {data.layer}, extracted from the highlighted tokens)
              </span>
            </h4>
            <TokenLine ctx={ctx} probe={probe} />
            <p className="method-note">{PROBE_DESC(ctx, probe)}</p>

            <div className="method-arrow">
              ⭣ the extracted activation vector{probe === 'tokens' ? '' : 's'} replace
              the “{data.special_token.trim()}” placeholder activations below
            </div>

            <h4>
              Verbalizer prompt <span className="method-note">
                (reconstructed — the scaffold is built at runtime, not logged)
              </span>
            </h4>
            <VerbalizerPrompt data={data} ctx={ctx} probe={probe} />

            <h4>Generated verbalizations</h4>
            <Responses ctx={ctx} probe={probe} />
          </div>
        )
      })()}
    </details>
  )
}
