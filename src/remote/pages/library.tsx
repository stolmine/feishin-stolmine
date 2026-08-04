import { keepPreviousData } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ActionSheet } from '/@/remote/components/action-sheet';
import { AlphaRibbon, RIBBON_COLUMN_WIDTH_PX } from '/@/remote/components/item-list/alpha-ribbon';
import { RemoteList } from '/@/remote/components/item-list/remote-list';
import { RemoteListHandle, RowData } from '/@/remote/components/item-list/types';
import { useLetterIndex } from '/@/remote/components/item-list/use-letter-index';
import { useQueueActions } from '/@/remote/components/item-list/use-queue-actions';
import { useRemoteInfiniteList } from '/@/remote/components/item-list/use-remote-infinite-list';
import { PageHeader } from '/@/remote/components/page-header';
import { SortControl } from '/@/remote/components/sort-control';
import { useHasLibraryAccess, useListSort, useSend, useSetSort } from '/@/remote/store';
import { getEffectiveSort, getSongSortOptions } from '/@/remote/utils/sort-options';
import { songsQueries } from '/@/renderer/features/songs/api/songs-api';
import { useCurrentServer, useCurrentServerId } from '/@/renderer/store/auth.store';
import { Center } from '/@/shared/components/center/center';
import { Flex } from '/@/shared/components/flex/flex';
import { Text } from '/@/shared/components/text/text';
import { toast } from '/@/shared/components/toast/toast';
import { LibraryItem, Song, SongListSort, SortOrder } from '/@/shared/types/domain-types';
import { Play } from '/@/shared/types/types';

const PAGE_SIZE = 100;
const RIBBON_MIN_TOTAL_COUNT = 40;

const songToRowData = (song: Song): RowData => ({
    id: song.id,
    imageId: song.imageId,
    subtitle: song.album ? `${song.artistName} — ${song.album}` : song.artistName,
    title: song.name,
});

interface SelectedItem {
    id: string;
    itemType: LibraryItem;
    name: string;
}

export const LibraryPage = () => {
    const serverId = useCurrentServerId();
    const server = useCurrentServer();
    const hasLibraryAccess = useHasLibraryAccess();
    const send = useSend();
    const sort = useListSort('library');
    const setSort = useSetSort();

    const [selectedItem, setSelectedItem] = useState<null | SelectedItem>(null);

    const sortOptions = useMemo(() => getSongSortOptions(server?.type), [server?.type]);

    const effectiveSort = useMemo(
        () => getEffectiveSort(sort, sortOptions, SongListSort.NAME),
        [sort, sortOptions],
    );

    useEffect(() => {
        if (effectiveSort !== sort) {
            setSort('library', effectiveSort);
        }
    }, [effectiveSort, sort, setSort]);

    const countQueryOptions = useMemo(
        () =>
            songsQueries.listCount({
                options: { placeholderData: keepPreviousData },
                query: {
                    sortBy: effectiveSort.sortBy as SongListSort,
                    sortOrder: effectiveSort.sortOrder,
                },
                serverId,
            }),
        [serverId, effectiveSort],
    );

    const buildListQueryOptions = useCallback(
        (startIndex: number, limit: number) =>
            songsQueries.list({
                query: {
                    limit,
                    sortBy: effectiveSort.sortBy as SongListSort,
                    sortOrder: effectiveSort.sortOrder,
                    startIndex,
                },
                serverId,
            }),
        [serverId, effectiveSort],
    );

    const { ensureRange, getItem, totalCount } = useRemoteInfiniteList<Song>({
        buildListQueryOptions,
        countQueryOptions,
        pageSize: PAGE_SIZE,
    });

    const listRef = useRef<RemoteListHandle>(null);

    const isNameAscSort =
        effectiveSort.sortBy === SongListSort.NAME && effectiveSort.sortOrder === SortOrder.ASC;

    const didMountRef = useRef(false);

    useEffect(() => {
        if (!didMountRef.current) {
            didMountRef.current = true;
            return;
        }

        listRef.current?.scrollToOffset(0, { behavior: 'auto' });
    }, [effectiveSort.sortBy, effectiveSort.sortOrder]);

    const { buckets, estimate, resolve } = useLetterIndex<Song>({
        buildProbeQueryOptions: buildListQueryOptions,
        cacheKey: `library:${effectiveSort.sortBy}:${effectiveSort.sortOrder}`,
        enabled: isNameAscSort,
        getLoadedItem: getItem,
        getName: (song) => song.name,
        serverId,
        totalCount,
    });

    const getRowData = useCallback(
        (index: number): RowData | undefined => {
            const song = getItem(index);
            return song ? songToRowData(song) : undefined;
        },
        [getItem],
    );

    const handleSongPress = useCallback(
        (item: RowData) => {
            send({
                event: 'queueAdd',
                ids: [item.id],
                itemType: LibraryItem.SONG,
                playType: Play.NOW,
                serverId,
            });
            toast.success({ message: `Playing "${item.title}"` });
        },
        [send, serverId],
    );

    const handleSongLongPress = useCallback((item: RowData) => {
        setSelectedItem({ id: item.id, itemType: LibraryItem.SONG, name: item.title });
    }, []);

    const queueActions = useQueueActions({
        id: selectedItem?.id ?? '',
        itemType: selectedItem?.itemType ?? LibraryItem.SONG,
        onClose: () => setSelectedItem(null),
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
                    <SortControl
                        onChange={(next) => setSort('library', next)}
                        options={sortOptions}
                        sortBy={effectiveSort.sortBy}
                        sortOrder={effectiveSort.sortOrder}
                    />
                }
                title="Library"
            />
            <Flex direction="row" style={{ flex: 1, minHeight: 0 }}>
                <Flex direction="column" style={{ flex: 1, minHeight: 0, minWidth: 0 }}>
                    <RemoteList
                        getItem={getRowData}
                        itemCount={totalCount}
                        onLongPress={handleSongLongPress}
                        onPress={handleSongPress}
                        onRangeChanged={({ startIndex, stopIndex }) =>
                            ensureRange(startIndex, stopIndex)
                        }
                        ref={listRef}
                        scrollKey={`library:${effectiveSort.sortBy}:${effectiveSort.sortOrder}`}
                        serverId={serverId}
                    />
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
                onClose={() => setSelectedItem(null)}
                opened={!!selectedItem}
                title={selectedItem?.name}
            />
        </Flex>
    );
};
