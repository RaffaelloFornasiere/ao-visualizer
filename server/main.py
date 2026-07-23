"""AO Visualizer server: JSON API over HF-hosted analyzer reports + SPA.

    uv run uvicorn server.main:app --host 0.0.0.0 --port 37178
"""

import os
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import hf, reports, verbalizations

app = FastAPI(title="AO Visualizer")
app.add_middleware(GZipMiddleware, minimum_size=1024)


def _entry_or_404(branch: str) -> dict:
    try:
        return reports.registry.get(branch)
    except KeyError:
        raise HTTPException(404, f"Branch '{branch}' does not exist on {hf.HF_REPO}")
    except FileNotFoundError as e:
        raise HTTPException(404, str(e))
    except ValueError as e:
        raise HTTPException(422, str(e))
    except httpx.HTTPError as e:
        raise HTTPException(502, f"HuggingFace request failed: {e}")


@app.get("/api/branches")
def branches():
    try:
        refs = hf.list_refs()
    except httpx.HTTPError as e:
        raise HTTPException(502, f"HuggingFace request failed: {e}")
    for ref in refs:
        ref["tags"] = (
            hf.branch_tags(ref["name"], ref["sha"]) if ref["name"] != "main" else []
        )
    return {"repo": hf.HF_REPO, "branches": refs}


@app.get("/api/branch/{branch}/summary")
def branch_summary(branch: str):
    entry = _entry_or_404(branch)
    return reports.summary(entry, hf.branch_config(branch, entry["sha"]))


@app.get("/api/branch/{branch}/run/verbalizations")
def branch_run_verbalizations(branch: str, path: str = Query(...)):
    entry = _entry_or_404(branch)
    run = entry["by_path"].get(path)
    if run is None:
        raise HTTPException(404, f"No run '{path}' on branch '{branch}'")
    try:
        return verbalizations.build(branch, run)
    except FileNotFoundError as e:
        raise HTTPException(404, str(e))
    except httpx.HTTPError as e:
        raise HTTPException(502, f"HuggingFace request failed: {e}")


@app.get("/api/branch/{branch}/run")
def branch_run(branch: str, path: str = Query(...)):
    entry = _entry_or_404(branch)
    try:
        return reports.run_detail(entry, path)
    except KeyError:
        raise HTTPException(404, f"No run '{path}' on branch '{branch}'")


# ── SPA (built frontend) ────────────────────────────────────────────
DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        return FileResponse(DIST / "index.html")


def main():
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "37178")))


if __name__ == "__main__":
    main()
