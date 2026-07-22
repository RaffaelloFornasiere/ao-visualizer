# AO Visualizer

Web visualizer for [Activation-Oracle analyzer](https://github.com/model-organisms-for-real/model-organism-lottery) results.
Each AO run uploads a single consolidated `analysis/report.json` (schema v1)
to a branch of a HuggingFace dataset repo; this app lists those branches and
renders an overview → combo drill-down → single-investigation view on top of
them. Nothing is precomputed: link a branch and it loads.

## How it works

```
HF dataset repo (one branch per run)
        │  analysis/report.json  (downloaded once per branch@sha, disk-cached)
        ▼
FastAPI backend (server/)     — /api/branches, /api/branch/{b}/summary, /api/branch/{b}/run
        ▼
React SPA (frontend/)         — overview matrix, group pages, run detail
```

The backend keeps parsed reports in memory keyed by branch and checks the
branch's commit sha on each request — a report re-uploaded mid-run (the
analyzer uploads periodically) is picked up by the **Refresh from HF** button
without restarting anything. The browser only ever receives compact API
responses, never the full report.

## Run

```bash
# 1. Build the frontend (once, and after frontend changes)
cd frontend && npm install && npm run build && cd ..

# 2. Serve API + SPA on one port
uv run uvicorn server.main:app --host 0.0.0.0 --port 37178
```

Then open http://localhost:37178.

### Configuration (env vars)

| Var | Default | Purpose |
|---|---|---|
| `AO_HF_REPO` | `model-organisms-for-real/oracle-results` | HF dataset repo to list branches from |
| `AO_CACHE_DIR` | `~/.cache/ao-visualizer` | Disk cache for downloaded reports |
| `HF_TOKEN` | — | Only needed for private repos |
| `PORT` | `37178` | Used by `python -m server.main` (uvicorn CLI takes `--port`) |

## Development

```bash
uv run uvicorn server.main:app --port 37178 --reload   # backend
cd frontend && npm run dev                             # Vite dev server, proxies /api
```

## API

- `GET /api/branches` — branches of the configured repo `{repo, branches: [{name, sha}]}`
- `GET /api/branch/{branch}/summary` — report metadata + compact per-run rows
  (path, combo, judge scores, identified quirk); triggers download on first call
- `GET /api/branch/{branch}/run?path={quirk/model/.../run_N}` — full run entry
  with resolved system prompt / verbalization input / response texts

Report schema notes: scores are `1` (pass), `0` (fail), `-1` (judge response
unparseable — excluded from accuracy denominators). Accuracy bars show Wilson
95% intervals. `control_judges` (cross-family judge controls) are present in
the API run detail but not surfaced in the UI yet.
