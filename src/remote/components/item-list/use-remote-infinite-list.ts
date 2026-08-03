import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';

interface ListPage<TItem> {
    items: TItem[];
    startIndex: number;
}

/**
 * Structural shape of a TanStack `queryOptions()` result, loosened just enough
 * (optional `queryFn`, `any` context/return) to accept the real query-factory
 * objects (`albumQueries.list(...)`, `.listCount(...)`, etc.) without fighting
 * their internal, hard-to-name generic types.
 */
interface RemoteListQueryOptions {
    queryFn?: (context: any) => any;
    queryKey: readonly unknown[];
}

const DEFAULT_PAGE_SIZE = 100;

export const useRemoteInfiniteList = <TItem>({
    buildListQueryOptions,
    countQueryOptions,
    pageSize = DEFAULT_PAGE_SIZE,
}: {
    buildListQueryOptions: (startIndex: number, limit: number) => RemoteListQueryOptions;
    countQueryOptions: RemoteListQueryOptions;
    pageSize?: number;
}) => {
    const queryClient = useQueryClient();
    const { data: totalCount, isLoading: isCountLoading } = useQuery(
        countQueryOptions as { queryFn: () => Promise<number>; queryKey: readonly unknown[] },
    );

    const pagesRef = useRef<Map<number, ListPage<TItem>>>(new Map());
    const inFlightRef = useRef<Set<number>>(new Set());
    const [version, setVersion] = useState(0);

    const fetchPage = useCallback(
        async (pageIndex: number) => {
            if (inFlightRef.current.has(pageIndex) || pagesRef.current.has(pageIndex)) {
                return;
            }

            inFlightRef.current.add(pageIndex);

            try {
                const startIndex = pageIndex * pageSize;
                const options = buildListQueryOptions(startIndex, pageSize);
                const result = (await queryClient.fetchQuery(
                    options as {
                        queryFn: () => Promise<{ items: TItem[] }>;
                        queryKey: readonly unknown[];
                    },
                )) as { items: TItem[] };

                pagesRef.current.set(pageIndex, { items: result.items, startIndex });
                setVersion((v) => v + 1);
            } finally {
                inFlightRef.current.delete(pageIndex);
            }
        },
        [buildListQueryOptions, pageSize, queryClient],
    );

    const getItem = useCallback(
        (index: number): TItem | undefined => {
            const pageIndex = Math.floor(index / pageSize);
            const page = pagesRef.current.get(pageIndex);

            if (!page) {
                return undefined;
            }

            return page.items[index - page.startIndex];
        },
        // `version` is intentionally unused in the body: bumping it after each page
        // load changes this callback's identity so memoized consumers (RemoteList/
        // RemoteGrid row components) re-render with newly-loaded data.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [pageSize, version],
    );

    const ensureRange = useCallback(
        (startIndex: number, stopIndex: number) => {
            const firstPage = Math.floor(Math.max(0, startIndex) / pageSize);
            const lastPage = Math.floor(Math.max(0, stopIndex) / pageSize);

            for (let pageIndex = firstPage; pageIndex <= lastPage; pageIndex += 1) {
                void fetchPage(pageIndex);
            }
        },
        [fetchPage, pageSize],
    );

    return {
        ensureRange,
        getItem,
        isLoading: isCountLoading,
        totalCount: totalCount ?? 0,
    };
};
