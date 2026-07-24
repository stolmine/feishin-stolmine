"""AutoDJ initial digest: embed every library track (d6x10 distributed window) with a
4-worker pool, persisting to /out/index.sqlite as it goes (resumable), then export
emb.npy + keys.json + meta.jsonl for the recommender to load.

Runs as a one-shot `crate-essentia` container (model baked in at /models), mounting a
writable /out and /music:ro. Good citizen: os.nice(15), 1 TF thread per worker.
Reads /out/manifest.json (produced from beets). navidrome_id is left null here — a
separate fast pass resolves it. Per-track decode failures are logged, never fatal.
"""
import json
import os
import sqlite3
import time
from multiprocessing import Pool

import numpy as np

OUT = "/out"
SR, SLICES, SEC = 16000, 6, 10                   # distributed window: 6x10s = 60s (the knee)
WORKERS = 4
_E = _G = _LAB = None


def init():
    os.nice(15)
    for v in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS",
              "TF_NUM_INTRAOP_THREADS", "TF_NUM_INTEROP_THREADS"):
        os.environ[v] = "1"
    global _E, _G, _LAB
    from essentia.standard import TensorflowPredict2D, TensorflowPredictEffnetDiscogs
    _E = TensorflowPredictEffnetDiscogs(
        graphFilename="/models/discogs-effnet-bs64-1.pb", output="PartitionedCall:1")
    _G = TensorflowPredict2D(
        graphFilename="/models/genre_discogs400-discogs-effnet-1.pb",
        input="serving_default_model_Placeholder", output="PartitionedCall:0")
    _LAB = json.load(open("/models/genre_discogs400-discogs-effnet-1.json"))["classes"]


def _window(a):
    w = int(SEC * SR)
    if len(a) <= SLICES * w:
        return a
    parts = []
    for i in range(SLICES):
        c = int((i + 0.5) / SLICES * len(a))
        s = max(0, min(len(a) - w, c - w // 2))
        parts.append(a[s:s + w])
    return np.concatenate(parts)


def work(t):
    from essentia.standard import MonoLoader
    bid, p = t["beets_id"], t["path"]
    try:
        if not os.path.isfile(p):
            return (bid, None, "missing_file")
        # essentia's bundled libav lacks opus → MonoLoader raises at *construct* time,
        # and a raised error in a pooled worker has been observed to deadlock the pool.
        # Short-circuit unsupported codecs by extension before touching essentia.
        if p.lower().rsplit(".", 1)[-1] in ("opus",):
            return (bid, None, "unsupported_codec")
        a = MonoLoader(filename=p, sampleRate=SR, resampleQuality=4)()
        if len(a) == 0:
            return (bid, None, "empty_audio")
        emb = _E(_window(a))
        if len(emb) == 0:
            return (bid, None, "no_patches")
        v = np.mean(emb, axis=0)
        v = v / (float(np.linalg.norm(v)) + 1e-9)
        preds = np.mean(_G(emb), axis=0)
        styles = [_LAB[i] for i in np.argsort(preds)[::-1][:6]]
        return (bid, v.astype(np.float32).tobytes(), json.dumps(styles))
    except Exception as e:
        return (bid, None, str(e)[:150])


def progress(msg):
    with open(OUT + "/progress.txt", "a") as f:
        f.write(msg + "\n")


def export(db):
    rows = list(db.execute(
        "select beets_id, mbid, path, navidrome_id, bpm, length, year, artist, "
        "albumartist, album, title, genre, styles, vec from tracks "
        "where vec is not null order by beets_id"))
    vecs = np.zeros((len(rows), 1280), dtype=np.float32)
    keys = []
    with open(OUT + "/meta.jsonl", "w") as mf:
        for i, r in enumerate(rows):
            vecs[i] = np.frombuffer(r[13], dtype=np.float32)
            keys.append({"beets_id": r[0], "mbid": r[1], "path": r[2], "navidrome_id": r[3]})
            mf.write(json.dumps({
                "beets_id": r[0], "bpm": r[4], "length": r[5], "year": r[6],
                "artist": r[7], "albumartist": r[8], "album": r[9], "title": r[10],
                "genre": r[11], "styles": json.loads(r[12]) if r[12] else []}) + "\n")
    np.save(OUT + "/emb.npy", vecs)
    json.dump(keys, open(OUT + "/keys.json", "w"))
    return len(rows)


def main():
    db = sqlite3.connect(OUT + "/index.sqlite")
    db.execute("""create table if not exists tracks(
        beets_id INTEGER PRIMARY KEY, mbid TEXT, path TEXT, added REAL, mtime REAL,
        bpm REAL, length REAL, year INTEGER, artist TEXT, albumartist TEXT, album TEXT,
        title TEXT, genre TEXT, styles TEXT, navidrome_id TEXT, vec BLOB, embedded_at REAL)""")
    db.execute("""create table if not exists failures(
        beets_id INTEGER PRIMARY KEY, path TEXT, err TEXT, ts REAL)""")
    db.commit()

    manifest = json.load(open(OUT + "/manifest.json"))
    byid = {t["beets_id"]: t for t in manifest}
    done = {r[0] for r in db.execute("select beets_id from tracks where vec is not null")}
    todo = [t for t in manifest if t["beets_id"] not in done]
    total, start = len(manifest), len(done)
    progress(f"=== start {time.strftime('%Y-%m-%d %H:%M:%S')} total={total} "
             f"already_done={start} todo={len(todo)}")

    t0 = time.time()
    n = 0
    with Pool(WORKERS, initializer=init) as pool:
        for bid, vec, info in pool.imap_unordered(work, todo, chunksize=1):
            t = byid[bid]
            if vec is not None:
                db.execute(
                    "insert or replace into tracks(beets_id,mbid,path,added,mtime,bpm,"
                    "length,year,artist,albumartist,album,title,genre,styles,navidrome_id,"
                    "vec,embedded_at) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    (bid, t.get("mbid"), t.get("path"), t.get("added"), t.get("mtime"),
                     t.get("bpm"), t.get("length"), t.get("year"), t.get("artist"),
                     t.get("albumartist"), t.get("album"), t.get("title"), t.get("genre"),
                     info, None, vec, time.time()))
            else:
                db.execute("insert or replace into failures(beets_id,path,err,ts) "
                           "values(?,?,?,?)", (bid, t.get("path"), info, time.time()))
            n += 1
            if n % 50 == 0:
                db.commit()
                rate = n / (time.time() - t0)
                eta = (len(todo) - n) / rate if rate > 0 else 0
                fails = db.execute("select count(*) from failures").fetchone()[0]
                with open(OUT + "/status.txt", "w") as f:
                    f.write(f"done={start + n}/{total} this_run={n}/{len(todo)} "
                            f"rate={rate:.2f}/s eta={eta / 60:.1f}min fails={fails}\n")
    db.commit()
    emb = export(db)
    fails = db.execute("select count(*) from failures").fetchone()[0]
    progress(f"=== DONE {time.strftime('%Y-%m-%d %H:%M:%S')} embedded={emb} "
             f"fails={fails} elapsed={(time.time() - t0) / 60:.1f}min")


if __name__ == "__main__":
    main()
