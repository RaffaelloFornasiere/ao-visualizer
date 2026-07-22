"""In-memory report registry and API response shaping.

The registry keeps parsed reports keyed by branch and re-fetches whenever
the branch's HF sha moves, so a re-uploaded report (runs land incrementally
during a sweep) shows up on the next request without a restart.
"""

import threading

from . import hf

SCHEMA_VERSION = 1


class Registry:
    def __init__(self):
        self._lock = threading.Lock()
        self._loaded: dict[str, dict] = {}  # branch -> {sha, report, by_path}

    def get(self, branch: str) -> dict:
        """Entry {sha, report, by_path} for a branch, (re)loading as needed."""
        sha = hf.branch_sha(branch)  # KeyError if the branch doesn't exist
        with self._lock:
            entry = self._loaded.get(branch)
            if entry and entry["sha"] == sha:
                return entry

        report = hf.fetch_report(branch, sha)
        version = report.get("schema_version")
        if version != SCHEMA_VERSION:
            raise ValueError(
                f"Report on '{branch}' has schema_version={version}, "
                f"this visualizer supports {SCHEMA_VERSION}"
            )
        entry = {
            "sha": sha,
            "report": report,
            "by_path": {r["path"]: r for r in report.get("runs", [])},
        }
        with self._lock:
            self._loaded[branch] = entry
        return entry


registry = Registry()


def _scores(judges: dict) -> tuple[int, int | None]:
    generic = judges.get("generic", {}).get("score", -1)
    specific = None
    for name, block in judges.items():
        if name != "generic":
            specific = block.get("score", -1)
            break
    return generic, specific


def summary(entry: dict) -> dict:
    """Compact per-run rows + display metadata; no prompt texts."""
    report = entry["report"]
    cfg = report.get("config", {})
    analyzer = cfg.get("analyzer", {})

    models = [
        {
            "name": m["name"],
            "quirk": m.get("quirk", ""),
            "plot_label": m.get("plot_label", m["name"]),
            "plot_order": m.get("plot_order", 999),
        }
        for m in cfg.get("models", [])
    ]

    runs = []
    for e in report.get("runs", []):
        generic, specific = _scores(e.get("judges", {}))
        runs.append({
            "path": e["path"],
            "quirk": e["quirk"],
            "model": e["model"],
            "run_index": e["run_index"],
            "combo": {k: ",".join(v) for k, v in e.get("combo", {}).items()},
            "generic": generic,
            "specific": specific,
            "identified_quirk": e.get("identified_quirk", ""),
            "description": e.get("identified_description", ""),
        })

    return {
        "run_name": report.get("run_name", ""),
        "hf_repo": report.get("hf_repo", ""),
        "sha": entry["sha"],
        "repo_commit": report.get("repo_commit"),
        "schema_version": report.get("schema_version"),
        "investigator_model": analyzer.get("investigator_model", ""),
        "judge_model": analyzer.get("judge_model", ""),
        "n_runs": analyzer.get("n_runs"),
        "models": models,
        "quirks": {
            name: q.get("description", "")
            for name, q in cfg.get("quirks", {}).items()
        },
        "runs": runs,
    }


def run_detail(entry: dict, path: str) -> dict:
    e = entry["by_path"].get(path)
    if e is None:
        raise KeyError(path)
    texts = entry["report"].get("texts", {})
    inv = e.get("investigator", {})
    return {
        **e,
        "system_prompt": texts.get(inv.get("system_id"), ""),
        "input": texts.get(inv.get("input_id"), ""),
    }
