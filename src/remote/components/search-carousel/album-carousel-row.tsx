import { memo, useEffect, useRef, useState } from 'react';

import styles from './album-carousel-row.module.css';

import { CoverImage } from '/@/remote/components/item-list/cover-image';
import { Stack } from '/@/shared/components/stack/stack';
import { Text } from '/@/shared/components/text/text';
import { Album } from '/@/shared/types/domain-types';

const CARD_SIZE_PX = 112;
const CARD_GAP_PX = 12;
// One card (width + gap) scrolls into view roughly every 3 seconds.
const AUTO_SCROLL_MS_PER_CARD = 3000;
const AUTO_SCROLL_SPEED_PX_PER_MS = (CARD_SIZE_PX + CARD_GAP_PX) / AUTO_SCROLL_MS_PER_CARD;
// Idle delay after the user releases (or momentum settles) before auto-scroll resumes.
const RESUME_DELAY_MS = 1500;
// Clamp rAF deltas so returning from a background tab doesn't cause a big jump.
const MAX_FRAME_DELTA_MS = 100;
// scrollLeft writes get rounded by the browser; differences within this
// threshold are treated as our own programmatic writes, not user scrolling.
const PROGRAMMATIC_SCROLL_TOLERANCE_PX = 2;

interface AlbumCarouselCardProps {
    album: Album;
    onPress: (album: Album) => void;
    serverId: string;
}

const AlbumCarouselCard = memo(({ album, onPress, serverId }: AlbumCarouselCardProps) => {
    return (
        <div
            onClick={() => onPress(album)}
            style={{
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                flexShrink: 0,
                userSelect: 'none',
                WebkitTouchCallout: 'none',
                width: CARD_SIZE_PX,
            }}
        >
            <CoverImage
                alt={album.name}
                borderRadius={8}
                imageId={album.imageId}
                serverId={serverId}
                size={CARD_SIZE_PX}
            />
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 1,
                    marginTop: 6,
                    minWidth: 0,
                }}
            >
                <Text fw={500} lineClamp={1} size="xs">
                    {album.name}
                </Text>
                {album.albumArtistName && (
                    <Text isMuted lineClamp={1} size="xs">
                        {album.albumArtistName}
                    </Text>
                )}
            </div>
        </div>
    );
});

AlbumCarouselCard.displayName = 'AlbumCarouselCard';

interface AlbumCarouselRowProps {
    albums: Album[];
    label: string;
    onAlbumPress: (album: Album) => void;
    serverId: string;
}

export const AlbumCarouselRow = ({
    albums,
    label,
    onAlbumPress,
    serverId,
}: AlbumCarouselRowProps) => {
    const trackRef = useRef<HTMLDivElement | null>(null);

    const [prefersReducedMotion] = useState(
        () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    );

    // Looping (and therefore auto-scroll + item duplication) is enabled only
    // when the row actually overflows its container; a short row is left as a
    // plain static strip.
    const [isLooping, setIsLooping] = useState(false);

    useEffect(() => {
        if (prefersReducedMotion) {
            return;
        }

        const track = trackRef.current;

        if (!track || albums.length === 0) {
            setIsLooping(false);
            return;
        }

        const singleListWidth = albums.length * (CARD_SIZE_PX + CARD_GAP_PX) - CARD_GAP_PX;
        const update = () => setIsLooping(singleListWidth > track.clientWidth);

        update();

        const observer = new ResizeObserver(update);
        observer.observe(track);

        return () => observer.disconnect();
    }, [albums.length, prefersReducedMotion]);

    useEffect(() => {
        const track = trackRef.current;

        if (!isLooping || !track) {
            return;
        }

        // With the item list rendered twice in the same flex track, the offset
        // between an item and its duplicate is exactly one list-width + gap.
        const wrapWidth = albums.length * (CARD_SIZE_PX + CARD_GAP_PX);

        // Float scroll position; scrollLeft alone would lose the sub-pixel
        // advance of each frame to browser rounding.
        let position = track.scrollLeft;
        let lastWritten = track.scrollLeft;
        let isPointerDown = false;
        let resumeAt = 0;
        let lastTimestamp: null | number = null;
        let frame = 0;

        const pause = () => {
            resumeAt = performance.now() + RESUME_DELAY_MS;
        };

        const step = (timestamp: number) => {
            frame = requestAnimationFrame(step);

            const delta =
                lastTimestamp === null
                    ? 0
                    : Math.min(timestamp - lastTimestamp, MAX_FRAME_DELTA_MS);
            lastTimestamp = timestamp;

            if (isPointerDown || timestamp < resumeAt) {
                // Track wherever the user (or momentum) left the row so
                // auto-scroll resumes from there without a jump.
                position = track.scrollLeft;
                return;
            }

            position += delta * AUTO_SCROLL_SPEED_PX_PER_MS;

            if (position >= wrapWidth) {
                position -= wrapWidth;
            }

            lastWritten = position;
            track.scrollLeft = position;
        };

        const handlePointerDown = () => {
            isPointerDown = true;
            pause();
        };

        const handlePointerEnd = () => {
            isPointerDown = false;
            pause();
        };

        const handleScroll = () => {
            // Scroll events caused by our own writes land (modulo rounding) on
            // the value we just set; anything else is the user scrubbing or
            // post-release momentum, which keeps pushing the resume deadline.
            if (Math.abs(track.scrollLeft - lastWritten) <= PROGRAMMATIC_SCROLL_TOLERANCE_PX) {
                return;
            }

            pause();

            // Keep manual scrubs endless too: past the seam, jump back by one
            // list-width onto identical content.
            if (track.scrollLeft >= wrapWidth) {
                const wrapped = track.scrollLeft - wrapWidth;
                lastWritten = wrapped;
                track.scrollLeft = wrapped;
            }

            position = track.scrollLeft;
        };

        track.addEventListener('pointerdown', handlePointerDown);
        track.addEventListener('pointerup', handlePointerEnd);
        track.addEventListener('pointercancel', handlePointerEnd);
        track.addEventListener('scroll', handleScroll, { passive: true });
        frame = requestAnimationFrame(step);

        return () => {
            cancelAnimationFrame(frame);
            track.removeEventListener('pointerdown', handlePointerDown);
            track.removeEventListener('pointerup', handlePointerEnd);
            track.removeEventListener('pointercancel', handlePointerEnd);
            track.removeEventListener('scroll', handleScroll);
        };
    }, [albums.length, isLooping]);

    if (albums.length === 0) {
        return null;
    }

    const renderCards = (copy: string) =>
        albums.map((album, index) => (
            <AlbumCarouselCard
                album={album}
                key={`${copy}-${index}-${album.id}`}
                onPress={onAlbumPress}
                serverId={serverId}
            />
        ));

    return (
        <Stack gap={4}>
            <Text fw={600} px="md" size="sm">
                {label}
            </Text>
            <div className={styles.track} ref={trackRef}>
                {renderCards('a')}
                {isLooping && renderCards('b')}
            </div>
        </Stack>
    );
};
