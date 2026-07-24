# 04 — Feishin UI Plan

Grounded in the actual fork conventions (Mantine v9 wrapped in `src/shared/components/*`,
react-router v7 `HashRouter`, Zustand v5 `persist`, react-query v5, react-i18next).

## 4.1 Navbar destination

Add "AutoDJ" as a top-level nav item. Touch points (all confirmed in the map):

| Step | File | Anchor |
|---|---|---|
| Route enum `AUTODJ = '/autodj'` | `src/renderer/router/routes.ts` | `enum AppRoute` |
| Push nav entry | `src/renderer/store/settings.store.ts:1095` | `sidebarItems` (mirror the `NOW_PLAYING`/`Radio` entry) |
| Icon case (active + inactive) | `src/renderer/features/sidebar/components/sidebar-icon.tsx:44` | `switch(route)` — else falls back to Home |
| Translated label | `src/renderer/features/sidebar/components/sidebar.tsx:66` | `translatedSidebarItemMap` |
| Collapsed + mobile variants | `collapsed-sidebar-item.tsx`, `mobile-sidebar.tsx` | same icon/label maps |
| i18n label | `src/i18n/locales/en.json` | add `page.sidebar.autoDJ` |

Icon suggestion: a disc/radio glyph from `react-icons/ri` (e.g. `RiDiscLine` /
`RiRadioLine`) with a filled variant when active.

## 4.2 Route + page

| Step | File |
|---|---|
| Lazy import + `<Route>` | `src/renderer/router/app-router.tsx:14` (lazy) + `:224` (route, sibling of `NowPlayingRoute`) |
| Page component | new `src/renderer/features/autodj/routes/autodj-route.tsx` — mirror `now-playing-route.tsx` (`<AnimatedPage>` + `PageErrorBoundary`, default-export the wrapped component) |

## 4.3 AutoDJ page layout

```
┌ AutoDJ ─────────────────────────────────────────────┐
│  ┌───────────────────────────────────────────────┐  │
│  │  ▶  New AutoDJ session      [contrast preview]  │  │  ← "create" card, opens modal
│  └───────────────────────────────────────────────┘  │
│                                                      │
│  Recent sessions                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │ Late-night ambient     · 42 tracks · 3d ago     │  │  resume ▸ save-as-playlist ▸ ⋯
│  │ contrast 0.2 · 1990–2005 · Electronic           │  │
│  ├───────────────────────────────────────────────┤  │
│  │ High-energy mix        · 18 tracks · 1w ago     │  │
│  └───────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

- Session list is read from the persisted `autoDJSessions` store slice.
- Each row: name, param summary (contrast + key filters), track count, updatedAt, and
  actions: **Resume**, **Save as playlist**, **Duplicate**, **Delete**. Use the existing
  list/card/`Paper` primitives and the table conventions from `ItemTableList`.
- The "New session" card sits pinned at the top (as requested).

## 4.4 Parameter modal

Registered **context modal** (preferred for first-class features). Mirror
`features/lyrics/components/lyrics-settings-form.tsx` (Slider + MultiSelect + Select +
Switch bound to a form) and its opener `open-lyrics-settings-modal.ts`.

| Step | File |
|---|---|
| Form | new `features/autodj/components/autodj-session-form.tsx` |
| Opener | new `features/autodj/utils/open-autodj-modal.ts` (`openContextModal({ modal:'autoDJ', ... })`) |
| Register | `app-router.tsx:190` `appRouterModals` (add `autoDJ`) |

Controls (map 1:1 to `AutoDJParams`):

| Param | Control | Primitive |
|---|---|---|
| contrast (min↔max variety) | Slider `0–1`, `onChangeEnd` | `slider/slider` |
| seed tracks | search/select existing tracks (or "surprise me") | `multi-select` / a track picker |
| year range | two `NumberInput` (min/max) | `number-input` |
| genre allow / exclude | two `MultiSelect` (options = Discogs styles from index) | `multi-select` |
| bpm range | two `NumberInput` | `number-input` |
| length min/max | two `NumberInput` (seconds/min) | `number-input` |
| artist include / exclude | two `MultiSelect` (artist search) | `multi-select` |
| allow duplicates | `Switch` | `switch` |
| batch size / timing | `NumberInput` | `number-input` |

Use `SettingOption`/`SettingsSection` grouping (as `auto-dj-settings.tsx` does) so it
reads like the rest of Feishin's settings UI. **Start** button creates the session and
kicks off generation.

## 4.5 Queue integration (live)

Starting/continuing a session drives the **real** queue — no separate mini-player:

- **On start:** `POST /session/next` (seeds only) → resolve ids → `usePlayer()`:
  - `addToQueueByFetch(serverId, ids, LibraryItem.SONG, Play.NOW)` to begin immediately,
    or `Play.LAST` to append after the current track.
- **On refill:** extend the existing trigger in
  `features/player/hooks/use-auto-dj.ts`. When the active session's strategy is
  `'vector'`, gather the last N queue items + params, `POST /session/next`, append via
  `addToQueueByData` / `addToQueueByFetch` with `Play.LAST` — exactly how AutoDJ appends
  today (`use-auto-dj.ts:140`).
- **Live UI:** the queue view (`features/now-playing/components/play-queue.tsx`)
  subscribes to the player store, so appended tracks appear **automatically**. Keep the
  existing `AUTODJ_QUEUE_ADDED` event so the queue can auto-scroll to follow.

## 4.6 Client → recommender transport

- New react-query wrapper for the recommender endpoints. Two options (decide in 06):
  - **Renderer-direct** `axios` to `http://100.96.217.104:<port>` (simplest; axios already
    used in mutations). Add `recommenderUrl` to the AutoDJ settings schema.
  - **Main-process IPC** (mirrors the lyrics providers in `src/main/features/core/lyrics/*`
    exposed over IPC) — cleaner if CORS/mixed-content or secrets become an issue.
- Track-id → `Song` resolution reuses the existing songs-by-id query used across the app.

## 4.7 i18n

Add keys under `page.autoDJ.*` (page + modal strings) and `page.sidebar.autoDJ` (nav
label) to `src/i18n/locales/en.json`; other locales optional.

## 4.8 Files created vs touched (summary)

**New** (`src/renderer/features/autodj/`): `routes/autodj-route.tsx`,
`components/autodj-session-list.tsx`, `components/autodj-session-form.tsx`,
`components/autodj-session-card.tsx`, `utils/open-autodj-modal.ts`,
`api/recommender-api.ts`, `hooks/use-autodj-session.ts`.

**Touched:** `routes.ts`, `app-router.tsx`, `settings.store.ts` (schemas + sidebar item +
migration), `sidebar-icon.tsx`, `sidebar.tsx`, collapsed/mobile sidebar, `en.json`, and
`features/player/hooks/use-auto-dj.ts` (add the `vector` strategy path).
