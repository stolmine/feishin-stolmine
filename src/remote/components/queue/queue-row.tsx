import formatDuration from 'format-duration';
import { memo, PointerEvent, Ref, useCallback } from 'react';
import {
    RiArrowRightDoubleLine,
    RiDeleteBinLine,
    RiDraggable,
    RiPlayFill,
    RiSkipForwardLine,
} from 'react-icons/ri';

import { CoverImage } from '/@/remote/components/item-list/cover-image';
import { useRowSwipe } from '/@/remote/components/queue/use-row-swipe';
import { Group } from '/@/shared/components/group/group';
import { Text } from '/@/shared/components/text/text';
import { RemoteQueueEntry } from '/@/shared/types/remote-types';

// Fixed row height drives the drag-reorder math in queue.tsx (index deltas are
// computed from pointer travel divided by this constant), so it must match the
// rendered height below.
export const QUEUE_ROW_HEIGHT = 64;

const SWIPE_ACTION_WIDTH = 72;
const SWIPE_ACTION_COUNT = 3;
export const QUEUE_ROW_REVEAL_WIDTH = SWIPE_ACTION_WIDTH * SWIPE_ACTION_COUNT;

interface QueueRowProps {
    dragOffsetY?: number;
    entry: RemoteQueueEntry;
    index: number;
    isCurrent: boolean;
    isDragging?: boolean;
    isSwipeOpen: boolean;
    onDragLostPointerCapture: (event: PointerEvent<HTMLDivElement>) => void;
    onDragPointerCancel: (event: PointerEvent<HTMLDivElement>) => void;
    onDragPointerDown: (
        entry: RemoteQueueEntry,
        index: number,
        event: PointerEvent<HTMLDivElement>,
    ) => void;
    onDragPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
    onDragPointerUp: (event: PointerEvent<HTMLDivElement>) => void;
    onPress: (entry: RemoteQueueEntry) => void;
    onSwipeDelete: (entry: RemoteQueueEntry) => void;
    onSwipeLast: (entry: RemoteQueueEntry) => void;
    onSwipeNext: (entry: RemoteQueueEntry) => void;
    onSwipeOpenChange: (uniqueId: null | string) => void;
    rowRef?: Ref<HTMLDivElement>;
    serverId: string;
}

export const QueueRow = memo(function QueueRow({
    dragOffsetY,
    entry,
    index,
    isCurrent,
    isDragging,
    isSwipeOpen,
    onDragLostPointerCapture,
    onDragPointerCancel,
    onDragPointerDown,
    onDragPointerMove,
    onDragPointerUp,
    onPress,
    onSwipeDelete,
    onSwipeLast,
    onSwipeNext,
    onSwipeOpenChange,
    rowRef,
    serverId,
}: QueueRowProps) {
    const handleDragPointerDown = useCallback(
        (event: PointerEvent<HTMLDivElement>) => onDragPointerDown(entry, index, event),
        [entry, index, onDragPointerDown],
    );

    const handleSwipeOpenChange = useCallback(
        (open: boolean) => onSwipeOpenChange(open ? entry.uniqueId : null),
        [entry.uniqueId, onSwipeOpenChange],
    );

    const {
        handlers: swipeHandlers,
        isDragging: isSwiping,
        offsetX,
    } = useRowSwipe({
        isOpen: isSwipeOpen,
        onOpenChange: handleSwipeOpenChange,
        revealWidth: QUEUE_ROW_REVEAL_WIDTH,
    });

    const handleClick = useCallback(() => {
        if (isSwipeOpen) {
            onSwipeOpenChange(null);
            return;
        }
        onPress(entry);
    }, [entry, isSwipeOpen, onPress, onSwipeOpenChange]);

    const handleDelete = useCallback(() => {
        onSwipeOpenChange(null);
        onSwipeDelete(entry);
    }, [entry, onSwipeDelete, onSwipeOpenChange]);

    const handleNext = useCallback(() => {
        onSwipeOpenChange(null);
        onSwipeNext(entry);
    }, [entry, onSwipeNext, onSwipeOpenChange]);

    const handleLast = useCallback(() => {
        onSwipeOpenChange(null);
        onSwipeLast(entry);
    }, [entry, onSwipeLast, onSwipeOpenChange]);

    return (
        <div
            ref={rowRef}
            style={{
                height: QUEUE_ROW_HEIGHT,
                position: 'relative',
                transform: isDragging ? `translateY(${dragOffsetY ?? 0}px)` : undefined,
                zIndex: isDragging ? 2 : undefined,
            }}
        >
            <div
                style={{ height: '100%', overflow: 'hidden', position: 'relative', width: '100%' }}
            >
                <div
                    style={{
                        alignItems: 'stretch',
                        bottom: 0,
                        display: 'flex',
                        position: 'absolute',
                        right: 0,
                        top: 0,
                        width: QUEUE_ROW_REVEAL_WIDTH,
                    }}
                >
                    <button
                        onClick={handleNext}
                        style={{
                            alignItems: 'center',
                            background: 'var(--theme-colors-surface)',
                            border: 'none',
                            color: 'var(--theme-colors-foreground)',
                            cursor: 'pointer',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 4,
                            justifyContent: 'center',
                            width: SWIPE_ACTION_WIDTH,
                        }}
                        type="button"
                    >
                        <RiSkipForwardLine size={20} />
                        <Text size="xs">Next</Text>
                    </button>
                    <button
                        onClick={handleLast}
                        style={{
                            alignItems: 'center',
                            background: 'var(--theme-colors-surface)',
                            border: 'none',
                            borderLeft: '1px solid var(--theme-colors-border)',
                            color: 'var(--theme-colors-foreground)',
                            cursor: 'pointer',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 4,
                            justifyContent: 'center',
                            width: SWIPE_ACTION_WIDTH,
                        }}
                        type="button"
                    >
                        <RiArrowRightDoubleLine size={20} />
                        <Text size="xs">Last</Text>
                    </button>
                    <button
                        onClick={handleDelete}
                        style={{
                            alignItems: 'center',
                            background: 'var(--theme-colors-state-error, #e03131)',
                            border: 'none',
                            color: 'var(--theme-colors-white, #fff)',
                            cursor: 'pointer',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 4,
                            justifyContent: 'center',
                            width: SWIPE_ACTION_WIDTH,
                        }}
                        type="button"
                    >
                        <RiDeleteBinLine size={20} />
                        <Text size="xs">Delete</Text>
                    </button>
                </div>
                <div
                    style={{
                        alignItems: 'center',
                        background: 'var(--theme-colors-background)',
                        display: 'flex',
                        gap: 4,
                        height: '100%',
                        padding: '0 8px 0 16px',
                        position: 'relative',
                        transform: `translateX(${offsetX}px)`,
                        transition: isSwiping ? undefined : 'transform 180ms ease',
                    }}
                >
                    <div
                        onClick={handleClick}
                        onLostPointerCapture={swipeHandlers.onLostPointerCapture}
                        onPointerCancel={swipeHandlers.onPointerCancel}
                        onPointerDown={swipeHandlers.onPointerDown}
                        onPointerMove={swipeHandlers.onPointerMove}
                        onPointerUp={swipeHandlers.onPointerUp}
                        style={{
                            alignItems: 'center',
                            cursor: 'pointer',
                            display: 'flex',
                            flex: 1,
                            gap: 12,
                            minWidth: 0,
                            touchAction: 'pan-y',
                            userSelect: 'none',
                            WebkitTouchCallout: 'none',
                        }}
                    >
                        <CoverImage imageId={entry.imageId} serverId={serverId} size={48} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <Group gap={4} wrap="nowrap">
                                {isCurrent && (
                                    <RiPlayFill color="var(--theme-colors-primary)" size={14} />
                                )}
                                <Text
                                    fw={isCurrent ? 700 : 500}
                                    lineClamp={1}
                                    style={
                                        isCurrent
                                            ? { color: 'var(--theme-colors-primary)' }
                                            : undefined
                                    }
                                >
                                    {entry.name}
                                </Text>
                            </Group>
                            <Text isMuted lineClamp={1} size="sm">
                                {entry.album
                                    ? `${entry.artistName} — ${entry.album}`
                                    : entry.artistName}
                            </Text>
                        </div>
                        <Text isMuted size="xs">
                            {formatDuration(entry.duration)}
                        </Text>
                    </div>
                    <div
                        onLostPointerCapture={onDragLostPointerCapture}
                        onPointerCancel={onDragPointerCancel}
                        onPointerDown={handleDragPointerDown}
                        onPointerMove={onDragPointerMove}
                        onPointerUp={onDragPointerUp}
                        style={{
                            alignItems: 'center',
                            color: 'var(--theme-colors-foreground-muted)',
                            cursor: 'grab',
                            display: 'flex',
                            height: '100%',
                            padding: '0 8px',
                            touchAction: 'none',
                        }}
                    >
                        <RiDraggable size={20} />
                    </div>
                </div>
            </div>
        </div>
    );
});
