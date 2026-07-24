# 06 — Open Decisions

Lock these before/early in the build. Recommendations given; none block Phase 0.

## D1 — Vector storage backend
- **A. npy + sqlite in the recommender (recommended).** 6k×1280 = 30 MB; brute-force
  cosine is sub-ms. Simplest, inspectable, mirrors `brain`'s `emb_cache.npy`. Add
  `hnswlib` later only if the library grows past ~100k.
- B. Reuse Immich's `pgvecto.rs` Postgres — real vector DB, but couples to the Immich DB
  and adds moving parts for no speed gain at this scale.
- C. Dedicated pgvector/Qdrant container — cleanest separation, most infra.

## D2 — Recommender host — **DECIDED: new sibling container to `essentia`.**

## D3 — Session persistence
- **A. Client-side (recommended).** Sessions in Feishin's Zustand `persist`
  (localStorage), recommender stateless. Matches Feishin convention, offline-friendly,
  simple daemon.
- B. Server-side sessions in the recommender DB — enables cross-device sync, at the cost
  of a stateful server + a sync story. Revisit if multi-device becomes a goal (Phase 4).

## D4 — Client → recommender transport
- **A. Renderer-direct axios (recommended for v1)** to the Tailscale URL, configured via
  `recommenderUrl`. Fastest to build.
- B. Main-process IPC (mirrors lyrics providers) — adopt if CORS/mixed-content/secret
  handling forces it.

## D5 — Reranker v1 scope
- **A. Feature scorer + MMR + contrast mapping (recommended).** No training data,
  explainable, tunable. Ship it.
- B. Jump straight to a learned model — blocked on assembling training data; defer to v2.

## D6 — Seed selection UX
- How does a new session start? Options (can offer several): pick 1+ seed tracks via
  search; "from current track"; "surprise me" (random/most-played seed); "from a
  genre/decade." **Recommendation:** support "from current track", explicit seed search,
  and "surprise me" in v1.

## D7 — Relationship to the existing rules-based AutoDJ
- **Recommendation:** keep `similar` / `library_random` strategies as-is; add `vector` as
  a third strategy. The new navbar page defaults to `vector`; the old playerbar popover
  and settings panel keep working unchanged (least disruption, easy fallback if the
  recommender is unreachable).

## D8 — Recommender-unreachable fallback
- When the Tailscale endpoint is down (off-network), AutoDJ should degrade gracefully.
  **Recommendation:** fall back to the existing `similar` cascade and surface a subtle
  "using offline mode" hint. Prevents a dead queue when away from the tailnet.

## D9 — Discogs styles vs Navidrome genres for the genre filter
- The index stores Discogs styles (from the embedding model); Navidrome has its own genre
  tags. **Recommendation:** filter on the index's Discogs styles (consistent, model-
  derived, always present) and show those in the modal; optionally map to Navidrome
  genres later for familiarity.
