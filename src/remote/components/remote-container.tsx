import formatDuration from 'format-duration';
import debounce from 'lodash/debounce';
import { CSSProperties, useCallback } from 'react';
import { RiPauseFill, RiPlayFill, RiVolumeUpFill } from 'react-icons/ri';

import { PlayerImage } from '/@/remote/components/player-image';
import { WrappedSlider } from '/@/remote/components/wrapped-slider';
import { useInfo, useSend, useShowImage } from '/@/remote/store';
import { ActionIcon } from '/@/shared/components/action-icon/action-icon';
import { Flex } from '/@/shared/components/flex/flex';
import { Group } from '/@/shared/components/group/group';
import { Rating } from '/@/shared/components/rating/rating';
import { Stack } from '/@/shared/components/stack/stack';
import { Text } from '/@/shared/components/text/text';
import { Tooltip } from '/@/shared/components/tooltip/tooltip';
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

    const id = song?.id;

    const setRating = useCallback(
        (rating: number) => {
            send({ event: 'rating', id: id!, rating });
        },
        [send, id],
    );

    const debouncedSetRating = debounce(setRating, 400);

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
            {id && (
                <Stack gap={4} px="sm" style={{ flexShrink: 0 }} w="100%">
                    <Text
                        fw={700}
                        style={{ ...ellipsis, fontSize: '1.375rem', lineHeight: 1.3 }}
                        ta="center"
                    >
                        {song.name}
                    </Text>
                    <Text fw={500} size="md" style={ellipsis} ta="center">
                        {song.artistName}
                    </Text>
                    <Text isMuted size="sm" style={ellipsis} ta="center">
                        {song.album}
                    </Text>
                    <Group gap={6} justify="center" mt={2} wrap="nowrap">
                        {song.releaseDate && (
                            <>
                                <Text isMuted size="xs">
                                    {new Date(song.releaseDate).toLocaleDateString()}
                                </Text>
                                <Text isMuted size="xs">
                                    ·
                                </Text>
                            </>
                        )}
                        <Text isMuted size="xs">
                            {song.playCount} plays
                        </Text>
                    </Group>
                </Stack>
            )}
            <Group gap="sm" justify="center" style={{ flexShrink: 0 }} wrap="nowrap">
                <ActionIcon
                    disabled={!id}
                    icon="favorite"
                    iconProps={{
                        fill: song?.userFavorite ? 'primary' : 'default',
                        size: 'lg',
                    }}
                    onClick={() => {
                        if (!id) return;

                        send({ event: 'favorite', favorite: !song.userFavorite, id });
                    }}
                    size="md"
                    tooltip={{
                        label: song?.userFavorite ? 'Unfavorite' : 'Favorite',
                    }}
                    variant="subtle"
                />
                {(song?._serverType === 'navidrome' || song?._serverType === 'subsonic') && (
                    <Tooltip label="Double click to clear" openDelay={1000}>
                        <Rating
                            onChange={debouncedSetRating}
                            onDoubleClick={() => debouncedSetRating(0)}
                            value={song.userRating ?? 0}
                        />
                    </Tooltip>
                )}
            </Group>
            <Group gap="sm" justify="center" style={{ flexShrink: 0 }} wrap="nowrap">
                <ActionIcon
                    icon="mediaShuffle"
                    iconProps={{
                        fill: shuffle ? 'primary' : 'default',
                        size: 'lg',
                    }}
                    onClick={() => send({ event: 'shuffle' })}
                    size="md"
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
                        size: 'xl',
                    }}
                    onClick={() => send({ event: 'previous' })}
                    size="lg"
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
                        <RiPlayFill size={30} style={{ transform: 'translateX(2px)' }} />
                    )}
                </ActionIcon>
                <ActionIcon
                    disabled={!id}
                    icon="mediaNext"
                    iconProps={{
                        fill: 'default',
                        size: 'xl',
                    }}
                    onClick={() => send({ event: 'next' })}
                    size="lg"
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
                        size: 'lg',
                    }}
                    onClick={() => send({ event: 'repeat' })}
                    size="md"
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
                <WrappedSlider
                    leftLabel={<RiVolumeUpFill size={20} />}
                    max={100}
                    onChangeEnd={(e) => send({ event: 'volume', volume: e })}
                    rightLabel={
                        <Text fw={600} size="xs">
                            {volume ?? 0}
                        </Text>
                    }
                    value={volume ?? 0}
                />
            </Stack>
        </Stack>
    );
};
