import { useCallback, useEffect, useRef, useState } from 'react';

import { RemoteListScrollOptions } from '/@/remote/components/item-list/types';
import { logger } from '/@/renderer/utils/logger';

const RESOLVE_DEBOUNCE_MS = 120;
const HAPTIC_MS = 8;

interface UseRibbonScrubOptions {
    buckets: string[];
    estimate: (bucket: string) => number;
    onScrollToIndex: (index: number, options?: RemoteListScrollOptions) => void;
    resolve: (bucket: string) => Promise<number>;
}

interface UseRibbonScrubResult {
    activeBucket: null | string;
    isScrubbing: boolean;
    onLostPointerCapture: (event: React.PointerEvent<HTMLDivElement>) => void;
    onPointerCancel: (event: React.PointerEvent<HTMLDivElement>) => void;
    onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
    onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
    onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => void;
    pointerY: null | number;
}

// Drives the alpha ribbon's pointer-capture scrubbing gesture: Tier-3 instant
// (proportional `estimate`) feedback on every bucket change, with a debounced
// Tier-2 `resolve` correction that lands ~120ms after the finger settles (and
// unconditionally once more on release, so the final position is always exact).
export const useRibbonScrub = ({
    buckets,
    estimate,
    onScrollToIndex,
    resolve,
}: UseRibbonScrubOptions): UseRibbonScrubResult => {
    const [isScrubbing, setIsScrubbing] = useState(false);
    const [activeBucket, setActiveBucket] = useState<null | string>(null);
    const [pointerY, setPointerY] = useState<null | number>(null);

    // Mirrors `activeBucket` state for use inside the debounced callback, which
    // must always compare against the LATEST bucket (not the one captured at
    // schedule time) to avoid landing a stale resolve after the finger moved on.
    const activeBucketRef = useRef<null | string>(null);
    const debounceRef = useRef<null | ReturnType<typeof setTimeout>>(null);

    // Bumped on every new gesture (`onPointerDown`) and again at the start of
    // `endScrub`, so a `resolve()` issued by a gesture that has since ended (or
    // been superseded by a new one) is recognized as stale when it finally
    // settles and its scroll is dropped instead of yanking the list.
    const scrubGenerationRef = useRef(0);

    const clearDebounce = useCallback(() => {
        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
            debounceRef.current = null;
        }
    }, []);

    useEffect(() => clearDebounce, [clearDebounce]);

    const bucketFromEvent = useCallback(
        (event: React.PointerEvent<HTMLDivElement>): null | string => {
            if (buckets.length === 0) {
                return null;
            }

            const rect = event.currentTarget.getBoundingClientRect();
            const ratio = (event.clientY - rect.top) / rect.height;
            const index = Math.min(
                buckets.length - 1,
                Math.max(0, Math.floor(ratio * buckets.length)),
            );

            return buckets[index];
        },
        [buckets],
    );

    const scheduleResolve = useCallback(
        (bucket: string) => {
            clearDebounce();
            const generation = scrubGenerationRef.current;

            debounceRef.current = setTimeout(() => {
                debounceRef.current = null;
                resolve(bucket)
                    .then((index) => {
                        if (
                            scrubGenerationRef.current === generation &&
                            activeBucketRef.current === bucket
                        ) {
                            onScrollToIndex(index, { align: 'top', behavior: 'auto' });
                        }
                    })
                    .catch((error) => {
                        logger.debug('Ribbon debounced resolve failed', { bucket, error });
                    });
            }, RESOLVE_DEBOUNCE_MS);
        },
        [clearDebounce, onScrollToIndex, resolve],
    );

    const enterBucket = useCallback(
        (bucket: string) => {
            setActiveBucket(bucket);
            activeBucketRef.current = bucket;
            onScrollToIndex(estimate(bucket), { align: 'top', behavior: 'auto' });
            scheduleResolve(bucket);
        },
        [estimate, onScrollToIndex, scheduleResolve],
    );

    const onPointerDown = useCallback(
        (event: React.PointerEvent<HTMLDivElement>) => {
            const bucket = bucketFromEvent(event);

            if (!bucket) {
                return;
            }

            event.currentTarget.setPointerCapture(event.pointerId);
            scrubGenerationRef.current += 1;
            setIsScrubbing(true);
            setPointerY(event.clientY);
            enterBucket(bucket);
        },
        [bucketFromEvent, enterBucket],
    );

    const onPointerMove = useCallback(
        (event: React.PointerEvent<HTMLDivElement>) => {
            if (!activeBucketRef.current) {
                return;
            }

            setPointerY(event.clientY);

            const bucket = bucketFromEvent(event);

            if (!bucket || bucket === activeBucketRef.current) {
                return;
            }

            navigator.vibrate?.(HAPTIC_MS);
            enterBucket(bucket);
        },
        [bucketFromEvent, enterBucket],
    );

    const endScrub = useCallback(() => {
        clearDebounce();
        scrubGenerationRef.current += 1;
        const generation = scrubGenerationRef.current;
        const bucket = activeBucketRef.current;

        if (bucket) {
            resolve(bucket)
                .then((index) => {
                    if (scrubGenerationRef.current === generation) {
                        onScrollToIndex(index, { align: 'top', behavior: 'auto' });
                    }
                })
                .catch((error) => {
                    logger.debug('Ribbon end-scrub resolve failed', { bucket, error });
                });
        }

        setIsScrubbing(false);
        setActiveBucket(null);
        activeBucketRef.current = null;
    }, [clearDebounce, onScrollToIndex, resolve]);

    const onPointerUp = useCallback(
        (event: React.PointerEvent<HTMLDivElement>) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
            }

            endScrub();
        },
        [endScrub],
    );

    const onPointerCancel = useCallback(() => {
        endScrub();
    }, [endScrub]);

    const onLostPointerCapture = useCallback(() => {
        endScrub();
    }, [endScrub]);

    return {
        activeBucket,
        isScrubbing,
        onLostPointerCapture,
        onPointerCancel,
        onPointerDown,
        onPointerMove,
        onPointerUp,
        pointerY,
    };
};
