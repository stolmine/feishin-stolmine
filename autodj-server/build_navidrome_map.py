"""Build the Navidrome-id join map from Navidrome's own DB (read-only), keyed by
path (primary) + mbz_recording_id (fallback). Independent of the digest — writes only
navidrome_map.json. Also reports coverage against the manifest.

Navidrome stores media_file.path RELATIVE to its /music root — same relpath beets uses —
so we join on the relative path (manifest paths are /music/<relpath>; strip the prefix).
"""
import json
import sqlite3

ND = "/home/stol/docker/media/navidrome/navidrome.db"
OUT = "/home/stol/docker/crate/autodj-index"

c = sqlite3.connect(f"file:{ND}?mode=ro", uri=True)
c.execute("pragma busy_timeout=5000")
by_path, by_mbid = {}, {}
for nid, path, mbz in c.execute("select id, path, mbz_recording_id from media_file"):
    if path:
        by_path[path] = nid
    if mbz:
        by_mbid[mbz] = nid
json.dump({"by_path": by_path, "by_mbid": by_mbid},
          open(f"{OUT}/navidrome_map.json", "w"))
print(f"navidrome mapped: paths={len(by_path)} mbids={len(by_mbid)}")

man = json.load(open(f"{OUT}/manifest.json"))
hit_p = hit_m = miss = 0
for t in man:
    rel = t["path"][7:] if t["path"].startswith("/music/") else t["path"]
    if rel in by_path:
        hit_p += 1
    elif t.get("mbid") and t["mbid"] in by_mbid:
        hit_m += 1
    else:
        miss += 1
print(f"manifest coverage of {len(man)}: by_path={hit_p} by_mbid_fallback={hit_m} miss={miss}")
