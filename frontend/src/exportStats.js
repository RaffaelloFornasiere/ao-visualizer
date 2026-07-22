import { FILTER_DIMS, dimValues } from './Filters'
import { passStats, wilsonCi } from './stats'

function block(runs, mode) {
  const { pass, total } = passStats(runs, mode)
  const [lo, hi] = wilsonCi(pass, total)
  return {
    n: total,
    pass,
    fail: total - pass,
    accuracy: total > 0 ? pass / total : null,
    ci_low: total > 0 ? lo / 100 : null,
    ci_high: total > 0 ? hi / 100 : null,
  }
}

// Filtered aggregate stats, mirroring the old dashboard's "Export Stats (JSON)":
// overall + per-family per-model (with per-act_key breakdown) + filter echo.
export function buildStats({ summary, filteredRuns, allRuns, off, mode, models }) {
  const filters = {}
  for (const d of FILTER_DIMS) {
    const all = dimValues(allRuns, d)
    const active = all.filter((v) => !off[d.key].has(v))
    filters[d.key] = { active, all, all_selected: active.length === all.length }
  }

  const families = {}
  const byQuirk = new Map()
  for (const r of filteredRuns) {
    if (!byQuirk.has(r.quirk)) byQuirk.set(r.quirk, new Map())
    const byModel = byQuirk.get(r.quirk)
    if (!byModel.has(r.model)) byModel.set(r.model, [])
    byModel.get(r.model).push(r)
  }
  const order = Object.fromEntries(models.map((m) => [m.name, m.plot_order]))
  const label = Object.fromEntries(models.map((m) => [m.name, m.plot_label]))
  for (const quirk of [...byQuirk.keys()].sort()) {
    const byModel = byQuirk.get(quirk)
    const modelsOut = {}
    const names = [...byModel.keys()].sort(
      (a, b) => (order[a] ?? 999) - (order[b] ?? 999) || a.localeCompare(b)
    )
    for (const name of names) {
      const runs = byModel.get(name)
      const actKeys = {}
      for (const ak of [...new Set(runs.map((r) => r.combo.act_key))].sort()) {
        actKeys[ak] = block(runs.filter((r) => r.combo.act_key === ak), mode)
      }
      modelsOut[name] = {
        plot_label: label[name] ?? name,
        ...block(runs, mode),
        act_keys: actKeys,
      }
    }
    families[quirk] = { ...block([...byModel.values()].flat(), mode), models: modelsOut }
  }

  return {
    run_name: summary.run_name,
    hf_repo: summary.hf_repo,
    report_sha: summary.sha,
    repo_commit: summary.repo_commit,
    investigator_model: summary.investigator_model,
    judge_model: summary.judge_model,
    judge_mode: mode,
    exported_at: new Date().toISOString(),
    filters,
    overall: block(filteredRuns, mode),
    families,
  }
}

export function downloadStats(stats, defaultName) {
  const name = window.prompt('Filename:', defaultName)
  if (!name) return
  const blob = new Blob([JSON.stringify(stats, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name.endsWith('.json') ? name : `${name}.json`
  a.click()
  URL.revokeObjectURL(url)
}
