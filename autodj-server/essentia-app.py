"""Thin local audio-analysis service for Crate (§genre) and AutoDJ (§embedding).

Content-based: it *listens* to the audio (Discogs-EffNet embeddings → 400-genre Discogs
classifier from MTG/Essentia), so it works regardless of metadata coverage — the whole point
for an obscure/experimental library where Last.fm/MusicBrainz genre data is thin.

GET /genre?path=<file>  -> {"top":[{"label":"Electronic---Ambient","genre":"Electronic",
                                     "style":"Ambient","p":0.42}, ...], "best_style": "...",
                            "genres":[...distinct broad genres...]}
   Full-track genre classification (crate writes these tags into files — keep it full).

GET /embedding?path=<file>[&slices=6&sec=10] -> {"path":..., "dim":1280,
                               "vector":[...L2-normed floats...], "window":"6x10s",
                               "styles":[{"label","genre","style","p"}, ...]}
   The 1280-d Discogs-EffNet embedding (mean-pooled over patches, L2-normalized so cosine
   similarity is a plain dot product) — the AutoDJ recommender's similarity vector.

   By default it embeds 6 evenly-spaced 10s slices (60s total, "distributed windowing")
   rather than the whole track: ~5x faster on CPU at ~0.99 cosine to the full-track vector,
   and — because the slices are scattered across the song — it samples intro/chorus/outro
   variety instead of betting the vector on one contiguous region. `slices=0` (or `sec=0`)
   embeds the FULL track (used by the optional idle-time fidelity-upgrade sweep). The bulk
   indexer runs this same window scheme directly against the model, so bulk and incremental
   vectors live in one space.
CPU inference, ~1s (windowed) to a few seconds (full) per track. Models baked in at /models.
"""
import json
import os

import numpy as np
from flask import Flask, jsonify, request
from essentia.standard import (MonoLoader, TensorflowPredictEffnetDiscogs,
                               TensorflowPredict2D)

app = Flask(__name__)

SR = 16000
DEF_SLICES, DEF_SEC = 6, 10                      # distributed default: 6x10s = 60s

_META = json.load(open("/models/genre_discogs400-discogs-effnet-1.json"))
LABELS = _META["classes"]                       # e.g. "Electronic---Ambient"
# load the graphs once (heavy) and reuse
_EMBED = TensorflowPredictEffnetDiscogs(
    graphFilename="/models/discogs-effnet-bs64-1.pb", output="PartitionedCall:1")
_GENRE = TensorflowPredict2D(
    graphFilename="/models/genre_discogs400-discogs-effnet-1.pb",
    input="serving_default_model_Placeholder", output="PartitionedCall:0")


def _window(audio, slices, sec):
    """Distributed windowing: `slices` evenly-spaced excerpts of `sec` seconds each,
    concatenated. Samples the whole track's variety at a fraction of the compute.
    slices<=0 or sec<=0, or a track shorter than the budget → return the full track.
    """
    if slices <= 0 or sec <= 0:
        return audio
    w = int(sec * SR)
    if len(audio) <= slices * w:
        return audio
    parts = []
    for i in range(slices):                     # slice centered at (i+0.5)/slices of track
        c = int((i + 0.5) / slices * len(audio))
        s = max(0, min(len(audio) - w, c - w // 2))
        parts.append(audio[s:s + w])
    return np.concatenate(parts)


def _embed(audio, topk=6):
    """One EffNet pass over the given audio → (L2-normed pooled vector, ranked styles)."""
    emb = _EMBED(audio)                          # (patches, 1280)
    vec = np.mean(emb, axis=0)                   # track-level embedding
    vec = vec / (float(np.linalg.norm(vec)) + 1e-9)   # L2-normalize → cosine == dot
    preds = _GENRE(emb)                          # (patches, 400) activations
    mean = np.mean(preds, axis=0)
    order = np.argsort(mean)[::-1][:topk]
    top = []
    for i in order:
        g, _, s = LABELS[i].partition("---")
        top.append({"label": LABELS[i], "genre": g, "style": s, "p": round(float(mean[i]), 4)})
    return vec, top


def _classify(path: str, topk: int = 6) -> dict:
    audio = MonoLoader(filename=path, sampleRate=SR, resampleQuality=4)()  # full track
    _vec, top = _embed(audio, topk)
    # distinct broad genres in rank order, and the single best style
    genres, seen = [], set()
    for t in top:
        if t["genre"] not in seen:
            seen.add(t["genre"]); genres.append(t["genre"])
    return {"path": path, "top": top, "best_style": top[0]["style"] or top[0]["genre"],
            "best_genre": top[0]["genre"], "genres": genres}


@app.route("/genre")
def genre():
    path = request.args.get("path")
    if not path or not os.path.isfile(path):
        return jsonify(error="file not found", path=path), 404
    try:
        return jsonify(_classify(path))
    except Exception as e:                        # never 500-crash the caller
        return jsonify(error=str(e)[:200], path=path), 500


@app.route("/embedding")
def embedding():
    path = request.args.get("path")
    if not path or not os.path.isfile(path):
        return jsonify(error="file not found", path=path), 404
    try:
        slices = request.args.get("slices", DEF_SLICES, type=int)
        sec = request.args.get("sec", DEF_SEC, type=int)
        audio = MonoLoader(filename=path, sampleRate=SR, resampleQuality=4)()
        vec, top = _embed(_window(audio, slices, sec))
        win = "full" if (slices <= 0 or sec <= 0 or len(audio) <= slices * sec * SR) \
            else f"{slices}x{sec}s"
        return jsonify(path=path, dim=int(vec.shape[0]), window=win,
                       vector=[round(float(x), 6) for x in vec], styles=top)
    except Exception as e:                        # never 500-crash the caller
        return jsonify(error=str(e)[:200], path=path), 500


@app.route("/health")
def health():
    return jsonify(ok=True, labels=len(LABELS))


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, threaded=False)
