import { memo, useEffect, useRef, useState } from 'react';

import styles from './album-carousel-row.module.css';

import { CoverImage } from '/@/remote/components/item-list/cover-image';
import { Stack } from '/@/shared/components/stack/stack';
import { Text } from '/@/shared/components/text/text';
import { Album } from '/@/shared/types/domain-types';

const CARD_SIZE_PX = 148;
const CARD_GAP_PX = 14;
// One card (width + gap) scrolls into view roughly every 3 seconds.
const AUTO_SCROLL_MS_PER_CARD = 3000;
const AUTO_SCROLL_SPEED_PX_PER_MS = (CARD_SIZE_PX + CARD_GAP_PX) / AUTO_SCROLL_MS_PER_CARD;
// Idle delay after the user releases before auto-scroll resumes.
const RESUME_DELAY_MS = 1500;
// Clamp rAF deltas so returning from a background tab doesn't cause a big jump.
const MAX_FRAME_DELTA_MS = 100;

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
                <Text fw={500} lineClamp={1} size="sm">
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
                // Follow wherever the user (or momentum) left the row so
                // auto-scroll resumes from there without a jump.
                position = track.scrollLeft;
                return;
            }

            position += delta * AUTO_SCROLL_SPEED_PX_PER_MS;

            if (position >= wrapWidth) {
                position -= wrapWidth;
            }

            track.scrollLeft = position;
        };

        // Pausing is driven purely by pointer interaction — NOT by the scroll
        // event. iOS reports scrollLeft asynchronously after a programmatic
        // write, so comparing scrollLeft to our last write mis-detects our own
        // auto-scroll as "user scrolling" and freezes the row. Pointer events
        // are reliable; the RESUME_DELAY covers the brief post-release momentum.
        const handlePointerDown = () => {
            isPointerDown = true;
            pause();
        };

        const handlePointerEnd = () => {
            isPointerDown = false;
            pause();
        };

        const handleScroll = () => {
            // Auto-scroll always keeps scrollLeft < wrapWidth (it wraps in step),
            // so a value past the seam can only come from a manual scrub — wrap
            // it back onto identical content to keep manual scrubbing endless.
            // No pause here: programmatic writes fire this too and must be ignored.
            if (track.scrollLeft >= wrapWidth) {
                const wrapped = track.scrollLeft - wrapWidth;
                track.scrollLeft = wrapped;
                position = wrapped;
            }
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
            <Text fw={700} px="md" size="lg">
                {label}
            </Text>
            <div className={styles.track} ref={trackRef}>
                {renderCards('a')}
                {isLooping && renderCards('b')}
            </div>
        </Stack>
    );
};
