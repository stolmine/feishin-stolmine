# 05 — Build Plan

Ordered to de-risk the unknowns first (does the embedding actually sound right?) before
any client work.

## Phase 0 — Prove the vector (server only) — ✅ DONE (2026-07-24)

- Added `GET /embedding` to `essentia/app.py`; rebuilt the container.
- Embedded 80 random tracks; printed nearest neighbors for a spread of seeds.
- **Gate PASSED:** neighbors clearly sound alike — same-artist clustering (Stereolab→
  Stereolab; Tom Jenkinson→Squarepusher = same person), texture coherence (ambient→ambient,
  glitch→glitch, math-rock→rock), and cross-genre timbral links (Squarepusher→Parmegiani).
- **Speed work (also done):** decode ~0.7s, embed ~85% of cost & linear in duration.
  Distributed windowing (default **d6×10 = 6×10s slices**) → 0.994 mean / 0.989 min cosine
  to full-track at ~1.1s embed. 4-worker parallel throughput **0.84s/track**. 1 of 80
  tracks failed to decode (graceful 500) → indexer must tolerate per-track failures.

## Phase 1 — Index + recommender daemon (server, ~2–3 days)

- Indexer: embed all 6,008 tracks (**d6×10 window, 4 parallel workers running the model
  directly, `nice`, 1 TF thread/worker → ~1.4h one-time**) → `emb.npy` + `keys.json` +
  `meta.jsonl` + `index.sqlite`; build the Navidrome id join; tolerate + log per-track
  decode failures; report coverage/miss count.
- `autodj-recommender` container (sibling to essentia): load matrix once; implement hard
  filters, centroid retrieve, v1 feature reranker + MMR + contrast mapping; `/health`,
  `/neighbors`, `/session/next`. ✅ **SCAFFOLDED + DEPLOYED** (`autodj-server/recommender.py`,
  container up on stol:8001, reachable over Tailscale, graceful `loaded:false` until digest
  exports emb.npy → then `POST /reload`).
- Navidrome-id join: ✅ **DONE** — `build_navidrome_map.py` joins on path (primary) +
  MBID (fallback) against Navidrome's own DB. Coverage **5,982/6,008 (99.6%)**; 26 misses
  are tracks Navidrome hasn't scanned yet.
- **Gate:** once digest completes → `POST /reload`, then `curl /session/next` with
  hand-written params returns sensible, filter-respecting, contrast-varying tracklists.
  Verify sub-1s first-batch latency.

### Phase 1 — ✅ DONE (2026-07-24)

- Digest embedded **5,940 / 6,008** tracks (~2.3h wall). 68 unembeddable: 33 `missing_file`
  (stale beets ghosts), 28 `no_patches` (sub-patch-length interstitials), 7
  `unsupported_codec` (opus — essentia's libav lacks it). All logged, none block anything.
- Gotcha found: a raised error in a pooled essentia worker (opus) deadlocked the pool at
  0% CPU near the end. Fixed: `embed_index.py` now short-circuits opus by extension before
  touching essentia. A hung digest is resumable — killed it, exported the 5,939 already in
  `index.sqlite`, mopped up the rest.
- Navidrome join **99.6%** (5,982/6,008). Recommender **live on stol:8001, loaded=5,940**,
  reachable from the Mac over Tailscale.
- **Quality validated:** `/neighbors` returns tight sonic clusters (Actress→OPN/Loscil/Alva
  Noto all 0.90+; Squarepusher→Autechre/Amon Tobin), and `/session/next` contrast visibly
  widens the pool (54→174) and diversifies picks from 0.05→0.9. Gate passed.

## Phase 2 — Feishin engine wiring (client core) — ✅ DONE (2026-07-24)

- ✅ Added `AUTO_DJ_STRATEGY.VECTOR`, `contrast` (0..1), and `recommenderUrl` to the
  AutoDJ settings schema + defaults + migration (store version 33→34).
- ✅ `features/player/auto-dj/recommender-api.ts` — axios client for `/session/next`
  (renderer-direct over Tailscale, 10s timeout).
- ✅ `features/player/auto-dj/auto-dj-vector.ts` — `runAutoDjVector()` collector, mirrors
  `runAutoDjSongs` shape.
- ✅ Extended `use-auto-dj.ts`: when `songStrategy === 'vector'`, gather recent queue ids +
  contrast → `POST /session/next` → resolve ids via `addToQueueByFetch(SONG, LAST)` → emit
  `AUTODJ_QUEUE_ADDED`. **Graceful fallback**: any failure falls through to the local
  similar cascade so the queue never dead-ends (D8).
- ✅ Surfaced controls in the existing `auto-dj-settings.tsx` panel (vector option +
  Recommender URL field + Contrast slider) so it's testable before the Phase 3 page.
- ✅ typecheck + eslint clean.
- **Gate (live play-test) pending:** needs the app running against the stol Navidrome with
  `recommenderUrl=http://100.96.217.104:8001`. Watch for renderer CSP/mixed-content on the
  plain-http call — if blocked, move the fetch to main-process IPC (D4 fallback).
- **Original gate text:** with a test session active, the queue continuously refills with coherent,
  filtered tracks that respect the contrast setting; live queue UI updates.

## Phase 3 — Feishin UI (client, ~3–4 days)

- Navbar item + route + `autodj-route.tsx` page.
- Session list + "New session" card; parameter modal (context modal, mirrors
  lyrics-settings-form).
- Start / resume session; wire params → engine; "Save as playlist" (reuse create+prefill).
- Session persistence (`autoDJSessions` store slice + migration).
- i18n keys.
- **Gate:** full loop from the UI — create a session in the modal, watch it fill the
  queue live, save it as a Navidrome playlist, resume it later.

## Phase 4 — Polish + v2 reranker (ongoing)

- v2 learned cross-encoder on the user's own play/skip/playlist-transition data.
- Trajectory extrapolation; per-session feedback (skip = negative signal live).
- Optional: server-side session sync for cross-device; genre backfill for the whole
  library from the index; "similar to this track" quick action via `/neighbors`.

## Effort / risk summary

| Area | Effort | Risk | Mitigation |
|---|---|---|---|
| Embedding endpoint | trivial | low | model already loaded |
| Indexing 6k tracks | one-time hours | low | parallelize 4 cores; incremental after |
| Navidrome id join coverage | small | **med** | MBID primary, path fallback, log misses |
| Recommender + v1 reranker | moderate | low | pure numpy, stateless, mirrors braind |
| Reranker *quality* | iterative | **med** | v1 heuristic ~80%; v2 learned closes gap |
| Feishin engine wiring | moderate | low | extends existing AutoDJ hook |
| Feishin UI | **largest** | med | many files (nav has collapsed/mobile variants); follow the map |
| Fork upkeep vs upstream | ongoing | low | keep new code in `features/autodj/`, minimal edits to shared files |

Backend is ~80% pre-built; the client UI is the bulk of the *new* work.
