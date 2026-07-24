import { useQueryClient } from '@tanstack/react-query';
import React, { useEffect } from 'react';

import { eventEmitter } from '/@/renderer/events/event-emitter';
import { runAutoDjAlbumIds } from '/@/renderer/features/player/auto-dj/auto-dj-albums';
import { runAutoDjSongs } from '/@/renderer/features/player/auto-dj/auto-dj-songs';
import { runAutoDjVector } from '/@/renderer/features/player/auto-dj/auto-dj-vector';
import { useIsPlayerFetching, usePlayer } from '/@/renderer/features/player/context/player-context';
import {
    AUTO_DJ_STRATEGY,
    isShuffleEnabled,
    mapShuffledToQueueIndex,
    useAutoDJSettings,
    useCurrentServer,
    useCurrentServerId,
    usePlayerStore,
    usePlayerStoreBase,
    useSettingsStore,
} from '/@/renderer/store';
import { logger } from '/@/renderer/utils/logger';
import { hasFeature } from '/@/shared/api/utils';
import { LibraryItem } from '/@/shared/types/domain-types';
import { ServerFeature } from '/@/shared/types/features-types';
import { Play } from '/@/shared/types/types';

export const useAutoDJ = () => {
    const queryClient = useQueryClient();
    const serverId = useCurrentServerId();
    const server = useCurrentServer();
    const player = usePlayer();
    const settings = useAutoDJSettings();
    const isFetching = useIsPlayerFetching();

    const hasSimilarSongsMusicFolder = hasFeature(server, ServerFeature.SIMILAR_SONGS_MUSIC_FOLDER);

    useEffect(() => {
        const albumStrategy = settings.albumStrategy ?? AUTO_DJ_STRATEGY.SIMILAR;
        const songStrategy = settings.songStrategy ?? AUTO_DJ_STRATEGY.SIMILAR;

        const unsubscribe = usePlayerStoreBase.subscribe(
            (state) => {
                const queue = state.getQueue();
                let index = state.player.index;
                let remaining: number;

                if (isShuffleEnabled(state)) {
                    remaining = state.queue.shuffled.length - index - 1;
                    index = mapShuffledToQueueIndex(index, state.queue.shuffled);
                } else {
                    remaining = queue.items.slice(index + 1).length;
                }

                return { index, remaining, song: queue.items[index] };
            },
            async (properties) => {
                if (!settings.enabled) {
                    return;
                }

                if (!properties.song?.id) {
                    return;
                }

                if (properties.remaining >= settings.timing) {
                    return;
                }

                logger.info('Auto play triggered', {
                    remaining: properties.remaining,
                    songId: properties.song?.id,
                });

                try {
                    const queue = usePlayerStore.getState().getQueue();

                    const hasMusicFolder = server?.musicFolderId && server.musicFolderId.length > 0;
                    const musicFolderId =
                        hasMusicFolder && server?.musicFolderId ? server.musicFolderId : undefined;
                    const trySimilarSongs =
                        !hasMusicFolder || (hasMusicFolder && hasSimilarSongsMusicFolder);

                    const runnerDepsBase = {
                        allowDuplicates: settings.allowDuplicates,
                        itemCount: settings.itemCount,
                        musicFolderId,
                        onlySimilar: settings.onlySimilar,
                        queryClient,
                        server,
                        serverId,
                        trySimilarSongs,
                    };

                    if (settings.mode === 'albums') {
                        if (!serverId) {
                            return;
                        }

                        const queueAlbumIdSet = new Set(
                            queue.items
                                .map((item) => item.albumId)
                                .filter((id): id is string => Boolean(id)),
                        );

                        const albumsToAdd = await runAutoDjAlbumIds({
                            ...runnerDepsBase,
                            albumStrategy,
                            currentSong: properties.song,
                            queueAlbumIdSet,
                        });

                        if (albumsToAdd.length > 0) {
                            await player.addToQueueByFetch(
                                serverId,
                                albumsToAdd,
                                LibraryItem.ALBUM,
                                Play.LAST,
                            );

                            eventEmitter.emit('AUTODJ_QUEUE_ADDED', {
                                songCount: albumsToAdd.length,
                            });
                        }

                        return;
                    }

                    if (!serverId) {
                        return;
                    }

                    // Vector strategy: delegate selection to the self-hosted recommender.
                    // On any failure (recommender unreachable / off-tailnet) fall through to
                    // the local similar cascade so the queue never dead-ends.
                    if (songStrategy === AUTO_DJ_STRATEGY.VECTOR && settings.recommenderUrl) {
                        try {
                            // read fresh so filter edits apply without re-subscribing.
                            const autoDJ = useSettingsStore.getState().autoDJ;
                            const excludeIds = queue.items.map((item) => item.id);
                            const recentIds = queue.items
                                .slice(Math.max(0, properties.index - 10), properties.index + 1)
                                .map((item) => item.id);

                            const trackIds = await runAutoDjVector({
                                count: settings.itemCount,
                                currentSong: properties.song,
                                excludeIds,
                                params: {
                                    allowDuplicates: autoDJ.allowDuplicates,
                                    artistsExclude: autoDJ.artistsExclude,
                                    artistsInclude: autoDJ.artistsInclude,
                                    bpmMax: autoDJ.bpmMax || undefined,
                                    bpmMin: autoDJ.bpmMin || undefined,
                                    contrast: autoDJ.contrast,
                                    genresAllow: autoDJ.genresAllow,
                                    genresExclude: autoDJ.genresExclude,
                                    lengthMaxSec: autoDJ.lengthMaxSec || undefined,
                                    lengthMinSec: autoDJ.lengthMinSec || undefined,
                                    yearMax: autoDJ.yearMax || undefined,
                                    yearMin: autoDJ.yearMin || undefined,
                                },
                                recentIds,
                                recommenderUrl: settings.recommenderUrl,
                            });

                            if (trackIds.length > 0) {
                                await player.addToQueueByFetch(
                                    serverId,
                                    trackIds,
                                    LibraryItem.SONG,
                                    Play.LAST,
                                );

                                eventEmitter.emit('AUTODJ_QUEUE_ADDED', {
                                    songCount: trackIds.length,
                                });
                            }

                            return;
                        } catch (error) {
                            logger.error('Auto DJ vector failed; falling back to similar', {
                                error: (error as Error).message,
                                songId: properties.song?.id,
                            });
                        }
                    }

                    const queueSongIdSet = new Set(queue.items.map((item) => item.id));

                    const songsToAdd = await runAutoDjSongs({
                        ...runnerDepsBase,
                        currentSong: properties.song,
                        queueSongIdSet,
                        songStrategy,
                    });

                    if (songsToAdd.length > 0) {
                        player.addToQueueByData(songsToAdd, Play.LAST);

                        eventEmitter.emit('AUTODJ_QUEUE_ADDED', {
                            songCount: songsToAdd.length,
                        });
                    }
                } catch (error) {
                    logger.error('Auto play failed', {
                        error: (error as Error).message,
                        songId: properties.song?.id,
                    });
                }
            },
            {
                equalityFn: (a, b) => {
                    return a.song?._uniqueId === b.song?._uniqueId && a.remaining === b.remaining;
                },
            },
        );

        return () => unsubscribe();
    }, [
        hasSimilarSongsMusicFolder,
        isFetching,
        player,
        queryClient,
        server,
        serverId,
        settings.enabled,
        settings.albumStrategy,
        settings.allowDuplicates,
        settings.contrast,
        settings.itemCount,
        settings.mode,
        settings.onlySimilar,
        settings.recommenderUrl,
        settings.songStrategy,
        settings.timing,
    ]);
};

const AutoDJHookInner = () => {
    useAutoDJ();
    return null;
};

export const AutoDJHook = () => {
    const isAutoDJEnabled = useSettingsStore((state) => state.autoDJ.enabled);

    if (!isAutoDJEnabled) {
        return null;
    }

    return React.createElement(AutoDJHookInner);
};
