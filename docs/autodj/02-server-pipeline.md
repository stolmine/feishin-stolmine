# 02 — Server Pipeline (embeddings, indexer, recommender, reranker)

This is the crux. The pipeline mirrors `brain`'s retrieve→rerank, adapted for music.

## 2.1 Embedding endpoint (extend `essentia`) — DEPLOYED (Phase 0)

`essentia/app.py` already computes `emb = _EMBED(audio)  # (patches, 1280)` and feeds it
to the genre head. We added a sibling `/embedding` endpoint that returns the L2-normed
pooled vector + styles, and — critically — uses **distributed windowing** by default.

### Distributed windowing (measured, the biggest speed lever)

The embed forward-pass is ~85% of per-track cost and is **linear in audio duration**
(decode is only ~0.7s). So instead of embedding the whole 3–6 min track, embed a small
**budget** of audio — but *scatter* it across the song rather than taking one contiguous
region (a single central window bets the vector on a possibly-atypical intro/breakdown).
Same seconds → same embed time, but distributed slices sample intro/chorus/outro variety.

Measured cosine of the windowed vector to the **full-track** vector (8-track sample):

| scheme | budget | embed | mean cos | min cos |
|---|---|---|---|---|
| contiguous central 90s | 90s | 1.7s | 0.9854 | 0.9668 |
| **d6×10 (6 slices × 10s)** — **default** | **60s** | **1.1s** | **0.9938** | **0.9887** |
| d6×15 (6 slices × 15s) | 90s | 1.7s | 0.9961 | 0.9922 |
| d9×10 | 90s | 1.7s | 0.9966 | 0.9940 |

Findings: distributed **beats contiguous at equal cost** and fixes the worst case
(0.967 → 0.992); ≥6 slices is the knee (9 barely helps); **raw even-division beats
structure-aware heuristics** (which add per-track analysis cost for ~zero gain). Default =
**d6×10 (60s)**: 0.994 mean / 0.989 min at ~1.1s embed. `slices=0`/`sec=0` → full track.

**Why 60s specifically — it's the knee, not a guess.** Embed cost has a ~1.1s fixed floor
(melspectrogram + TF session + the batch-64 graph) that stays flat from 12s→60s, then
rises: 60s=1.11s, 90s=1.74s, 120s=1.76s, 180s=2.38s, full=5.92s. So budget is a bathtub
with 60s at the bottom: **below 60s you lose fidelity for ~zero speed** (24s=0.963 min,
18s=0.948, 12s=0.938); **above 60s you pay a lot for crumbs** (90s = +57% time for +0.002
mean). Don't relitigate — 60s is optimal. Free tail-tightening option: use ~8–10 slices at
the same 60s budget (e.g. 10×6) — the worst case improves at fixed floor cost.

### Deployed endpoint (shape)

```python
SR, DEF_SLICES, DEF_SEC = 16000, 6, 10

def _window(audio, slices, sec):          # distributed: `slices` even excerpts of `sec`s
    if slices <= 0 or sec <= 0: return audio
    w = int(sec * SR)
    if len(audio) <= slices * w: return audio          # short track → full
    parts = []
    for i in range(slices):
        c = int((i + 0.5) / slices * len(audio)); s = max(0, min(len(audio) - w, c - w // 2))
        parts.append(audio[s:s + w])
    return np.concatenate(parts)

def _embed(audio):                        # one EffNet pass → (L2-normed vec, styles)
    emb = _EMBED(audio); v = np.mean(emb, axis=0); v = v / (np.linalg.norm(v) + 1e-9)
    preds = _GENRE(emb); ...              # genre head reused → styles in the index for free
    return v, styles

# GET /embedding?path=&slices=6&sec=10  → {vector, dim, window:"6x10s", styles}
```

Notes:
- **L2-normalize** so cosine similarity is a plain dot product (fast matmul later).
- Piggy-back the genre head so the index stores Discogs styles per track — powers the
  genre filter + genre-overlap rerank feature **with no extra Navidrome calls**.
- `/genre` stays **full-track** (crate writes those tags into files); only `/embedding`
  windows. Two separate paths, one EffNet pass each.
- **Bulk indexer runs this exact window scheme directly against the model** (not via the
  single-threaded HTTP service), so bulk and incremental vectors share one space.

## 2.2 Indexer (`autodj-indexer`)

One-time batch + incremental. Mirrors `brain_index.py` (npy cache + keys + meta).

Steps:
1. Read beets `items`: `path, mb_trackid, mb_albumid, bpm, length, year, albumartist,
   title`.
2. For each track → `essentia /embedding` → vector + styles.
3. Query Navidrome once to map `path`/`mbid` → `navidrome_id` (Navidrome exposes both).
4. Write:
   - `emb.npy` — `float32[N, 1280]`, L2-normed (source of truth for search).
   - `keys.json` — row index → `{navidrome_id, mbid, path}`.
   - `meta.jsonl` — row index → `{bpm, length, year, styles, genres, artist, album,
     title, playCount?, rating?}`.
   - `index.sqlite` (optional durable mirror + incremental bookkeeping: content hash per
     path so unchanged files are skipped).
5. **Incremental:** re-embed only new/changed paths (hash check), append rows. `crate`
   already hooks the beets import flow — call the indexer there, or a nightly cron.

Batch time: 6k tracks × ~few s single-threaded ≈ a few hours; parallelize across 4 cores
→ ~1–2 h, one-time. Incremental is per-new-track only.

## 2.3 Recommender daemon (`autodj-recommender`)

Resident FastAPI/Flask, loads `emb.npy` + `meta` + `keys` once at startup (mirrors
`braind.py` loading model+index+reranker once). Endpoints:

- `GET /health` → `{ok, tracks, dim}`
- `GET /neighbors?trackId=&k=` → nearest neighbors (quick "similar" action / debugging)
- `POST /session/next` → the main call:

```jsonc
// request
{
  "seeds":  ["ndid1", ...],      // session seed track ids (may be empty on continuation)
  "recent": ["ndid9", ...],      // last N played/queued ids, most-recent last
  "count":  5,                    // how many to return this refill
  "params": {
    "contrast": 0.35,             // 0 = max consistency, 1 = max variety
    "yearMin": 1990, "yearMax": 2005,
    "genresAllow": ["Electronic"], "genresExclude": ["Country"],
    "bpmMin": 110, "bpmMax": 130,
    "lengthMinSec": 90, "lengthMaxSec": 600,
    "artistsInclude": [], "artistsExclude": ["ndArtistX"],
    "allowDuplicates": false
  },
  "exclude": ["ndid…"]            // full current queue, to avoid repeats
}
// response
{ "tracks": ["ndidA","ndidB", ...], "debug": { "poolSize": 180, "centroidTracks": 8 } }
```

## 2.4 The retrieve→rerank algorithm

### Stage 0 — Session vector ("the query")

Exponentially-weighted centroid of the recent track vectors (recent = heavier):

```
c = Σ_i w_i · v_i / Σ_i w_i      w_i = decay^(age_i),  decay ≈ 0.8
```

If `recent` is empty (fresh session), `c` = centroid of the seed vectors. Optionally
track a **trajectory** `d = v_last − v_{last-k}` for v2 extrapolation (predict where the
set is heading, not just where it sits).

### Stage 1 — Filter + retrieve (bi-encoder)

1. **Hard filters first** → eligible set `E` (year range, genre allow/exclude, bpm range,
   length min/max, artist include/exclude, drop `exclude`/`recent` unless
   `allowDuplicates`).
2. **Cosine retrieve:** `sims = E_matrix @ c` (single matmul; sub-ms at 6k). Take top
   `M = count × OVERFETCH` (OVERFETCH ≈ 8, capped ~200 — brain's exact trick).

### Stage 2 — Rerank (the cross-encoder analog)

Score each candidate `e` against the **full session context** with signals cosine alone
misses. This is where "coherence" comes from.

```
rel(e) =  β1·cos(c, v_e)              # fits the running vibe
        + β2·cos(v_last, v_e)         # smooth transition from the current track
        + β3·genre_overlap(e, ctx)    # Discogs styles we already store
        + β4·bpm_compat(e, last)      # gaussian on |Δbpm|  → DJ tempo continuity
        + β5·year_prox(e, ctx)
        + β6·rating/playcount boost
        - β7·recency_penalty(e)       # avoid cross-session repeats
```

### Stage 2b — Diversity + selection (MMR + temperature)

Select `count` tracks **iteratively**, penalizing redundancy against the batch so far
(Maximal Marginal Relevance):

```
mmr(e) = λ·rel(e) − (1−λ)·max_{s∈selected} cos(v_e, v_s)
pick   = argmax mmr(e)                    # consistency
       | softmax_sample(mmr / T)          # variety
add pick to selected; enforce artist cap; repeat.
```

### The contrast slider `α ∈ [0,1]` → all knobs at once

| Knob | α=0 (consistency) | α=1 (variety) |
|---|---|---|
| MMR `λ` | ~0.9 (relevance-dominated) | ~0.4 (diversity-dominated) |
| temperature `T` | →0 (greedy argmax) | high (broad sampling) |
| OVERFETCH pool `M` | small, tight | large, wide |
| cosine floor | high (reject dissimilar) | low/none |
| centroid decay | slow (stable vibe) | fast (lets vibe drift) |
| similarity weights β1,β2 | high | lower |
| novelty/recency weight | low | high |

One user-facing slider, one `α`, mapped to the whole vector of knobs. Everything is a
smooth interpolation, so the middle of the slider is a genuine blend.

## 2.5 Reranker: v1 vs v2

- **v1 — feature scorer (ship this).** The weighted `rel()` + MMR above. Fast on CPU
  (microseconds over a capped pool), fully explainable, tunable by `α`. Gets ~80% of the
  quality with zero training data.
- **v2 — learned cross-encoder (the true `brain` analog).** A small MLP/GBM taking
  `[c ⊕ v_e ⊕ |c−v_e| ⊕ features]` → transition-quality score, trained on the user's own
  data: **positives** = consecutive tracks in their playlists / listened-through
  transitions; **negatives** = skips. Models *what plays well after what*, which pure
  similarity can't. Keep the scorer interface identical → drop-in replacement. Still
  CPU-cheap (tiny model, capped candidates), like `braind`'s MiniLM cross-encoder.

## 2.6 Latency budget

- Retrieve (6k matmul): **sub-ms**.
- Rerank v1 over ≤200 candidates: **sub-ms**.
- Rerank v2 tiny MLP over ≤200: **single-digit ms**.
- Network (Tailscale LAN): a few ms.
- **Only the first batch of a new session is user-visible.** Steady-state refills happen
  ahead of the play head and are invisible. Sub-1s target is met with large margin.
