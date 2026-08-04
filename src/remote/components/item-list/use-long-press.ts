import { useCallback, useRef } from 'react';

const LONG_PRESS_DELAY_MS = 500;
// Touch slop: movement past this many px turns the gesture into a scroll and
// cancels BOTH the long-press and the tap. ~10px matches iOS/Android list slop.
const MOVE_CANCEL_THRESHOLD_PX = 10;

interface UseLongPressOptions {
    onLongPress: () => void;
    onPress?: () => void;
}

export const useLongPress = ({ onLongPress, onPress }: UseLongPressOptions) => {
    const timeoutRef = useRef<null | ReturnType<typeof setTimeout>>(null);
    const startPosRef = useRef<null | { x: number; y: number }>(null);
    const firedLongPressRef = useRef(false);
    const movedRef = useRef(false);

    const clearTimer = useCallback(() => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
    }, []);

    const onPointerDown = useCallback(
        (event: React.PointerEvent) => {
            firedLongPressRef.current = false;
            movedRef.current = false;
            startPosRef.current = { x: event.clientX, y: event.clientY };
            clearTimer();
            timeoutRef.current = setTimeout(() => {
                firedLongPressRef.current = true;
                onLongPress();
            }, LONG_PRESS_DELAY_MS);
        },
        [clearTimer, onLongPress],
    );

    const onPointerMove = useCallback(
        (event: React.PointerEvent) => {
            const start = startPosRef.current;

            if (!start || movedRef.current) {
                return;
            }

            const dx = event.clientX - start.x;
            const dy = event.clientY - start.y;

            if (Math.sqrt(dx * dx + dy * dy) > MOVE_CANCEL_THRESHOLD_PX) {
                // Past slop: this is a scroll, not a tap. Cancel the long-press
                // timer and latch `moved` so pointerup does NOT fire onPress.
                movedRef.current = true;
                clearTimer();
            }
        },
        [clearTimer],
    );

    const onPointerUp = useCallback(() => {
        clearTimer();

        if (!firedLongPressRef.current && !movedRef.current) {
            onPress?.();
        }
    }, [clearTimer, onPress]);

    const onPointerCancel = useCallback(() => {
        // The browser took over the gesture as a scroll — never a tap.
        movedRef.current = true;
        clearTimer();
    }, [clearTimer]);

    return { onPointerCancel, onPointerDown, onPointerMove, onPointerUp };
};
