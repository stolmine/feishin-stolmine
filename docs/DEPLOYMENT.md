# Deployment — MacBook Air → Studios Mac mini

How this fork gets from source to the machine that actually plays music.

## Topology

| Role | Machine | Tailscale IP | LAN IP | Notes |
|---|---|---|---|---|
| Dev / build | `brams-macbook-air` | `100.116.39.102` | — | Where the repo lives and the app is built |
| Player + remote host | `studios-mac-mini` (`Studios-Mini`) | `100.73.62.61` | `192.168.1.65` | Runs `/Applications/Feishin.app`; serves the remote PWA on `:4333` |
| Music server | `stol-compute` | `100.96.217.104` | `192.168.1.100` | Navidrome on `:4533` |
| Phone | `iphone-13-mini` | `100.119.194.38` | — | Reaches the PWA at `http://100.73.62.61:4333` |

**There is no source clone on the mini.** It runs a packaged `.app` built on the MBA
and copied over. Never try to `git pull && pnpm run build` there — there is nothing to
pull into.

## SSH

The mini's account is **`huh`**. This is the single most common time-waster: the key
(`~/.ssh/id_ed25519`) is already authorized, so a
`Permission denied (publickey,password,keyboard-interactive)` means the *username* is
wrong, not that the key is missing.

An alias is configured in `~/.ssh/config` on the MBA:

```
Host mini studios-mac-mini
    HostName 100.73.62.61
    User huh
    AddKeysToAgent yes
    UseKeychain yes
    IdentityFile ~/.ssh/id_ed25519
```

So everything below assumes plain `ssh mini`.

## Build

```sh
pnpm run package:dev      # = pnpm run build && electron-builder --dir
```

Output: `dist/mac-arm64/Feishin.app` (~559 MB), arm64, ad-hoc signed
(`identity: '-'`, no notarization — see `electron-builder.yml`). The mini is Apple
Silicon, so arm64 is correct.

Verify the change actually landed in the bundle before shipping 559 MB:

```sh
grep -qa "<a string unique to your change>" dist/mac-arm64/Feishin.app/Contents/Resources/app.asar \
  && echo PRESENT || echo MISSING
```

## Deploy

Use `ditto`, not `rsync`. macOS ships **openrsync**, which rejects several GNU rsync
flags, and `ditto` is the Apple-sanctioned way to move an app bundle with its
resource forks and code signature intact.

```sh
# 1. archive locally (559 MB -> ~198 MB)
ditto -c -k --sequesterRsrc --keepParent dist/mac-arm64/Feishin.app /tmp/Feishin.zip

# 2. quit the running app on the mini (this interrupts playback)
ssh mini 'osascript -e "tell application \"Feishin\" to quit"; sleep 3; pkill -f "Feishin.app" 2>/dev/null; true'

# 3. copy
scp /tmp/Feishin.zip mini:/tmp/Feishin.zip

# 4. unpack and swap, keeping the previous build as a rollback
ssh mini 'set -e
  rm -rf /tmp/Feishin-new && mkdir -p /tmp/Feishin-new
  ditto -x -k /tmp/Feishin.zip /tmp/Feishin-new
  rm -rf /Applications/Feishin.app.old
  mv /Applications/Feishin.app /Applications/Feishin.app.old
  mv /tmp/Feishin-new/Feishin.app /Applications/Feishin.app
  xattr -dr com.apple.quarantine /Applications/Feishin.app 2>/dev/null || true'

# 5. relaunch and verify
ssh mini 'open -a Feishin; sleep 10; pgrep -f "Feishin.app/Contents/MacOS/Feishin" >/dev/null && echo running'
```

Rollback is `mv /Applications/Feishin.app.old /Applications/Feishin.app`.

Copying via `scp` does not set the quarantine attribute (that only comes from browser
downloads), but step 4 strips it defensively.

## After deploying: the phone's service worker

`src/remote/service-worker.ts` is **cache-first** for `remote.js` / `remote.css`. A
fresh build on the mini does not guarantee a fresh PWA. If changes don't appear, fully
close the PWA and reopen, or clear site data for `http://100.73.62.61:4333`.

## Gotcha: LAN addresses are not routable over Tailscale

The phone reaches the PWA at the mini's **Tailscale** address. Browse requests,
however, go **phone → music server directly** using whatever URL the desktop has
configured for the server (`getServerUrl`, `src/renderer/utils/normalize-server-url.ts`).

`stol-compute` advertises **no subnet routes**, so a server URL of
`http://192.168.1.100:4533` is unreachable from the phone whenever it is not on the
home WiFi. The desktop keeps working, playback control keeps working (that's the
WebSocket to the mini), and every browse request fails silently — a blank Albums page
with no error, because `use-remote-infinite-list.ts` has no `catch`.

**Fix:** on the server entry in Feishin's settings, set **Remote URL** to the
Tailscale address `http://100.96.217.104:4533` and enable **Prefer remote URL**. That
is exactly what those two fields are for, and it makes the phone work on any network.
Navidrome serves permissive CORS (`Access-Control-Allow-Origin: *`, with
`X-Nd-Authorization` in both allow- and expose-headers), so cross-origin is not a
constraint.

## Note on the auto-updater

`electron-builder.yml` points `publish` at `owner: jeffvli, repo: feishin` — **upstream**,
not this fork. On macOS the updater only notifies (`autoDownload = false`,
`src/main/index.ts:98-101`), but accepting an update prompt on the mini would replace
this fork with stock Feishin, which has a transport-only remote.
