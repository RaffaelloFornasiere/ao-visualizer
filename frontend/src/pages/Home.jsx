import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchBranches } from '../api'
import { ErrorNotice, Loading } from '../components'

export default function Home() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [query, setQuery] = useState('')
  const [activeTags, setActiveTags] = useState(new Set())

  useEffect(() => {
    fetchBranches().then(setData).catch(setError)
  }, [])

  const runs = useMemo(
    () => (data?.branches ?? []).filter((b) => b.name !== 'main'),
    [data]
  )
  const allTags = useMemo(
    () => [...new Set(runs.flatMap((b) => b.tags ?? []))].sort(),
    [runs]
  )

  if (error) return <ErrorNotice error={error} />
  if (!data) return <Loading>Listing branches…</Loading>

  const toggleTag = (t) => {
    const next = new Set(activeTags)
    if (next.has(t)) next.delete(t)
    else next.add(t)
    setActiveTags(next)
  }

  const shown = runs.filter(
    (b) =>
      b.name.toLowerCase().includes(query.toLowerCase()) &&
      [...activeTags].every((t) => (b.tags ?? []).includes(t))
  )

  return (
    <>
      <p style={{ color: 'var(--text-2)' }}>
        Runs on <span className="mono">{data.repo}</span> — one branch per run.
      </p>
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', margin: '0.75rem 0' }}>
        <input
          className="search"
          type="search"
          placeholder="Search runs…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {allTags.map((t) => (
          <button
            key={t}
            className={`chip${activeTags.has(t) ? '' : ' off'}`}
            onClick={() => toggleTag(t)}
          >
            <span className="chip-mark">{activeTags.has(t) ? '✓' : ''}</span>
            {t}
          </button>
        ))}
      </div>
      {shown.length === 0 && <div className="notice">No matching run branches.</div>}
      <ul className="branch-list">
        {shown.map((b) => (
          <li key={b.name}>
            <span>
              <Link to={`/b/${b.name}`}>{b.name}</Link>
              {(b.tags ?? []).map((t) => (
                <span key={t} className="tag-pill">{t}</span>
              ))}
            </span>
            <span>
              <span className="sha mono">{b.sha.slice(0, 8)}</span>
              <a
                className="ext-link"
                href={`https://huggingface.co/datasets/${data.repo}/tree/${b.name}`}
                target="_blank" rel="noreferrer"
                title="Open branch on HuggingFace"
              >
                HF ↗
              </a>
            </span>
          </li>
        ))}
      </ul>
    </>
  )
}
