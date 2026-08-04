import { keepPreviousData } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { PageHeader } from '/@/remote/components/page-header';
import { SortControl } from '/@/remote/components/sort-control';
import {
    useHasLibraryAccess,
    useListSort,
    useRemoteListDisplay,
    useSetListDisplay,
    useSetSort,
} from '/@/remote/store';
import { getAlbumSortOptions, getEffectiveSort } from '/@/remote/utils/sort-options';
import { albumQueries } from '/@/renderer/features/albums/api/album-api';
import { useCurrentServer, useCurrentServerId } from '/@/renderer/store/auth.store';
import { ActionIcon } from '/@/shared/components/action-icon/action-icon';
import { Center } from '/@/shared/components/center/center';
import { Flex } from '/@/shared/components/flex/flex';
import { Text } from '/@/shared/components/text/text';
import { Album, AlbumListSort, LibraryItem, SortOrder } from '/@/shared/types/domain-types';

const PAGE_SIZE = 100;
const RIBBON_MIN_TOTAL_COUNT = 40;

const albumToRowData = (album: Album): RowData => ({
    favorite: album.userFavorite,
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
    const server = useCurrentServer();
    const hasLibraryAccess = useHasLibraryAccess();
    const display = useRemoteListDisplay('album');
    const setListDisplay = useSetListDisplay();
    const sort = useListSort('album');
    const setSort = useSetSort();
    const navigate = useNavigate();

    const [selectedAlbum, setSelectedAlbum] = useState<null | SelectedAlbum>(null);

    const sortOptions = useMemo(() => getAlbumSortOptions(server?.type), [server?.type]);

    const effectiveSort = useMemo(
        () => getEffectiveSort(sort, sortOptions, AlbumListSort.NAME),
        [sort, sortOptions],
    );

    useEffect(() => {
        if (effectiveSort !== sort) {
            setSort('album', effectiveSort);
        }
    }, [effectiveSort, sort, setSort]);

    const countQueryOptions = useMemo(
        () =>
            albumQueries.listCount({
                options: { placeholderData: keepPreviousData },
                query: {
                    sortBy: effectiveSort.sortBy as AlbumListSort,
                    sortOrder: effectiveSort.sortOrder,
                },
                serverId,
            }),
        [serverId, effectiveSort],
    );

    const buildListQueryOptions = useCallback(
        (startIndex: number, limit: number) =>
            albumQueries.list({
                query: {
                    limit,
                    sortBy: effectiveSort.sortBy as AlbumListSort,
                    sortOrder: effectiveSort.sortOrder,
                    startIndex,
                },
                serverId,
            }),
        [serverId, effectiveSort],
    );

    const { ensureRange, getItem, totalCount } = useRemoteInfiniteList<Album>({
        buildListQueryOptions,
        countQueryOptions,
        pageSize: PAGE_SIZE,
    });

    const listRef = useRef<RemoteListHandle>(null);

    const isNameAscSort =
        effectiveSort.sortBy === AlbumListSort.NAME && effectiveSort.sortOrder === SortOrder.ASC;

    const didMountRef = useRef(false);

    useEffect(() => {
        if (!didMountRef.current) {
            didMountRef.current = true;
            return;
        }

        listRef.current?.scrollToOffset(0, { behavior: 'auto' });
    }, [effectiveSort.sortBy, effectiveSort.sortOrder]);

    const { buckets, estimate, resolve } = useLetterIndex<Album>({
        buildProbeQueryOptions: buildListQueryOptions,
        cacheKey: `albums:${effectiveSort.sortBy}:${effectiveSort.sortOrder}`,
        enabled: isNameAscSort,
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
            <PageHeader
                actions={
                    <>
                        <SortControl
                            onChange={(next) => setSort('album', next)}
                            options={sortOptions}
                            sortBy={effectiveSort.sortBy}
                            sortOrder={effectiveSort.sortOrder}
                        />
                        <ActionIcon
                            onClick={() =>
                                setListDisplay('album', display === 'grid' ? 'list' : 'grid')
                            }
                            size="md"
                            variant="default"
                        >
                            {display === 'grid' ? (
                                <RiListCheck2 size={20} />
                            ) : (
                                <RiLayoutGridLine size={20} />
                            )}
                        </ActionIcon>
                    </>
                }
                title="Albums"
            />
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
                            scrollKey={`albums:${effectiveSort.sortBy}:${effectiveSort.sortOrder}`}
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
                            scrollKey={`albums:${effectiveSort.sortBy}:${effectiveSort.sortOrder}`}
                            serverId={serverId}
                        />
                    )}
                </Flex>
                {totalCount > RIBBON_MIN_TOTAL_COUNT && isNameAscSort && (
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
