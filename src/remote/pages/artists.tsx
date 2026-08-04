import { useCallback, useMemo, useState } from 'react';
import { RiLayoutGridLine, RiListCheck2 } from 'react-icons/ri';
import { useNavigate } from 'react-router';

import { ActionSheet } from '/@/remote/components/action-sheet';
import { RemoteGrid } from '/@/remote/components/item-list/remote-grid';
import { RemoteList } from '/@/remote/components/item-list/remote-list';
import { RowData } from '/@/remote/components/item-list/types';
import { useQueueActions } from '/@/remote/components/item-list/use-queue-actions';
import { useRemoteInfiniteList } from '/@/remote/components/item-list/use-remote-infinite-list';
import { useHasLibraryAccess, useRemoteListDisplay, useSetListDisplay } from '/@/remote/store';
import { artistsQueries } from '/@/renderer/features/artists/api/artists-api';
import { useCurrentServerId } from '/@/renderer/store/auth.store';
import { ActionIcon } from '/@/shared/components/action-icon/action-icon';
import { Center } from '/@/shared/components/center/center';
import { Flex } from '/@/shared/components/flex/flex';
import { Text } from '/@/shared/components/text/text';
import {
    AlbumArtist,
    AlbumArtistListSort,
    LibraryItem,
    SortOrder,
} from '/@/shared/types/domain-types';

const PAGE_SIZE = 100;

const artistToRowData = (artist: AlbumArtist): RowData => ({
    id: artist.id,
    imageId: artist.imageId,
    subtitle:
        artist.albumCount != null
            ? `${artist.albumCount} album${artist.albumCount === 1 ? '' : 's'}`
            : artist.songCount != null
              ? `${artist.songCount} song${artist.songCount === 1 ? '' : 's'}`
              : undefined,
    title: artist.name,
});

interface SelectedArtist {
    id: string;
    name: string;
}

export const ArtistsPage = () => {
    const serverId = useCurrentServerId();
    const hasLibraryAccess = useHasLibraryAccess();
    const display = useRemoteListDisplay('artist');
    const setListDisplay = useSetListDisplay();
    const navigate = useNavigate();

    const [selectedArtist, setSelectedArtist] = useState<null | SelectedArtist>(null);

    const countQueryOptions = useMemo(
        () =>
            artistsQueries.albumArtistListCount({
                query: { sortBy: AlbumArtistListSort.NAME, sortOrder: SortOrder.ASC },
                serverId,
            }),
        [serverId],
    );

    const buildListQueryOptions = useCallback(
        (startIndex: number, limit: number) =>
            artistsQueries.albumArtistList({
                query: {
                    limit,
                    sortBy: AlbumArtistListSort.NAME,
                    sortOrder: SortOrder.ASC,
                    startIndex,
                },
                serverId,
            }),
        [serverId],
    );

    const { ensureRange, getItem, totalCount } = useRemoteInfiniteList<AlbumArtist>({
        buildListQueryOptions,
        countQueryOptions,
        pageSize: PAGE_SIZE,
    });

    const getRowData = useCallback(
        (index: number): RowData | undefined => {
            const artist = getItem(index);
            return artist ? artistToRowData(artist) : undefined;
        },
        [getItem],
    );

    const handlePress = useCallback(
        (item: RowData) => {
            navigate(`/artists/${item.id}`);
        },
        [navigate],
    );

    const handleLongPress = useCallback((item: RowData) => {
        setSelectedArtist({ id: item.id, name: item.title });
    }, []);

    const queueActions = useQueueActions({
        id: selectedArtist?.id ?? '',
        itemType: LibraryItem.ARTIST,
        onClose: () => setSelectedArtist(null),
        serverId,
    });

    if (!serverId || !hasLibraryAccess) {
        return (
            <Center h="100%" w="100%">
                <Text isMuted>Connect the Feishin desktop app to browse the library.</Text>
            </Center>
        );
    }

    return (
        <Flex direction="column" h="100%" w="100%">
            <Flex align="center" justify="space-between" px="md" py="sm">
                <Text fw={700} size="lg">
                    Artists
                </Text>
                <ActionIcon
                    onClick={() => setListDisplay('artist', display === 'grid' ? 'list' : 'grid')}
                    variant="default"
                >
                    {display === 'grid' ? (
                        <RiListCheck2 size={20} />
                    ) : (
                        <RiLayoutGridLine size={20} />
                    )}
                </ActionIcon>
            </Flex>
            <Flex direction="column" style={{ flex: 1, minHeight: 0 }}>
                {display === 'grid' ? (
                    <RemoteGrid
                        getItem={getRowData}
                        itemCount={totalCount}
                        onLongPress={handleLongPress}
                        onPress={handlePress}
                        onRangeChanged={({ startIndex, stopIndex }) =>
                            ensureRange(startIndex, stopIndex)
                        }
                        scrollKey="artists"
                        serverId={serverId}
                    />
                ) : (
                    <RemoteList
                        getItem={getRowData}
                        itemCount={totalCount}
                        onLongPress={handleLongPress}
                        onPress={handlePress}
                        onRangeChanged={({ startIndex, stopIndex }) =>
                            ensureRange(startIndex, stopIndex)
                        }
                        scrollKey="artists"
                        serverId={serverId}
                    />
                )}
            </Flex>
            <ActionSheet
                actions={queueActions}
                onClose={() => setSelectedArtist(null)}
                opened={!!selectedArtist}
                title={selectedArtist?.name}
            />
        </Flex>
    );
};
