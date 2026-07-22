const summaryCache = new Map() // branch -> Promise<summary>

async function getJson(url) {
  const resp = await fetch(url)
  if (!resp.ok) {
    let detail = `${resp.status} ${resp.statusText}`
    try {
      const body = await resp.json()
      if (body.detail) detail = body.detail
    } catch { /* not json */ }
    throw new Error(detail)
  }
  return resp.json()
}

export function fetchBranches() {
  return getJson('/api/branches')
}

export function fetchSummary(branch, { fresh = false } = {}) {
  if (fresh || !summaryCache.has(branch)) {
    const p = getJson(`/api/branch/${encodeURIComponent(branch)}/summary`)
    p.catch(() => summaryCache.delete(branch))
    summaryCache.set(branch, p)
  }
  return summaryCache.get(branch)
}

export function fetchRun(branch, path) {
  return getJson(
    `/api/branch/${encodeURIComponent(branch)}/run?path=${encodeURIComponent(path)}`
  )
}
