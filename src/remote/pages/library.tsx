import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RiArrowRightSLine } from 'react-icons/ri';
import { useNavigate } from 'react-router';

import { ActionSheet } from '/@/remote/components/action-sheet';
import { AlphaRibbon, RIBBON_COLUMN_WIDTH_PX } from '/@/remote/components/item-list/alpha-ribbon';
import { CoverImage } from '/@/remote/components/item-list/cover-image';
import { RemoteList } from '/@/remote/components/item-list/remote-list';
import { RemoteListHandle, RowData } from '/@/remote/components/item-list/types';
import { useLetterIndex } from '/@/remote/components/item-list/use-letter-index';
import { useLongPress } from '/@/remote/components/item-list/use-long-press';
import { useQueueActions } from '/@/remote/components/item-list/use-queue-actions';
import { useRemoteInfiniteList } from '/@/remote/components/item-list/use-remote-infinite-list';
import { useHasLibraryAccess, useSend } from '/@/remote/store';
import { searchQueries } from '/@/renderer/features/search/api/search-api';
import { songsQueries } from '/@/renderer/features/songs/api/songs-api';
import { useCurrentServerId } from '/@/renderer/store/auth.store';
import { Center } from '/@/shared/components/center/center';
import { Flex } from '/@/shared/components/flex/flex';
import { Stack } from '/@/shared/components/stack/stack';
import { TextInput } from '/@/shared/components/text-input/text-input';
import { Text } from '/@/shared/components/text/text';
import { toast } from '/@/shared/components/toast/toast';
import {
    Album,
    AlbumArtist,
    LibraryItem,
    Song,
    SongListSort,
    SortOrder,
} from '/@/shared/types/domain-types';
import { Play } from '/@/shared/types/types';

const PAGE_SIZE = 100;
const RIBBON_MIN_TOTAL_COUNT = 40;
const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_SONG_LIMIT = 20;
const SEARCH_ALBUM_LIMIT = 10;
const SEARCH_ARTIST_LIMIT = 10;

const songToRowData = (song: Song): RowData => ({
    id: song.id,
    imageId: song.imageId,
    subtitle: song.album ? `${song.artistName} — ${song.album}` : song.artistName,
    title: song.name,
});

const albumToRowData = (album: Album): RowData => ({
    id: album.id,
    imageId: album.imageId,
    subtitle: album.albumArtistName,
    title: album.name,
});

const artistToRowData = (artist: AlbumArtist): RowData => ({
    id: artist.id,
    imageId: artist.imageId,
    subtitle:
        artist.albumCount != null
            ? `${artist.albumCount} album${artist.albumCount === 1 ? '' : 's'}`
            : undefined,
    title: artist.name,
});

interface SelectedItem {
    id: string;
    itemType: LibraryItem;
    name: string;
}

const SearchResultRow = ({
    itemType,
    onLongPress,
    onPress,
    row,
    serverId,
}: {
    itemType: LibraryItem;
    onLongPress: (row: RowData) => void;
    onPress: (row: RowData) => void;
    row: RowData;
    serverId: string;
}) => {
    const longPress = useLongPress({
        onLongPress: () => onLongPress(row),
        onPress: () => onPress(row),
    });

    return (
        <div
            onClick={longPress.onClick}
            onContextMenu={longPress.onContextMenu}
            onPointerCancel={longPress.onPointerCancel}
            onPointerDown={longPress.onPointerDown}
            onPointerMove={longPress.onPointerMove}
            onPointerUp={longPress.onPointerUp}
            style={{
                alignItems: 'center',
                cursor: 'pointer',
                display: 'flex',
                gap: 12,
                padding: '8px 12px',
                touchAction: 'pan-y',
                userSelect: 'none',
                WebkitTouchCallout: 'none',
            }}
        >
            <CoverImage imageId={row.imageId} itemType={itemType} serverId={serverId} size={48} />
            <div style={{ flex: 1, minWidth: 0 }}>
                <Text fw={500} lineClamp={1}>
                    {row.title}
                </Text>
                {row.subtitle && (
                    <Text isMuted lineClamp={1} size="sm">
                        {row.subtitle}
                    </Text>
                )}
            </div>
            <RiArrowRightSLine color="var(--theme-colors-foreground-muted)" size={20} />
        </div>
    );
};

export const LibraryPage = () => {
    const serverId = useCurrentServerId();
    const hasLibraryAccess = useHasLibraryAccess();
    const send = useSend();
    const navigate = useNavigate();

    const [searchInput, setSearchInput] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedItem, setSelectedItem] = useState<null | SelectedItem>(null);

    useEffect(() => {
        const handle = setTimeout(() => setSearchTerm(searchInput.trim()), SEARCH_DEBOUNCE_MS);
        return () => clearTimeout(handle);
    }, [searchInput]);

    const isSearching = searchTerm.length > 0;

    const countQueryOptions = useMemo(
        () =>
            songsQueries.listCount({
                query: { sortBy: SongListSort.NAME, sortOrder: SortOrder.ASC },
                serverId,
            }),
        [serverId],
    );

    const buildListQueryOptions = useCallback(
        (startIndex: number, limit: number) =>
            songsQueries.list({
                query: { limit, sortBy: SongListSort.NAME, sortOrder: SortOrder.ASC, startIndex },
                serverId,
            }),
        [serverId],
    );

    const { ensureRange, getItem, totalCount } = useRemoteInfiniteList<Song>({
        buildListQueryOptions,
        countQueryOptions,
        pageSize: PAGE_SIZE,
    });

    const listRef = useRef<RemoteListHandle>(null);

    const { buckets, estimate, resolve } = useLetterIndex<Song>({
        buildProbeQueryOptions: buildListQueryOptions,
        cacheKey: 'library:name:asc',
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

    const { data: searchResult, isLoading: isSearchLoading } = useQuery({
        ...searchQueries.search({
            query: {
                albumArtistLimit: SEARCH_ARTIST_LIMIT,
                albumArtistStartIndex: 0,
                albumLimit: SEARCH_ALBUM_LIMIT,
                albumStartIndex: 0,
                query: searchTerm,
                songLimit: SEARCH_SONG_LIMIT,
                songStartIndex: 0,
            },
            serverId,
        }),
        enabled: isSearching && !!serverId,
    });

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

    const handleAlbumPress = useCallback(
        (item: RowData) => {
            navigate(`/albums/${item.id}`);
        },
        [navigate],
    );

    const handleAlbumLongPress = useCallback((item: RowData) => {
        setSelectedItem({ id: item.id, itemType: LibraryItem.ALBUM, name: item.title });
    }, []);

    const handleArtistPress = useCallback(
        (item: RowData) => {
            navigate(`/artists/${item.id}`);
        },
        [navigate],
    );

    const handleArtistLongPress = useCallback((item: RowData) => {
        setSelectedItem({ id: item.id, itemType: LibraryItem.ARTIST, name: item.title });
    }, []);

    const queueActions = useQueueActions({
        id: selectedItem?.id ?? '',
        itemType: selectedItem?.itemType ?? LibraryItem.SONG,
        onClose: () => setSelectedItem(null),
        serverId,
    });

    const searchSongs = useMemo(() => searchResult?.songs ?? [], [searchResult]);
    const searchAlbums = useMemo(() => searchResult?.albums ?? [], [searchResult]);
    const searchArtists = useMemo(() => searchResult?.albumArtists ?? [], [searchResult]);

    if (!serverId || !hasLibraryAccess) {
        return (
            <Center h="100%" w="100%">
                <Text isMuted>Connect the Feishin desktop app to browse the library.</Text>
            </Center>
        );
    }

    return (
        <Flex direction="column" h="100%" w="100%">
            <Stack gap="sm" px="md" py="sm">
                <Text fw={700} size="lg">
                    Library
                </Text>
                <TextInput
                    onChange={(event) => setSearchInput(event.currentTarget.value)}
                    placeholder="Search songs, albums, artists"
                    value={searchInput}
                />
            </Stack>
            <Flex
                direction="column"
                style={{
                    flex: 1,
                    minHeight: 0,
                }}
            >
                {!isSearching ? (
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
                                scrollKey="library"
                                serverId={serverId}
                            />
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
                ) : isSearchLoading ? (
                    <Center h="100%" w="100%">
                        <Text isMuted>Searching…</Text>
                    </Center>
                ) : (
                    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                        {searchSongs.length > 0 && (
                            <Stack gap={4} pb="sm">
                                <Text fw={600} px="md" size="sm">
                                    Songs
                                </Text>
                                {searchSongs.map((song) => (
                                    <SearchResultRow
                                        itemType={LibraryItem.SONG}
                                        key={song.id}
                                        onLongPress={handleSongLongPress}
                                        onPress={handleSongPress}
                                        row={songToRowData(song)}
                                        serverId={serverId}
                                    />
                                ))}
                            </Stack>
                        )}
                        {searchAlbums.length > 0 && (
                            <Stack gap={4} pb="sm">
                                <Text fw={600} px="md" size="sm">
                                    Albums
                                </Text>
                                {searchAlbums.map((album) => (
                                    <SearchResultRow
                                        itemType={LibraryItem.ALBUM}
                                        key={album.id}
                                        onLongPress={handleAlbumLongPress}
                                        onPress={handleAlbumPress}
                                        row={albumToRowData(album)}
                                        serverId={serverId}
                                    />
                                ))}
                            </Stack>
                        )}
                        {searchArtists.length > 0 && (
                            <Stack gap={4} pb="sm">
                                <Text fw={600} px="md" size="sm">
                                    Artists
                                </Text>
                                {searchArtists.map((artist) => (
                                    <SearchResultRow
                                        itemType={LibraryItem.ARTIST}
                                        key={artist.id}
                                        onLongPress={handleArtistLongPress}
                                        onPress={handleArtistPress}
                                        row={artistToRowData(artist)}
                                        serverId={serverId}
                                    />
                                ))}
                            </Stack>
                        )}
                        {searchSongs.length === 0 &&
                            searchAlbums.length === 0 &&
                            searchArtists.length === 0 && (
                                <Center h="100%" w="100%">
                                    <Text isMuted>No results</Text>
                                </Center>
                            )}
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
