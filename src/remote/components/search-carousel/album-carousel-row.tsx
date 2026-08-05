import { memo, useCallback, useEffect, useRef, useState } from 'react';

import styles from './album-carousel-row.module.css';

import { CoverImage } from '/@/remote/components/item-list/cover-image';
import { Text } from '/@/shared/components/text/text';
import { Album } from '/@/shared/types/domain-types';

// Gap between cards. Applied as inline column-gap so the rendered layout and
// the loop math can never disagree.
const CARD_GAP_PX = 12;

// Artwork is sized from the row's measured height and clamped to this range so
// three rows always fit the viewport without cutting off the bottom row.
const ART_MAX_PX = 168;
const ART_MIN_PX = 72;

// Fixed vertical overhead per row (label line + label gap + card text block);
// the card text line-heights below are pinned in px so this stays exact.
const LABEL_LINE_PX = 20;
const LABEL_GAP_PX = 4;
const CARD_TEXT_MARGIN_PX = 6;
const CARD_TITLE_LINE_PX = 18;
const CARD_TEXT_GAP_PX = 1;
const CARD_SUBTITLE_LINE_PX = 16;
const CARD_TEXT_BLOCK_PX = CARD_TITLE_LINE_PX + CARD_TEXT_GAP_PX + CARD_SUBTITLE_LINE_PX;
const ROW_OVERHEAD_PX = LABEL_LINE_PX + LABEL_GAP_PX + CARD_TEXT_MARGIN_PX + CARD_TEXT_BLOCK_PX;

// One card (width + gap) drifts into view roughly every 3 seconds.
const AUTO_SCROLL_MS_PER_CARD = 3000;
// Idle delay after the user releases before auto-scroll resumes.
const RESUME_DELAY_MS = 1500;
// Clamp rAF deltas so returning from a background tab doesn't cause a jump.
const MAX_FRAME_DELTA_MS = 100;
// Horizontal movement before a touch becomes a scrub instead of a tap.
const DRAG_START_THRESHOLD_PX = 8;
// Post-release momentum: iOS-like exponential decay of the fling velocity.
const MOMENTUM_TIME_CONSTANT_MS = 325;
const MOMENTUM_MAX_SPEED_PX_PER_MS = 3;
const MOMENTUM_MIN_SPEED_PX_PER_MS = 0.02;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

interface AlbumCarouselCardProps {
    album: Album;
    artSize: number;
    onPress: (album: Album) => void;
    serverId: string;
}

const AlbumCarouselCard = memo(({ album, artSize, onPress, serverId }: AlbumCarouselCardProps) => {
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
                width: artSize,
            }}
        >
            <CoverImage
                alt={album.name}
                borderRadius={8}
                imageId={album.imageId}
                serverId={serverId}
                size={artSize}
            />
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: CARD_TEXT_GAP_PX,
                    height: CARD_TEXT_BLOCK_PX,
                    marginTop: CARD_TEXT_MARGIN_PX,
                    minWidth: 0,
                }}
            >
                <Text fw={500} lh={`${CARD_TITLE_LINE_PX}px`} lineClamp={1} size="sm">
                    {album.name}
                </Text>
                {album.albumArtistName && (
                    <Text isMuted lh={`${CARD_SUBTITLE_LINE_PX}px`} lineClamp={1} size="xs">
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
    const rowRef = useRef<HTMLDivElement | null>(null);
    const viewportRef = useRef<HTMLDivElement | null>(null);
    const trackRef = useRef<HTMLDivElement | null>(null);
    // Set while a scrub is in progress so the click that iOS fires after the
    // release doesn't navigate; cleared on the next pointerdown.
    const wasDraggedRef = useRef(false);

    const [prefersReducedMotion] = useState(
        () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    );

    const [artSize, setArtSize] = useState(ART_MIN_PX);

    // The marquee (auto-scroll + item duplication) is enabled only when the
    // row actually overflows its container and motion is allowed; otherwise
    // the row is a plain native scroller.
    const [isLooping, setIsLooping] = useState(false);

    // Derive the artwork size from the row's measured height so all three rows
    // always fit, and decide whether the strip overflows at that size.
    useEffect(() => {
        const row = rowRef.current;

        if (!row || albums.length === 0) {
            return;
        }

        const update = () => {
            const nextArtSize = clamp(
                Math.floor(row.clientHeight - ROW_OVERHEAD_PX),
                ART_MIN_PX,
                ART_MAX_PX,
            );
            const listWidth = albums.length * (nextArtSize + CARD_GAP_PX) - CARD_GAP_PX;

            setArtSize(nextArtSize);
            setIsLooping(!prefersReducedMotion && listWidth > row.clientWidth);
        };

        update();

        const observer = new ResizeObserver(update);
        observer.observe(row);

        return () => observer.disconnect();
    }, [albums.length, prefersReducedMotion]);

    // Marquee engine. Auto-scroll animates translateX on the track — never
    // scrollLeft. iOS performs overflow scrolling asynchronously on the
    // compositor: per-frame scrollLeft writes are round-tripped, snapped to
    // whole pixels, and silently dropped around touch/momentum handling, so a
    // slow (<1px/frame) scrollLeft animation never visibly moves on the
    // device. Transforms bypass the scroll machinery entirely. Manual scrub is
    // reimplemented on top with pointer events plus a decaying fling.
    useEffect(() => {
        const track = trackRef.current;
        const viewport = viewportRef.current;

        if (!isLooping || !track || !viewport) {
            return;
        }

        // With the card list rendered twice in the same flex track, content
        // repeats exactly every list-width + gap.
        const wrapWidth = albums.length * (artSize + CARD_GAP_PX);
        const autoSpeed = (artSize + CARD_GAP_PX) / AUTO_SCROLL_MS_PER_CARD;

        // Float offset in px; positive offset moves cards leftwards.
        let offset = 0;
        let velocity = 0;
        let mode: 'auto' | 'drag' | 'momentum' | 'wait' = 'auto';
        let resumeAt = 0;
        let lastTimestamp: null | number = null;
        let frame = 0;
        let activePointerId: null | number = null;
        let startX = 0;
        let lastX = 0;
        let lastMoveTime = 0;

        const wrap = (value: number) => ((value % wrapWidth) + wrapWidth) % wrapWidth;

        const apply = () => {
            track.style.transform = `translate3d(${-offset}px, 0, 0)`;
        };

        const step = (timestamp: number) => {
            frame = requestAnimationFrame(step);

            const delta =
                lastTimestamp === null
                    ? 0
                    : Math.min(timestamp - lastTimestamp, MAX_FRAME_DELTA_MS);
            lastTimestamp = timestamp;

            if (mode === 'drag') {
                return;
            }

            if (mode === 'momentum') {
                offset = wrap(offset + velocity * delta);
                velocity *= Math.exp(-delta / MOMENTUM_TIME_CONSTANT_MS);

                if (Math.abs(velocity) < MOMENTUM_MIN_SPEED_PX_PER_MS) {
                    mode = 'wait';
                    resumeAt = timestamp + RESUME_DELAY_MS;
                }

                apply();
                return;
            }

            if (mode === 'wait') {
                if (timestamp < resumeAt) {
                    return;
                }

                mode = 'auto';
            }

            offset = wrap(offset + autoSpeed * delta);
            apply();
        };

        const handlePointerDown = (event: PointerEvent) => {
            activePointerId = event.pointerId;
            startX = event.clientX;
            lastX = event.clientX;
            lastMoveTime = event.timeStamp;
            velocity = 0;
            wasDraggedRef.current = false;
            // Pause immediately; a plain tap resumes after the idle delay.
            mode = 'wait';
            resumeAt = event.timeStamp + RESUME_DELAY_MS;
        };

        const handlePointerMove = (event: PointerEvent) => {
            if (activePointerId !== event.pointerId) {
                return;
            }

            if (mode !== 'drag') {
                if (Math.abs(event.clientX - startX) < DRAG_START_THRESHOLD_PX) {
                    return;
                }

                mode = 'drag';
                wasDraggedRef.current = true;
                lastX = event.clientX;
                lastMoveTime = event.timeStamp;

                try {
                    viewport.setPointerCapture(event.pointerId);
                } catch {
                    // The pointer may already be gone; drag ends via cancel.
                }

                return;
            }

            const moveDx = event.clientX - lastX;
            const moveDt = Math.max(1, event.timeStamp - lastMoveTime);

            offset = wrap(offset - moveDx);
            // Smoothed fling velocity in px/ms, matching offset's direction.
            velocity = 0.8 * (-moveDx / moveDt) + 0.2 * velocity;
            lastX = event.clientX;
            lastMoveTime = event.timeStamp;
            apply();
        };

        const handlePointerEnd = (event: PointerEvent) => {
            if (activePointerId !== event.pointerId) {
                return;
            }

            activePointerId = null;

            if (mode === 'drag') {
                velocity = clamp(
                    velocity,
                    -MOMENTUM_MAX_SPEED_PX_PER_MS,
                    MOMENTUM_MAX_SPEED_PX_PER_MS,
                );

                if (Math.abs(velocity) >= MOMENTUM_MIN_SPEED_PX_PER_MS) {
                    mode = 'momentum';
                    return;
                }
            }

            mode = 'wait';
            resumeAt = event.timeStamp + RESUME_DELAY_MS;
        };

        apply();
        viewport.addEventListener('pointerdown', handlePointerDown);
        viewport.addEventListener('pointermove', handlePointerMove);
        viewport.addEventListener('pointerup', handlePointerEnd);
        viewport.addEventListener('pointercancel', handlePointerEnd);
        frame = requestAnimationFrame(step);

        return () => {
            cancelAnimationFrame(frame);
            viewport.removeEventListener('pointerdown', handlePointerDown);
            viewport.removeEventListener('pointermove', handlePointerMove);
            viewport.removeEventListener('pointerup', handlePointerEnd);
            viewport.removeEventListener('pointercancel', handlePointerEnd);
            track.style.transform = '';
        };
    }, [albums.length, artSize, isLooping]);

    const handleCardPress = useCallback(
        (album: Album) => {
            if (wasDraggedRef.current) {
                return;
            }

            onAlbumPress(album);
        },
        [onAlbumPress],
    );

    if (albums.length === 0) {
        return null;
    }

    const renderCards = (copy: string) =>
        albums.map((album, index) => (
            <AlbumCarouselCard
                album={album}
                artSize={artSize}
                key={`${copy}-${index}-${album.id}`}
                onPress={handleCardPress}
                serverId={serverId}
            />
        ));

    return (
        <div className={styles.row} ref={rowRef}>
            <Text fw={600} lh={`${LABEL_LINE_PX}px`} pb={LABEL_GAP_PX} px="md" size="sm">
                {label}
            </Text>
            {isLooping ? (
                <div className={styles.viewport} ref={viewportRef}>
                    <div
                        className={styles.marqueeTrack}
                        ref={trackRef}
                        style={{ columnGap: CARD_GAP_PX }}
                    >
                        {renderCards('a')}
                        {renderCards('b')}
                    </div>
                </div>
            ) : (
                <div className={styles.staticTrack} style={{ columnGap: CARD_GAP_PX }}>
                    {renderCards('a')}
                </div>
            )}
        </div>
    );
};
