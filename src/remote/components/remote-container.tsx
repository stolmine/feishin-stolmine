import formatDuration from 'format-duration';
import { CSSProperties } from 'react';
import { RiPauseFill, RiPlayFill, RiVolumeUpFill } from 'react-icons/ri';
import { useNavigate } from 'react-router';

import { PlayerImage } from '/@/remote/components/player-image';
import { WrappedSlider } from '/@/remote/components/wrapped-slider';
import { useInfo, useSend, useShowImage } from '/@/remote/store';
import { ActionIcon } from '/@/shared/components/action-icon/action-icon';
import { Flex } from '/@/shared/components/flex/flex';
import { Group } from '/@/shared/components/group/group';
import { Stack } from '/@/shared/components/stack/stack';
import { Text } from '/@/shared/components/text/text';
import { PlayerRepeat, PlayerStatus } from '/@/shared/types/types';

const ellipsis: CSSProperties = {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
};

export const RemoteContainer = () => {
    const { position, repeat, shuffle, song, status, volume } = useInfo();
    const send = useSend();
    const showImage = useShowImage();
    const navigate = useNavigate();

    const id = song?.id;
    // `/artists/:id` renders the album-artist detail page, so prefer the
    // album-artist id over the (possibly featured/track-only) track artist
    // id, and skip empty-string ids so an empty page can't be linked to.
    const artistId = [song?.albumArtists?.[0]?.id, song?.artists?.[0]?.id].find(
        (candidate): candidate is string => Boolean(candidate),
    );

    return (
        <Stack gap="md" h="100%" px="lg" py="sm" style={{ overflow: 'hidden' }} w="100%">
            {showImage ? (
                <Flex
                    align="center"
                    justify="center"
                    py="xs"
                    style={{ flex: '1 1 0', minHeight: 0 }}
                    w="100%"
                >
                    <PlayerImage src={song?.imageUrl} />
                </Flex>
            ) : (
                <div style={{ flex: '1 1 0' }} />
            )}
            {id && position !== undefined && (
                <WrappedSlider
                    label={(value) => formatDuration(value * 1e3)}
                    leftLabel={formatDuration(position * 1e3)}
                    max={song.duration / 1e3}
                    onChangeEnd={(e) => send({ event: 'position', position: e })}
                    rightLabel={formatDuration(song.duration)}
                    value={position}
                />
            )}
            {id && (
                <Stack gap={4} px="sm" style={{ flexShrink: 0 }} w="100%">
                    <Text
                        fw={700}
                        style={{ ...ellipsis, fontSize: '1.375rem', lineHeight: 1.3 }}
                        ta="center"
                    >
                        {song.name}
                    </Text>
                    <Group gap={6} justify="center" mt={2} style={{ minWidth: 0 }} wrap="nowrap">
                        <Text
                            component="span"
                            fw={500}
                            isLink={Boolean(artistId)}
                            onClick={artistId ? () => navigate(`/artists/${artistId}`) : undefined}
                            overflow="hidden"
                            size="md"
                            style={{ flexShrink: 1, minWidth: 0 }}
                        >
                            {song.artistName}
                        </Text>
                        {song.album && (
                            <>
                                <Text component="span" isMuted size="md">
                                    ·
                                </Text>
                                <Text
                                    component="span"
                                    isLink={Boolean(song.albumId)}
                                    isMuted
                                    onClick={
                                        song.albumId
                                            ? () => navigate(`/albums/${song.albumId}`)
                                            : undefined
                                    }
                                    overflow="hidden"
                                    size="md"
                                    style={{ flexShrink: 1, minWidth: 0 }}
                                >
                                    {song.album}
                                </Text>
                            </>
                        )}
                    </Group>
                </Stack>
            )}
            <Group gap="sm" justify="center" style={{ flexShrink: 0 }} wrap="nowrap">
                <ActionIcon
                    icon="mediaShuffle"
                    iconProps={{
                        fill: shuffle ? 'primary' : 'default',
                        size: 26,
                    }}
                    onClick={() => send({ event: 'shuffle' })}
                    size="lg"
                    tooltip={{
                        label: shuffle ? 'Shuffle tracks' : 'Shuffle disabled',
                    }}
                    variant="subtle"
                />
                <ActionIcon
                    disabled={!id}
                    icon="mediaPrevious"
                    iconProps={{
                        fill: 'default',
                        size: 30,
                    }}
                    onClick={() => send({ event: 'previous' })}
                    size="xl"
                    tooltip={{
                        label: 'Previous track',
                    }}
                    variant="subtle"
                />
                <ActionIcon
                    disabled={!id}
                    onClick={() => {
                        if (status === PlayerStatus.PLAYING) {
                            send({ event: 'pause' });
                        } else {
                            send({ event: 'play' });
                        }
                    }}
                    size={64}
                    style={{
                        backgroundColor: 'var(--theme-colors-foreground)',
                        borderRadius: '50%',
                        boxShadow: '0 6px 18px rgb(0 0 0 / 25%)',
                        color: 'var(--theme-colors-background)',
                    }}
                    tooltip={{
                        label: id && status === PlayerStatus.PLAYING ? 'Pause' : 'Play',
                    }}
                    variant="transparent"
                >
                    {id && status === PlayerStatus.PLAYING ? (
                        <RiPauseFill size={30} />
                    ) : (
                        <RiPlayFill size={30} style={{ transform: 'translateX(-2px)' }} />
                    )}
                </ActionIcon>
                <ActionIcon
                    disabled={!id}
                    icon="mediaNext"
                    iconProps={{
                        fill: 'default',
                        size: 30,
                    }}
                    onClick={() => send({ event: 'next' })}
                    size="xl"
                    tooltip={{
                        label: 'Next track',
                    }}
                    variant="subtle"
                />
                <ActionIcon
                    icon={
                        repeat === undefined || repeat === PlayerRepeat.ONE
                            ? 'mediaRepeatOne'
                            : 'mediaRepeat'
                    }
                    iconProps={{
                        fill:
                            repeat !== undefined && repeat !== PlayerRepeat.NONE
                                ? 'primary'
                                : 'default',
                        size: 26,
                    }}
                    onClick={() => send({ event: 'repeat' })}
                    size="lg"
                    tooltip={{
                        label: `Repeat ${
                            repeat === PlayerRepeat.ONE
                                ? 'One'
                                : repeat === PlayerRepeat.ALL
                                  ? 'all'
                                  : 'none'
                        }`,
                    }}
                    variant="subtle"
                />
            </Group>
            <Stack gap={6} pb="xs" style={{ flexShrink: 0 }} w="100%">
                <WrappedSlider
                    leftLabel={<RiVolumeUpFill size={20} />}
                    max={100}
                    onChangeEnd={(e) => send({ event: 'volume', volume: e })}
                    rightLabel={volume ?? 0}
                    value={volume ?? 0}
                />
            </Stack>
        </Stack>
    );
};
