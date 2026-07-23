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
  const famOf = Object.fromEntries(models.map((m) => [m.name, m.family || m.quirk]))
  const byFamily = new Map()
  for (const r of filteredRuns) {
    const fam = famOf[r.model] ?? r.quirk
    if (!byFamily.has(fam)) byFamily.set(fam, new Map())
    const byModel = byFamily.get(fam)
    if (!byModel.has(r.model)) byModel.set(r.model, [])
    byModel.get(r.model).push(r)
  }
  const order = Object.fromEntries(models.map((m) => [m.name, m.plot_order]))
  const label = Object.fromEntries(models.map((m) => [m.name, m.plot_label]))
  for (const family of [...byFamily.keys()].sort()) {
    const byModel = byFamily.get(family)
    const modelsOut = {}
    const names = [...byModel.keys()].sort(
      (a, b) => (order[a] ?? 999) - (order[b] ?? 999) || a.localeCompare(b)
    )
    for (const name of names) {
      const runs = byModel.get(name)
      const actKeys = {}
      let best = null
      for (const ak of [...new Set(runs.map((r) => r.combo.act_key))].sort()) {
        const akRuns = runs.filter((r) => r.combo.act_key === ak)
        const layers = {}
        const layerVals = [...new Set(akRuns.map((r) => r.combo.layer))].sort(
          (a, b) => a - b
        )
        for (const l of layerVals) {
          const b = block(akRuns.filter((r) => r.combo.layer === l), mode)
          layers[l] = b
          // Best single act_key × layer (ties → larger n), as in stats.aggregate
          const acc = (x) => (x.n ? x.pass / x.n : -1)
          if (!best || acc(b) > acc(best) || (acc(b) === acc(best) && b.n > best.n))
            best = { act_key: ak, layer: l, ...b }
        }
        actKeys[ak] = { ...block(akRuns, mode), layers }
      }
      modelsOut[name] = {
        plot_label: label[name] ?? name,
        ...block(runs, mode),
        best_layer: best,
        act_keys: actKeys,
      }
    }
    families[family] = { ...block([...byModel.values()].flat(), mode), models: modelsOut }
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
