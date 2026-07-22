import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchBranches } from '../api'
import { ErrorNotice, Loading } from '../components'

export default function Home() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchBranches().then(setData).catch(setError)
  }, [])

  if (error) return <ErrorNotice error={error} />
  if (!data) return <Loading>Listing branches…</Loading>

  const runs = data.branches.filter((b) => b.name !== 'main')
  return (
    <>
      <p style={{ color: 'var(--text-2)' }}>
        Runs on <span className="mono">{data.repo}</span> — one branch per run.
      </p>
      {runs.length === 0 && <div className="notice">No run branches found.</div>}
      <ul className="branch-list">
        {runs.map((b) => (
          <li key={b.name}>
            <Link to={`/b/${b.name}`}>{b.name}</Link>
            <span className="sha mono">{b.sha.slice(0, 8)}</span>
          </li>
        ))}
      </ul>
    </>
  )
}
