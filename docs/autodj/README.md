# Vector AutoDJ — Design Docs

A first-class AutoDJ for the Feishin stolmine fork: an audio-embedding + reranker
recommender running locally on `stol`, driving a navbar destination with saved
sessions, a rich parameter modal, live queue integration, and playlist export.

## The one-paragraph pitch

Feishin already ships a rules-based AutoDJ (a background hook + settings panel, no
real UI). We replace its "similar" guesswork with **content-based audio similarity**:
a Discogs-EffNet embedding per track (the model is *already running* on `stol` for
genre), retrieved by cosine over an in-memory matrix and **reranked** for coherence —
exactly mirroring the retrieve→rerank pattern of the `brain` text stack. A single
**contrast slider** moves the result from "tight, consistent vibe" to "maximum
variety," on top of hard filters (year, genre, bpm, length, artist). Sessions live in
Feishin as a navbar page, feed the real play queue as they generate, and can be frozen
into a Navidrome playlist.

## Is it doable?

**Yes — all of it.** The backend is ~80% built already:

- **Embeddings:** the `essentia` container on `stol` runs Discogs-EffNet and computes a
  1280-d content embedding per track today (it just throws the vector away after the
  genre head). Exposing it is a few lines.
- **Library scale:** 6,008 tracks / 154 GiB. A 6k×1280 float32 matrix is ~30 MB —
  brute-force cosine is **sub-millisecond**. No ANN index required (though `hnswlib`,
  as used by `brain`, is a drop-in if the library grows).
- **Join key:** Feishin's `Song` carries `mbzTrackId` + `path`; beets has
  `mb_trackid` + `path`. Direct join, no fragile ID-mapping layer.
- **Proven pattern:** `brain`'s `braind.py` is a resident embed+cross-encoder-rerank
  daemon on CPU. We mirror it for music.

The **heaviest new lift is the Feishin client UI**, because AutoDJ currently has no
navbar surface — only a settings panel and a playerbar popover.

## Document map

| Doc | Contents |
|---|---|
| [01-architecture.md](01-architecture.md) | System overview, components, data flow, why this shape |
| [02-server-pipeline.md](02-server-pipeline.md) | Embedding endpoint, indexer, recommender daemon, **reranker + contrast-knob math** |
| [03-data-model.md](03-data-model.md) | Embedding store, session model, persistence, playlist export, join keys |
| [04-feishin-ui.md](04-feishin-ui.md) | Nav item, route/page, session list, parameter modal, queue integration (grounded in real files) |
| [05-build-plan.md](05-build-plan.md) | Phases 0→4, milestones, effort, risks |
| [06-open-decisions.md](06-open-decisions.md) | Decisions to lock before building |
| [07-incremental-refresh.md](07-incremental-refresh.md) | Race-free refresh daemon: poll beets, settle-guard, atomic swap, `/reload` |

## Key facts (environment)

- **Server `stol`**: Ubuntu, 4 cores, 15 GiB RAM, **no GPU**, Docker. Reach via
  `ssh stol@100.96.217.104` (Tailscale). Music at `/mnt/storage/media/music`.
- **`essentia` container**: `/home/stol/docker/crate/essentia/app.py` — Discogs-EffNet
  embeddings → 400-genre Discogs head. Reads audio read-only.
- **beets DB**: `/home/stol/docker/media/beets/musiclibrary.blb` — `path`, `mb_trackid`,
  `mb_albumid`, `bpm`, `length`, `albumartist`, `title`.
- **Navidrome**: host port 4533. **Feishin fork**: `~/repos/feishin-stolmine`.
- **`brain` reference**: `~/repos/brain/bin/{brain_index,braind}.py` — the
  embed+rerank template.
