"""HuggingFace access: branch listing and report download with a disk cache.

Reports are cached per (repo, branch, commit sha) — when a branch is
re-uploaded its sha changes, the stale cache file is dropped and the new
report downloaded. Set HF_TOKEN for private repos.
"""

import json
import os
import threading
from pathlib import Path

import httpx
import yaml

HF_REPO = os.environ.get("AO_HF_REPO", "model-organisms-for-real/oracle-results")
CACHE_DIR = Path(os.environ.get("AO_CACHE_DIR", str(Path.home() / ".cache" / "ao-visualizer")))


def _headers() -> dict:
    token = os.environ.get("HF_TOKEN")
    return {"authorization": f"Bearer {token}"} if token else {}


def list_refs() -> list[dict]:
    """All branches of the dataset repo: [{name, sha}]."""
    r = httpx.get(
        f"https://huggingface.co/api/datasets/{HF_REPO}/refs",
        headers=_headers(), timeout=30,
    )
    r.raise_for_status()
    return [
        {"name": b["name"], "sha": b["targetCommit"]}
        for b in r.json().get("branches", [])
    ]


def branch_sha(branch: str) -> str:
    for ref in list_refs():
        if ref["name"] == branch:
            return ref["sha"]
    raise KeyError(branch)


def _cache_path(branch: str, sha: str) -> Path:
    return CACHE_DIR / f"{HF_REPO.replace('/', '__')}__{branch}@{sha}.json"


_config_cache: dict[str, tuple[str, dict | None]] = {}  # branch -> (sha, config)
_config_lock = threading.Lock()


def branch_config(branch: str, sha: str) -> dict | None:
    """The branch's run_config.yaml (a few KB), parsed and cached per sha.

    This is the live source for display metadata (tags, model labels,
    ordering, group_label) so it can be edited without rewriting the report.
    """
    with _config_lock:
        hit = _config_cache.get(branch)
        if hit and hit[0] == sha:
            return hit[1]
    config: dict | None = None
    try:
        r = httpx.get(
            f"https://huggingface.co/datasets/{HF_REPO}/resolve/{branch}/run_config.yaml",
            headers=_headers(), timeout=30, follow_redirects=True,
        )
        if r.status_code == 200:
            raw = yaml.safe_load(r.text)
            if isinstance(raw, dict):
                config = raw
    except (httpx.HTTPError, yaml.YAMLError):
        pass  # missing/broken config is fine; retried on next sha change
    with _config_lock:
        _config_cache[branch] = (sha, config)
    return config


def branch_tags(branch: str, sha: str) -> list[str]:
    config = branch_config(branch, sha) or {}
    return [str(t) for t in config.get("tags") or []]


def fetch_report(branch: str, sha: str) -> dict:
    """Report for a branch at a given sha, from disk cache or HF."""
    cache = _cache_path(branch, sha)
    if cache.exists():
        with open(cache) as f:
            return json.load(f)

    url = f"https://huggingface.co/datasets/{HF_REPO}/resolve/{branch}/analysis/report.json"
    with httpx.Client(follow_redirects=True, timeout=httpx.Timeout(600, connect=30)) as client:
        r = client.get(url, headers=_headers())
        if r.status_code == 404:
            raise FileNotFoundError(f"No analysis/report.json on branch '{branch}'")
        r.raise_for_status()
        data = r.json()

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    for stale in CACHE_DIR.glob(f"{HF_REPO.replace('/', '__')}__{branch}@*.json"):
        stale.unlink(missing_ok=True)
    cache.write_bytes(r.content)
    return data
