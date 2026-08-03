import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { RiPlayFill, RiShuffleLine } from 'react-icons/ri';
import { useNavigate, useParams } from 'react-router';

import { ActionSheet } from '/@/remote/components/action-sheet';
import { CoverImage } from '/@/remote/components/item-list/cover-image';
import { RemoteGrid } from '/@/remote/components/item-list/remote-grid';
import { RowData } from '/@/remote/components/item-list/types';
import { useQueueActions } from '/@/remote/components/item-list/use-queue-actions';
import { useSend } from '/@/remote/store';
import { albumQueries } from '/@/renderer/features/albums/api/album-api';
import { artistsQueries } from '/@/renderer/features/artists/api/artists-api';
import { useCurrentServerId } from '/@/renderer/store/auth.store';
import { Button } from '/@/shared/components/button/button';
import { Center } from '/@/shared/components/center/center';
import { Flex } from '/@/shared/components/flex/flex';
import { Group } from '/@/shared/components/group/group';
import { Spinner } from '/@/shared/components/spinner/spinner';
import { Stack } from '/@/shared/components/stack/stack';
import { Text } from '/@/shared/components/text/text';
import { toast } from '/@/shared/components/toast/toast';
import { Album, AlbumListSort, LibraryItem, SortOrder } from '/@/shared/types/domain-types';
import { Play } from '/@/shared/types/types';

const albumToRowData = (album: Album): RowData => ({
    id: album.id,
    imageId: album.imageId,
    subtitle: album.releaseYear ? String(album.releaseYear) : undefined,
    title: album.name,
});

interface SelectedAlbum {
    id: string;
    name: string;
}

export const ArtistDetailPage = () => {
    const { id } = useParams<{ id: string }>();
    const serverId = useCurrentServerId();
    const send = useSend();
    const navigate = useNavigate();

    const [selectedAlbum, setSelectedAlbum] = useState<null | SelectedAlbum>(null);

    const { data: artist, isLoading: isArtistLoading } = useQuery({
        ...artistsQueries.albumArtistDetail({ query: { id: id ?? '' }, serverId }),
        enabled: !!id && !!serverId,
    });

    const { data: albumsResult, isLoading: isAlbumsLoading } = useQuery({
        ...albumQueries.list({
            query: {
                artistIds: id ? [id] : [],
                limit: -1,
                sortBy: AlbumListSort.YEAR,
                sortOrder: SortOrder.DESC,
                startIndex: 0,
            },
            serverId,
        }),
        enabled: !!id && !!serverId,
    });

    const albums = useMemo(() => albumsResult?.items ?? [], [albumsResult]);

    const getRowData = useCallback(
        (index: number): RowData | undefined => {
            const album = albums[index];
            return album ? albumToRowData(album) : undefined;
        },
        [albums],
    );

    const handleAlbumPress = useCallback(
        (item: RowData) => {
            navigate(`/albums/${item.id}`);
        },
        [navigate],
    );

    const handleAlbumLongPress = useCallback((item: RowData) => {
        setSelectedAlbum({ id: item.id, name: item.title });
    }, []);

    const queueActions = useQueueActions({
        id: selectedAlbum?.id ?? '',
        itemType: LibraryItem.ALBUM,
        onClose: () => setSelectedAlbum(null),
        serverId,
    });

    const playArtist = useCallback(
        (playType: Play) => {
            if (!id) return;
            send({
                event: 'queueAdd',
                ids: [id],
                itemType: LibraryItem.ARTIST,
                playType,
                serverId,
            });
            toast.success({
                message: playType === Play.SHUFFLE ? 'Shuffling artist' : 'Playing artist',
            });
        },
        [id, send, serverId],
    );

    const subtitleParts = useMemo(() => {
        if (!artist) return [];
        const parts: string[] = [];
        if (artist.albumCount) parts.push(`${artist.albumCount} albums`);
        if (artist.songCount) parts.push(`${artist.songCount} songs`);
        return parts;
    }, [artist]);

    if (isArtistLoading || !artist) {
        return (
            <Center h="100%" w="100%">
                <Spinner container />
            </Center>
        );
    }

    return (
        <Flex direction="column" h="100%" w="100%">
            <Stack gap="sm" p="md">
                <Group align="flex-start" gap="md" wrap="nowrap">
                    <CoverImage
                        borderRadius={8}
                        imageId={artist.imageId}
                        itemType={LibraryItem.ARTIST}
                        serverId={serverId}
                        size={96}
                    />
                    <Stack gap={4} style={{ minWidth: 0 }}>
                        <Text fw={700} lineClamp={2} size="lg">
                            {artist.name}
                        </Text>
                        <Text isMuted lineClamp={2} size="sm">
                            {subtitleParts.join(' · ')}
                        </Text>
                    </Stack>
                </Group>
                <Group gap="sm" grow>
                    <Button
                        leftSection={<RiPlayFill size={18} />}
                        onClick={() => playArtist(Play.NOW)}
                    >
                        Play
                    </Button>
                    <Button
                        leftSection={<RiShuffleLine size={18} />}
                        onClick={() => playArtist(Play.SHUFFLE)}
                        variant="default"
                    >
                        Shuffle
                    </Button>
                </Group>
            </Stack>
            <Flex direction="column" style={{ flex: 1, minHeight: 0 }}>
                {isAlbumsLoading ? (
                    <Center h="100%" w="100%">
                        <Spinner container />
                    </Center>
                ) : (
                    <RemoteGrid
                        getItem={getRowData}
                        itemCount={albums.length}
                        onLongPress={handleAlbumLongPress}
                        onPress={handleAlbumPress}
                        serverId={serverId}
                    />
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
