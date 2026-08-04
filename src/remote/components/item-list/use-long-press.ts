import { useCallback, useRef } from 'react';

const LONG_PRESS_DELAY_MS = 500;
// Touch slop: movement past this many px is a scroll, so cancel the long-press
// timer. Tap-vs-scroll for the short press is delegated to the browser's native
// `click` event (which never fires after a scroll), so this only gates long-press.
const MOVE_CANCEL_THRESHOLD_PX = 10;

interface UseLongPressOptions {
    onLongPress: () => void;
    onPress?: () => void;
}

export const useLongPress = ({ onLongPress, onPress }: UseLongPressOptions) => {
    const timeoutRef = useRef<null | ReturnType<typeof setTimeout>>(null);
    const startPosRef = useRef<null | { x: number; y: number }>(null);
    // Set true when the long-press timer fires, so the trailing synthetic click
    // is swallowed instead of also triggering the tap action.
    const suppressClickRef = useRef(false);

    const clearTimer = useCallback(() => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
    }, []);

    const onPointerDown = useCallback(
        (event: React.PointerEvent) => {
            suppressClickRef.current = false;
            startPosRef.current = { x: event.clientX, y: event.clientY };
            clearTimer();
            timeoutRef.current = setTimeout(() => {
                suppressClickRef.current = true;
                onLongPress();
            }, LONG_PRESS_DELAY_MS);
        },
        [clearTimer, onLongPress],
    );

    const onPointerMove = useCallback(
        (event: React.PointerEvent) => {
            const start = startPosRef.current;

            if (!start) {
                return;
            }

            const dx = event.clientX - start.x;
            const dy = event.clientY - start.y;

            if (Math.sqrt(dx * dx + dy * dy) > MOVE_CANCEL_THRESHOLD_PX) {
                // Past slop: this is a scroll, not a long-press. Cancel the timer.
                // The tap (click) is handled natively and won't fire after a scroll.
                clearTimer();
            }
        },
        [clearTimer],
    );

    const onPointerUp = useCallback(() => {
        clearTimer();
    }, [clearTimer]);

    const onPointerCancel = useCallback(() => {
        clearTimer();
    }, [clearTimer]);

    // The tap. `click` fires only on a genuine tap — the browser suppresses it
    // when the touch turned into a scroll — so this reliably distinguishes the
    // two without fighting pointercancel. Skip it right after a long-press.
    const onClick = useCallback(() => {
        if (suppressClickRef.current) {
            suppressClickRef.current = false;
            return;
        }
        onPress?.();
    }, [onPress]);

    // Prevent the iOS long-press callout / context menu from hijacking the gesture.
    const onContextMenu = useCallback((event: React.MouseEvent) => {
        event.preventDefault();
    }, []);

    return { onClick, onContextMenu, onPointerCancel, onPointerDown, onPointerMove, onPointerUp };
};
