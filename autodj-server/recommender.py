"""AutoDJ recommender daemon — the retrieve→rerank→contrast engine.

Loads the derived index (emb.npy + keys.json + meta.jsonl + navidrome_map.json) once into
memory, mirroring brain's braind.py (load-once + POST /reload hot-swap). Stateless per
request: Feishin passes the session context (seeds/recent/params) each call and this
returns a ranked list of Navidrome track ids to enqueue.

Endpoints:
  GET  /health              -> {ok, loaded, tracks, dim}
  POST /reload              -> reload the index after a refresh (no restart)
  GET  /neighbors?id=&k=    -> nearest neighbors of a Navidrome track (debug / "similar")
  POST /session/next        -> {seeds[], recent[], count, params, exclude[]} -> {tracks[]}

Algorithm (see docs/autodj/02-server-pipeline.md): exp-weighted session centroid → hard
filters → cosine retrieve top-M → feature rerank + MMR diversity → contrast-controlled
selection (greedy ↔ temperature-sampled). The single `contrast` param (0=consistent,
1=variety) drives every knob at once.
"""
import json
import os
import threading

import numpy as np
from flask import Flask, jsonify, request

IDX = os.environ.get("AUTODJ_INDEX", "/index")
app = Flask(__name__)
_lock = threading.Lock()
_S = {"loaded": False}
_rng = np.random.default_rng()


@app.after_request
def _cors(resp):
    # Feishin's renderer loads over file://, so it sends `Origin: null` and Chromium
    # preflights the JSON POST. Without these the browser drops the response and axios
    # reports a bare "Network Error". Tailnet-only service, no credentials -> "*" is fine.
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
    resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return resp


def _parse_style(label):
    g, _, s = label.partition("---")           # "Electronic---Ambient" -> ("electronic","ambient")
    return g.lower(), (s or g).lower()


def load():
    """(Re)load the derived index into memory. Tolerant of a not-yet-built index."""
    try:
        E = np.load(f"{IDX}/emb.npy").astype(np.float32)          # (N, 1280), L2-normed
        keys = json.load(open(f"{IDX}/keys.json"))
        meta = [json.loads(x) for x in open(f"{IDX}/meta.jsonl") if x.strip()]
        nav = json.load(open(f"{IDX}/navidrome_map.json"))
    except FileNotFoundError as e:
        with _lock:
            _S.update(loaded=False, error=str(e))
        return 0

    by_path, by_mbid = nav["by_path"], nav["by_mbid"]
    row_nav, nav_row = [], {}
    for i, k in enumerate(keys):
        rel = k["path"][7:] if k["path"].startswith("/music/") else k["path"]
        nid = by_path.get(rel) or (by_mbid.get(k["mbid"]) if k.get("mbid") else None)
        row_nav.append(nid)
        if nid:
            nav_row[nid] = i

    year = np.array([(m.get("year") or 0) for m in meta], dtype=np.float32)
    bpm = np.array([(m.get("bpm") or 0) for m in meta], dtype=np.float32)
    length = np.array([(m.get("length") or 0) for m in meta], dtype=np.float32)
    artist = [(m.get("albumartist") or m.get("artist") or "").lower() for m in meta]
    album = [(m.get("album") or "").lower() for m in meta]
    genres = []
    for m in meta:
        gs = set()
        for lab in (m.get("styles") or []):
            g, s = _parse_style(lab)
            gs.add(g); gs.add(s)
        genres.append(gs)
    mapped = np.array([r is not None for r in row_nav])

    with _lock:
        _S.update(loaded=True, error=None, E=E, keys=keys, meta=meta,
                  row_nav=row_nav, nav_row=nav_row, mapped=mapped,
                  year=year, bpm=bpm, length=length, artist=artist, album=album,
                  genres=genres, N=len(keys), dim=int(E.shape[1]))
    return len(keys)


def knobs(alpha):
    """Map the single contrast slider (0=consistency, 1=variety) onto every knob."""
    a = max(0.0, min(1.0, alpha))
    return dict(
        lam=0.90 - 0.50 * a,        # MMR relevance weight (high → hug the vibe)
        temp=0.02 + 0.60 * a,       # selection temperature (0 → greedy)
        overfetch=int(8 + 24 * a),  # candidate pool multiple
        floor=0.55 - 0.35 * a,      # min cosine-to-centroid (relax with variety)
        decay=0.60 + 0.30 * a,      # centroid recency decay (drifts faster with variety)
        w_last=0.50 - 0.30 * a,     # weight on smooth transition from the last track
        w_genre=0.30, w_bpm=0.15, w_year=0.10,
        # per-batch caps + recency penalties space tracks out by artist AND album, both
        # within the batch and relative to what is already in the queue.
        artist_cap=1 if a < 0.34 else (2 if a < 0.67 else 3),
        album_cap=1 if a < 0.34 else (2 if a < 0.67 else 3),
        w_recent_artist=0.40, w_recent_album=0.50,
    )


def _bpm_compat(b, ref):
    if b <= 0 or ref <= 0:
        return 0.0                                # unknown → neutral
    d = abs(b - ref)
    d = min(d, abs(b - ref * 2), abs(b - ref / 2))  # half/double-time tolerant
    return float(np.exp(-(d * d) / (2 * 12 * 12)))  # gaussian, ~12 BPM sigma


def _year_prox(y, ref):
    if y <= 0 or ref <= 0:
        return 0.0
    return float(np.exp(-((y - ref) ** 2) / (2 * 8 * 8)))  # ~8 year sigma


def _filter_mask(S, p, exclude):
    """Hard filters → boolean eligibility mask over all rows."""
    N = S["N"]
    mask = S["mapped"].copy()                     # must be resolvable to a Navidrome id
    for r in exclude:
        if 0 <= r < N:
            mask[r] = False

    ymin, ymax = p.get("yearMin"), p.get("yearMax")
    if ymin or ymax:
        yr = S["year"]
        known = yr > 0
        ok = known & (yr >= (ymin or 0)) & (yr <= (ymax or 9999))
        mask &= ok

    lmin, lmax = p.get("lengthMinSec"), p.get("lengthMaxSec")
    if lmin or lmax:
        ln = S["length"]
        mask &= (ln >= (lmin or 0)) & (ln <= (lmax or 1e9))

    bmin, bmax = p.get("bpmMin"), p.get("bpmMax")
    if bmin or bmax:                              # bpm sparse in library → known-only
        bp = S["bpm"]
        mask &= (bp > 0) & (bp >= (bmin or 0)) & (bp <= (bmax or 1e9))

    allow = set(g.lower() for g in (p.get("genresAllow") or []))
    excl = set(g.lower() for g in (p.get("genresExclude") or []))
    if allow or excl:
        gen = S["genres"]
        for i in np.nonzero(mask)[0]:
            g = gen[i]
            if allow and not (g & allow):
                mask[i] = False
            elif excl and (g & excl):
                mask[i] = False

    ai = set(a.lower() for a in (p.get("artistsInclude") or []))
    ax = set(a.lower() for a in (p.get("artistsExclude") or []))
    if ai or ax:
        art = S["artist"]
        for i in np.nonzero(mask)[0]:
            a = art[i]
            if ai and a not in ai:
                mask[i] = False
            elif ax and a in ax:
                mask[i] = False
    return mask


@app.route("/health")
def health():
    with _lock:
        return jsonify(ok=True, loaded=_S.get("loaded", False),
                       tracks=_S.get("N", 0), dim=_S.get("dim", 0),
                       error=_S.get("error"))


@app.route("/reload", methods=["POST"])
def reload_index():
    n = load()
    return jsonify(status="reloaded", tracks=n, loaded=_S.get("loaded", False))


@app.route("/neighbors")
def neighbors():
    with _lock:
        S = dict(_S)
    if not S.get("loaded"):
        return jsonify(error="index not loaded"), 503
    nid = request.args.get("id")
    k = request.args.get("k", 10, type=int)
    if nid not in S["nav_row"]:
        return jsonify(error="unknown track id", id=nid), 404
    row = S["nav_row"][nid]
    sims = S["E"] @ S["E"][row]
    order = np.argsort(sims)[::-1]
    out = []
    for r in order:
        if r == row or S["row_nav"][r] is None:
            continue
        m = S["meta"][r]
        out.append({"id": S["row_nav"][r], "cos": round(float(sims[r]), 4),
                    "artist": m.get("artist"), "title": m.get("title"),
                    "styles": (m.get("styles") or [])[:1]})
        if len(out) >= k:
            break
    return jsonify(seed=nid, neighbors=out)


@app.route("/session/next", methods=["POST"])
def session_next():
    with _lock:
        S = dict(_S)
    if not S.get("loaded"):
        return jsonify(error="index not loaded"), 503
    req = request.get_json(force=True) or {}
    p = req.get("params", {}) or {}
    K = knobs(float(p.get("contrast", 0.35)))
    count = int(req.get("count", 5))
    nr = S["nav_row"]
    recent = [nr[x] for x in req.get("recent", []) if x in nr]
    seeds = [nr[x] for x in req.get("seeds", []) if x in nr]
    exclude = {nr[x] for x in req.get("exclude", []) if x in nr}
    if not p.get("allowDuplicates", False):
        exclude |= set(recent) | set(seeds)

    print(f"[session/next] seeds {len(seeds)}/{len(req.get('seeds', []))} resolved, "
          f"recent {len(recent)}/{len(req.get('recent', []))} resolved, "
          f"exclude={len(exclude)}, N={S['N']}", flush=True)

    ctx = recent or seeds or [int(_rng.integers(S["N"]))]   # cold start → random seed
    E = S["E"]
    w = np.array([K["decay"] ** (len(ctx) - 1 - i) for i in range(len(ctx))], dtype=np.float32)
    c = (E[ctx] * w[:, None]).sum(0)
    c = c / (float(np.linalg.norm(c)) + 1e-9)
    last = ctx[-1]

    mask = _filter_mask(S, p, exclude)
    if mask.sum() == 0:
        print("[session/next] -> 0 tracks (no candidates after filters)", flush=True)
        return jsonify(tracks=[], debug={"reason": "no candidates after filters"})
    idx = np.nonzero(mask)[0]
    sims = E[idx] @ c
    keep = sims >= K["floor"]                     # cosine floor (relaxes with variety)
    if int(keep.sum()) >= count:
        idx, sims = idx[keep], sims[keep]
    M = min(len(idx), max(count * K["overfetch"], count * 4))
    top = np.argsort(sims)[::-1][:M]
    cand = idx[top]

    # rerank features over the candidate pool
    cos_c = E[cand] @ c
    cos_last = E[cand] @ E[last]
    ctx_gen = set().union(*[S["genres"][i] for i in ctx]) if ctx else set()
    g_ov = np.array([len(S["genres"][r] & ctx_gen) / (len(ctx_gen) + 1e-9) for r in cand])
    lb, ly = float(S["bpm"][last]), float(S["year"][last])
    bpm_c = np.array([_bpm_compat(float(S["bpm"][r]), lb) for r in cand])
    yr = np.array([_year_prox(float(S["year"][r]), ly) for r in cand])
    # penalize candidates whose artist/album already appears in the session/queue, so
    # AutoDJ spaces tracks out rather than clustering an artist or album together.
    seen_rows = set(ctx) | exclude
    seen_art = {S["artist"][r] for r in seen_rows if S["artist"][r]}
    seen_alb = {S["album"][r] for r in seen_rows if S["album"][r]}
    art_pen = np.array([K["w_recent_artist"] if S["artist"][r] in seen_art else 0.0 for r in cand])
    alb_pen = np.array([K["w_recent_album"] if S["album"][r] in seen_alb else 0.0 for r in cand])
    rel = (cos_c + K["w_last"] * cos_last + K["w_genre"] * g_ov + K["w_bpm"] * bpm_c
           + K["w_year"] * yr - art_pen - alb_pen)

    # MMR + temperature selection with a per-batch artist cap
    selected, sel_rows, art_count, alb_count = [], [], {}, {}
    remaining = list(range(len(cand)))
    while len(selected) < count and remaining:
        base = rel[remaining]
        if sel_rows:
            red = (E[cand[remaining]] @ E[sel_rows].T).max(1)
        else:
            red = np.zeros(len(remaining))
        score = K["lam"] * base - (1 - K["lam"]) * red
        for j, li in enumerate(remaining):        # per-batch artist/album caps
            a, al = S["artist"][cand[li]], S["album"][cand[li]]
            if (a and art_count.get(a, 0) >= K["artist_cap"]) or (
                al and alb_count.get(al, 0) >= K["album_cap"]
            ):
                score[j] -= 1e6
        if K["temp"] <= 0.03:
            pj = int(np.argmax(score))
        else:
            z = score - score.max()
            pr = np.exp(z / K["temp"])
            s = pr.sum()
            pj = int(_rng.choice(len(remaining), p=pr / s)) if s > 0 else int(np.argmax(score))
        gi = remaining.pop(pj)
        r = cand[gi]
        selected.append(r); sel_rows.append(r)
        a, al = S["artist"][r], S["album"][r]
        art_count[a] = art_count.get(a, 0) + 1
        alb_count[al] = alb_count.get(al, 0) + 1
    sel_rows = np.array(sel_rows) if sel_rows else np.array([], dtype=int)

    tracks = [S["row_nav"][r] for r in selected if S["row_nav"][r]]
    print(f"[session/next] -> {len(tracks)} tracks (eligible={int(mask.sum())} "
          f"pool={len(cand)}); first few: {tracks[:3]}", flush=True)
    return jsonify(tracks=tracks, debug={
        "contrast": p.get("contrast", 0.35), "pool": int(len(cand)),
        "eligible": int(mask.sum()), "ctx": len(ctx),
        "picked": [{"id": S["row_nav"][r], "artist": S["meta"][r].get("artist"),
                    "title": S["meta"][r].get("title")} for r in selected],
    })


load()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8001, threaded=False)
