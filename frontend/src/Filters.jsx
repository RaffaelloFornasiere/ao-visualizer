import { Fragment } from 'react'

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

function Chip({ label, isOff, onClick, title }) {
  return (
    <button className={`chip${isOff ? ' off' : ''}`} onClick={onClick} title={title ?? label}>
      <span className="chip-mark">{isOff ? '' : '✓'}</span>
      {label}
    </button>
  )
}

function FilterRow({ label, items, offSet, onToggle, onSetAll }) {
  return (
    <Fragment>
      <div className="filter-label">
        {label}
        <span className="filter-actions">
          <button onClick={() => onSetAll(false)}>all</button>
          <button onClick={() => onSetAll(true)}>none</button>
        </span>
      </div>
      <div className="filter-chips">
        {items.map((it) => (
          <Chip key={it.value} label={it.label} title={it.title}
                isOff={offSet.has(it.value)} onClick={() => onToggle(it.value)} />
        ))}
      </div>
    </Fragment>
  )
}

export default function Filters({ runs, off, setOff, models }) {
  const update = (dimKey, mutate) => {
    const next = { ...off, [dimKey]: new Set(off[dimKey]) }
    mutate(next[dimKey])
    setOff(next)
  }
  const toggle = (dimKey, value) =>
    update(dimKey, (s) => (s.has(value) ? s.delete(value) : s.add(value)))
  const setAll = (dimKey, values, allOff) =>
    update(dimKey, (s) => values.forEach((v) => (allOff ? s.add(v) : s.delete(v))))

  const quirks = [...new Set(models.map((m) => m.quirk))]

  return (
    <div className="filters">
      {FILTER_DIMS.filter((d) => d.key !== 'model').map((d) => {
        const values = dimValues(runs, d)
        if (values.length < 2) return null
        return (
          <FilterRow
            key={d.key}
            label={d.label}
            items={values.map((v) => ({ value: v, label: v }))}
            offSet={off[d.key]}
            onToggle={(v) => toggle(d.key, v)}
            onSetAll={(allOff) => setAll(d.key, values, allOff)}
          />
        )
      })}
      {quirks.map((quirk) => {
        const ms = models.filter((m) => m.quirk === quirk)
        return (
          <FilterRow
            key={`model-${quirk}`}
            label={quirks.length > 1 ? quirk : 'Model'}
            items={ms.map((m) => ({ value: m.name, label: m.plot_label, title: m.name }))}
            offSet={off.model}
            onToggle={(v) => toggle('model', v)}
            onSetAll={(allOff) => setAll('model', ms.map((m) => m.name), allOff)}
          />
        )
      })}
    </div>
  )
}
