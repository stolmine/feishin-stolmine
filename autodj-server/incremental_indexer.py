"""AutoDJ incremental indexer — the auto-ingest daemon (docs/autodj/07).

Polls the beets DB (the "is this file real and final?" oracle — a row exists only after
beets has moved+tagged+committed), embeds anything new that beets covers, purges anything
beets removed, then atomically swaps the index and pings the recommender's /reload. Does
NOT watch the filesystem (inotify races with in-progress moves). Runs as a long-lived
container from the crate-essentia image (model baked in), d6x10 window for parity with the
bulk digest. Good citizen: os.nice(15), settle guard, single flock, read-only beets/navidrome.

Env: AUTODJ_INDEX=/index  BEETS_DB=/beets/musiclibrary.blb  NAVIDROME_DB=/navidrome/navidrome.db
     RECOMMENDER_RELOAD_URL=http://host.docker.internal:8001/reload  POLL_INTERVAL=60  SETTLE_SECONDS=90
"""
import fcntl
import json
import os
import sqlite3
import time
import urllib.request

import numpy as np
from essentia.standard import (MonoLoader, TensorflowPredict2D,
                               TensorflowPredictEffnetDiscogs)

IDX = os.environ.get("AUTODJ_INDEX", "/index")
BEETS_DB = os.environ.get("BEETS_DB", "/beets/musiclibrary.blb")
NAVIDROME_DB = os.environ.get("NAVIDROME_DB", "/navidrome/navidrome.db")
RELOAD_URL = os.environ.get("RECOMMENDER_RELOAD_URL", "http://host.docker.internal:8001/reload")
POLL = int(os.environ.get("POLL_INTERVAL", "60"))
SETTLE = int(os.environ.get("SETTLE_SECONDS", "90"))
SR, SLICES, SEC = 16000, 6, 10

_E = TensorflowPredictEffnetDiscogs(
    graphFilename="/models/discogs-effnet-bs64-1.pb", output="PartitionedCall:1")
_G = TensorflowPredict2D(
    graphFilename="/models/genre_discogs400-discogs-effnet-1.pb",
    input="serving_default_model_Placeholder", output="PartitionedCall:0")
_LAB = json.load(open("/models/genre_discogs400-discogs-effnet-1.json"))["classes"]


def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def _window(a):
    w = int(SEC * SR)
    if len(a) <= SLICES * w:
        return a
    parts = []
    for i in range(SLICES):
        c = int((i + 0.5) / SLICES * len(a))
        parts.append(a[max(0, min(len(a) - w, c - w // 2)):][:w])
    return np.concatenate(parts)


def embed(abspath):
    a = MonoLoader(filename=abspath, sampleRate=SR, resampleQuality=4)()
    if len(a) == 0:
        raise RuntimeError("empty_audio")
    emb = _E(_window(a))
    if len(emb) == 0:
        raise RuntimeError("no_patches")
    v = np.mean(emb, axis=0)
    v = v / (float(np.linalg.norm(v)) + 1e-9)
    styles = [_LAB[i] for i in np.argsort(np.mean(_G(emb), axis=0))[::-1][:6]]
    return v.astype(np.float32).tobytes(), json.dumps(styles)


def beets_rows():
    c = sqlite3.connect(f"file:{BEETS_DB}?mode=ro", uri=True)
    c.execute("pragma busy_timeout=5000")
    rows = []
    for r in c.execute("select id, path, mb_trackid, mb_albumid, bpm, length, year, "
                       "artist, albumartist, album, title, added, mtime, genre from items"):
        p = r[1].decode("utf-8", "surrogateescape") if isinstance(r[1], (bytes, bytearray)) else r[1]
        rows.append({"beets_id": r[0], "path": "/music/" + p, "mbid": r[2], "bpm": r[4],
                     "length": r[5], "year": r[6], "artist": r[7], "albumartist": r[8],
                     "album": r[9], "title": r[10], "added": r[11] or 0, "mtime": r[12] or 0,
                     "genre": r[13]})
    c.close()
    return rows


def rebuild_navidrome_map():
    c = sqlite3.connect(f"file:{NAVIDROME_DB}?mode=ro", uri=True)
    c.execute("pragma busy_timeout=5000")
    by_path, by_mbid = {}, {}
    for nid, path, mbz in c.execute("select id, path, mbz_recording_id from media_file"):
        if path:
            by_path[path] = nid
        if mbz:
            by_mbid[mbz] = nid
    c.close()
    tmp = IDX + "/navidrome_map.json.tmp"
    json.dump({"by_path": by_path, "by_mbid": by_mbid}, open(tmp, "w"))
    os.replace(tmp, IDX + "/navidrome_map.json")


def export(db):
    rows = list(db.execute(
        "select beets_id, mbid, path, navidrome_id, bpm, length, year, artist, albumartist, "
        "album, title, genre, styles, vec from tracks where vec is not null order by beets_id"))
    vecs = np.zeros((len(rows), 1280), dtype=np.float32)
    keys = []
    with open(IDX + "/meta.jsonl.tmp", "w") as mf:
        for i, r in enumerate(rows):
            vecs[i] = np.frombuffer(r[13], dtype=np.float32)
            keys.append({"beets_id": r[0], "mbid": r[1], "path": r[2], "navidrome_id": r[3]})
            mf.write(json.dumps({"beets_id": r[0], "bpm": r[4], "length": r[5], "year": r[6],
                                 "artist": r[7], "albumartist": r[8], "album": r[9],
                                 "title": r[10], "genre": r[11],
                                 "styles": json.loads(r[12]) if r[12] else []}) + "\n")
    np.save(IDX + "/emb.tmp.npy", vecs)      # name ends in .npy so np.save won't re-append
    os.replace(IDX + "/emb.tmp.npy", IDX + "/emb.npy")
    json.dump(keys, open(IDX + "/keys.json.tmp", "w"))
    os.replace(IDX + "/keys.json.tmp", IDX + "/keys.json")
    os.replace(IDX + "/meta.jsonl.tmp", IDX + "/meta.jsonl")
    return len(rows)


def reload_recommender():
    try:
        urllib.request.urlopen(urllib.request.Request(RELOAD_URL, method="POST"), timeout=30)
        log("recommender reloaded")
    except Exception as e:
        log(f"reload failed (will retry next change): {repr(e)[:120]}")


def cycle():
    db = sqlite3.connect(IDX + "/index.sqlite")
    rows = beets_rows()
    byid = {r["beets_id"]: r for r in rows}
    live_ids = set(byid)
    done = {r[0] for r in db.execute("select beets_id from tracks where vec is not null")}
    failed = {r[0] for r in db.execute("select beets_id from failures")}
    now = time.time()
    todo = [r for r in rows if r["beets_id"] not in done and r["beets_id"] not in failed
            and max(r["added"], r["mtime"]) < now - SETTLE]

    changed = False
    for t in todo:
        bid, p = t["beets_id"], t["path"]
        try:
            if not os.path.isfile(p):
                raise RuntimeError("missing_file")
            if p.lower().rsplit(".", 1)[-1] == "opus":
                raise RuntimeError("unsupported_codec")
            vec, styles = embed(p)
            db.execute(
                "insert or replace into tracks(beets_id,mbid,path,added,mtime,bpm,length,"
                "year,artist,albumartist,album,title,genre,styles,navidrome_id,vec,embedded_at)"
                " values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (bid, t["mbid"], p, t["added"], t["mtime"], t["bpm"], t["length"], t["year"],
                 t["artist"], t["albumartist"], t["album"], t["title"], t["genre"], styles,
                 None, vec, now))
            db.commit()
            changed = True
            log(f"embedded #{bid} {t['artist']} — {t['title']} [{json.loads(styles)[0]}]")
        except Exception as e:
            db.execute("insert or replace into failures(beets_id,path,err,ts) values(?,?,?,?)",
                       (bid, p, str(e)[:150], now))
            db.commit()
            log(f"skip #{bid} ({str(e)[:40]})")

    idx_ids = {r[0] for r in db.execute("select beets_id from tracks")}
    gone = idx_ids - live_ids
    if gone:
        db.executemany("delete from tracks where beets_id=?", [(g,) for g in gone])
        db.commit()
        changed = True
        log(f"purged {len(gone)} track(s) removed from beets")

    if changed:
        rebuild_navidrome_map()
        n = export(db)
        reload_recommender()
        log(f"index now {n} tracks")
    db.close()


def main():
    os.nice(15)
    lock = open(IDX + "/incremental.lock", "w")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        log("another incremental indexer is running; exiting")
        return
    log(f"incremental indexer started (poll={POLL}s settle={SETTLE}s)")
    while True:
        try:
            cycle()
        except Exception as e:
            log(f"cycle error: {repr(e)[:200]}")
        time.sleep(POLL)


if __name__ == "__main__":
    main()
