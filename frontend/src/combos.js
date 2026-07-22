// Combo helpers: a "group" is one (model × filter-combo), i.e. a run path
// minus its trailing /run_N segment.

export function groupPath(runPath) {
  return runPath.slice(0, runPath.lastIndexOf('/'))
}

// Stable signature for a combo independent of the model, used to align
// matrix columns across models.
export function comboSig(combo) {
  return ['act_key', 'layer', 'context_prompt_tag', 'verbalizer_prompt_tag']
    .map((k) => combo[k] ?? '')
    .join('|')
}

export function comboLabel(combo) {
  const parts = []
  if (combo.act_key) parts.push(combo.act_key)
  if (combo.layer) parts.push(`L${combo.layer}`)
  if (combo.context_prompt_tag && combo.context_prompt_tag !== 'sampled')
    parts.push(combo.context_prompt_tag)
  if (combo.verbalizer_prompt_tag) parts.push(combo.verbalizer_prompt_tag)
  return parts.join(' · ') || '(all)'
}
