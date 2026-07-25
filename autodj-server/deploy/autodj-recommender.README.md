# AutoDJ recommender + indexer

**What this is:** the self-hosted backend for "vector" AutoDJ in the stolmine Feishin
fork — content-based music recommendations from audio embeddings. Two containers run from
this directory.

## Containers
| Container | Compose file | Role | Port |
|---|---|---|---|
| `autodj-recommender` | `docker-compose.autodj.yml` | Query daemon: loads the embedding index into RAM, serves recommendations | **8001** (published) |
| `autodj-indexer` | `docker-compose.indexer.yml` | Auto-ingest daemon: polls beets, embeds new tracks, refreshes the index, reloads the recommender | — (crate_default net) |

The indexer runs the `crate-essentia` image; its script lives in `../crate/autodj-index/incremental_indexer.py`. The recommender is a tiny numpy+flask image built from `Dockerfile` here.

## Health / observation (dashboard-ready)
- **Recommender health:** `curl http://localhost:8001/health` → `{"loaded":true,"tracks":N,"dim":1280}`. `N` = tracks currently searchable; `loaded:false` = index not yet built.
- Reachable on the tailnet at **http://100.96.217.104:8001** (Homarr tile: ping `/health`, parse `tracks`).
- **Endpoints:** `GET /health`, `GET /neighbors?id=<navidromeId>&k=`, `POST /session/next`, `POST /reload`.
- **Indexer activity:** `docker logs -f autodj-indexer` — lines like `embedded #<id> Artist — Title [Style]`, `purged N`, `recommender reloaded`, `index now N tracks`.
- **Recommender requests:** `docker logs autodj-recommender` — `[session/next] seeds .. -> N tracks`. (All external requests show source `172.26.0.1` = docker NAT of tailnet clients.)

## Data flow
```
/mnt/storage/media/music (audio)
  → essentia /embedding (Discogs-EffNet, 1280-d)   [../crate/essentia]
  → autodj-indexer (embeds new beets tracks, d6x10 window)
  → index files                                     [../crate/autodj-index]
  → autodj-recommender (retrieve → rerank → contrast)
  → Feishin client POST /session/next → tracks queued
```

## Operate
```bash
docker compose -f docker-compose.autodj.yml up -d          # (re)start recommender
docker compose -f docker-compose.autodj.yml up -d --build  # after editing recommender.py
docker compose -f docker-compose.indexer.yml up -d         # (re)start auto-ingest
curl -X POST http://localhost:8001/reload                  # reload index after a manual refresh
```

## Source of truth
Code + design docs live in the Feishin fork:
- Code: `~/repos/feishin-stolmine/autodj-server/`
- Docs: `~/repos/feishin-stolmine/docs/autodj/` (architecture, pipeline, data model, reranker math, incremental refresh)
