import { useCallback, useMemo, useRef, useState } from 'react';
import { RiLayoutGridLine, RiListCheck2 } from 'react-icons/ri';
import { useNavigate } from 'react-router';

import { ActionSheet } from '/@/remote/components/action-sheet';
import { AlphaRibbon, RIBBON_COLUMN_WIDTH_PX } from '/@/remote/components/item-list/alpha-ribbon';
import { RemoteGrid } from '/@/remote/components/item-list/remote-grid';
import { RemoteList } from '/@/remote/components/item-list/remote-list';
import { RemoteListHandle, RowData } from '/@/remote/components/item-list/types';
import { useLetterIndex } from '/@/remote/components/item-list/use-letter-index';
import { useQueueActions } from '/@/remote/components/item-list/use-queue-actions';
import { useRemoteInfiniteList } from '/@/remote/components/item-list/use-remote-infinite-list';
import { useHasLibraryAccess, useRemoteListDisplay, useSetListDisplay } from '/@/remote/store';
import { albumQueries } from '/@/renderer/features/albums/api/album-api';
import { useCurrentServerId } from '/@/renderer/store/auth.store';
import { ActionIcon } from '/@/shared/components/action-icon/action-icon';
import { Center } from '/@/shared/components/center/center';
import { Flex } from '/@/shared/components/flex/flex';
import { Text } from '/@/shared/components/text/text';
import { Album, AlbumListSort, LibraryItem, SortOrder } from '/@/shared/types/domain-types';

const PAGE_SIZE = 100;
const RIBBON_MIN_TOTAL_COUNT = 40;

const albumToRowData = (album: Album): RowData => ({
    id: album.id,
    imageId: album.imageId,
    subtitle: album.albumArtistName,
    title: album.name,
});

interface SelectedAlbum {
    id: string;
    name: string;
}

export const AlbumsPage = () => {
    const serverId = useCurrentServerId();
    const hasLibraryAccess = useHasLibraryAccess();
    const display = useRemoteListDisplay('album');
    const setListDisplay = useSetListDisplay();
    const navigate = useNavigate();

    const [selectedAlbum, setSelectedAlbum] = useState<null | SelectedAlbum>(null);

    const countQueryOptions = useMemo(
        () =>
            albumQueries.listCount({
                query: { sortBy: AlbumListSort.NAME, sortOrder: SortOrder.ASC },
                serverId,
            }),
        [serverId],
    );

    const buildListQueryOptions = useCallback(
        (startIndex: number, limit: number) =>
            albumQueries.list({
                query: { limit, sortBy: AlbumListSort.NAME, sortOrder: SortOrder.ASC, startIndex },
                serverId,
            }),
        [serverId],
    );

    const { ensureRange, getItem, totalCount } = useRemoteInfiniteList<Album>({
        buildListQueryOptions,
        countQueryOptions,
        pageSize: PAGE_SIZE,
    });

    const listRef = useRef<RemoteListHandle>(null);

    const { buckets, estimate, resolve } = useLetterIndex<Album>({
        buildProbeQueryOptions: buildListQueryOptions,
        cacheKey: 'albums:name:asc',
        getLoadedItem: getItem,
        getName: (album) => album.name,
        serverId,
        totalCount,
    });

    const getRowData = useCallback(
        (index: number): RowData | undefined => {
            const album = getItem(index);
            return album ? albumToRowData(album) : undefined;
        },
        [getItem],
    );

    const handlePress = useCallback(
        (item: RowData) => {
            navigate(`/albums/${item.id}`);
        },
        [navigate],
    );

    const handleLongPress = useCallback((item: RowData) => {
        setSelectedAlbum({ id: item.id, name: item.title });
    }, []);

    const queueActions = useQueueActions({
        id: selectedAlbum?.id ?? '',
        itemType: LibraryItem.ALBUM,
        onClose: () => setSelectedAlbum(null),
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
                    Albums
                </Text>
                <ActionIcon
                    onClick={() => setListDisplay('album', display === 'grid' ? 'list' : 'grid')}
                    variant="default"
                >
                    {display === 'grid' ? (
                        <RiListCheck2 size={20} />
                    ) : (
                        <RiLayoutGridLine size={20} />
                    )}
                </ActionIcon>
            </Flex>
            <Flex direction="row" style={{ flex: 1, minHeight: 0 }}>
                <Flex direction="column" style={{ flex: 1, minHeight: 0, minWidth: 0 }}>
                    {display === 'grid' ? (
                        <RemoteGrid
                            getItem={getRowData}
                            itemCount={totalCount}
                            onLongPress={handleLongPress}
                            onPress={handlePress}
                            onRangeChanged={({ startIndex, stopIndex }) =>
                                ensureRange(startIndex, stopIndex)
                            }
                            ref={listRef}
                            scrollKey="albums"
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
                            ref={listRef}
                            scrollKey="albums"
                            serverId={serverId}
                        />
                    )}
                </Flex>
                {totalCount > RIBBON_MIN_TOTAL_COUNT && (
                    <div
                        style={{
                            flexShrink: 0,
                            position: 'relative',
                            width: RIBBON_COLUMN_WIDTH_PX,
                        }}
                    >
                        <AlphaRibbon
                            buckets={buckets}
                            estimate={estimate}
                            onScrollToIndex={(index, options) =>
                                listRef.current?.scrollToIndex(index, options)
                            }
                            resolve={resolve}
                        />
                    </div>
                )}
            </Flex>
            <ActionSheet
                actions={queueActions}
                onClose={() => setSelectedAlbum(null)}
                opened={!!selectedAlbum}
                title={selectedAlbum?.name}
            />
        </Flex>
    );
};
