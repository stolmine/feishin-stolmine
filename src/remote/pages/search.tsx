import { UnstyledButton } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RiCloseLine } from 'react-icons/ri';
import { useNavigate } from 'react-router';

import { ActionSheet } from '/@/remote/components/action-sheet';
import { RowData } from '/@/remote/components/item-list/types';
import { useQueueActions } from '/@/remote/components/item-list/use-queue-actions';
import { PageHeader } from '/@/remote/components/page-header';
import { SearchCarousels } from '/@/remote/components/search-carousel/search-carousels';
import { SearchResultRow } from '/@/remote/components/search-result-row';
import { useHasLibraryAccess, useSend } from '/@/remote/store';
import { searchQueries } from '/@/renderer/features/search/api/search-api';
import { useCurrentServerId } from '/@/renderer/store/auth.store';
import { Center } from '/@/shared/components/center/center';
import { Flex } from '/@/shared/components/flex/flex';
import { Stack } from '/@/shared/components/stack/stack';
import { TextInput } from '/@/shared/components/text-input/text-input';
import { Text } from '/@/shared/components/text/text';
import { toast } from '/@/shared/components/toast/toast';
import { Album, AlbumArtist, LibraryItem, Song } from '/@/shared/types/domain-types';
import { Play } from '/@/shared/types/types';

const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_SONG_LIMIT = 20;
const SEARCH_ALBUM_LIMIT = 10;
const SEARCH_ARTIST_LIMIT = 10;

const songToRowData = (song: Song): RowData => ({
    favorite: song.userFavorite,
    id: song.id,
    imageId: song.imageId,
    showChevron: false,
    subtitle: song.album ? `${song.artistName} — ${song.album}` : song.artistName,
    title: song.name,
});

const albumToRowData = (album: Album): RowData => ({
    favorite: album.userFavorite,
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

export const SearchPage = () => {
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

    const handleCarouselAlbumPress = useCallback(
        (album: Album) => {
            navigate(`/albums/${album.id}`);
        },
        [navigate],
    );

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
            <PageHeader title="Search" />
            <Stack gap="sm" pb="sm" px="md" style={{ flexShrink: 0 }}>
                <TextInput
                    onChange={(event) => setSearchInput(event.currentTarget.value)}
                    placeholder="Search songs, albums, artists"
                    rightSection={
                        searchInput ? (
                            <UnstyledButton
                                aria-label="Clear search"
                                onClick={() => setSearchInput('')}
                                style={{ alignItems: 'center', display: 'flex' }}
                            >
                                <RiCloseLine
                                    color="var(--theme-colors-foreground-muted)"
                                    size={18}
                                />
                            </UnstyledButton>
                        ) : undefined
                    }
                    rightSectionPointerEvents="auto"
                    // 16px input font prevents iOS Safari from auto-zooming on focus.
                    styles={{ input: { fontSize: '16px' } }}
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
                    <SearchCarousels onAlbumPress={handleCarouselAlbumPress} serverId={serverId} />
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
