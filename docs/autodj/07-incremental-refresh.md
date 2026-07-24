# 07 — Incremental Refresh Daemon

Keeps the embedding index current as new records land (~5–15/day) without races,
stale entries, or embedding files that are mid-move or already gone. Mirrors `brain`'s
hash-diff + atomic-swap + `POST /reload` pattern, adapted to audio and to beets as the
source of truth.

## 7.1 Trigger decision: poll beets, do NOT hook crate

**Beets is the single source of truth for "this file is real and final."** A row appears
in the beets `items` table only *after* beets has atomically moved + tagged + committed
the album (both configs use `import: move: yes, write: yes`). After commit, `path` is
final and the file won't move again.

Why beets and not crate:
- **A second importer bypasses crate.** A standalone `beets` container runs
  `beet import -q /downloads` on a cron (`/home/stol/docker/media/beets/import.sh`).
  Hooking crate's `state=DONE` would miss every track imported this way (and any manual
  `beet import`). Polling beets captures **all** routes.
- **crate's `jobs.db` lacks what we need** — it's album/request-granular; `result` is only
  `{album, songs:<count>}`, with no per-track beets ids or final paths. We'd have to query
  beets anyway.
- **inotify on `/music` is worse** — a single album move fires many create/move events
  *mid-transaction*, and still forces a beets lookup for ids/metadata.

**Optional latency nudge:** watch `jobs.db` `events` for `kind='state:DONE'` as a "poll
now" kick for near-instant embedding. Strictly optional — a 30–60 s beets poll is simpler
and sufficient. The beets watermark is always the authority.

## 7.2 The beets read contract (important gotchas)

- **NOT WAL** — `journal_mode=delete`. Concurrent readers get `SQLITE_BUSY` during a
  writer's commit window. → open read-only, set `busy_timeout`, retry on BUSY:
  `sqlite3.connect("file:/library/musiclibrary.blb?mode=ro", uri=True, timeout=5)` then
  `PRAGMA busy_timeout=5000`. Mount the blb `:ro` into the daemon, exactly as crate does
  (`library.py:22`).
- **Paths are RELATIVE** in this library — `path` (BLOB) is stored relative to
  `directory: /music` (e.g. `Mice Parade/Mice Parade/09 - ….flac`, no leading slash).
  Resolve absolute as `/music/` + `path.decode('utf-8')`. Mount `/mnt/storage/media/music`
  read-only at `/music` (same as essentia) so the daemon and essentia agree on paths.
- **Columns available:** `id` (stable int PK), `added` (epoch float, import time),
  `mtime` (epoch float, bumped on re-tag/move), `path`, plus `mb_trackid, mb_albumid,
  album_id, format, bitrate, samplerate, length, artist, album, title`.
- **6,008 rows** — a full-table scan is cheap; do **not** assume an index on
  `added`/`mtime` exists.

## 7.3 The settle guard (race safety)

Observed: `mtime` bumps ~71 min *after* import (embedart / replaygain / scrub passes)
**without moving the file**. To avoid (a) reading during another writer's active
transaction and (b) needless re-embeds from post-import tag passes:

> Only consider a row when `max(added, mtime) < now − SETTLE` (SETTLE ≈ 90–120 s).

This mirrors `import.sh`'s own "older than 5 min, nothing active" heuristic — a proven
local convention.

## 7.4 What actually triggers a (re-)embed

Audio embeddings depend on **audio content**, which for an existing track essentially
never changes here: crate never replaces/upgrades (`duplicate_action: skip`, no
quality-upgrade path), and the cron `import -q` skips duplicates. So:

| beets change | index action |
|---|---|
| New `id` (new import) | **embed** |
| Same `id`, `path` changed (move) | update stored path only; **no re-embed** (audio identical) |
| Same `id`, only `mtime` bumped (re-tag/art/replaygain) | update `mtime` watermark; **no re-embed** |
| Same `id`, `format`/`length`/`samplerate` changed (true re-rip) | **re-embed** (rare/none today, but handle it) |
| `id` gone from beets (`beet remove`) | **purge** from index |

The cache is keyed by beets `id`; we store `(added, mtime, path, format, length,
embedded_at)` and re-embed only when the **audio fingerprint** (`format`+`length`+
`samplerate`, or an optional content hash) changes — not on tag-only bumps. This avoids
re-embedding a whole re-tagged album for nothing.

## 7.5 One refresh cycle (pseudocode)

```python
os.nice(15)                                   # never peg the shared host
for v in ("OMP_NUM_THREADS","OPENBLAS_NUM_THREADS","ONNXRUNTIME_NUM_THREADS"):
    os.environ.setdefault(v, "2")

with flock(idx/"refresh.lock", LOCK_EX|LOCK_NB) or exit(0):   # no overlap/stack-up
    now = time.time()
    rows = beets_ro("""SELECT id,path,added,mtime,mb_trackid,mb_albumid,
                              format,length,samplerate,artist,album,title
                       FROM items
                       WHERE added > :wa OR mtime > :wm""",
                    wa=wm_added, wm=wm_mtime, retry_on_busy=True)

    to_embed = []
    for r in rows:
        if max(r.added, r.mtime) >= now - SETTLE:      # settle guard
            continue
        abspath = "/music/" + r.path.decode("utf-8")
        if not os.path.isfile(abspath):                 # vanished/mid-move → skip
            continue
        prev = state.get(r.id)
        if prev is None or audio_fp_changed(prev, r):   # new or true re-rip
            to_embed.append((r.id, abspath, r))
        else:
            state.update_meta(r.id, r)                  # move/re-tag: metadata only

    for id, abspath, r in to_embed:                     # ~15/day → seconds
        # incremental is cheap, so embed FULL track (slices=0) for max fidelity;
        # bulk used the fast d6x10 window. Both are ~0.99 cosine apart → one space.
        resp = essentia_get("/embedding", path=abspath, slices=0)  # full-track vec + styles
        vecs[id] = l2norm(resp.vector)
        meta[id] = build_meta(r, resp.styles)           # bpm/year via essentia+beets
        state.mark_embedded(id, r)

    # deletion/move reconcile (cheap at 6k): anti-join current beets ids
    live_ids = set(beets_ro("SELECT id FROM items"))
    for gone in state.ids() - live_ids:
        drop(gone, vecs, meta); state.remove(gone)

    resolve_navidrome_ids(new_or_changed)               # see 7.6

    if changed:
        atomic_write(idx/"emb.npy", stack(vecs))        # tmp + os.replace
        atomic_write(idx/"keys.json", keys); atomic_write(idx/"meta.jsonl", meta)
        wm_added, wm_mtime = max_added, max_mtime; persist_watermarks()
        post("http://autodj-recommender:PORT/reload")   # hot-swap, no restart
```

`audio_fp_changed` compares `(format, length, samplerate)` (optionally a real content
hash). `atomic_write` = write `.tmp` then `os.replace` (POSIX-atomic; the recommender
never sees a half-written index — `brain`'s exact pattern).

## 7.6 Navidrome id resolution

The recommender returns **navidrome track ids** (what Feishin queues), joined by
`mb_trackid` / `path`. For new tracks:
- crate-driven imports already call `navidrome.rescan()` in `_finalize`, so Navidrome
  knows them shortly after import.
- cron `import -q` tracks rely on Navidrome's own periodic scan; the daemon may trigger a
  Navidrome rescan or simply retry id-resolution next cycle (a track with no navidrome id
  yet is just held back one cycle — harmless).
- Resolve by querying the Navidrome API for `mbzTrackId` (fallback title+artist+album), or
  read Navidrome's DB directly. Store `navidrome_id` in `keys.json`. Missing ids are
  retried until resolved.

## 7.6b Optional idle-time fidelity-upgrade sweep

The initial bulk uses the fast **d6×10 (60s)** window to get a store in ~1.4h. Those
vectors are 0.994 mean / 0.989 min cosine to full-track — close enough to use permanently.
If you ever want a uniformly full-fidelity store, run a low-priority background sweep that
re-embeds the windowed bulk vectors at `slices=0` (full track), N per hour at `nice`, until
the whole store converges. It reuses the same atomic-swap + `/reload` machinery; there is
no rush and no correctness issue while the store is mixed (it's a smooth ~1% offset, not
noise). Windowing is a config knob (`slices`, `sec`), so "less economy later" is a
parameter change, not a rewrite.

## 7.7 Deployment

- **New sibling container** `autodj-indexer` (or a thread inside `autodj-recommender`).
  Mounts: beets blb `:ro`, `/mnt/storage/media/music:/music:ro`, its own data volume.
  Reaches `essentia` at `http://essentia:8000` (same compose network).
- **Cadence:** a 30–60 s poll loop, or a systemd-timer-style periodic run (mirrors
  brain's hourly timer, but tighter given the settle guard already gates freshness).
- **Full rebuild** is always available (index is reproducible from audio + beets) but
  unnecessary day-to-day; the cache means only genuinely-new tracks ever hit essentia.
- **Good-citizen defaults:** `os.nice(15)`, capped BLAS/ONNX threads, `flock` refuse-if-
  running — all carried over from `brain`, important on a 20+-container host.

## 7.8 Summary of guarantees

- **No mid-move reads** — beets commit + settle guard + `os.path.isfile` triple-gate.
- **No missed imports** — polling beets covers crate, cron, and manual routes.
- **No stale entries** — anti-join reconcile purges removed tracks.
- **No wasted work** — id-keyed cache + audio-fingerprint check skips tag-only bumps.
- **No torn reads by the recommender** — atomic temp-then-rename + `/reload`.
- **No host contention** — nice + thread caps + single-flight lock.
