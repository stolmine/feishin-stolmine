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
import { playlistsQueries } from '/@/renderer/features/playlists/api/playlists-api';
import { useCurrentServerId } from '/@/renderer/store/auth.store';
import { ActionIcon } from '/@/shared/components/action-icon/action-icon';
import { Center } from '/@/shared/components/center/center';
import { Flex } from '/@/shared/components/flex/flex';
import { Text } from '/@/shared/components/text/text';
import { LibraryItem, Playlist, PlaylistListSort, SortOrder } from '/@/shared/types/domain-types';

const PAGE_SIZE = 100;
const RIBBON_MIN_TOTAL_COUNT = 40;

const playlistToRowData = (playlist: Playlist): RowData => ({
    id: playlist.id,
    imageId: playlist.imageId,
    subtitle:
        playlist.songCount != null
            ? `${playlist.songCount} track${playlist.songCount === 1 ? '' : 's'}`
            : undefined,
    title: playlist.name,
});

interface SelectedPlaylist {
    id: string;
    name: string;
}

export const PlaylistsPage = () => {
    const serverId = useCurrentServerId();
    const hasLibraryAccess = useHasLibraryAccess();
    const display = useRemoteListDisplay('playlist');
    const setListDisplay = useSetListDisplay();
    const navigate = useNavigate();

    const [selectedPlaylist, setSelectedPlaylist] = useState<null | SelectedPlaylist>(null);

    const countQueryOptions = useMemo(
        () =>
            playlistsQueries.listCount({
                query: { sortBy: PlaylistListSort.NAME, sortOrder: SortOrder.ASC },
                serverId,
            }),
        [serverId],
    );

    const buildListQueryOptions = useCallback(
        (startIndex: number, limit: number) =>
            playlistsQueries.list({
                query: {
                    limit,
                    sortBy: PlaylistListSort.NAME,
                    sortOrder: SortOrder.ASC,
                    startIndex,
                },
                serverId,
            }),
        [serverId],
    );

    const { ensureRange, getItem, totalCount } = useRemoteInfiniteList<Playlist>({
        buildListQueryOptions,
        countQueryOptions,
        pageSize: PAGE_SIZE,
    });

    const listRef = useRef<RemoteListHandle>(null);

    const { buckets, estimate, resolve } = useLetterIndex<Playlist>({
        buildProbeQueryOptions: buildListQueryOptions,
        cacheKey: 'playlists:name:asc',
        getLoadedItem: getItem,
        getName: (playlist) => playlist.name,
        serverId,
        totalCount,
    });

    const getRowData = useCallback(
        (index: number): RowData | undefined => {
            const playlist = getItem(index);
            return playlist ? playlistToRowData(playlist) : undefined;
        },
        [getItem],
    );

    const handlePress = useCallback(
        (item: RowData) => {
            navigate(`/playlists/${item.id}`);
        },
        [navigate],
    );

    const handleLongPress = useCallback((item: RowData) => {
        setSelectedPlaylist({ id: item.id, name: item.title });
    }, []);

    const queueActions = useQueueActions({
        id: selectedPlaylist?.id ?? '',
        itemType: LibraryItem.PLAYLIST,
        onClose: () => setSelectedPlaylist(null),
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
                    Playlists
                </Text>
                <ActionIcon
                    onClick={() => setListDisplay('playlist', display === 'grid' ? 'list' : 'grid')}
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
                            scrollKey="playlists"
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
                            scrollKey="playlists"
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
                onClose={() => setSelectedPlaylist(null)}
                opened={!!selectedPlaylist}
                title={selectedPlaylist?.name}
            />
        </Flex>
    );
};
