import isElectron from 'is-electron';
import debounce from 'lodash/debounce';
import { useEffect, useMemo, useRef, useState } from 'react';

import { getItemImageUrl } from '/@/renderer/components/item-image/item-image';
import { usePlayerEvents } from '/@/renderer/features/player/audio-player/hooks/use-player-events';
import { usePlayer } from '/@/renderer/features/player/context/player-context';
import { useSetRating } from '/@/renderer/features/shared/hooks/use-set-rating';
import { useCreateFavorite } from '/@/renderer/features/shared/mutations/create-favorite-mutation';
import { useDeleteFavorite } from '/@/renderer/features/shared/mutations/delete-favorite-mutation';
import {
    isShuffleEnabled,
    mapShuffledToQueueIndex,
    subscribeCurrentTrack,
    subscribePlayerQueue,
    useAutoDJSettings,
    usePlayerActions,
    usePlayerStore,
    useRemoteSettings,
    useSettingsStoreActions,
} from '/@/renderer/store';
import { useCurrentServerWithCredential } from '/@/renderer/store/auth.store';
import { useAccent, useThemeSettings } from '/@/renderer/store/settings.store';
import { logger } from '/@/renderer/utils/logger';
import { toast } from '/@/shared/components/toast/toast';
import { LibraryItem, QueueSong } from '/@/shared/types/domain-types';
import {
    RemoteAutoDj,
    RemoteQueueEntry,
    RemoteServer,
    RemoteTheme,
    ServerQueue,
} from '/@/shared/types/remote-types';
import { PlayerShuffle } from '/@/shared/types/types';

const remote = isElectron() ? window.api.remote : null;
const ipc = isElectron() ? window.api.ipc : null;

export const useRemote = () => {
    const {
        clearQueue,
        clearSelected,
        mediaPlayByIndex,
        mediaSkipForward,
        moveSelectedTo,
        setVolume,
    } = usePlayerActions();
    const player = usePlayerStore();
    const playerContext = usePlayer();

    const remoteSettings = useRemoteSettings();
    const autoDJSettings = useAutoDJSettings();
    const { setSettings } = useSettingsStoreActions();
    const setRating = useSetRating();
    const addToFavoritesMutation = useCreateFavorite({});
    const removeFromFavoritesMutation = useDeleteFavorite({});
    const currentServer = useCurrentServerWithCredential();
    const accent = useAccent();
    const {
        followSystemTheme,
        primaryShade,
        theme,
        themeDark,
        themeLight,
        useThemeAccentColor,
        useThemePrimaryShade,
    } = useThemeSettings();
    const [isDark, setIsDark] = useState(
        () => window.matchMedia('(prefers-color-scheme: dark)').matches,
    );

    const isRemoteEnabled = remoteSettings.enabled;

    // Initialize the remote
    useEffect(() => {
        // we must send this EVEN IF the remote is disabled, as this is what
        // makes sure that the main process gets the port/username/password on startup

        logger.info('Initializing remote settings', {
            enabled: remoteSettings.enabled,
            port: remoteSettings.port,
            username: remoteSettings.username,
        });

        remote
            ?.updateSetting(
                remoteSettings.enabled,
                remoteSettings.port,
                remoteSettings.username,
                remoteSettings.password,
            )
            .catch((error) => {
                logger.error('Failed to enable remote', { error });
                toast.warn({ message: error, title: 'Failed to enable remote' });
            });
        // We only want to fire this once
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!isRemoteEnabled || !remote) {
            return;
        }

        remote.requestPosition((data: { position: number }) => {
            logger.debug('Request position received', { position: data.position });
            const newTime = data.position;
            player.mediaSeekToTimestamp(newTime);
        });

        remote.requestSeek((data: { offset: number }) => {
            logger.debug('Request seek received', { offset: data.offset });
            mediaSkipForward(data.offset);
        });

        remote.requestRating((data: { id: string; rating: number; serverId: string }) => {
            logger.debug('Request rating received', {
                id: data.id,
                rating: data.rating,
                serverId: data.serverId,
            });
            setRating(data.serverId, [data.id], LibraryItem.SONG, data.rating);
        });

        remote.requestVolume((data: { volume: number }) => {
            logger.debug('Request volume received', { volume: data.volume });
            setVolume(data.volume);
        });

        remote.requestFavorite((data: { favorite: boolean; id: string; serverId: string }) => {
            logger.debug('Request favorite received', {
                favorite: data.favorite,
                id: data.id,
                serverId: data.serverId,
            });
            const mutator = data.favorite ? addToFavoritesMutation : removeFromFavoritesMutation;
            mutator.mutate({
                apiClientProps: { serverId: data.serverId },
                query: {
                    id: [data.id],
                    type: LibraryItem.SONG,
                },
            });
        });

        remote.requestQueueAdd((data) => {
            logger.debug('Request queue add received', {
                ids: data.ids,
                itemType: data.itemType,
                playType: data.playType,
                serverId: data.serverId,
            });
            playerContext.addToQueueByFetch(data.serverId, data.ids, data.itemType, data.playType);
        });

        remote.requestQueuePlay((data: { uniqueId: string }) => {
            logger.debug('Request queue play received', { uniqueId: data.uniqueId });
            const defaultIndex = usePlayerStore.getState().queue.default.indexOf(data.uniqueId);
            if (defaultIndex !== -1) {
                mediaPlayByIndex(defaultIndex);
            }
        });

        remote.requestQueueRemove((data: { uniqueIds: string[] }) => {
            logger.debug('Request queue remove received', { uniqueIds: data.uniqueIds });
            const { songs } = usePlayerStore.getState().queue;
            const items = data.uniqueIds
                .map((uniqueId) => songs[uniqueId])
                .filter((song): song is QueueSong => Boolean(song));
            clearSelected(items);
        });

        remote.requestQueueMove(
            (data: { edge: 'bottom' | 'top'; targetUniqueId: string; uniqueIds: string[] }) => {
                logger.debug('Request queue move received', {
                    edge: data.edge,
                    targetUniqueId: data.targetUniqueId,
                    uniqueIds: data.uniqueIds,
                });
                const { songs } = usePlayerStore.getState().queue;
                const items = data.uniqueIds
                    .map((uniqueId) => songs[uniqueId])
                    .filter((song): song is QueueSong => Boolean(song));
                moveSelectedTo(items, data.targetUniqueId, data.edge);
            },
        );

        remote.requestQueueClear(() => {
            logger.debug('Request queue clear received');
            clearQueue();
        });

        remote.requestAutoDjSet((settings: Partial<RemoteAutoDj>) => {
            logger.debug('Request AutoDJ set received', { settings });
            setSettings({ autoDJ: settings });
        });

        return () => {
            ipc?.removeAllListeners('request-position');
            ipc?.removeAllListeners('request-seek');
            ipc?.removeAllListeners('request-volume');
            ipc?.removeAllListeners('request-favorite');
            ipc?.removeAllListeners('request-rating');
            ipc?.removeAllListeners('request-queue-add');
            ipc?.removeAllListeners('request-queue-play');
            ipc?.removeAllListeners('request-queue-remove');
            ipc?.removeAllListeners('request-queue-move');
            ipc?.removeAllListeners('request-queue-clear');
            ipc?.removeAllListeners('request-autodj-set');
        };
    }, [
        addToFavoritesMutation,
        clearQueue,
        clearSelected,
        isRemoteEnabled,
        mediaPlayByIndex,
        mediaSkipForward,
        moveSelectedTo,
        player,
        playerContext,
        removeFromFavoritesMutation,
        setSettings,
        setVolume,
        setRating,
    ]);

    // Send initial song if one is already playing
    const isInitializedRef = useRef(false);
    useEffect(() => {
        if (isInitializedRef.current || !isRemoteEnabled || !remote) {
            return;
        }

        isInitializedRef.current = true;

        const currentSong = player.getCurrentSong();

        if (currentSong) {
            logger.debug('Sending initial song', {
                artistName: currentSong.artistName,
                id: currentSong.id,
                name: currentSong.name,
            });

            const imageUrl =
                getItemImageUrl({
                    id: currentSong.id,
                    imageUrl: currentSong.imageUrl,
                    itemType: LibraryItem.SONG,
                    serverId: currentSong._serverId,
                    type: 'itemCard',
                    useRemoteUrl: true,
                }) || null;

            remote.updateSong(currentSong, imageUrl);
        }
    }, [isRemoteEnabled, player]);

    // Push the current server (with credentials) on connect and whenever it changes
    useEffect(() => {
        if (!isRemoteEnabled || !remote) {
            return;
        }

        if (!currentServer) {
            logger.debug('Sending null server');
            remote.updateServer(null);
            return;
        }

        const server: RemoteServer = {
            credential: currentServer.credential,
            features: currentServer.features,
            id: currentServer.id,
            isAdmin: currentServer.isAdmin,
            musicFolderId: currentServer.musicFolderId,
            name: currentServer.name,
            ndCredential: currentServer.ndCredential,
            preferInstantMix: currentServer.preferInstantMix,
            preferRemoteUrl: currentServer.preferRemoteUrl,
            remoteUrl: currentServer.remoteUrl,
            type: currentServer.type,
            url: currentServer.url,
            userId: currentServer.userId,
            username: currentServer.username,
            version: currentServer.version,
        };

        logger.debug('Sending current server', { id: server.id, name: server.name });
        remote.updateServer(server);
    }, [currentServer, isRemoteEnabled]);

    useEffect(() => {
        const darkThemeMq = window.matchMedia('(prefers-color-scheme: dark)');
        const listener = (e: MediaQueryListEvent) => {
            setIsDark(e.matches);
        };
        darkThemeMq.addEventListener('change', listener);
        return () => darkThemeMq.removeEventListener('change', listener);
    }, []);

    // Push the effective theme (built-in AppTheme + accent/shade) on connect
    // and whenever it changes, including a system dark/light switch.
    useEffect(() => {
        if (!isRemoteEnabled || !remote) {
            return;
        }

        const selectedTheme = followSystemTheme ? (isDark ? themeDark : themeLight) : theme;

        const payload: RemoteTheme = {
            accent,
            primaryShade,
            theme: selectedTheme,
            useThemeAccentColor,
            useThemePrimaryShade,
        };

        logger.debug('Sending current theme', { theme: payload.theme });
        remote.updateTheme(payload);
    }, [
        accent,
        followSystemTheme,
        isDark,
        isRemoteEnabled,
        primaryShade,
        theme,
        themeDark,
        themeLight,
        useThemeAccentColor,
        useThemePrimaryShade,
    ]);

    // Push the current AutoDJ settings (enabled/contrast/mode) on connect and
    // whenever they change, mirroring the theme push above.
    useEffect(() => {
        if (!isRemoteEnabled || !remote) {
            return;
        }

        const payload: RemoteAutoDj = {
            contrast: autoDJSettings.contrast,
            enabled: autoDJSettings.enabled,
            mode: autoDJSettings.mode,
        };

        logger.debug('Sending current AutoDJ settings', payload);
        remote.updateAutoDj(payload);
    }, [autoDJSettings.contrast, autoDJSettings.enabled, autoDJSettings.mode, isRemoteEnabled]);

    // Push a slim queue snapshot whenever the queue, current track, or shuffle
    // state changes. Reorders fire bursts of updates, so this is debounced.
    const pushQueueSnapshot = useMemo(
        () =>
            debounce(() => {
                if (!remote) {
                    return;
                }

                const state = usePlayerStore.getState();
                const queue = state.getQueue();
                const shuffle = isShuffleEnabled(state);

                let currentIndex = state.player.index;
                if (shuffle) {
                    currentIndex = mapShuffledToQueueIndex(currentIndex, state.queue.shuffled);
                }
                if (currentIndex < 0 || currentIndex >= queue.items.length) {
                    currentIndex = -1;
                }

                const currentSong = currentIndex !== -1 ? queue.items[currentIndex] : undefined;

                const entries: RemoteQueueEntry[] = queue.items.map((song) => ({
                    album: song.album,
                    albumId: song.albumId,
                    artistName: song.artistName,
                    duration: song.duration,
                    id: song.id,
                    imageId: song.imageId,
                    name: song.name,
                    uniqueId: song._uniqueId,
                    userFavorite: song.userFavorite,
                    userRating: song.userRating,
                }));

                const snapshot: ServerQueue['data'] = {
                    currentIndex,
                    currentUniqueId: currentSong?._uniqueId ?? null,
                    entries,
                    shuffle,
                };

                logger.debug('Update queue sent', {
                    currentIndex: snapshot.currentIndex,
                    entryCount: entries.length,
                    shuffle,
                });
                remote.updateQueue(snapshot);
            }, 250),
        [],
    );

    useEffect(() => {
        if (!isRemoteEnabled || !remote) {
            return;
        }

        // Push once on mount so a freshly-connected phone gets state immediately.
        pushQueueSnapshot();

        const unsubQueue = subscribePlayerQueue(() => {
            pushQueueSnapshot();
        });
        const unsubCurrentTrack = subscribeCurrentTrack(() => {
            pushQueueSnapshot();
        });

        return () => {
            unsubQueue();
            unsubCurrentTrack();
            pushQueueSnapshot.cancel();
        };
    }, [isRemoteEnabled, pushQueueSnapshot]);

    usePlayerEvents(
        {
            onCurrentSongChange: (properties) => {
                if (!isRemoteEnabled || !remote) {
                    return;
                }

                logger.debug('Update song sent', {
                    artistName: properties.song?.artistName,
                    id: properties.song?.id,
                    index: properties.index,
                    name: properties.song?.name,
                });
                if (properties.song) {
                    const song = properties.song;
                    const imageUrl =
                        getItemImageUrl({
                            id: song.id,
                            imageUrl: song.imageUrl,
                            itemType: LibraryItem.SONG,
                            serverId: song._serverId,
                            type: 'itemCard',
                            useRemoteUrl: true,
                        }) || null;

                    remote.updateSong(song, imageUrl);
                } else {
                    remote.updateSong(undefined);
                }
            },
            onPlayerProgress: (properties) => {
                if (!isRemoteEnabled || !remote) {
                    return;
                }

                logger.debug('Update position sent', { timestamp: properties.timestamp });
                remote.updatePosition(properties.timestamp);
            },
            onPlayerRepeat: (properties) => {
                if (!isRemoteEnabled || !remote) {
                    return;
                }

                logger.debug('Update repeat sent', { repeat: properties.repeat });
                remote.updateRepeat(properties.repeat);
            },
            onPlayerShuffle: (properties) => {
                if (!isRemoteEnabled || !remote) {
                    return;
                }

                const isShuffleEnabled = properties.shuffle !== PlayerShuffle.NONE;
                logger.debug('Update shuffle sent', {
                    isShuffleEnabled,
                    shuffle: properties.shuffle,
                });
                remote.updateShuffle(isShuffleEnabled);
            },
            onPlayerStatus: (properties) => {
                if (!isRemoteEnabled || !remote) {
                    return;
                }

                logger.debug('Update playback sent', { status: properties.status });
                remote.updatePlayback(properties.status);
            },
            onPlayerVolume: (properties) => {
                if (!isRemoteEnabled || !remote) {
                    return;
                }

                logger.debug('Update volume sent', { volume: properties.volume });
                remote.updateVolume(properties.volume);
            },
            onUserFavorite: (properties) => {
                if (!isRemoteEnabled || !remote) {
                    return;
                }

                logger.debug('Update favorite sent', {
                    favorite: properties.favorite,
                    id: properties.id,
                    serverId: properties.serverId,
                });
                remote.updateFavorite(properties.favorite, properties.serverId, properties.id);
            },
            onUserRating: (properties) => {
                if (!isRemoteEnabled || !remote) {
                    return;
                }

                logger.debug('Update rating sent', {
                    id: properties.id,
                    rating: properties.rating || 0,
                    serverId: properties.serverId,
                });
                remote.updateRating(properties.rating || 0, properties.serverId, properties.id);
            },
        },
        [],
    );
};

export const RemoteHook = () => {
    useRemote();
    return null;
};
