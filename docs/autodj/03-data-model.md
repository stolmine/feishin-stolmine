# 03 — Data Model

## 3.1 Embedding store (server, mirrors `brain`'s index dir)

Lives in the recommender's data volume. Truth = the audio files; vectors are derived.

| Artifact | Shape | Role |
|---|---|---|
| `emb.npy` | `float32[N, 1280]`, L2-normed | search matrix, loaded into RAM |
| `keys.json` | `[{navidrome_id, mbid, path}]` (row-aligned) | row → track identity / join |
| `meta.jsonl` | `{bpm, length, year, styles[], genres[], artist, artistId, album, title, playCount?, rating?}` | filters + rerank features |
| `index.sqlite` | `path, hash, row, mbid, navidrome_id, embedded_at` | durable mirror + incremental (skip unchanged) |

`N ≈ 6008`, so `emb.npy ≈ 30 MB`. Reloaded on daemon start; rebuilt/appended by the
indexer.

## 3.2 The ID join (validated)

Three identifiers, resolvable to each other:

```
Feishin Song            beets item          Navidrome
  id (navidrome_id) ◀──────────────────────▶ id
  mbzTrackId       ◀──▶ mb_trackid
  path             ◀──▶ path            ◀──▶ path
```

- Primary join: `mbzTrackId ↔ beets.mb_trackid`.
- Fallback: `path` (for tracks lacking an MBID).
- `navidrome_id` is obtained by the indexer querying Navidrome once and matched on
  `path`/`mbid`; it's what the recommender **returns** and what Feishin **queues**.
- Coverage gaps (no MBID + path mismatch, or essentia analysis failure) → track is simply
  absent from the index; the recommender never returns it. Log the miss count.

## 3.3 Session model (client-side, Feishin store)

Sessions live in Feishin's Zustand `persist` store (localStorage), matching Feishin
convention (the UI-map agent confirmed this is where per-feature config belongs — add an
`AutoDJSessionSchema` alongside the existing `AutoDJSettingsSchema`). The recommender
stays **stateless**; Feishin passes context each call.

```ts
// new schema in store/settings.store.ts (zod), persisted + migrated (version bump)
type AutoDJSession = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  params: AutoDJParams;          // the modal's values (see below)
  seedTrackIds: string[];        // navidrome ids chosen at start
  generatedTrackIds: string[];   // full log of what AutoDJ added, in order
  savedPlaylistId?: string;      // set once exported to Navidrome
};

type AutoDJParams = {
  contrast: number;              // 0..1  → server α
  yearMin?: number; yearMax?: number;
  genresAllow: string[]; genresExclude: string[];
  bpmMin?: number; bpmMax?: number;
  lengthMinSec?: number; lengthMaxSec?: number;
  artistsInclude: string[]; artistsExclude: string[];  // navidrome artist ids
  allowDuplicates: boolean;
  count: number;                 // batch size per refill (existing itemCount)
  timing: number;                // refill threshold (existing)
};
```

Also add to the AutoDJ **settings** schema (global, not per-session):
`recommenderUrl: string` (default the Tailscale URL) and `strategy` gains a `'vector'`
value alongside `'similar' | 'library_random'`.

## 3.4 "Active session" runtime state

One session can be *active* (currently driving the queue). Held in the player/AutoDJ
runtime (not necessarily persisted every tick):

```ts
{ activeSessionId, headIndexAtStart, lastContextIds: string[] }
```

- `headIndexAtStart` marks where the session began in the queue, so **"Save as playlist"
  can cut off at the current head** (tracks from session start → current index).
- On refill, `lastContextIds` = the last N queue items feeding the recommender's `recent`.

## 3.5 Playlist export (reuse existing flow)

"Save session as playlist" reuses Feishin's create-and-prefill flow
(`features/playlists/components/create-playlist-form.tsx` → `useCreatePlaylist` +
`useAddToPlaylist`). Input = the session's generated tracklist sliced to the current
head. On success, store `savedPlaylistId` on the session.

## 3.6 What is NOT stored where

- **No vectors in file tags** (see 01/02 — search needs them all in one matrix; tagging
  bloats files and breaks on model change).
- **No session DB on the server** — recommender is stateless; Feishin owns session state.
  (Alternative for cross-device sync noted in [06-open-decisions.md](06-open-decisions.md).)
- **No new Navidrome schema** — durable artifacts are ordinary Navidrome playlists.
