# Remote Browse + Queue Management — Implementation Scope

Feature: extend the phone remote PWA (`src/remote/`) with library browsing (artists, albums, songs, playlists, search) and full queue management — an "iTunes Remote"-style client for the Feishin desktop player.

Status: SCOPING ONLY — no implementation. All file:line references verified against the working tree at branch `development` (2026-07-24).

---

## 1. Summary + goal

Today the remote is a single-screen transport controller: play/pause/next/prev/shuffle/repeat, seek, volume, favorite, rating, and one proxied cover image. The goal:

1. **Browse** the library from the phone (Artists / Albums / Songs / Playlists / Search) with list-or-grid display per tab and an iOS-style alphabetical ribbon scrubber.
2. **Play + queue** from the phone: play now / play next / add last for any song, album, artist, or playlist.
3. **Live queue view**: see the desktop's current queue on the phone, tap-to-play any entry, remove, reorder, clear.

Architecture in one sentence: **browse reads go phone → music server directly** (reusing the desktop renderer's api/query layer, with credentials provisioned via a new endpoint), while **all writes (play/queue mutations) go phone → desktop over the existing WebSocket**, extended with new events; the desktop pushes live queue snapshots back.

---

## 2. Current-architecture findings (verified)

### 2.1 The remote PWA

- Entry: `src/remote/index.tsx` → `src/remote/app.tsx` (MantineProvider + `useAppTheme` from `/@/renderer/themes/use-app-theme`) → `src/remote/components/shell.tsx` (Mantine `AppShell`, header with reconnect/image/theme buttons) → `src/remote/components/remote-container.tsx` (the entire transport UI, ~225 lines).
- **No router.** One screen, conditionally rendered on `connected` (`shell.tsx:42-48`).
- Store: `src/remote/store/index.ts` — a single zustand store (`useRemoteStore`, persist name `store_settings`, version 7, `src/remote/store/index.ts:38-275`). Owns the WebSocket:
  - `reconnect()` (line 43): `fetch('/credentials')` → text (line 64-65), opens `new WebSocket(location.href.replace('http','ws'))` (line 72-74), on open sends `{event:'authenticate', header}` (line 190-198), dispatches every `ServerEvent` into `state.info` (lines 78-183).
  - `send(data: ClientEvent)` (line 239) — raw JSON over the socket.
- The remote already imports renderer/shared code: `/@/shared/components/*`, `/@/renderer/themes/use-app-theme`, `/@/renderer/utils/logger` — proving the alias-based reuse path works in practice.
- PWA bits: `src/remote/manifest.json` (standalone, portrait), `src/remote/service-worker.ts` (cache-first for `./`, `remote.js`, `remote.css`, `favicon.ico`), registered from `src/remote/index.html:13-19`. Note `src/remote/worker.js` is an empty placeholder; the built SW comes from `service-worker.ts`.
- Build: `remote.vite.config.ts` — `root: ./src/remote`, `outDir: ./out/remote`, aliases (lines 45-51): `/@/i18n`, `/@/remote`, `/@/renderer`, `/@/shared`. Inputs: `index.html`, `index.tsx`→`remote.js`, `service-worker.ts`→`worker.js`. Scripts: `build:remote`, `dev:remote` (`package.json`). No define/polyfill block.

### 2.2 The desktop-hosted server

`src/main/features/core/remote/index.ts` — Node `http` + `ws` in the **main** process:

- HTTP: fixed route switch (lines 294-332): `/`, `/credentials`, `/favicon.ico`, `/manifest.json`, `/remote.css`, `/remote.js`, `/worker.js*`. Everything else 404s — **deep links would 404, which motivates hash routing** (§5.1). Optional HTTP Basic gate `authorize()` (lines 134-145) driven by remote username/password settings.
- **`GET /credentials` (lines 299-303) merely echoes the request's own `Authorization` header** — i.e. `Basic base64(remoteUser:remotePass)` for the remote gate. It is *not* a Navidrome/Subsonic credential and is used only to authenticate the WS (`store/index.ts:190-198`, validated at main lines 384-403). **This kills the naive "just use /credentials to hit the music server" plan — see §3.1.**
- WS command dispatch: one `switch` in `ws.on('message')` (lines 405-516). Transport events forward as IPC to the main window:
  - `play/pause/next/previous` → `renderer-player-play/-pause/-next/-previous` (lines 417-432)
  - `repeat/shuffle` → `renderer-player-toggle-repeat/-toggle-shuffle` (lines 478-484)
  - `favorite`/`rating` → `request-favorite`/`request-rating` (lines 406-416, 467-477) — only if the id matches the *current* song
  - `volume`/`position` → `request-volume`/`request-position` (lines 486-515)
  - `proxy` (lines 433-466): the one existing request/response pattern — main fetches `currentState.song.imageUrl` itself with axios and replies base64 **to that single client** via `send({client: ws, ...})`, not `broadcast`.
- State pushed to phones: module-level `currentState: SongState` (line 115) updated by `ipcMain.on('update-song'|'update-playback'|'update-repeat'|'update-shuffle'|'update-volume'|'update-position'|'update-favorite'|'update-rating')` (lines 607-699), each broadcasting a `ServerEvent`. New WS clients get the full `state` on connect (line 526). **`currentState` holds only the single current song — no queue.**

### 2.3 The WS protocol — complete current event list

`src/shared/types/remote-types.ts`:

- `ClientEvent` (phone → desktop): `authenticate` (ClientAuth, line 4), `favorite` (line 17), `position` (line 23), `rating` (line 28), `volume` (line 37), and `ClientSimpleEvent` = `'next' | 'pause' | 'play' | 'previous' | 'proxy' | 'repeat' | 'shuffle'` (line 34). **No queue operations exist.**
- `ServerEvent` (desktop → phone): `error`, `favorite`, `playback` (PlayerStatus), `position`, `proxy` (base64 image), `rating`, `repeat` (PlayerRepeat), `shuffle` (bool), `song` (null | QueueSong), `state` (SongState), `volume` (lines 42-108).

### 2.4 Renderer side of the command flow (what we mirror)

Two established paths for remote-originated commands:

- **Path A — generic transport IPC** (shared with media keys/MPRIS/tray): handled in `src/renderer/features/player/audio-player/hooks/use-main-player-listener.tsx` — play/pause line 51-55, next 57-61, previous 69-73, play 81-85, pause 87-91, toggle shuffle 107-109, toggle repeat 111-113.
- **Path B — remote-specific `request-*` IPC** via a dedicated preload bridge:
  - Preload: `src/preload/remote.ts` — `requestPosition/Seek/Volume/Rating/Favorite` register `ipcRenderer.on('request-*')` (lines 6-26); `update*` senders at lines 38-85. Exposed as `window.api.remote`.
  - Renderer handler hook: `src/renderer/features/remote/hooks/use-remote.tsx` — position 60-64, seek 66-69, rating 71-78, volume 80-83, favorite 85-99. Renderer→main state pushes live in the same file via `usePlayerEvents` (line 150+): `remote.updateSong` (175), `updatePosition` (186), `updateRepeat` (194), `updateShuffle` (206), `updatePlayback` (214), `updateVolume` (222), `updateFavorite` (234), `updateRating` (246).

**New queue events should follow Path B** (dedicated `request-queue-*` channels + a renderer handler in `use-remote.tsx` + preload additions), because queue ops need renderer store access and structured payloads, exactly like favorite/rating.

### 2.5 The renderer queue model + mutation API

- `QueueData` (`src/shared/types/domain-types.ts:69-73`) — **normalized** (this fork diverges from upstream):
  ```ts
  { default: string[];            // ordered _uniqueIds
    shuffled: number[];           // indices into `default` (shuffle order)
    songs: Record<string, QueueSong> }
  ```
- `QueueSong = Song & { _contextPlaylistId?; _uniqueId: string }` (`domain-types.ts:75-78`). **`_uniqueId` (nanoid on enqueue) is queue identity** — the same song id can appear multiple times; all remove/reorder ops must use `_uniqueId`. There is no `streamUrl` on `Song`.
- Store: `src/renderer/store/player.store.ts` — `addToQueueByType` (impl line 359), `addToQueueByUniqueId` (597, insert relative to an item), `clearQueue` (719), `clearSelected` (727), `getQueue` (852), `mediaPlay` (1137), `mediaPlayByIndex` (1183), `moveSelectedTo` (1360), `moveSelectedToBottom/Next/Top` (1393/1413/1447), `setQueue` (1467), `shuffleAll` (1576). `player.index` + shuffle mapping helpers at lines 160-168.
- **UI-facing handler layer** (this fork does NOT use upstream's `usePlayQueueHandler`; `PlayQueueAddOptions` in `src/shared/types/types.ts:233-243` is a dead leftover): `src/renderer/features/player/context/player-context.tsx`:
  - `addToQueueByData(songs, playType, …)` — line 213
  - `addToQueueByFetch(serverId, ids, itemType, playType)` — line 254; resolves album/artist/playlist/genre/**song** ids to songs via `fetchSongsByItemType` (line 859; SONG case line 945) then enqueues. **This is the single entry point the remote queue-add event should target.**
  - `Play` enum (`src/shared/types/types.ts:122-130`): `NOW, NEXT, LAST, SHUFFLE, NEXT_SHUFFLE, LAST_SHUFFLE, INDEX`.
- Desktop queue UI: `src/renderer/features/now-playing/components/play-queue.tsx` — renders via `ItemTableList`, row id `_uniqueId` (line 196), follow-current via `tableRef.current?.scrollToIndex(index, {align:'center'})` (lines 73-123), reorder via `@atlaskit/pragmatic-drag-and-drop` → `moveSelectedTo` (`item-table-list/hooks/use-item-drag-drop-state.tsx:241`).

### 2.6 The api layer + credentials (browse path)

- Dispatch: `src/renderer/api/controller.ts` — `apiController()` (lines 118-195) picks `endpoints[serverType]` from `{jellyfin, navidrome, subsonic}` controllers (lines 23-27); every method resolves the server via `getServerById(args.apiClientProps.serverId)` from the **auth store** (`src/renderer/store/auth.store.ts:171-177`, store at line 26, zustand `persist` → **localStorage**, key `store_authentication`).
- `ServerListItemWithCredential` (`src/shared/types/domain-types.ts:87-106`): `ServerListItem` (id, name, type, url, remoteUrl?, username, userId, musicFolderId?, features?, …) + `credential: string` (Subsonic auth query fragment `u=…&s=…&t=…` or `u=…&p=…`) + `ndCredential?: string` (Navidrome bearer token).
- Auth attachment: Subsonic — `src/renderer/api/subsonic/subsonic-api.ts:485-513` splits `server.credential` into query params against `${serverUrl}/rest`. Navidrome — `src/renderer/api/navidrome/navidrome-api.ts:483-504` sends `x-nd-authorization: Bearer ${ndCredential}` (Navidrome uses BOTH: `ndCredential` for `/api`, `credential` for Subsonic-style stream/image endpoints).
- Query factories (TanStack v5 `queryOptions` objects, NOT `useXxx` hooks):
  - `albumQueries` — `src/renderer/features/albums/api/album-api.ts:10` (`detail` :11, `list` :23, `listCount` :39)
  - `artistQueries` — `src/renderer/features/artists/api/artists-api.ts` (`albumArtistList` :49, `albumArtistListCount` :79, `albumArtistDetail` :23, `topSongs` :161, …)
  - `songQueries` — `src/renderer/features/songs/api/songs-api.ts` (`list` :62, `listCount` :92, `randomSongList` :108, …)
  - `playlistQueries` — `src/renderer/features/playlists/api/playlists-api.ts` (`detail` :17, `list` :30, `listCount` :43, `songList` :59)
  - `searchQueries` — `src/renderer/features/search/api/search-api.ts:10` (`search` :11, plus `search*Infinite` variants, `SEARCH_PAGE_SIZE = 4` :8). All three server types route search through Subsonic `search3` (`navidrome-controller.ts:1166` delegates to `SubsonicController.search`, `subsonic-controller.ts:2305`).
  - Arg shape: `QueryHookArgs<T>` = `{ serverId, query, options? }` (`src/renderer/lib/react-query.ts:62`); list queries take `{sortBy, sortOrder, startIndex, limit, searchTerm?, …}`.
- **Electron coupling: none fatal.** The feature api files are grep-clean of `window.*`/electron. `src/renderer/api/utils.ts:1-8` and `navidrome-api.ts:3-18` gate `window.api.localSettings` behind `isElectron()` (false in the PWA → null, optional-chained uses). `src/renderer/utils/logger.ts` is already used by the remote and is guarded.
- Images: DTO `imageUrl` is normalized to null; URLs are built on demand embedding the credential — `getSubsonicImageRequest` (`src/renderer/api/subsonic/subsonic-controller.ts:48-76`): `${url}/rest/getCoverArt.view?id=${imageId}&${server.credential}&v=1.13.0&c=Feishin&size=N`; exposed as `controller.getImageUrl` (`controller.ts:593`).

### 2.7 Desktop list UI (patterns to crib)

- Three renderers in `src/renderer/components/item-list/`:
  - `item-grid-list/item-grid-list.tsx` — **react-window v1** `FixedSizeList` + `react-virtualized-auto-sizer`; responsive columns; `scrollToIndex` → `listRef.current.scrollToItem(row, alignment)` (lines 529-550).
  - `item-table-list/item-table-list.tsx` — **react-window v2** (`react-window-v2` alias, pkg `npm:react-window@^2.2.7`) `Grid`; custom pixel scroll-to-index (`hooks/use-table-scroll-to-index.ts:45-111`).
  - `item-detail-list/item-detail-list.tsx` — react-window v2 `List` + `useDynamicRowHeight`.
  - **Uniform imperative handle** `ItemListHandle` (`src/renderer/components/item-list/types.ts:73-80`): `scrollToIndex(index, {align, behavior})`, `scrollToOffset(offset)` — the primitive the ribbon needs.
- Display-mode idiom: `ListDisplayType` enum (`src/shared/types/types.ts:37-42`: `DETAIL/'detail'`, `GRID/'poster'`, `LIST/'list'`, `TABLE/'table'`). Persisted per list key in `useSettingsStore.lists[ItemListKey]` (`src/renderer/store/settings.store.ts` — `ItemListConfigSchema` lines 258-271 with `display`, `grid: {itemsPerRow, itemGap, size}`, `table`, `pagination`; read via `useListSettings(key)` lines 2888-2892). List pages `switch (display)` to pick a renderer (e.g. `src/renderer/features/albums/components/album-list-content.tsx:77-230`).
- Data loading: `useItemListInfiniteLoader` (`/@/renderer/components/item-list/helpers/item-list-infinite-loader`) + `*Queries.listCount` — e.g. `album-list-infinite-grid.tsx:34-59`.
- **No alphabet scrubber / letter index exists anywhere** in the codebase; no touch/gesture handling in item-list beyond OverlayScrollbars `pointers: ['mouse','pen','touch']` (grid :438, detail :1457) — interactions are keyboard/mouse-oriented (hotkeys, arrow nav, pragmatic-drag-and-drop).

Relevant deps already in `package.json`: `react-router ^7.17.0`, `react-window 1.8.11`, `react-window-v2` (v2.2.7), `react-virtualized-auto-sizer`, `@tanstack/react-query 5.96.2`, `zustand ^5.0.14`, Mantine 9.

---

## 3. Proposed architecture

### 3.1 Browse: phone → music server DIRECT (validated, with one correction)

The task hypothesis was "reuse `/@/renderer/api` + the `/credentials` header to hit Navidrome directly." The reuse half is **confirmed viable** (aliases exist, no fatal electron deps, factories are UI-free). The credentials half is **wrong as stated**: `/credentials` returns only the remote gate's Basic header (§2.2), and the real music-server credentials live in the *desktop renderer's* localStorage (`store_authentication`) — a different origin the PWA can never read.

**Fix: provision the current server (with credentials) to the PWA.** Chosen mechanism — over the existing WS, mirroring `update-song`:

1. Renderer pushes the current server on connect/change: in `use-remote.tsx`, subscribe to `useAuthStore` `currentServer` (with credential, via `useCurrentServerWithCredential`, `auth.store.ts:164`) and call a new `remote.updateServer(server)` preload method → `ipcRenderer.send('update-server', server)`.
2. Main caches it (module-level `currentServer` next to `currentState`) and broadcasts a new `ServerEvent` `{event:'server', data: RemoteServer}` — also included in the on-connect payload (after the existing `state` send, `index.ts:526`). Only sent to **authenticated** sockets (the existing `send()` already gates on `client.auth`, line 71-77).
3. The PWA hydrates `useAuthStore` (imported from `/@/renderer/store/auth.store`) with that single server via its existing actions, so `api.controller.*` and every query factory work **unchanged** — `getServerById(serverId)` resolves exactly as on desktop.

`RemoteServer` payload = `ServerListItemWithCredential` minus `savePassword` (id, name, type, url, remoteUrl?, preferRemoteUrl?, username, userId, musicFolderId?, features?, credential, ndCredential?).

Why WS and not a new HTTP endpoint: main doesn't have the credentials (renderer does), the WS path already has an auth gate and a renderer→main push idiom, and it handles server switching live.

**CORS caveat (must verify in P1 week 1):** the phone will fetch `https?://music-server/rest/...` and `/api/...` from origin `http://desktop:4333`. Navidrome ships permissive CORS on its API routes in current versions, but this must be verified against the user's server; generic Subsonic servers vary. **Fallback (design now, build only if needed):** a reverse-proxy route in main's HTTP server — `GET /upstream/<encoded-absolute-url>` (authorize()-gated, restricted to the known server URL prefix) that pipes via axios, plus a `serverUrl` rewrite so `subsonic-api`/`navidrome-api` base URLs point at the proxy. This preserves the direct-first architecture with a one-file escape hatch.

Scaling note: browse traffic (JSON + cover art) never touches the desktop in the direct path — this is the whole reason not to round-trip browsing over the WS.

### 3.2 Playback + queue: phone → desktop over the existing WS (extend protocol)

All mutations go through the desktop player. Flow mirrors favorite/rating (Path B, §2.4):

```
phone useSend() ──WS──> main ws switch (remote/index.ts:405)
  ──webContents.send('request-queue-*')──> preload src/preload/remote.ts
  ──> renderer use-remote.tsx handler ──> player-context / player.store actions
renderer usePlayerEvents queue subscription ──'update-queue' IPC──> main
  ──broadcast {event:'queue'}──> all phones
```

The desktop remains the single source of truth for the queue; phones render snapshots and send intents. Reorder conflicts resolve trivially (last write wins on the desktop store; every mutation triggers a fresh snapshot broadcast).

---

## 4. WS protocol changes (exact shapes)

All additions to `src/shared/types/remote-types.ts`. Naming follows the existing flat-event style.

### 4.1 New ClientEvents (phone → desktop)

```ts
// Enqueue/play library items by id. Covers playSong/playAlbum/playArtist/playPlaylist
// via itemType + playType. Renderer resolves ids → songs with
// player-context.addToQueueByFetch (fetchSongsByItemType handles SONG/ALBUM/
// ALBUM_ARTIST/ARTIST/PLAYLIST/GENRE — player-context.tsx:859).
export interface ClientQueueAdd {
    event: 'queueAdd';
    ids: string[];
    itemType: LibraryItem;          // from /@/shared/types/domain-types
    playType: Play;                 // Play.NOW | NEXT | LAST | SHUFFLE | ... (types.ts:122)
    serverId: string;               // from the provisioned RemoteServer.id
}

// Jump to an existing queue entry (tap a row in the phone's queue view).
export interface ClientQueuePlay {
    event: 'queuePlay';
    uniqueId: string;               // QueueSong._uniqueId
}

// Remove entries. uniqueIds, never song ids (duplicates!).
export interface ClientQueueRemove {
    event: 'queueRemove';
    uniqueIds: string[];
}

// Reorder: move entries relative to a target entry (matches store
// moveSelectedTo(items, uniqueId, edge) — player.store.ts:1360).
export interface ClientQueueMove {
    event: 'queueMove';
    edge: 'bottom' | 'top';         // insert below/above target
    targetUniqueId: string;
    uniqueIds: string[];
}

export interface ClientQueueClear {
    event: 'queueClear';
}

// Explicit snapshot request (reconnect resync; mirrors the 'proxy'
// request/response idiom — targeted send, not broadcast).
export interface ClientQueueRequest {
    event: 'queueRequest';
}
```

`ClientEvent` union gains all six. (`shuffleAll` deliberately omitted from P1 — `playType: Play.SHUFFLE` on `queueAdd` covers the common case.)

### 4.2 New ServerEvent (desktop → phone)

```ts
// Slim queue entry — NOT the full QueueSong (a Song is large; queues can be
// 1000s of entries). ~120 bytes/entry keeps a 2k-song queue snapshot ~250 KB.
export interface RemoteQueueEntry {
    album: null | string;
    albumId: null | string;
    artistName: string;
    duration: number;
    id: string;
    imageId: null | string;        // phone builds cover URL via controller.getImageUrl
    name: string;
    uniqueId: string;              // QueueSong._uniqueId — identity for play/remove/move
    userFavorite: boolean;
    userRating: null | number;
}

export interface ServerQueue {
    data: {
        currentIndex: number;       // index into entries; -1 if nothing playing
        currentUniqueId: null | string;
        entries: RemoteQueueEntry[]; // in EFFECTIVE play order (shuffle already applied
                                     // by the renderer when building the snapshot)
        shuffle: boolean;
    };
    event: 'queue';
}

// Server provisioning (§3.1)
export interface ServerCurrentServer {
    data: null | RemoteServer;      // null when desktop logs out / no server
    event: 'server';
}
```

`ServerEvent` union gains `ServerQueue` and `ServerCurrentServer`.

### 4.3 Where each piece is handled

| Piece | File | Change |
|---|---|---|
| Event types | `src/shared/types/remote-types.ts` | add interfaces above |
| WS dispatch | `src/main/features/core/remote/index.ts` (switch at 405-516) | `queueAdd/queuePlay/queueRemove/queueMove/queueClear` → `getMainWindow()?.webContents.send('request-queue-add' \| '-play' \| '-remove' \| '-move' \| '-clear', payload)`; `queueRequest` → targeted `send({client: ws, ...cachedQueue, event:'queue'})` |
| Queue cache + broadcast | same file | module-level `currentQueue` beside `currentState` (line 115); `ipcMain.on('update-queue', …)` beside `update-song` (line 650); include `queue` in the on-connect sends (after line 526); `ipcMain.on('update-server', …)` + broadcast `server` |
| Preload bridge | `src/preload/remote.ts` | `requestQueueAdd/Play/Remove/Move/Clear` (`ipcRenderer.on`, mirror lines 6-26); `updateQueue`, `updateServer` (`ipcRenderer.send`, mirror lines 38-85); type additions in the preload `window.api` typings |
| Renderer handlers | `src/renderer/features/remote/hooks/use-remote.tsx` | `request-queue-add` → `player.addToQueueByFetch(serverId, ids, itemType, playType)` (context line 254); `request-queue-play` → map uniqueId → effective index → `mediaPlayByIndex` (store :1183); `request-queue-remove` → `clearSelected(items)` (store :727) after resolving uniqueIds from `queue.songs`; `request-queue-move` → `moveSelectedTo` (store :1360); `request-queue-clear` → `clearQueue` (store :719) |
| Renderer queue push | same hook (`usePlayerEvents` block, line 150+) | subscribe to queue changes (`subscribePlayerQueue` / `subscribeCurrentTrack`, as `play-queue.tsx:73-123` does) → build slim snapshot in effective order → `remote.updateQueue(...)`, **debounced ~250 ms** (drag reorders fire bursts) |

No changes to Path A (`use-main-player-listener.tsx`) — transport events are untouched.

**Versioning/compat:** old phone + new desktop is fine (unknown server events should be ignored — add a `default:` no-op in the phone's message switch, `src/remote/store/index.ts:83-182`, which currently silently ignores unknown events anyway since it's a switch). New phone + old desktop: gate browse/queue UI on receipt of the `server` event; if none arrives within a timeout, show only the Now Playing tab with an "update Feishin desktop" notice.

---

## 5. Remote UI design

### 5.1 Routing + bottom tab bar

**Hash-based routing** via the already-installed `react-router` v7 `createHashRouter`/`RouterProvider`. Rationale: main's HTTP server only serves fixed paths (§2.2) — path routing would 404 on refresh/PWA relaunch; hash URLs (`/#/albums`) always resolve to `/`. No server change needed; Android/iOS back gestures work.

Routes:

```
/#/            → NowPlayingPage (current RemoteContainer, moved)
/#/library     → LibraryPage (Songs + global search)
/#/artists     → ArtistListPage;  /#/artists/:id  → ArtistDetailPage
/#/albums      → AlbumListPage;   /#/albums/:id   → AlbumDetailPage
/#/playlists   → PlaylistListPage; /#/playlists/:id → PlaylistDetailPage
/#/queue       → QueuePage (reached from Now Playing header button, not a tab)
/#/settings    → SettingsPage
```

New files (all under `src/remote/`):

- `components/tab-bar.tsx` — fixed-bottom bar, 6 tabs (Now Playing, Library, Artists, Albums, Playlists, Settings), 56 px + `env(safe-area-inset-bottom)` padding, `react-icons/ri` icons (already used, `remote-container.tsx:4`), active tint `var(--theme-colors-primary)`. NavLink-based. Hidden when disconnected.
- `components/shell.tsx` — rework: header slims down; `AppShell.Main` gets `padding-bottom: calc(56px + env(safe-area-inset-bottom))`; renders `<Outlet/>`.
- `app.tsx` — wrap in `RouterProvider`; also `QueryClientProvider` (new `src/remote/lib/query-client.ts`, TanStack v5 already a dep) required by the reused query factories.
- `pages/` — `now-playing.tsx` (wraps existing `RemoteContainer`), `library.tsx`, `artists.tsx`, `artist-detail.tsx`, `albums.tsx`, `album-detail.tsx`, `playlists.tsx`, `playlist-detail.tsx`, `queue.tsx`, `settings.tsx`.

Tab semantics: **Library** = all-songs list (via `songQueries.list`, sorted by name) with a search field on top that switches to `searchQueries.search*Infinite` results (songs/albums/artists sections). **Settings** absorbs the current header buttons (theme, show-image, reconnect) + per-tab display config + connection info.

### 5.2 Browse list infrastructure (build slim, crib patterns)

**Do not reuse `ItemGridList`/`ItemTableList`/`ItemDetailList` directly.** They carry desktop concerns (hotkeys, arrow-key nav, pragmatic-drag-and-drop, context menus, column systems, OverlayScrollbars) and thousands of lines. Instead build two small remote components on **react-window v2** (`react-window-v2` — the direction the desktop is migrating; `List` + `useListRef`), mirroring the desktop's contracts:

- `src/remote/components/item-list/remote-list.tsx` — rows (64 px: 48 px art, title, subtitle, chevron/press affordances). Exposes `ItemListHandle`-shaped ref (`scrollToIndex(index, {align})`) matching `src/renderer/components/item-list/types.ts:73-80`.
- `src/remote/components/item-list/remote-grid.tsx` — 2–3 responsive columns (container width / 168 px min), square art + two text lines; implemented as a v2 `List` of row-chunks (mirrors `item-grid-list.tsx`'s rows-of-N approach, lines 248-309) so scroll-to-index maps letter → item index → row = `floor(index / perRow)`.
- `src/remote/components/item-list/use-remote-infinite-list.ts` — pairs `useQuery(xQueries.listCount(...))` with a windowed page loader over `xQueries.list(...)` (crib the pagination math from `useItemListInfiniteLoader`, `/@/renderer/components/item-list/helpers/item-list-infinite-loader`, as used by `album-list-infinite-grid.tsx:34-59`; the desktop hook itself may work as-is — evaluate in P1, fall back to a ~80-line remote version if it drags in desktop coupling).
- Row/card press = navigate to detail; long-press (500 ms `pointerdown` timer, canceled by `pointermove` > 8 px) = action sheet (Mantine `Drawer` bottom sheet): Play Now / Play Next / Play Last / Shuffle / Go to Artist / Go to Album — each firing `send({event:'queueAdd', ...})`.

Per-tab data mapping:

| Tab | Count query | List query | Default sort |
|---|---|---|---|
| Library (songs) | `songQueries.listCount` (`songs-api.ts:92`) | `songQueries.list` (`:62`) | NAME asc |
| Artists | `artistQueries.albumArtistListCount` (`artists-api.ts:79`) | `artistQueries.albumArtistList` (`:49`) | NAME asc |
| Albums | `albumQueries.listCount` (`album-api.ts:39`) | `albumQueries.list` (`:23`) | NAME asc |
| Playlists | `playlistQueries.listCount` (`playlists-api.ts:43`) | `playlistQueries.list` (`:30`) | NAME asc |
| Album detail | — | `albumQueries.detail` (`:11`) (songs included) | track order |
| Artist detail | — | `artistQueries.albumArtistDetail` (`:23`) + albums via `albumQueries.list` `{artistIds:[id]}` | year desc |
| Playlist detail | — | `playlistQueries.songList` (`:59`) | playlist order |

Cover art: `api.controller.getImageUrl({apiClientProps:{serverId}, query:{id: imageId, size: 300}})` (`controller.ts:593` → `subsonic-controller.ts:48-76`) — credential-embedded URLs straight to the music server; lazy-load with `loading="lazy"` + a `content-visibility` row optimization; no proxying.

### 5.3 Per-tab list/grid toggle

Mirror the desktop idiom (§2.7) but scoped to the remote store:

- Extend `useRemoteStore` (`src/remote/store/index.ts`) — already `persist`ed (localStorage `store_settings`, version 7 → **bump to 8**):
  ```ts
  lists: Record<RemoteListKey /* 'album' | 'artist' | 'library' | 'playlist' */, {
      display: 'grid' | 'list';
  }>;
  // defaults: album/artist/playlist = 'grid', library = 'list'
  actions.setListDisplay(key, display)
  ```
  Two modes only — the remote deliberately collapses `ListDisplayType`'s four desktop values (`GRID`→'grid'; `LIST`/`TABLE`/`DETAIL`→'list'); map to the desktop enum only if configs ever sync.
- UI: an icon toggle (grid/list glyphs) in each browse tab's sticky header row (next to sort control); pages `switch (display)` between `RemoteList`/`RemoteGrid` exactly like `album-list-content.tsx:100-230` does.
- Also duplicated in Settings as a per-tab picker (discoverability).

### 5.4 The alphabetical ribbon scrubber (deep design)

`src/remote/components/item-list/alpha-ribbon.tsx` + `use-letter-index.ts`. Shown on browse tabs **only when sorted by name**; hidden under ~2 screenfuls of items (< ~40).

#### 5.4.1 The core problem

Lists are virtualized and server-paginated: tapping "T" requires the **absolute index of the first item whose sort-title starts at/after "T"** without having loaded pages A–S. Nothing exists in the codebase for this (§2.7); the desktop's `scrollToIndex` handle is the only primitive.

#### 5.4.2 Letter→index resolution: three-tier strategy

**Tier 1 — Artists: free server-side buckets.** The Subsonic `getArtists` endpoint returns artists pre-grouped into `indexes` (`index: [{name:'A', artist:[…]}, …]`) using the *server's* collation (Navidrome applies its own sort/ignored-articles rules). The desktop's Subsonic controller already consumes this endpoint for album-artist listing — reuse it to derive `{letter → firstAbsoluteIndex}` exactly, in one request. This also yields the **authoritative bucket alphabet** (which letters exist, including `#` and any non-Latin buckets the server emits).

**Tier 2 — Albums/Songs/Playlists: lazy binary probe.** No bucketed endpoint exists, but the list is server-sorted and randomly addressable via `startIndex`/`limit:1`:

```
resolve(letter):
  binary-search over [0, totalCount) (totalCount from xQueries.listCount):
    probe(mid) = fetch list({ startIndex: mid, limit: 1 }) → item.name
    compare bucketOf(sortKey(item.name)) vs letter (collator, §5.4.5)
  → first index whose bucket >= letter        // ~log2(N) probes; N=20k → ~15 requests
```

- Probes are tiny (1 item), issued through the same `xQueries.list` factory (so react-query caches them), and each probe's result seeds the page cache.
- Cache: `Map<letter, index>` keyed by `(tab, serverId, sortBy, sortOrder, filterHash)`; persisted in `useRemoteStore` with the library's `totalCount` as a staleness check (count changed → drop the map). Cache warms permanently as the user scrubs.
- During a drag, only the **settled** letter (120 ms debounce) triggers resolution; intermediate letters show the bubble immediately (optimistic) and resolve when the finger pauses. While resolving: bubble shows the letter with a subtle spinner ring; on resolve → `listRef.scrollToIndex(index, {align:'start'})` (grid: `scrollToIndex(floor(index/perRow))` on the row list).
- Already-loaded ranges short-circuit: if the target letter's boundary falls inside loaded pages, compute locally with no network.

**Tier 3 — degenerate/offline fallback:** proportional jump — `index ≈ totalCount * (letterOrdinal / bucketCount)` — used instantly while Tier 2 resolves, then corrected. Guarantees the ribbon always *feels* immediate even on slow LANs.

#### 5.4.3 Ribbon geometry + touch handling

- Fixed to the right edge of the scroll viewport: `position:absolute; right:0; top:headerHeight; bottom:0; width:20px;` visual glyphs ~11 px, but a **44 px-wide invisible hit area** (`::before` extending left) per Apple HIG. `touch-action: none` on the ribbon so vertical drags don't scroll the list underneath.
- Bucket labels: when bucket count ≤ available rows (bucketCount × 14 px ≤ ribbon height) render every label; otherwise render every 2nd (or 3rd) label with `·` separators, iOS-style — hit-testing still resolves to the full bucket array by Y-proportion, not by rendered glyphs.
- Pointer events (not touch events — matches codebase convention, §2.7):
  - `onPointerDown` → `setPointerCapture(pointerId)`; enter scrubbing state (ribbon widens to 28 px, labels enlarge slightly); compute bucket = `clamp(floor((y - top) / height * buckets.length))`.
  - `onPointerMove` (while captured) → recompute bucket; on change: update bubble, `navigator.vibrate?.(8)` (Android haptic; no-op iOS Safari), schedule resolution (debounced per §5.4.2).
  - `onPointerUp/Cancel` → release capture, final resolve+scroll, bubble fades (150 ms), ribbon narrows.
  - A plain tap is just down+up on one bucket — same path.
- **Bubble/preview:** a 56 px rounded-square floating left of the ribbon, vertically tracking the finger (clamped to viewport), showing the bucket glyph at ~28 px bold on `--theme-colors-surface` with shadow; rendered in a portal above the list. After scroll lands, if the resolved first item is loaded, the bubble briefly (400 ms) shows the item's leading title text under the glyph (iTunes-style confirmation) before fading.
- Scrubbing must not fight list momentum: on `pointerdown`, cancel any in-flight smooth scroll (use `behavior:'auto'` for ribbon jumps — instant, iOS-like).

#### 5.4.4 Virtualization mapping

- List mode: bucket → absolute item index → `remote-list` ref `scrollToIndex(index, {align:'start', behavior:'auto'})` (react-window v2 `List` `scrollToRow` under the hood, same wiring as `item-detail-list.tsx:1270`).
- Grid mode: item index → row index `floor(index / itemsPerRow)` (perRow known from the grid's own layout state, as `item-grid-list.tsx:529-550` does) → scroll the row list.
- Jumping into unloaded territory renders skeleton rows (the infinite loader's placeholder path) and triggers page fetch for the landed window — identical to a fast fling today.

#### 5.4.5 Non-Latin / CJK bucketing (Japanese library confirmed — e.g. フィッシュマンズ)

Two-layer approach:

1. **Trust the server's sort order** — buckets are derived FROM the server-sorted sequence (Tiers 1/2 probe actual items), so the ribbon can never disagree with scroll order. This is the crucial invariant: we bucket *positions in the server's collation*, we do not re-sort client-side. Navidrome sorts Japanese titles by its own rules (typically after Z or by Unicode point; `OrderTitle` fields), so CJK titles form contiguous tail regions — bucketable.
2. **Bucket labeling** in `sortKey()/bucketOf()`:
   - Strip leading articles only if the server type does (Navidrome handles this server-side in Order* fields — do nothing client-side).
   - NFKD-normalize + strip diacritics for Latin (é→E) via `String.normalize`.
   - `0-9` → `#` bucket.
   - Kana (U+3040–30FF, incl. フ) → map katakana→hiragana, then to the five gojūon row buckets `あ か さ た な は ま や ら わ` (e.g. フィッシュマンズ → ふ → は-row). Kanji (U+4E00–9FFF) → single `漢` bucket (no reliable reading without a tokenizer — see note). Hangul → `ㄱ`-style initial-jamo buckets only if present; else a single `한` bucket. Everything else → `⋯` bucket.
   - The ribbon's alphabet is **dynamic**: only buckets that actually occur (discovered via Tier 1 indexes, or lazily via Tier 2 probes + loaded pages) are rendered; a library that is 40% Japanese gets a ribbon like `# A–Z あ か さ た な は ま や ら わ 漢`.
   - Note: the repo bundles a kuromoji vite plugin (`vite.kuromoji-plugin.ts`) for Japanese tokenization on desktop; reusing it in the PWA for kanji readings is possible but the dictionary is multi-MB — **explicitly out of scope** (open question §8).
   - Caveat: if the server's collation interleaves scripts differently than the bucket ordering assumes, Tier-2 probing self-corrects (buckets are located by probing, not assumed positions); worst case a bucket resolves to a slightly-off boundary, which is cosmetically acceptable.

---

## 6. Reuse map

**Reuse as-is (import via existing aliases):**

- `api.controller` + all of `src/renderer/api/` (controller.ts, subsonic/navidrome/jellyfin) — §2.6
- Query factories: `albumQueries`, `artistQueries`, `songQueries`, `playlistQueries`, `searchQueries` — §2.6
- `useAuthStore` (`src/renderer/store/auth.store.ts`) — hydrated from the WS `server` event
- Shared components already proven in the remote: `/@/shared/components/*` (ActionIcon, Text, Group, Stack, Rating, Spinner, toast), Mantine 9, `useAppTheme`
- Types: `remote-types.ts`, `domain-types.ts` (`Album`, `Song`, `AlbumArtist`, `Playlist`, `LibraryItem`), `types.ts` (`Play`, `PlayerStatus`, …)
- `react-window-v2`, `@tanstack/react-query`, `react-router` — installed, currently unused by the remote bundle

**Crib the pattern, build remote-native:**

- `RemoteList`/`RemoteGrid` ← contracts and column math from `item-grid-list.tsx` / `item-detail-list.tsx`; `ItemListHandle` shape from `item-list/types.ts:73-80`
- Infinite loading ← `useItemListInfiniteLoader` (evaluate direct reuse first, §5.2)
- Display-mode persistence ← `settings.store.ts` `lists[key].display` idiom, re-implemented in `useRemoteStore`
- Queue snapshot/scroll-follow ← `play-queue.tsx:73-123`
- `request-*` IPC handler shape ← `use-remote.tsx:60-99` + `preload/remote.ts`

**Build new (no precedent in repo):**

- Tab bar, hash routes, page components (§5.1)
- Alpha ribbon + letter-index resolver (§5.4) — genuinely novel
- Queue page with touch reorder (long-press + drag on `RemoteList` rows; do NOT pull in pragmatic-drag-and-drop's desktop wiring — a ~100-line pointer-capture reorder on the slim list is smaller than adapting `use-item-drag-drop-state.tsx`)
- Server-credential provisioning path (`update-server` IPC → `server` WS event → auth-store hydration)
- Action sheet (bottom Drawer) for play-type selection

**Explicitly not reused:** `ItemTableList` (column system meaningless on phone), pragmatic-drag-and-drop, OverlayScrollbars (native momentum scrolling is better on touch), desktop `settings.store.ts` (desktop-scoped persistence).

---

## 7. Phased plan

### P1 — Foundation: browse + play/queue-add (est. 5–7 dev-days)

1. Protocol: `queueAdd` client event; `server` event + `update-server` IPC + preload + `use-remote.tsx` push; auth-store hydration in the PWA; compat gating (§4.3).
2. Router + tab bar + shell rework; Now Playing becomes a route; Settings page absorbing existing toggles.
3. `RemoteList`/`RemoteGrid` + infinite loader + Albums/Artists/Playlists/Library tabs + detail pages + search in Library tab; action sheet firing `queueAdd` (NOW/NEXT/LAST/SHUFFLE).
4. Verify CORS against Navidrome early (day 1–2); if blocked, add the `/upstream` proxy fallback (+1 day).

Risks: CORS (fallback designed); bundle size — importing `api.controller` pulls all three server controllers into `remote.js` (measure; acceptable first, code-split later); react-query/QueryClient config drift from desktop defaults.

### P2 — Live queue view + reorder (est. 4–5 dev-days)

1. Protocol: `queue` server event + `update-queue` IPC (debounced renderer push, slim mapping); `queuePlay`/`queueRemove`/`queueMove`/`queueClear`/`queueRequest`; main-side queue cache + on-connect send.
2. Queue page: `RemoteList` of `RemoteQueueEntry`s, now-playing highlight + auto-scroll-to-current, tap→`queuePlay`, swipe-left/long-press→remove, drag-handle reorder→`queueMove`, clear-all.
3. Reconciliation: optimistic local reorder, snap to next `queue` broadcast.

Risks: large-queue payloads (mitigated by slim entries + debounce; if 10k-song queues appear, move to diff events — deferred); uniqueId races between phones (last-write-wins is acceptable; renderer must no-op gracefully on unknown uniqueIds).

### P3 — Ribbon + polish (est. 4–6 dev-days)

1. `use-letter-index` Tier 1 (artists via `getArtists` indexes) + Tier 2 (binary probe + cache) + Tier 3 fallback.
2. `AlphaRibbon` component: geometry, pointer capture, bubble, haptics, dynamic bucket alphabet, CJK bucketing (§5.4.5).
3. Polish: per-tab sort controls, favorites filter, pull-to-refresh (invalidate queries), skeletons, PWA manifest/theme-color touch-ups, SW cache-version bump.

Risks: highest-uncertainty UI (touch feel needs on-device iteration — budget half the estimate for tuning); server collation vs bucket ordering edge cases (self-correcting by design, but Japanese-heavy libraries need real-device validation against the user's Navidrome).

Total: ~13–18 dev-days across three shippable increments (P1 alone is a usable product).

---

## 8. Open questions

1. **CORS reality check** — does the target Navidrome version send permissive CORS on `/rest` AND `/api` (`x-nd-authorization` must survive preflight)? Determines whether `/upstream` proxy ships in P1. (Verify first.)
2. **Credential exposure posture** — the `server` event hands the music-server credential to any WS client that passes the remote gate; the gate is optional and plaintext HTTP on the LAN. Should browse features *require* remote username/password to be set (recommended: yes — gate the `server` broadcast on `settings.username || settings.password`)? Should this be a desktop settings opt-in ("Allow remote library access")?
3. **Jellyfin** — the api layer supports it, but favorite/rating in the remote already special-cases navidrome/subsonic (`remote-container.tsx:99`). Ship browse for Jellyfin too (should mostly work via the same controller) or scope to Subsonic-family first?
4. **`useItemListInfiniteLoader` direct reuse** — confirm it has no desktop-only coupling; else write the slim remote loader (§5.2). Decide in P1.
5. **Kanji buckets** — is a single `漢` bucket acceptable, or is kuromoji-based reading extraction (multi-MB dictionary in the PWA, `vite.kuromoji-plugin.ts` exists) worth it for this library? Default: single bucket, revisit after real-device use.
6. **Service worker on LAN** — SWs require a secure context; on `http://<lan-ip>:4333` registration silently fails today (works on `localhost` only). Out of scope here, but new routes/assets must not *depend* on SW caching.
7. **Multi-server** — the desktop supports multiple servers; the `server` event provisions only `currentServer`. Is single-server browse acceptable for v1 (assumed: yes)?
8. **Queue snapshot scale** — threshold for switching from full snapshots to diff events (proposed: revisit if real queues exceed ~5k entries).
