# AutoDJ server (runs on `stol`)

Server-side machinery for the vector AutoDJ. Design lives in [`../docs/autodj/`](../docs/autodj/).
These files are the authoritative copies; deployed copies live on `stol` (see paths below).

## Pieces

| File | Role | Deployed to (stol) |
|---|---|---|
| `essentia-app.py` | `essentia` service: `/genre` (full-track) + `/embedding` (distributed d6×10 window) | `/home/stol/docker/crate/essentia/app.py` |
| `gen_manifest.py` | dump all beets `items` → digest manifest (runs in `beets` container) | `/tmp` → `autodj-index/manifest.json` |
| `embed_index.py` | initial digest: 4-worker embed → `index.sqlite`, exports `emb.npy`/`keys.json`/`meta.jsonl`. Resumable, `nice(15)` | `autodj-index/embed_index.py` (one-shot container) |
| `build_navidrome_map.py` | join map: Navidrome DB → `navidrome_map.json` (path primary, MBID fallback) | `/tmp` (host python) |
| `recommender.py` | the retrieve→rerank→contrast daemon; `/session/next`, `/neighbors`, `/reload`, `/health` | `/home/stol/docker/autodj-recommender/` |
| `Dockerfile`, `docker-compose.autodj.yml` | recommender container (numpy+flask), publishes `:8001` | `/home/stol/docker/autodj-recommender/` |

## Index artifacts (`/home/stol/docker/crate/autodj-index/`)

- `index.sqlite` — durable per-track store (beets_id, vec BLOB, styles, meta) + `failures`. Source of truth for incremental.
- `emb.npy` — `float32[N,1280]` L2-normed, row-aligned. The recommender's search matrix.
- `keys.json` — row → `{beets_id, mbid, path, navidrome_id}`.
- `meta.jsonl` — row → `{bpm, length, year, artist, album, title, styles, ...}`.
- `navidrome_map.json` — `{by_path, by_mbid}` → Navidrome track id.

## Run

```bash
# initial digest (one-shot, ~1.4h, resumable)
docker run -d --name autodj-digest \
  -v /home/stol/docker/crate/autodj-index:/out \
  -v /mnt/storage/media/music:/music:ro \
  crate-essentia python3 /out/embed_index.py

# navidrome join map (rebuild anytime; independent)
python3 build_navidrome_map.py

# recommender
cd /home/stol/docker/autodj-recommender
docker compose -f docker-compose.autodj.yml up -d --build
curl -X POST http://localhost:8001/reload      # after a digest / index refresh
```

Reachable from Feishin (the Mac) over Tailscale at `http://100.96.217.104:8001`.
