import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { recommenderSessionNext } from '/@/renderer/features/player/auto-dj/recommender-api';
import { usePlayer } from '/@/renderer/features/player/context/player-context';
import {
    getAlbumArtistSongsById,
    getAlbumSongsById,
    getArtistSongsById,
} from '/@/renderer/features/player/utils';
import {
    AUTO_DJ_STRATEGY,
    useCurrentServerId,
    usePlayButtonBehavior,
    useSettingsStore,
    useSettingsStoreActions,
} from '/@/renderer/store';
import { shuffle } from '/@/renderer/utils/shuffle';
import { ContextMenu } from '/@/shared/components/context-menu/context-menu';
import { toast } from '/@/shared/components/toast/toast';
import {
    type Album,
    type AlbumArtist,
    type Artist,
    LibraryItem,
    type Song,
} from '/@/shared/types/domain-types';
import { Play } from '/@/shared/types/types';

// A seed batch big enough to start a session; AutoDJ then keeps refilling. An artist's
// full discography is capped to a representative sample so the seed request stays small.
const SEED_BATCH = 25;
const MAX_SEEDS = 50;

interface SeedAutoDjActionProps {
    album?: Album;
    albumArtist?: AlbumArtist;
    artist?: Artist;
    disabled?: boolean;
    song?: Song;
}

export const SeedAutoDjAction = ({
    album,
    albumArtist,
    artist,
    disabled,
    song,
}: SeedAutoDjActionProps) => {
    const { t } = useTranslation();
    const player = usePlayer();
    const serverId = useCurrentServerId();
    const queryClient = useQueryClient();
    const playButtonBehavior = usePlayButtonBehavior();
    const { setSettings } = useSettingsStoreActions();

    const handleSeed = useCallback(
        async (playType: Play) => {
            if (!serverId) return;

            const autoDJ = useSettingsStore.getState().autoDJ;
            if (!autoDJ.recommenderUrl) {
                toast.warn({
                    message: 'Set the AutoDJ recommender URL in Settings → Playback → Auto DJ',
                });
                return;
            }

            try {
                // Resolve the seed track ids from whichever item was clicked.
                let seedIds: string[] = [];
                if (song) {
                    seedIds = [song.id];
                } else if (album) {
                    const res = await getAlbumSongsById({ id: [album.id], queryClient, serverId });
                    seedIds = res.items.map((s) => s.id);
                } else if (albumArtist) {
                    const res = await getAlbumArtistSongsById({
                        id: [albumArtist.id],
                        queryClient,
                        serverId,
                    });
                    seedIds = res.items.map((s) => s.id);
                } else if (artist) {
                    const res = await getArtistSongsById({
                        id: [artist.id],
                        queryClient,
                        serverId,
                    });
                    seedIds = res.items.map((s) => s.id);
                }

                if (seedIds.length > MAX_SEEDS) {
                    seedIds = shuffle(seedIds).slice(0, MAX_SEEDS);
                }
                if (seedIds.length === 0) return;

                const response = await recommenderSessionNext(autoDJ.recommenderUrl, {
                    count: SEED_BATCH,
                    exclude: [],
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
                    recent: [],
                    seeds: seedIds,
                });

                const trackIds = response.tracks ?? [];
                if (trackIds.length === 0) {
                    toast.info({ message: 'AutoDJ returned no matching tracks for this seed' });
                    return;
                }

                // Turn on vector AutoDJ so the station keeps refilling from what plays.
                setSettings({
                    autoDJ: {
                        enabled: true,
                        mode: 'songs',
                        songStrategy: AUTO_DJ_STRATEGY.VECTOR,
                    },
                });

                // For a single clicked track, lead with it on "play now"; otherwise the
                // item is just the seed vibe and only the recommendations play.
                if (song && playType === Play.NOW) {
                    player.addToQueueByData([song], Play.NOW);
                    await player.addToQueueByFetch(serverId, trackIds, LibraryItem.SONG, Play.LAST);
                } else {
                    await player.addToQueueByFetch(serverId, trackIds, LibraryItem.SONG, playType);
                }
            } catch (error) {
                toast.error({
                    message: (error as Error).message,
                    title: t('error.genericError') as string,
                });
            }
        },
        [album, albumArtist, artist, player, queryClient, serverId, setSettings, song, t],
    );

    const seedNow = useCallback(() => handleSeed(Play.NOW), [handleSeed]);
    const seedNext = useCallback(() => handleSeed(Play.NEXT), [handleSeed]);
    const seedLast = useCallback(() => handleSeed(Play.LAST), [handleSeed]);
    const seedDefault = useCallback(
        () => handleSeed(playButtonBehavior),
        [handleSeed, playButtonBehavior],
    );

    return (
        <ContextMenu.Submenu>
            <ContextMenu.SubmenuTarget>
                <ContextMenu.Item
                    disabled={disabled}
                    leftIcon="disc"
                    onSelect={seedDefault}
                    rightIcon="arrowRightS"
                >
                    {t('player.seedAutoDj', { defaultValue: 'Seed AutoDJ' })}
                </ContextMenu.Item>
            </ContextMenu.SubmenuTarget>
            <ContextMenu.SubmenuContent>
                <ContextMenu.Item leftIcon="mediaPlay" onSelect={seedNow}>
                    {t('player.play')}
                </ContextMenu.Item>
                <ContextMenu.Item leftIcon="mediaPlayNext" onSelect={seedNext}>
                    {t('player.addNext')}
                </ContextMenu.Item>
                <ContextMenu.Item leftIcon="mediaPlayLast" onSelect={seedLast}>
                    {t('player.addLast')}
                </ContextMenu.Item>
            </ContextMenu.SubmenuContent>
        </ContextMenu.Submenu>
    );
};
