# 01 — Architecture

## System overview

```
┌─ stol (server, CPU-only) ─────────────────────────────────────────────────┐
│                                                                            │
│  essentia (existing)                                                       │
│    Discogs-EffNet graph → 1280-d embedding                                 │
│    + GET /genre     (exists today)                                         │
│    + GET /embedding?path=   ← NEW: mean-pooled, L2-normed vector           │
│                                                                            │
│  autodj-indexer  ← NEW (batch + incremental)                               │
│    beets items ──▶ essentia /embedding ──▶ emb.npy + meta.jsonl + keys     │
│    joins navidrome_id via Navidrome API (path / mbid)                      │
│    incremental: re-run on new imports (crate already hooks import)         │
│                                                                            │
│  autodj-recommender  ← NEW (resident daemon, sibling to essentia)          │
│    loads emb matrix + meta ONCE at startup (mirrors braind.py)             │
│    POST /session/next {seeds, recent, params, count} → [navidrome_id…]     │
│      1. hard-filter (year/genre/bpm/length/artist/exclusions)              │
│      2. retrieve: cosine(session_centroid, pool)  → top M  (in-memory)     │
│      3. rerank: feature scorer + MMR, contrast slider modulates weights    │
│      4. select: greedy (consistent) ↔ temperature-sample (variety)         │
│    GET /neighbors?trackId=&k=   (quick "similar" action)                   │
│    GET /health                                                             │
└────────────────────────────────────────────────────────────────────────────┘
        ▲  HTTP over Tailscale (100.96.217.104)
        │
┌─ Feishin fork (Electron/React, user's Mac) ───────────────────────────────┐
│                                                                            │
│  Navbar → "AutoDJ" destination  (AppRoute.AUTODJ)                          │
│    AutoDJ page: saved-session list + "New session" card                    │
│    Parameter modal (contrast slider + filters)                             │
│                                                                            │
│  AutoDJ engine (extends existing use-auto-dj.ts)                           │
│    active session holds params + track log (client state)                  │
│    on queue-refill trigger (remaining < timing):                           │
│      POST recommender /session/next with recent queue + params             │
│      → resolve ids → player.addToQueueByFetch(..., Play.LAST)              │
│    live queue updates automatically (store subscription)                   │
│                                                                            │
│  "Save as playlist" → Navidrome createPlaylist + addToPlaylist             │
└────────────────────────────────────────────────────────────────────────────┘
```

## Data flow (one refill cycle)

1. A track finishes; queue `remaining` drops below `timing`. The AutoDJ hook fires
   (this trigger already exists in `use-auto-dj.ts`).
2. Feishin builds the **session context**: the last N played/queued tracks (as
   `navidrome_id`s) + the active session's params.
3. Feishin `POST`s to the recommender `/session/next`.
4. The recommender: filters the eligible pool, computes the session centroid, retrieves
   top-M by cosine, reranks with the contrast-weighted feature scorer + MMR, selects
   `count` tracks, maps them to `navidrome_id`, returns them.
5. Feishin resolves ids → `Song[]` and appends via `player.addToQueueByFetch(...,
   Play.LAST)`. The queue view updates live via its Zustand subscription.

## Why this shape

- **Recommender is stateless per request.** Feishin already owns the queue and session
  state; it passes context on each call. The daemon is a pure `(context, params) →
  tracks` function — exactly like `brain`'s stateless `/search`. Simple, restart-safe,
  no session DB on the server.
- **Vectors resident in memory, never in file tags.** Mirrors `brain` (vectors in an
  index dir, truth in the source files). Tags don't help search — you'd load them all
  into a matrix anyway — and bloat files / force rewrites on model change. In-memory =
  sub-ms retrieval.
- **Reuse the existing embedding backbone.** `essentia` already computes the vector for
  genre; we just expose it. Same model → genre filter and similarity share one pass.
- **Prefetch hides latency.** Refill happens while a track still plays, so we have
  minutes of runway. Sub-1s only matters for the first batch on session start.
- **Separate `autodj-recommender` container** (not folded into `crate` or `essentia`):
  `crate` is acquisition, `essentia` is a thin model server; the recommender is its own
  concern with its own lifecycle. (Decision confirmed with user.)

## Component ownership

| Concern | Lives in | New? |
|---|---|---|
| Audio → 1280-d vector | `essentia` `/embedding` | extend |
| Build/refresh vector store | `autodj-indexer` (script/cron, or crate hook) | new |
| Retrieve + rerank + filter | `autodj-recommender` daemon | new |
| Session state, params, queue drive | Feishin client | new (extends AutoDJ hook) |
| Durable saved tracklist | Navidrome playlist | reuse |
