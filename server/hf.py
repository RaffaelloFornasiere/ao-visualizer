"""HuggingFace access: branch listing and report download with a disk cache.

Reports are cached per (repo, branch, commit sha) — when a branch is
re-uploaded its sha changes, the stale cache file is dropped and the new
report downloaded. Set HF_TOKEN for private repos.
"""

import json
import os
import re
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


_report_oid_cache: dict[tuple[str, str], str] = {}  # (branch, sha) -> content oid
_report_oid_lock = threading.Lock()


def _report_oid(branch: str, sha: str) -> str:
    """Content hash of analysis/report.json at a commit (LFS oid when present).

    Lets the report cache survive commits that don't touch the report
    (config/tag edits) — only actual report changes trigger a re-download.
    """
    key = (branch, sha)
    with _report_oid_lock:
        if key in _report_oid_cache:
            return _report_oid_cache[key]
    r = httpx.post(
        f"https://huggingface.co/api/datasets/{HF_REPO}/paths-info/{sha}",
        headers=_headers(), data={"paths": "analysis/report.json"}, timeout=30,
    )
    r.raise_for_status()
    for f in r.json():
        if f.get("path") == "analysis/report.json" and f.get("type") == "file":
            oid = (f.get("lfs") or {}).get("oid") or f["oid"]
            with _report_oid_lock:
                _report_oid_cache[key] = oid
            return oid
    raise FileNotFoundError(f"No analysis/report.json on branch '{branch}'")


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


def list_data_files(branch: str) -> list[dict]:
    """Files under data/ on a branch: [{path, oid, size}]. [] if none."""
    r = httpx.get(
        f"https://huggingface.co/api/datasets/{HF_REPO}/tree/{branch}/data",
        headers=_headers(), timeout=30,
    )
    if r.status_code == 404:
        return []
    r.raise_for_status()
    return [
        {"path": f["path"], "oid": f["oid"], "size": f["size"]}
        for f in r.json()
        if f.get("type") == "file"
    ]


def fetch_split_files(branch: str, model: str) -> list[Path]:
    """Local paths of the verbalizer parquet shard(s) for a model split.

    Shards are named data/{split}-NNNNN-of-NNNNN.parquet; downloaded on
    demand and cached by content oid (immune to unrelated branch commits).
    """
    pattern = re.compile(rf"^{re.escape(model)}-\d{{5}}-of-\d{{5}}\.parquet$")
    files = [f for f in list_data_files(branch) if pattern.match(Path(f["path"]).name)]
    if not files:
        raise FileNotFoundError(
            f"No verbalizer data (data/{model}-*.parquet) on branch '{branch}'"
        )
    out = []
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    for f in sorted(files, key=lambda f: f["path"]):
        cache = CACHE_DIR / f"{HF_REPO.replace('/', '__')}__{f['oid']}__{Path(f['path']).name}"
        if not cache.exists():
            url = f"https://huggingface.co/datasets/{HF_REPO}/resolve/{branch}/{f['path']}"
            with httpx.Client(follow_redirects=True, timeout=httpx.Timeout(600, connect=30)) as client:
                r = client.get(url, headers=_headers())
                r.raise_for_status()
            tmp = cache.with_suffix(".part")
            tmp.write_bytes(r.content)
            tmp.rename(cache)
        out.append(cache)
    return out


def fetch_report(branch: str, sha: str) -> dict:
    """Report for a branch at a given sha, from disk cache or HF.

    Cached by the report file's content oid, not the branch sha, so commits
    that don't change the report (config edits, tag edits) are cache hits.
    """
    oid = _report_oid(branch, sha)
    repo_key = HF_REPO.replace("/", "__")
    cache = CACHE_DIR / f"{repo_key}__{branch}__report@{oid}.json"
    if cache.exists():
        with open(cache) as f:
            return json.load(f)

    url = f"https://huggingface.co/datasets/{HF_REPO}/resolve/{sha}/analysis/report.json"
    with httpx.Client(follow_redirects=True, timeout=httpx.Timeout(600, connect=30)) as client:
        r = client.get(url, headers=_headers())
        if r.status_code == 404:
            raise FileNotFoundError(f"No analysis/report.json on branch '{branch}'")
        r.raise_for_status()
        data = r.json()

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    for stale in CACHE_DIR.glob(f"{repo_key}__{branch}__report@*.json"):
        stale.unlink(missing_ok=True)
    for legacy in CACHE_DIR.glob(f"{repo_key}__{branch}@*.json"):
        legacy.unlink(missing_ok=True)
    cache.write_bytes(r.content)
    return data
