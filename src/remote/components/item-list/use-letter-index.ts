import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { BASE_BUCKETS, bucketOf, compareBuckets, orderedBuckets } from './bucket';

import { logger } from '/@/renderer/utils/logger';

/**
 * Structural shape of a TanStack `queryOptions()` result, loosened just enough
 * (optional `queryFn`, `any` context/return) to accept the real query-factory
 * objects (`albumQueries.list(...)`, etc.) without fighting their internal,
 * hard-to-name generic types. Re-declared locally (not imported from
 * `use-remote-infinite-list.ts`) since that file doesn't export it and this
 * hook is meant to stay self-contained.
 */
interface RemoteListQueryOptions {
    queryFn?: (context: any) => any;
    queryKey: readonly unknown[];
}

const SAMPLE_COUNT = 12;
const PROBE_STALE_TIME_MS = 5 * 60 * 1000;

const resolvedIndexCache = new Map<string, number>();

export function useLetterIndex<TItem>({
    buildProbeQueryOptions,
    cacheKey,
    getLoadedItem,
    getName,
    serverId,
    totalCount,
}: {
    buildProbeQueryOptions: (startIndex: number, limit: number) => RemoteListQueryOptions;
    cacheKey: string;
    getLoadedItem?: (index: number) => TItem | undefined;
    getName: (item: TItem) => string;
    serverId: string;
    totalCount: number;
}): {
    buckets: string[];
    estimate: (bucket: string) => number;
    resolve: (bucket: string) => Promise<number>;
} {
    const queryClient = useQueryClient();
    const [buckets, setBuckets] = useState<string[]>(() => orderedBuckets(BASE_BUCKETS));
    const discoveredBucketsRef = useRef<Set<string>>(new Set(BASE_BUCKETS));
    // Cache entries are namespaced by server too, so the same `cacheKey` (e.g.
    // tab + sort) never collides across two different servers' data.
    const scopedCacheKey = `${serverId}:${cacheKey}`;

    // Kept in sync with the latest closures on every render (not inside an
    // effect) so `fetchProbeItem` and the sampling effect below can stay
    // referentially stable — depending on `getName`/`getLoadedItem` directly
    // would re-run the sampling effect on every render (a fresh inline arrow
    // from the page each time, or an infinite-list `getItem` that changes
    // identity on every `version` bump), which previously caused a
    // render→effect→fetch loop.
    const getNameRef = useRef(getName);
    const getLoadedItemRef = useRef(getLoadedItem);
    const buildProbeQueryOptionsRef = useRef(buildProbeQueryOptions);

    getNameRef.current = getName;
    getLoadedItemRef.current = getLoadedItem;
    buildProbeQueryOptionsRef.current = buildProbeQueryOptions;

    const fetchProbeItem = useCallback(
        async (index: number): Promise<TItem | undefined> => {
            const loaded = getLoadedItemRef.current?.(index);

            if (loaded !== undefined) {
                return loaded;
            }

            const probeOptions = {
                ...buildProbeQueryOptionsRef.current(index, 1),
                staleTime: PROBE_STALE_TIME_MS,
            } as {
                queryFn: () => Promise<{ items: TItem[] }>;
                queryKey: readonly unknown[];
                staleTime: number;
            };

            const result = (await queryClient.fetchQuery(probeOptions)) as { items: TItem[] };

            return result.items[0];
        },
        [queryClient],
    );

    // Sample a bounded, deterministic set of indexes spread across the list to
    // seed the ribbon's alphabet before the user has scrubbed anywhere. Guarded
    // against races with `cancelled`: a slow response from a stale cacheKey (a
    // sort/filter change fired mid-flight) must not clobber the current state.
    // Depends ONLY on stable values (`fetchProbeItem` is now stable too — see
    // above) so it re-runs exactly when the underlying list identity changes,
    // never on an unrelated parent re-render.
    useEffect(() => {
        const effectScopedCacheKey = `${serverId}:${cacheKey}`;

        ensureCacheFresh(effectScopedCacheKey, totalCount);
        discoveredBucketsRef.current = new Set(BASE_BUCKETS);

        if (totalCount === 0) {
            setBuckets((current) => {
                const next = orderedBuckets(BASE_BUCKETS);

                return bucketsEqual(current, next) ? current : next;
            });

            return;
        }

        let cancelled = false;
        const sampleCount = Math.min(SAMPLE_COUNT, totalCount);
        const sampleIndexes = new Set<number>();

        for (let i = 0; i < sampleCount; i += 1) {
            sampleIndexes.add(Math.floor((i * totalCount) / sampleCount));
        }

        // Always probe the first and last item, since the evenly-spaced
        // samples above cap out around `(SAMPLE_COUNT - 1) / SAMPLE_COUNT` of
        // the list and never reach the final ~1/12th — losing trailing
        // buckets (e.g. CJK/Hangul sorted after Latin) entirely.
        sampleIndexes.add(0);
        sampleIndexes.add(totalCount - 1);

        void (async () => {
            const discovered = new Set<string>(BASE_BUCKETS);

            await Promise.all(
                Array.from(sampleIndexes).map(async (index) => {
                    try {
                        const item = await fetchProbeItem(index);

                        if (item !== undefined) {
                            discovered.add(bucketOf(getNameRef.current(item)));
                        }
                    } catch (error) {
                        // A failed sample probe simply contributes no bucket.
                        logger.debug('Ribbon sample probe failed', { error, index });
                    }
                }),
            );

            if (cancelled) {
                return;
            }

            for (const bucket of discovered) {
                discoveredBucketsRef.current.add(bucket);
            }

            setBuckets((current) => {
                const next = orderedBuckets(discoveredBucketsRef.current);

                return bucketsEqual(current, next) ? current : next;
            });
        })();

        return () => {
            cancelled = true;
        };
    }, [cacheKey, fetchProbeItem, serverId, totalCount]);

    const resolve = useCallback(
        async (bucket: string): Promise<number> => {
            ensureCacheFresh(scopedCacheKey, totalCount);

            const cacheEntryKey = `${scopedCacheKey}:${bucket}`;
            const cached = resolvedIndexCache.get(cacheEntryKey);

            if (cached !== undefined) {
                return Promise.resolve(cached);
            }

            if (totalCount === 0) {
                return 0;
            }

            let lo = 0;
            let hi = totalCount;

            while (lo < hi) {
                const mid = (lo + hi) >> 1;

                const item = await fetchProbeItem(mid);
                // A probe that comes back empty (e.g. the index momentarily falls
                // outside the server's range) is treated as sorting after every
                // real bucket, so the search still narrows and terminates.
                const itemBucket = item === undefined ? '⋯' : bucketOf(getNameRef.current(item));

                // Record newly-discovered buckets for the NEXT sampling pass, but
                // deliberately do NOT push them into `buckets` state here: doing so
                // mid-gesture changes `buckets.length`, which remaps the ribbon's
                // hit-test and yanks the active letter out from under the finger.
                // Bucket discovery is surfaced to the UI only via the sampling
                // effect above (which now always covers the tail, see fix #6).
                discoveredBucketsRef.current.add(itemBucket);

                if (compareBuckets(itemBucket, bucket) >= 0) {
                    hi = mid;
                } else {
                    lo = mid + 1;
                }
            }

            const result = Math.min(Math.max(lo, 0), Math.max(0, totalCount - 1));

            resolvedIndexCache.set(cacheEntryKey, result);

            return result;
        },
        [fetchProbeItem, scopedCacheKey, totalCount],
    );

    const estimate = useCallback(
        (bucket: string): number => {
            const idx = buckets.indexOf(bucket);

            if (idx === -1) {
                return 0;
            }

            const raw = Math.floor(totalCount * (idx / buckets.length));

            return Math.min(Math.max(raw, 0), Math.max(0, totalCount - 1));
        },
        [buckets, totalCount],
    );

    return { buckets, estimate, resolve };
}

function bucketsEqual(a: string[], b: string[]): boolean {
    return a.length === b.length && a.every((bucket, index) => bucket === b[index]);
}

// Resolved indexes are only valid for a given (cacheKey, totalCount) pair —
// if the underlying list's length changes (filter/sort/library change), every
// previously resolved index is stale. Drop the whole cacheKey namespace
// whenever the observed totalCount changes.
function ensureCacheFresh(cacheKey: string, totalCount: number): void {
    const countKey = `${cacheKey}:__count`;
    const storedCount = resolvedIndexCache.get(countKey);

    if (storedCount !== totalCount) {
        const prefix = `${cacheKey}:`;

        for (const key of Array.from(resolvedIndexCache.keys())) {
            if (key.startsWith(prefix)) {
                resolvedIndexCache.delete(key);
            }
        }

        resolvedIndexCache.set(countKey, totalCount);
    }
}
