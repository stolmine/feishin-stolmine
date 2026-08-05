import { useQuery } from '@tanstack/react-query';

import { AlbumCarouselRow } from '/@/remote/components/search-carousel/album-carousel-row';
import { albumQueries } from '/@/renderer/features/albums/api/album-api';
import { Center } from '/@/shared/components/center/center';
import { Stack } from '/@/shared/components/stack/stack';
import { Text } from '/@/shared/components/text/text';
import { Album, AlbumListSort, SortOrder } from '/@/shared/types/domain-types';

const CAROUSEL_ALBUM_LIMIT = 20;
// Keep rows stable while the user hops between tabs; Random reshuffles (and
// Recently Added/Played refresh) once the data goes stale.
const CAROUSEL_STALE_TIME_MS = 1000 * 60 * 5;

const useCarouselAlbums = (serverId: string, sortBy: AlbumListSort, sortOrder: SortOrder) => {
    return useQuery({
        ...albumQueries.list({
            options: { staleTime: CAROUSEL_STALE_TIME_MS },
            query: {
                limit: CAROUSEL_ALBUM_LIMIT,
                sortBy,
                sortOrder,
                startIndex: 0,
            },
            serverId,
        }),
        enabled: !!serverId,
    });
};

interface SearchCarouselsProps {
    onAlbumPress: (album: Album) => void;
    serverId: string;
}

export const SearchCarousels = ({ onAlbumPress, serverId }: SearchCarouselsProps) => {
    const randomQuery = useCarouselAlbums(serverId, AlbumListSort.RANDOM, SortOrder.DESC);
    const recentlyAddedQuery = useCarouselAlbums(
        serverId,
        AlbumListSort.RECENTLY_ADDED,
        SortOrder.DESC,
    );
    const recentlyPlayedQuery = useCarouselAlbums(
        serverId,
        AlbumListSort.RECENTLY_PLAYED,
        SortOrder.DESC,
    );

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

    return (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            <Stack gap="md" pb="md">
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
            </Stack>
        </div>
    );
};
