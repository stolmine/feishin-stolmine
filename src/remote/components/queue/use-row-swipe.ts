import { PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from 'react';

// Past this many px of combined movement, a gesture commits to a direction
// (horizontal swipe vs vertical scroll) and never re-evaluates — this avoids
// jitter/flip-flopping right at the slop boundary.
const SWIPE_SLOP_PX = 8;
// Fraction of the full reveal width the drag must cross before release snaps
// the row open instead of springing back closed.
const SWIPE_OPEN_THRESHOLD_RATIO = 0.4;

interface GestureState {
    baseOffset: number;
    direction: 'horizontal' | 'vertical' | null;
    pointerId: number;
    startX: number;
    startY: number;
}

interface UseRowSwipeOptions {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    revealWidth: number;
}

// Drives the iOS-style "swipe left to reveal actions" gesture on a queue row.
// Deliberately does NOT call `setPointerCapture` (and does not touch the
// timeline) until a drag is confirmed horizontal, so a vertical touch is left
// alone for the browser's native `pan-y` scroll, and a plain tap is left
// alone for the row's native `click` handler.
export const useRowSwipe = ({ isOpen, onOpenChange, revealWidth }: UseRowSwipeOptions) => {
    const [offsetX, setOffsetX] = useState(() => (isOpen ? -revealWidth : 0));
    const [isDragging, setIsDragging] = useState(false);
    const gestureRef = useRef<GestureState | null>(null);

    // Snap to the controlled `isOpen` value whenever it changes from outside
    // (another row opened, or this row's own release just closed/opened it)
    // as long as no gesture is currently in flight.
    useEffect(() => {
        if (!gestureRef.current) {
            setOffsetX(isOpen ? -revealWidth : 0);
        }
    }, [isOpen, revealWidth]);

    const onPointerDown = useCallback(
        (event: ReactPointerEvent<HTMLDivElement>) => {
            gestureRef.current = {
                baseOffset: isOpen ? -revealWidth : 0,
                direction: null,
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
            };
        },
        [isOpen, revealWidth],
    );

    const onPointerMove = useCallback(
        (event: ReactPointerEvent<HTMLDivElement>) => {
            const gesture = gestureRef.current;
            if (!gesture || event.pointerId !== gesture.pointerId) return;

            const dx = event.clientX - gesture.startX;
            const dy = event.clientY - gesture.startY;

            if (gesture.direction === null) {
                if (Math.abs(dx) < SWIPE_SLOP_PX && Math.abs(dy) < SWIPE_SLOP_PX) return;

                if (Math.abs(dx) <= Math.abs(dy)) {
                    // Vertical wins: hand off to native scrolling untouched.
                    gestureRef.current = null;
                    return;
                }

                gesture.direction = 'horizontal';
                event.currentTarget.setPointerCapture(event.pointerId);
                setIsDragging(true);
            }

            const next = Math.min(0, Math.max(-revealWidth, gesture.baseOffset + dx));
            setOffsetX(next);
        },
        [revealWidth],
    );

    const endGesture = useCallback(
        (event: ReactPointerEvent<HTMLDivElement>) => {
            const gesture = gestureRef.current;
            if (!gesture || event.pointerId !== gesture.pointerId) return;

            gestureRef.current = null;

            if (gesture.direction !== 'horizontal') return;

            setIsDragging(false);

            const dx = event.clientX - gesture.startX;
            const finalOffset = Math.min(0, Math.max(-revealWidth, gesture.baseOffset + dx));
            const shouldOpen = finalOffset <= -revealWidth * SWIPE_OPEN_THRESHOLD_RATIO;

            setOffsetX(shouldOpen ? -revealWidth : 0);
            onOpenChange(shouldOpen);
        },
        [onOpenChange, revealWidth],
    );

    const onPointerCancel = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        const gesture = gestureRef.current;
        if (!gesture || event.pointerId !== gesture.pointerId) return;

        gestureRef.current = null;

        if (gesture.direction === 'horizontal') {
            setIsDragging(false);
            setOffsetX(gesture.baseOffset);
        }
    }, []);

    const onLostPointerCapture = useCallback(() => {
        setIsDragging(false);
    }, []);

    return {
        handlers: {
            onLostPointerCapture,
            onPointerCancel,
            onPointerDown,
            onPointerMove,
            onPointerUp: endGesture,
        },
        isDragging,
        offsetX,
    };
};
