import merge from 'lodash/merge';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { shallow } from 'zustand/shallow';
import { createWithEqualityFn } from 'zustand/traditional';

import { useAuthStore } from '/@/renderer/store/auth.store';
import { useSettingsStore } from '/@/renderer/store/settings.store';
import { logger } from '/@/renderer/utils/logger';
import { toast } from '/@/shared/components/toast/toast';
import {
    AlbumArtistListSort,
    AlbumListSort,
    PlaylistListSort,
    SongListSort,
    SortOrder,
} from '/@/shared/types/domain-types';
import {
    ClientEvent,
    RemoteTheme,
    ServerEvent,
    ServerQueue,
    SongUpdateSocket,
} from '/@/shared/types/remote-types';

export type RemoteListDisplay = 'grid' | 'list';

export type RemoteListKey = 'album' | 'artist' | 'library' | 'playlist';

export interface RemoteSort {
    sortBy: string;
    sortOrder: SortOrder;
}

export interface SettingsSlice extends SettingsState {
    actions: {
        queueClear: () => void;
        queueMove: (edge: 'bottom' | 'top', targetUniqueId: string, uniqueIds: string[]) => void;
        queuePlay: (uniqueId: string) => void;
        queueRemove: (uniqueIds: string[]) => void;
        queueRequest: () => void;
        reconnect: () => void;
        send: (data: ClientEvent) => void;
        setListDisplay: (key: RemoteListKey, display: RemoteListDisplay) => void;
        setSort: (key: RemoteListKey, sort: RemoteSort) => void;
        toggleIsDark: () => void;
        toggleShowImage: () => void;
    };
}

interface SettingsState {
    connected: boolean;
    hasLibraryAccess: boolean;
    info: Omit<SongUpdateSocket, 'currentTime'>;
    isDark: boolean;
    lists: Record<RemoteListKey, { display: RemoteListDisplay }>;
    queue: null | ServerQueue['data'];
    serverTheme: null | RemoteTheme;
    showImage: boolean;
    socket?: StatefulWebSocket;
    sorts: Record<RemoteListKey, RemoteSort>;
}

interface StatefulWebSocket extends WebSocket {
    natural: boolean;
}

// Auto-reconnect state (module-level so it survives store updates and is never
// persisted). Mobile browsers suspend/close the WebSocket when the PWA is
// backgrounded or the phone locks; without this the socket stays dead, the tab
// bar (previously gated on `connected`) vanished, and queue actions silently
// failed.
let reconnectTimer: null | ReturnType<typeof setTimeout> = null;
let reconnectAttempts = 0;
const RECONNECT_MAX_DELAY_MS = 15000;

const clearReconnect = () => {
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
};

const scheduleReconnect = (reconnect: () => void) => {
    if (reconnectTimer) return;
    const delay = Math.min(RECONNECT_MAX_DELAY_MS, 1000 * 2 ** reconnectAttempts);
    reconnectAttempts += 1;
    logger.info('Scheduling remote reconnect', { attempt: reconnectAttempts, delay });
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        reconnect();
    }, delay);
};

const initialState: SettingsState = {
    connected: false,
    hasLibraryAccess: false,
    info: {},
    isDark: window.matchMedia('(prefers-color-scheme: dark)').matches,
    lists: {
        album: { display: 'grid' },
        artist: { display: 'grid' },
        library: { display: 'list' },
        playlist: { display: 'grid' },
    },
    queue: null,
    serverTheme: null,
    showImage: true,
    sorts: {
        album: { sortBy: AlbumListSort.NAME, sortOrder: SortOrder.ASC },
        artist: { sortBy: AlbumArtistListSort.NAME, sortOrder: SortOrder.ASC },
        library: { sortBy: SongListSort.NAME, sortOrder: SortOrder.ASC },
        playlist: { sortBy: PlaylistListSort.NAME, sortOrder: SortOrder.ASC },
    },
};

export const useRemoteStore = createWithEqualityFn<SettingsSlice>()(
    persist(
        devtools(
            immer((set, get) => ({
                actions: {
                    queueClear: () => {
                        get().actions.send({ event: 'queueClear' });
                    },
                    queueMove: (edge, targetUniqueId, uniqueIds) => {
                        get().actions.send({ edge, event: 'queueMove', targetUniqueId, uniqueIds });
                    },
                    queuePlay: (uniqueId) => {
                        get().actions.send({ event: 'queuePlay', uniqueId });
                    },
                    queueRemove: (uniqueIds) => {
                        get().actions.send({ event: 'queueRemove', uniqueIds });
                    },
                    queueRequest: () => {
                        get().actions.send({ event: 'queueRequest' });
                    },
                    reconnect: async () => {
                        logger.info('Reconnect initiated');
                        // Cancel any pending scheduled retry — we are connecting now.
                        clearReconnect();
                        const existing = get().socket;

                        if (existing) {
                            if (
                                existing.readyState === WebSocket.OPEN ||
                                existing.readyState === WebSocket.CONNECTING
                            ) {
                                logger.debug('Closing existing socket', {
                                    readyState: existing.readyState,
                                });
                                existing.natural = true;
                                existing.close(4001);
                            }
                        }

                        let authHeader: string | undefined;

                        try {
                            logger.debug('Fetching credentials');
                            const credentials = await fetch('/credentials', { cache: 'no-store' });
                            if (credentials.ok) {
                                authHeader = await credentials.text();
                            } else {
                                // A 401 body ("Authorization required") must never be used
                                // as the auth header — the server would reject it and close
                                // the socket, producing an endless reconnect loop.
                                logger.warn('Credentials request rejected', {
                                    status: credentials.status,
                                });
                            }
                            logger.debug('Credentials fetched', { hasAuthHeader: !!authHeader });
                        } catch (error) {
                            logger.error('Failed to get credentials', { error });
                        }

                        set((state) => {
                            // Build the socket URL from protocol + host only. Never derive it
                            // from location.href: with hash routing the href contains a
                            // fragment (e.g. http://host:4333/#/albums), and the WebSocket
                            // constructor throws a SyntaxError for URLs with a fragment.
                            const wsProtocol =
                                window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                            const wsUrl = `${wsProtocol}//${window.location.host}/`;
                            logger.info('Creating new WebSocket', { url: wsUrl });
                            const socket = new WebSocket(wsUrl) as StatefulWebSocket;

                            socket.natural = false;

                            socket.addEventListener('message', (message) => {
                                const { data, event } = JSON.parse(message.data) as ServerEvent;

                                logger.debug('WebSocket message received', { data, event });

                                switch (event) {
                                    case 'error': {
                                        logger.error('WebSocket error event', { data });
                                        toast.error({ message: data, title: 'Socket error' });
                                        break;
                                    }
                                    case 'favorite': {
                                        logger.debug('Favorite event received', {
                                            favorite: data.favorite,
                                            id: data.id,
                                        });
                                        set((state) => {
                                            if (state.info.song?.id === data.id) {
                                                state.info.song.userFavorite = data.favorite;
                                            }
                                        });
                                        break;
                                    }
                                    case 'playback': {
                                        logger.debug('Playback event received', { status: data });
                                        set((state) => {
                                            state.info.status = data;
                                        });
                                        break;
                                    }
                                    case 'position': {
                                        logger.debug('Position event received', { position: data });
                                        set((state) => {
                                            state.info.position = data;
                                        });
                                        break;
                                    }
                                    case 'proxy': {
                                        logger.debug('Proxy event received (image update)', {
                                            dataLength: data?.length,
                                            hasData: !!data,
                                        });
                                        set((state) => {
                                            if (state.info.song) {
                                                state.info.song.imageUrl = `data:image/jpeg;base64,${data}`;
                                            }
                                        });
                                        break;
                                    }
                                    case 'queue': {
                                        logger.debug('Queue event received', {
                                            currentIndex: data.currentIndex,
                                            entryCount: data.entries.length,
                                        });
                                        set((state) => {
                                            state.queue = data;
                                        });
                                        break;
                                    }
                                    case 'rating': {
                                        logger.debug('Rating event received', {
                                            id: data.id,
                                            rating: data.rating,
                                        });
                                        set((state) => {
                                            if (state.info.song?.id === data.id) {
                                                state.info.song.userRating = data.rating;
                                            }
                                        });
                                        break;
                                    }
                                    case 'repeat': {
                                        logger.debug('Repeat event received', { repeat: data });
                                        set((state) => {
                                            state.info.repeat = data;
                                        });
                                        break;
                                    }
                                    case 'server': {
                                        logger.debug('Server event received', {
                                            hasServer: !!data,
                                            id: data?.id,
                                        });

                                        const authActions = useAuthStore.getState().actions;

                                        if (data) {
                                            authActions.addServer({ ...data, savePassword: false });
                                            authActions.setCurrentServer({
                                                ...data,
                                                savePassword: false,
                                            });
                                        } else {
                                            authActions.setCurrentServer(null);
                                        }

                                        set((state) => {
                                            state.hasLibraryAccess = !!data;
                                        });
                                        break;
                                    }
                                    case 'shuffle': {
                                        logger.debug('Shuffle event received', { shuffle: data });
                                        set((state) => {
                                            state.info.shuffle = data;
                                        });
                                        break;
                                    }
                                    case 'song': {
                                        logger.debug('Song event received', {
                                            artistName: data?.artistName,
                                            id: data?.id,
                                            name: data?.name,
                                        });
                                        set((state) => {
                                            state.info.song = data;
                                        });
                                        break;
                                    }
                                    case 'state': {
                                        logger.debug('State event received (full state update)', {
                                            hasSong: !!data.song,
                                            position: data.position,
                                            status: data.status,
                                            volume: data.volume,
                                        });
                                        set((state) => {
                                            state.info = data;
                                        });
                                        break;
                                    }
                                    case 'theme': {
                                        logger.debug('Theme event received', {
                                            hasTheme: !!data,
                                            theme: data?.theme,
                                        });

                                        if (data) {
                                            useSettingsStore.getState().actions.setSettings({
                                                general: {
                                                    accent: data.accent,
                                                    followSystemTheme: false,
                                                    primaryShade: data.primaryShade,
                                                    theme: data.theme,
                                                    useThemeAccentColor: data.useThemeAccentColor,
                                                    useThemePrimaryShade: data.useThemePrimaryShade,
                                                },
                                            });
                                        }

                                        set((state) => {
                                            state.serverTheme = data;
                                        });
                                        break;
                                    }
                                    case 'volume': {
                                        logger.debug('Volume event received', { volume: data });
                                        set((state) => {
                                            state.info.volume = data;
                                        });
                                    }
                                }
                            });

                            socket.addEventListener('open', () => {
                                logger.info('WebSocket opened', {
                                    hasAuthHeader: !!authHeader,
                                    readyState: socket.readyState,
                                });
                                if (authHeader) {
                                    logger.debug('Sending authentication');
                                    socket.send(
                                        JSON.stringify({
                                            event: 'authenticate',
                                            header: authHeader,
                                        }),
                                    );
                                }
                                // Successful connection — reset the backoff.
                                reconnectAttempts = 0;
                                clearReconnect();
                                set({ connected: true });
                            });

                            socket.addEventListener('close', (reason) => {
                                logger.info('WebSocket closed', {
                                    code: reason.code,
                                    natural: socket.natural,
                                    reason: reason.reason,
                                    wasClean: reason.wasClean,
                                });
                                if (reason.code === 4002 || reason.code === 4003) {
                                    logger.debug('Reloading page due to close code', {
                                        code: reason.code,
                                    });
                                    location.reload();
                                    return;
                                }

                                if (!socket.natural) {
                                    // Unexpected drop (server down, network blip, mobile tab
                                    // suspend). Mark disconnected and auto-retry with backoff
                                    // rather than giving up — the tab bar and queue actions
                                    // come back on their own once the desktop is reachable.
                                    logger.warn('Socket closed unexpectedly, will retry', {
                                        code: reason.code,
                                        reason: reason.reason,
                                    });
                                    set({ connected: false, info: {}, queue: null });
                                    scheduleReconnect(() => get().actions.reconnect());
                                }
                            });

                            state.socket = socket;
                        });
                    },
                    send: (data: ClientEvent) => {
                        const socket = get().socket;
                        if (socket && socket.readyState === WebSocket.OPEN) {
                            logger.debug('Sending event to server', {
                                data: data,
                                event: data.event,
                                readyState: socket.readyState,
                            });
                            try {
                                socket.send(JSON.stringify(data));
                            } catch (error) {
                                logger.error('Send failed, reconnecting', { error });
                                toast.warn({ message: 'Reconnecting to Feishin…' });
                                get().actions.reconnect();
                            }
                        } else {
                            // Socket dropped (e.g. phone was asleep). Kick a reconnect so the
                            // next tap works; the current action is not auto-retried.
                            logger.warn('Cannot send event - socket not open, reconnecting', {
                                event: data.event,
                                readyState: socket?.readyState,
                            });
                            toast.warn({ message: 'Reconnecting to Feishin…' });
                            get().actions.reconnect();
                        }
                    },
                    setListDisplay: (key: RemoteListKey, display: RemoteListDisplay) => {
                        set((state) => {
                            state.lists[key].display = display;
                        });
                    },
                    setSort: (key: RemoteListKey, sort: RemoteSort) => {
                        set((state) => {
                            state.sorts[key] = sort;
                        });
                    },
                    toggleIsDark: () => {
                        set((state) => {
                            state.isDark = !state.isDark;
                        });
                    },
                    toggleShowImage: () => {
                        set((state) => {
                            state.showImage = !state.showImage;
                        });
                    },
                },
                ...initialState,
            })),
            { name: 'store_settings' },
        ),
        {
            merge: (persistedState, currentState) => merge(currentState, persistedState),
            name: 'store_settings',
            // Persist only durable UI settings. Connection state (connected,
            // hasLibraryAccess, info, socket) must never be persisted — a stale
            // "connected" flag from a previous session masks a dead socket and the
            // UI pretends to be live without one.
            partialize: (state) => ({
                isDark: state.isDark,
                lists: state.lists,
                showImage: state.showImage,
                sorts: state.sorts,
            }),
            version: 10,
        },
    ),
);

export const useConnected = () => useRemoteStore((state) => state.connected);

export const useHasLibraryAccess = () => useRemoteStore((state) => state.hasLibraryAccess);

export const useInfo = () => useRemoteStore((state) => state.info);

export const useIsDark = () => useRemoteStore((state) => state.isDark);

export const useQueue = () => useRemoteStore((state) => state.queue);

export const useQueueActions = () =>
    useRemoteStore(
        (state) => ({
            queueClear: state.actions.queueClear,
            queueMove: state.actions.queueMove,
            queuePlay: state.actions.queuePlay,
            queueRemove: state.actions.queueRemove,
            queueRequest: state.actions.queueRequest,
        }),
        shallow,
    );

export const useReconnect = () => useRemoteStore((state) => state.actions.reconnect);

export const useRemoteListDisplay = (key: RemoteListKey) =>
    useRemoteStore((state) => state.lists[key].display);

export const useSetListDisplay = () => useRemoteStore((state) => state.actions.setListDisplay);

export const useListSort = (key: RemoteListKey) => useRemoteStore((state) => state.sorts[key]);

export const useSetSort = () => useRemoteStore((state) => state.actions.setSort);

export const useShowImage = () => useRemoteStore((state) => state.showImage);

export const useSend = () => useRemoteStore((state) => state.actions.send);

export const useServerTheme = () => useRemoteStore((state) => state.serverTheme);

export const useToggleDark = () => useRemoteStore((state) => state.actions.toggleIsDark);

export const useToggleShowImage = () => useRemoteStore((state) => state.actions.toggleShowImage);

// Reconnect eagerly when the phone wakes / the tab is foregrounded again, or the
// network comes back — mobile browsers routinely kill the socket while backgrounded.
//
// iOS standalone PWAs additionally freeze the JS context (timers included) while
// backgrounded and may restore a stale page from the back/forward cache. If the
// socket cannot be revived shortly after such a resume, the page itself is likely
// defunct (stale closures, frozen worker state) and only a clean reload produces a
// working app again — previously the user had to kill and relaunch by hand.
if (typeof document !== 'undefined') {
    // Backgrounded longer than this ⇒ assume iOS may have gutted the page and arm
    // the reload fallback; short blips (app switcher, notification shade) rely on
    // the plain reconnect alone.
    const RESUME_STALE_MS = 30000;
    // How long after resume the socket gets to come back before we force-reload.
    const REVIVE_TIMEOUT_MS = 8000;

    let hiddenAt: null | number = null;
    let reviveTimer: null | ReturnType<typeof setTimeout> = null;
    // At most one forced reload per resume — reset when the app is hidden again —
    // so a down/unreachable desktop can never cause a reload loop.
    let didForceReload = false;

    const isSocketDead = () => {
        const state = useRemoteStore.getState();
        const socket = state.socket;
        return !state.connected || !socket || socket.readyState !== WebSocket.OPEN;
    };

    const reconnectIfStale = () => {
        if (isSocketDead()) {
            useRemoteStore.getState().actions.reconnect();
        }
    };

    const armRevivalWatchdog = () => {
        if (didForceReload || reviveTimer) return;
        reviveTimer = setTimeout(() => {
            reviveTimer = null;
            // Only reload a visible, still-dead page. If iOS froze this timer and
            // resumed it while hidden, or the socket recovered, do nothing.
            if (document.visibilityState === 'visible' && isSocketDead()) {
                didForceReload = true;
                logger.warn('Socket did not revive after resume, forcing reload');
                location.reload();
            }
        }, REVIVE_TIMEOUT_MS);
    };

    const onResume = (viaBackForwardCache: boolean) => {
        const hiddenFor = hiddenAt === null ? 0 : Date.now() - hiddenAt;
        hiddenAt = null;
        // Timers were frozen while backgrounded — restart the backoff from zero so
        // the first retry after waking is immediate, not a leftover long delay.
        reconnectAttempts = 0;
        clearReconnect();
        reconnectIfStale();

        if (viaBackForwardCache || hiddenFor >= RESUME_STALE_MS) {
            armRevivalWatchdog();
        }
    };

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            onResume(false);
        } else {
            hiddenAt = Date.now();
            // New background cycle: allow one reload on the next resume, and
            // disarm any watchdog from the previous one.
            didForceReload = false;
            if (reviveTimer) {
                clearTimeout(reviveTimer);
                reviveTimer = null;
            }
        }
    });

    // Fires when iOS restores the page from the back/forward cache instead of
    // reloading it — the restored JS state (socket, timers) is stale by
    // definition. A non-persisted pageshow is just a normal load: the App mount
    // effect already reconnects, and skipping the watchdog there guarantees a
    // forced reload cannot loop.
    window.addEventListener('pageshow', (event) => {
        if (event.persisted) {
            onResume(true);
        }
    });

    window.addEventListener('online', reconnectIfStale);
}
