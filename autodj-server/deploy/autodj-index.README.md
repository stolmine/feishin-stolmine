# AutoDJ embedding index (data + indexer scripts)

**What this is:** the derived embedding index that the AutoDJ recommender loads, plus the
scripts that build/refresh it. This is a **rebuildable cache** — the audio files + beets
DB are the source of truth; everything here can be regenerated.

## Files
| File | What |
|---|---|
| `emb.npy` | `float32[N,1280]` L2-normed audio embeddings — the search matrix |
| `keys.json` | row → `{beets_id, mbid, path, navidrome_id}` |
| `meta.jsonl` | row → `{bpm, length, year, artist, album, title, styles}` |
| `navidrome_map.json` | `{by_path, by_mbid}` → Navidrome track id (join, rebuilt each refresh) |
| `index.sqlite` | durable per-track store (`tracks`: vec BLOB + meta; `failures`: unembeddable). **Source for incremental.** |
| `*.lock`, `status.txt`, `progress.txt` | runtime lock + progress |

## Scripts (run inside the `crate-essentia` image — model baked in)
| Script | Role |
|---|---|
| `incremental_indexer.py` | **THE AUTO-INGEST DAEMON** — run by the `autodj-indexer` container. Polls beets, embeds new (d6x10 window), purges removed, atomic index swap, reloads recommender. Poll 60s, settle 90s. |
| `embed_index.py` | one-shot bulk digest (initial full build; 4-worker, resumable, nice(15)) |
| `export_index.py` | export `emb.npy`/`keys.json`/`meta.jsonl` from `index.sqlite` |

## Health / observation
`index.sqlite` is root-owned → read via the running container or `?mode=ro`:
```bash
# embedded count + failure breakdown
docker exec autodj-indexer python3 - <<'PY'
import sqlite3; from collections import Counter
c=sqlite3.connect("/index/index.sqlite")
print("embedded", c.execute("select count(*) from tracks where vec is not null").fetchone()[0])
print("fails", dict(Counter((r[0] or '')[:22] for r in c.execute("select err from failures"))))
PY
```
Expected steady-state failures (~68, stable): `missing_file` (stale beets rows), `no_patches` (sub-second interstitials), `unsupported_codec` (opus — essentia's libav lacks it).

## Source / design
Scripts versioned at `~/repos/feishin-stolmine/autodj-server/`.
Refresh design: `~/repos/feishin-stolmine/docs/autodj/07-incremental-refresh.md`.
