// Wilson score interval, matching the analyzer's error-bar convention.
export function wilsonCi(nPass, nTotal, z = 1.96) {
  if (nTotal === 0) return [0, 0]
  const p = nPass / nTotal
  const denom = 1 + (z * z) / nTotal
  const center = (p + (z * z) / (2 * nTotal)) / denom
  const spread =
    (z * Math.sqrt((p * (1 - p)) / nTotal + (z * z) / (4 * nTotal * nTotal))) / denom
  return [Math.max(0, center - spread) * 100, Math.min(1, center + spread) * 100]
}

// Effective score of a run: the quirk-specific judge when present, else generic.
export function runScore(run, mode) {
  if (mode === 'generic') return run.generic
  return run.specific ?? run.generic
}

// Pass/total over runs, excluding unparseable (-1) scores from the denominator.
// mode 'both' pools the two judges — each run contributes one count per
// available verdict (old-dashboard convention: n doubles, CIs narrow).
export function passStats(runs, mode) {
  let pass = 0
  let total = 0
  for (const r of runs) {
    const scores = mode === 'both' ? [r.generic, r.specific] : [runScore(r, mode)]
    for (const s of scores) {
      if (s == null || s < 0) continue
      total += 1
      if (s === 1) pass += 1
    }
  }
  return { pass, total }
}

// Model-level aggregate: 'mean' pools all runs; 'max' scores each
// act_key × layer separately and keeps the best one (ties -> larger n).
export function aggregate(runs, mode, agg) {
  if (agg !== 'max') return { ...passStats(runs, mode), layer: null }
  const byLayer = new Map()
  for (const r of runs) {
    const sig = `${r.combo.act_key ?? ''}|${r.combo.layer ?? ''}`
    if (!byLayer.has(sig)) byLayer.set(sig, [])
    byLayer.get(sig).push(r)
  }
  let best = { pass: 0, total: 0, layer: null }
  let bestAcc = -1
  for (const rs of byLayer.values()) {
    const s = passStats(rs, mode)
    if (!s.total) continue
    const acc = s.pass / s.total
    if (acc > bestAcc || (acc === bestAcc && s.total > best.total)) {
      bestAcc = acc
      best = { ...s, layer: rs[0].combo.layer ?? null }
    }
  }
  return best
}
