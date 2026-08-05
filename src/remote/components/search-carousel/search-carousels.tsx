import { useQuery } from '@tanstack/react-query';

import { AlbumCarouselRow } from '/@/remote/components/search-carousel/album-carousel-row';
import { albumQueries } from '/@/renderer/features/albums/api/album-api';
import { Center } from '/@/shared/components/center/center';
import { Text } from '/@/shared/components/text/text';
import { Album, AlbumListSort, SortOrder } from '/@/shared/types/domain-types';

const CAROUSEL_ALBUM_LIMIT = 20;
// Recently Added/Played stay stable while the user hops between tabs.
const RECENT_STALE_TIME_MS = 1000 * 60 * 5;

interface CarouselQueryOptions {
    refetchOnMount: 'always' | boolean;
    staleTime: number;
}

const useCarouselAlbums = (
    serverId: string,
    sortBy: AlbumListSort,
    { refetchOnMount, staleTime }: CarouselQueryOptions,
) => {
    return useQuery({
        ...albumQueries.list({
            options: { staleTime },
            query: {
                limit: CAROUSEL_ALBUM_LIMIT,
                sortBy,
                sortOrder: SortOrder.DESC,
                startIndex: 0,
            },
            serverId,
        }),
        enabled: !!serverId,
        refetchOnMount,
    });
};

interface SearchCarouselsProps {
    onAlbumPress: (album: Album) => void;
    serverId: string;
}

export const SearchCarousels = ({ onAlbumPress, serverId }: SearchCarouselsProps) => {
    // Random reshuffles on every visit to the Search page: the cached list is
    // shown for the first paint, but a fresh shuffle is always fetched.
    const randomQuery = useCarouselAlbums(serverId, AlbumListSort.RANDOM, {
        refetchOnMount: 'always',
        staleTime: 0,
    });
    const recentlyAddedQuery = useCarouselAlbums(serverId, AlbumListSort.RECENTLY_ADDED, {
        refetchOnMount: true,
        staleTime: RECENT_STALE_TIME_MS,
    });
    const recentlyPlayedQuery = useCarouselAlbums(serverId, AlbumListSort.RECENTLY_PLAYED, {
        refetchOnMount: true,
        staleTime: RECENT_STALE_TIME_MS,
    });

    const randomAlbums = randomQuery.data?.items ?? [];
    const recentlyAddedAlbums = recentlyAddedQuery.data?.items ?? [];
    const recentlyPlayedAlbums = recentlyPlayedQuery.data?.items ?? [];

    const isLoading =
        randomQuery.isLoading || recentlyAddedQuery.isLoading || recentlyPlayedQuery.isLoading;
    const isEmpty =
        randomAlbums.length === 0 &&
        recentlyAddedAlbums.length === 0 &&
        recentlyPlayedAlbums.length === 0;

    if (isEmpty) {
        return (
            <Center h="100%" w="100%">
                {!isLoading && <Text isMuted>Search for songs, albums, and artists</Text>}
            </Center>
        );
    }

    // A flex column that divides the available height between the rows; each
    // row derives its artwork size from its own share, so all rows stay fully
    // visible with no vertical page scrolling or cutoff.
    return (
        <div
            style={{
                display: 'flex',
                flex: 1,
                flexDirection: 'column',
                gap: 10,
                minHeight: 0,
                overflow: 'hidden',
                paddingBottom: 12,
                paddingTop: 4,
            }}
        >
            <AlbumCarouselRow
                albums={randomAlbums}
                label="Random"
                onAlbumPress={onAlbumPress}
                serverId={serverId}
            />
            <AlbumCarouselRow
                albums={recentlyAddedAlbums}
                label="Recently Added"
                onAlbumPress={onAlbumPress}
                serverId={serverId}
            />
            <AlbumCarouselRow
                albums={recentlyPlayedAlbums}
                label="Recently Played"
                onAlbumPress={onAlbumPress}
                serverId={serverId}
            />
        </div>
    );
};
