import { useLayoutEffect, useRef } from 'react';

interface SavedScrollPosition {
    // The list's total item count at the time the position was saved. A saved
    // pixel offset is only meaningful for the exact list it was scrolled on —
    // if the count has changed since (new entries ingested, library rescan),
    // restoring the old offset would land on unrelated items, so the entry is
    // dropped instead. Mirrors the totalCount-stamping in use-letter-index.
    itemCount: number;
    scrollTop: number;
}

const scrollPositions = new Map<string, SavedScrollPosition>();

const MAX_RESTORE_FRAMES = 20;

export const useScrollRestoration = ({
    getElement,
    itemCount,
    ready,
    scrollKey,
}: {
    getElement: () => HTMLElement | null | undefined;
    itemCount: number;
    ready: boolean;
    scrollKey?: string;
}): void => {
    const getElementRef = useRef(getElement);
    getElementRef.current = getElement;

    const itemCountRef = useRef(itemCount);
    itemCountRef.current = itemCount;

    const restoredRef = useRef(false);

    useLayoutEffect(() => {
        // One-shot per mount: once a restore has been attempted, it must never
        // re-fire — `ready` can churn mid-session (count query identity
        // change, grid width flip) and re-running the restore then would snap
        // the list back to a stale offset and re-save it over the user's
        // current position.
        if (!scrollKey || !ready || restoredRef.current) {
            return undefined;
        }

        const saved = scrollPositions.get(scrollKey);

        if (saved === undefined) {
            restoredRef.current = true;
            return undefined;
        }

        if (saved.itemCount !== itemCountRef.current) {
            scrollPositions.delete(scrollKey);
            restoredRef.current = true;
            return undefined;
        }

        let frame = 0;
        let rafId: null | number = null;

        const tryRestore = () => {
            const element = getElementRef.current();

            if (element) {
                const maxScrollTop = element.scrollHeight - element.clientHeight;
                const isScrollable = maxScrollTop > 0;
                const isSavedOffsetReachable = maxScrollTop >= saved.scrollTop;

                if (isScrollable || isSavedOffsetReachable) {
                    element.scrollTop = saved.scrollTop;
                    restoredRef.current = true;
                    return;
                }
            }

            frame += 1;

            if (frame >= MAX_RESTORE_FRAMES) {
                restoredRef.current = true;
                return;
            }

            rafId = requestAnimationFrame(tryRestore);
        };

        tryRestore();

        return () => {
            if (rafId !== null) {
                cancelAnimationFrame(rafId);
            }
        };
    }, [ready, scrollKey]);

    useLayoutEffect(() => {
        // Only track scrolls of a list that actually has content. Attaching
        // while `ready` is false would let the ready-flip teardown's final
        // save capture the empty list's scrollTop (0) and clobber a good
        // saved position before the restore effect gets to read it.
        if (!scrollKey || !ready) {
            return undefined;
        }

        // react-window exposes its scroll element through state, so it is
        // still null during the commit in which this effect first runs (e.g.
        // returning to a list whose count query is already cached). Retry via
        // rAF until the element exists instead of silently never attaching —
        // otherwise scrolls made on that visit are never saved and the next
        // restore serves a stale position.
        let element: HTMLElement | null = null;
        let attachRafId: null | number = null;
        let saveRafId: null | number = null;

        const save = (scrollTop: number) => {
            scrollPositions.set(scrollKey, {
                itemCount: itemCountRef.current,
                scrollTop,
            });
        };

        const handleScroll = () => {
            if (saveRafId !== null) {
                return;
            }

            saveRafId = requestAnimationFrame(() => {
                saveRafId = null;

                if (element?.isConnected) {
                    save(element.scrollTop);
                }
            });
        };

        const tryAttach = () => {
            const candidate = getElementRef.current();

            if (candidate) {
                element = candidate;
                element.addEventListener('scroll', handleScroll, { passive: true });
                return;
            }

            attachRafId = requestAnimationFrame(tryAttach);
        };

        tryAttach();

        return () => {
            if (attachRafId !== null) {
                cancelAnimationFrame(attachRafId);
            }

            if (saveRafId !== null) {
                cancelAnimationFrame(saveRafId);
            }

            if (element) {
                element.removeEventListener('scroll', handleScroll);

                // Synchronous final save so the exact offset at unmount wins
                // over any pending rAF-coalesced save. Skip an element that
                // has already been torn out of the DOM — its scrollTop reads
                // 0 and would clobber the real position.
                if (element.isConnected) {
                    save(element.scrollTop);
                }
            }
        };
    }, [ready, scrollKey]);
};
