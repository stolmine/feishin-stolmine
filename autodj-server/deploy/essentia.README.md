# essentia — audio-analysis service (Crate + AutoDJ)

**What this is:** a thin Flask service wrapping Essentia's Discogs-EffNet model. Reads
audio read-only from `/music`, runs on port **8000** on the `crate_default` network (no
published host port). Model files baked into the `crate-essentia` image at `/models`.

**Two consumers share it:**
| Endpoint | Used by | Notes |
|---|---|---|
| `GET /genre?path=<file>` | **Crate** import pipeline | 400-genre Discogs classification, full-track |
| `GET /embedding?path=<file>[&slices=6&sec=10]` | **AutoDJ** indexer | 1280-d audio embedding, mean-pooled + L2-normed. Default = distributed **d6x10** window (6×10s slices, ~5× faster than full at ~0.99 cosine fidelity). `slices=0` = full track. Piggybacks the genre head → also returns `styles`. |
| `GET /health` | both | `{ok, labels}` |

Both endpoints run one Discogs-EffNet pass; `/genre` stays full-track (Crate writes those
tags to files), only `/embedding` windows.

Call it from a container on `crate_default` (e.g. `docker exec essentia python3 -c "... http://localhost:8000/..."`) — there is no host port.

## Source
`app.py` here; versioned copy at `~/repos/feishin-stolmine/autodj-server/essentia-app.py`.
AutoDJ design docs: `~/repos/feishin-stolmine/docs/autodj/`.
