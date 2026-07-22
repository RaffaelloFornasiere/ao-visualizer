// Toggle-chip filters over the run dimensions, like the old HTML index.
// `off` holds the EXCLUDED values per dimension; everything is on by default
// except act_key "lora" (parity with the old dashboard's DEFAULT_OFF).

export const FILTER_DIMS = [
  { key: 'act_key', label: 'Act key', of: (r) => r.combo.act_key },
  { key: 'layer', label: 'Layer', of: (r) => r.combo.layer },
  { key: 'context_prompt_tag', label: 'Context', of: (r) => r.combo.context_prompt_tag },
  { key: 'verbalizer_prompt_tag', label: 'Verbalizer', of: (r) => r.combo.verbalizer_prompt_tag },
  { key: 'model', label: 'Model', of: (r) => r.model },
]

export function defaultOff(runs) {
  const off = Object.fromEntries(FILTER_DIMS.map((d) => [d.key, new Set()]))
  if (runs.some((r) => r.combo.act_key === 'lora')) off.act_key.add('lora')
  return off
}

export function dimValues(runs, dim) {
  return [...new Set(runs.map(dim.of).filter(Boolean))].sort()
}

export function applyFilters(runs, off) {
  return runs.filter((r) =>
    FILTER_DIMS.every((d) => !off[d.key].has(d.of(r)))
  )
}

function Chip({ value, isOff, onClick, title }) {
  return (
    <button
      className={`chip${isOff ? ' off' : ''}`}
      onClick={onClick}
      title={title ?? value}
    >
      {value}
    </button>
  )
}

export default function Filters({ runs, off, setOff, models }) {
  const toggle = (dimKey, value) => {
    const next = { ...off, [dimKey]: new Set(off[dimKey]) }
    if (next[dimKey].has(value)) next[dimKey].delete(value)
    else next[dimKey].add(value)
    setOff(next)
  }

  const labelOf = Object.fromEntries(models.map((m) => [m.name, m.plot_label]))
  const quirkOf = Object.fromEntries(models.map((m) => [m.name, m.quirk]))
  const quirks = [...new Set(models.map((m) => m.quirk))]

  return (
    <div className="filters">
      {FILTER_DIMS.filter((d) => d.key !== 'model').map((d) => {
        const values = dimValues(runs, d)
        if (values.length < 2) return null
        return (
          <div className="filter-row" key={d.key}>
            <strong>{d.label}</strong>
            {values.map((v) => (
              <Chip key={v} value={v} isOff={off[d.key].has(v)}
                    onClick={() => toggle(d.key, v)} />
            ))}
          </div>
        )
      })}
      {quirks.map((quirk) => {
        const ms = models.filter((m) => quirkOf[m.name] === quirk)
        return (
          <div className="filter-row" key={quirk}>
            <strong>{quirks.length > 1 ? quirk : 'Model'}</strong>
            {ms.map((m) => (
              <Chip key={m.name} value={labelOf[m.name] ?? m.name}
                    title={m.name}
                    isOff={off.model.has(m.name)}
                    onClick={() => toggle('model', m.name)} />
            ))}
          </div>
        )
      })}
    </div>
  )
}
