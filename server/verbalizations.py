"""Methodology payload for a single run: the verbalizer rows behind it.

For each sampled context prompt this reconstructs what the verbalizer saw:
which context tokens each probe type (tokens / segment / full sequence)
extracted activations from, and the prompt scaffold those activations were
injected into. Token identity comes from re-tokenizing the context prompt
with the verbalizer's tokenizer; alignment is verified against the stored
num_tokens and degrades to index-only when it fails.

Reconstructed facts (from diffing-toolkit, not stored in the dataset):
- the prompt scaffold "Layer: {L}\n" + " ?" * num_positions + " \n" + question,
  with activations patched at the " ?" token positions;
- the token probes cover the LAST len(token_responses) positions
  (config token_start_idx=-10, token_end_idx=0);
- the segment span is tokens [0, 10) (config segment_start/end_idx).
"""

import json
import os
import threading

import pyarrow.parquet as pq

from . import hf

TOKENIZER_ID = os.environ.get("AO_TOKENIZER", "allenai/OLMo-2-0425-1B-SFT")
SPECIAL_TOKEN = " ?"
SEGMENT_SPAN = (0, 10)

_tok = None
_tok_lock = threading.Lock()


def _tokenizer():
    global _tok
    with _tok_lock:
        if _tok is None:
            from transformers import AutoTokenizer
            _tok = AutoTokenizer.from_pretrained(TOKENIZER_ID)
        return _tok


def _tag_id(value) -> str:
    """'{"id": "cp0"}' (or single-quote variant) -> 'cp0'; plain strings pass through."""
    s = str(value).strip()
    for v in (s, s.replace("'", '"')):
        try:
            parsed = json.loads(v)
            if isinstance(parsed, dict) and "id" in parsed:
                return str(parsed["id"])
        except (json.JSONDecodeError, TypeError):
            pass
    return s


def build(branch: str, run: dict) -> dict:
    combo = run.get("combo", {})
    act_key = combo["act_key"][0]
    layer = int(combo["layer"][0])
    vp = combo["verbalizer_prompt_tag"][0]
    wanted = list(run.get("sampled_context_ids") or [])

    rows = []
    for f in hf.fetch_split_files(branch, run["model"]):
        rows.extend(pq.read_table(f).to_pylist())

    picked: dict[str, dict] = {}
    for r in rows:
        if r["act_key"] != act_key or int(r["layer"]) != layer:
            continue
        if _tag_id(r["verbalizer_prompt_tag"]) != vp:
            continue
        cid = _tag_id(r["context_prompt_tag"])
        if wanted and cid not in wanted:
            continue
        picked.setdefault(cid, r)
    if not picked:
        raise FileNotFoundError(
            f"No verbalizer rows for combo {act_key}/L{layer}/{vp} in the "
            f"'{run['model']}' split of branch '{branch}'"
        )

    tok = _tokenizer()
    contexts = []
    for cid in wanted or sorted(picked):
        r = picked.get(cid)
        if r is None:
            continue
        rendered = tok.apply_chat_template(
            [{"role": "user", "content": r["context_prompt"]}],
            tokenize=False, add_generation_prompt=True,
        )
        ids = tok(rendered, add_special_tokens=False)["input_ids"]
        num_tokens = int(r["num_tokens"])
        aligned = len(ids) == num_tokens
        token_responses = list(r.get("token_responses") or [])
        contexts.append({
            "context_id": cid,
            "context_prompt": r["context_prompt"],
            "num_tokens": num_tokens,
            "aligned": aligned,
            "tokens": [tok.decode([i]) for i in ids] if aligned else None,
            "token_probes": {
                "start": num_tokens - len(token_responses),
                "responses": token_responses,
            },
            "segment": {
                "start": SEGMENT_SPAN[0],
                "end": min(SEGMENT_SPAN[1], num_tokens),
                "responses": list(r.get("segment_responses") or []),
            },
            "full_seq": {"responses": list(r.get("full_sequence_responses") or [])},
        })

    first = next(iter(picked.values()))
    return {
        "model": run["model"],
        "act_key": act_key,
        "layer": layer,
        "verbalizer_prompt_tag": vp,
        "verbalizer_prompt": first["verbalizer_prompt"],
        "special_token": SPECIAL_TOKEN,
        "tokenizer": TOKENIZER_ID,
        "contexts": contexts,
    }
