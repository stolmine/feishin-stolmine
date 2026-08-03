import { useCallback, useRef } from 'react';

const LONG_PRESS_DELAY_MS = 500;
const MOVE_CANCEL_THRESHOLD_PX = 8;

interface UseLongPressOptions {
    onLongPress: () => void;
    onPress?: () => void;
}

export const useLongPress = ({ onLongPress, onPress }: UseLongPressOptions) => {
    const timeoutRef = useRef<null | ReturnType<typeof setTimeout>>(null);
    const startPosRef = useRef<null | { x: number; y: number }>(null);
    const firedLongPressRef = useRef(false);

    const clearTimer = useCallback(() => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
    }, []);

    const onPointerDown = useCallback(
        (event: React.PointerEvent) => {
            firedLongPressRef.current = false;
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

            if (!start) {
                return;
            }

            const dx = event.clientX - start.x;
            const dy = event.clientY - start.y;

            if (Math.sqrt(dx * dx + dy * dy) > MOVE_CANCEL_THRESHOLD_PX) {
                clearTimer();
            }
        },
        [clearTimer],
    );

    const onPointerUp = useCallback(() => {
        clearTimer();

        if (!firedLongPressRef.current) {
            onPress?.();
        }
    }, [clearTimer, onPress]);

    const onPointerCancel = useCallback(() => {
        clearTimer();
    }, [clearTimer]);

    return { onPointerCancel, onPointerDown, onPointerMove, onPointerUp };
};
