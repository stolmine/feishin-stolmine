import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { RiPlayFill, RiShuffleLine } from 'react-icons/ri';
import { useParams } from 'react-router';

import { ActionSheet } from '/@/remote/components/action-sheet';
import { CoverImage } from '/@/remote/components/item-list/cover-image';
import { RemoteList } from '/@/remote/components/item-list/remote-list';
import { RowData } from '/@/remote/components/item-list/types';
import { useQueueActions } from '/@/remote/components/item-list/use-queue-actions';
import { useSend } from '/@/remote/store';
import { playlistsQueries } from '/@/renderer/features/playlists/api/playlists-api';
import { useCurrentServerId } from '/@/renderer/store/auth.store';
import { Button } from '/@/shared/components/button/button';
import { Center } from '/@/shared/components/center/center';
import { Flex } from '/@/shared/components/flex/flex';
import { Group } from '/@/shared/components/group/group';
import { Spinner } from '/@/shared/components/spinner/spinner';
import { Stack } from '/@/shared/components/stack/stack';
import { Text } from '/@/shared/components/text/text';
import { toast } from '/@/shared/components/toast/toast';
import { LibraryItem, Song } from '/@/shared/types/domain-types';
import { Play } from '/@/shared/types/types';

const songToRowData = (song: Song): RowData => ({
    favorite: song.userFavorite,
    id: song.id,
    imageId: song.imageId,
    subtitle: song.artistName,
    title: song.name,
});

export const PlaylistDetailPage = () => {
    const { id } = useParams<{ id: string }>();
    const serverId = useCurrentServerId();
    const send = useSend();

    const [selectedSong, setSelectedSong] = useState<null | Song>(null);

    const { data: playlist, isLoading: isPlaylistLoading } = useQuery({
        ...playlistsQueries.detail({ query: { id: id ?? '' }, serverId }),
        enabled: !!id && !!serverId,
    });

    const { data: songsResult, isLoading: isSongsLoading } = useQuery({
        ...playlistsQueries.songList({ query: { id: id ?? '' }, serverId }),
        enabled: !!id && !!serverId,
    });

    const songs = useMemo(() => songsResult?.items ?? [], [songsResult]);

    const getRowData = useCallback(
        (index: number): RowData | undefined => {
            const song = songs[index];
            return song ? songToRowData(song) : undefined;
        },
        [songs],
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

    const handleSongLongPress = useCallback(
        (item: RowData) => {
            const song = songs.find((s) => s.id === item.id);
            if (song) setSelectedSong(song);
        },
        [songs],
    );

    const queueActions = useQueueActions({
        id: selectedSong?.id ?? '',
        itemType: LibraryItem.SONG,
        onClose: () => setSelectedSong(null),
        serverId,
    });

    const playPlaylist = useCallback(
        (playType: Play) => {
            if (!id) return;
            send({
                event: 'queueAdd',
                ids: [id],
                itemType: LibraryItem.PLAYLIST,
                playType,
                serverId,
            });
            toast.success({
                message: playType === Play.SHUFFLE ? 'Shuffling playlist' : 'Playing playlist',
            });
        },
        [id, send, serverId],
    );

    const subtitleParts = useMemo(() => {
        if (!playlist) return [];
        const parts: string[] = [];
        if (playlist.owner) parts.push(playlist.owner);
        if (playlist.songCount) parts.push(`${playlist.songCount} tracks`);
        return parts;
    }, [playlist]);

    if (isPlaylistLoading || !playlist) {
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
                        imageId={playlist.imageId}
                        itemType={LibraryItem.PLAYLIST}
                        serverId={serverId}
                        size={96}
                    />
                    <Stack gap={4} style={{ minWidth: 0 }}>
                        <Text fw={700} lineClamp={2} size="lg">
                            {playlist.name}
                        </Text>
                        <Text isMuted lineClamp={2} size="sm">
                            {subtitleParts.join(' · ')}
                        </Text>
                    </Stack>
                </Group>
                <Group gap="sm" grow>
                    <Button
                        leftSection={<RiPlayFill size={18} />}
                        onClick={() => playPlaylist(Play.NOW)}
                    >
                        Play
                    </Button>
                    <Button
                        leftSection={<RiShuffleLine size={18} />}
                        onClick={() => playPlaylist(Play.SHUFFLE)}
                        variant="default"
                    >
                        Shuffle
                    </Button>
                </Group>
            </Stack>
            <Flex direction="column" style={{ flex: 1, minHeight: 0 }}>
                {isSongsLoading ? (
                    <Center h="100%" w="100%">
                        <Spinner container />
                    </Center>
                ) : (
                    <RemoteList
                        getItem={getRowData}
                        itemCount={songs.length}
                        onLongPress={handleSongLongPress}
                        onPress={handleSongPress}
                        serverId={serverId}
                    />
                )}
            </Flex>
            <ActionSheet
                actions={queueActions}
                onClose={() => setSelectedSong(null)}
                opened={!!selectedSong}
                title={selectedSong?.name}
            />
        </Flex>
    );
};
