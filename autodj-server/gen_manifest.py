"""Runs in the beets container: dump ALL items as the digest manifest (JSON list).
Read-only. Path is stored relative to /music in beets → emit absolute /music/... ."""
import json
import sqlite3

c = sqlite3.connect("file:/config/musiclibrary.blb?mode=ro", uri=True)
cur = c.execute(
    "select id, path, mb_trackid, mb_albumid, bpm, length, year, artist, "
    "albumartist, album, title, added, mtime, genre, format, samplerate from items")
rows = []
for r in cur:
    p = r[1]
    p = p.decode("utf-8", "surrogateescape") if isinstance(p, (bytes, bytearray)) else p
    rows.append({
        "beets_id": r[0], "path": "/music/" + p, "mbid": r[2], "mb_albumid": r[3],
        "bpm": r[4], "length": r[5], "year": r[6], "artist": r[7], "albumartist": r[8],
        "album": r[9], "title": r[10], "added": r[11], "mtime": r[12], "genre": r[13],
        "format": r[14], "samplerate": r[15],
    })
print(json.dumps(rows))
