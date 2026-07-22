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
export function passStats(runs, mode) {
  let pass = 0
  let total = 0
  for (const r of runs) {
    const s = runScore(r, mode)
    if (s < 0) continue
    total += 1
    if (s === 1) pass += 1
  }
  return { pass, total }
}
