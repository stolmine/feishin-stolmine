import { useLayoutEffect, useRef } from 'react';

const scrollPositions = new Map<string, number>();

const MAX_RESTORE_FRAMES = 20;

export const useScrollRestoration = ({
    getElement,
    ready,
    scrollKey,
}: {
    getElement: () => HTMLElement | null | undefined;
    ready: boolean;
    scrollKey?: string;
}): void => {
    const getElementRef = useRef(getElement);
    getElementRef.current = getElement;

    const restoredRef = useRef(false);

    useLayoutEffect(() => {
        if (!scrollKey) {
            return undefined;
        }

        if (!ready) {
            restoredRef.current = false;
            return undefined;
        }

        if (restoredRef.current) {
            return undefined;
        }

        const saved = scrollPositions.get(scrollKey);

        if (saved === undefined) {
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
                const isSavedOffsetReachable = maxScrollTop >= saved;

                if (isScrollable || isSavedOffsetReachable) {
                    element.scrollTop = saved;
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
        if (!scrollKey) {
            return undefined;
        }

        const element = getElementRef.current();

        if (!element) {
            return undefined;
        }

        let rafId: null | number = null;

        const handleScroll = () => {
            if (rafId !== null) {
                return;
            }

            rafId = requestAnimationFrame(() => {
                rafId = null;
                scrollPositions.set(scrollKey, element.scrollTop);
            });
        };

        element.addEventListener('scroll', handleScroll, { passive: true });

        return () => {
            element.removeEventListener('scroll', handleScroll);

            if (rafId !== null) {
                cancelAnimationFrame(rafId);
            }

            scrollPositions.set(scrollKey, element.scrollTop);
        };
    }, [ready, scrollKey]);
};
