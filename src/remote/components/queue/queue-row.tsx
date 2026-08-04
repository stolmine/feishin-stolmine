import formatDuration from 'format-duration';
import { memo, PointerEvent, Ref, useCallback } from 'react';
import { RiDraggable, RiPlayFill } from 'react-icons/ri';

import { CoverImage } from '/@/remote/components/item-list/cover-image';
import { useLongPress } from '/@/remote/components/item-list/use-long-press';
import { Group } from '/@/shared/components/group/group';
import { Text } from '/@/shared/components/text/text';
import { RemoteQueueEntry } from '/@/shared/types/remote-types';

// Fixed row height drives the drag-reorder math in queue.tsx (index deltas are
// computed from pointer travel divided by this constant), so it must match the
// rendered height below.
export const QUEUE_ROW_HEIGHT = 64;

interface QueueRowProps {
    dragOffsetY?: number;
    entry: RemoteQueueEntry;
    index: number;
    isCurrent: boolean;
    isDragging?: boolean;
    onDragLostPointerCapture: (event: PointerEvent<HTMLDivElement>) => void;
    onDragPointerCancel: (event: PointerEvent<HTMLDivElement>) => void;
    onDragPointerDown: (
        entry: RemoteQueueEntry,
        index: number,
        event: PointerEvent<HTMLDivElement>,
    ) => void;
    onDragPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
    onDragPointerUp: (event: PointerEvent<HTMLDivElement>) => void;
    onLongPress: (entry: RemoteQueueEntry) => void;
    onPress: (entry: RemoteQueueEntry) => void;
    rowRef?: Ref<HTMLDivElement>;
    serverId: string;
}

export const QueueRow = memo(function QueueRow({
    dragOffsetY,
    entry,
    index,
    isCurrent,
    isDragging,
    onDragLostPointerCapture,
    onDragPointerCancel,
    onDragPointerDown,
    onDragPointerMove,
    onDragPointerUp,
    onLongPress,
    onPress,
    rowRef,
    serverId,
}: QueueRowProps) {
    const handlePress = useCallback(() => onPress(entry), [entry, onPress]);
    const handleLongPress = useCallback(() => onLongPress(entry), [entry, onLongPress]);
    const handleDragPointerDown = useCallback(
        (event: PointerEvent<HTMLDivElement>) => onDragPointerDown(entry, index, event),
        [entry, index, onDragPointerDown],
    );
    const longPress = useLongPress({ onLongPress: handleLongPress, onPress: handlePress });

    return (
        <div
            ref={rowRef}
            style={{
                alignItems: 'center',
                display: 'flex',
                gap: 4,
                height: QUEUE_ROW_HEIGHT,
                padding: '0 8px 0 16px',
                position: 'relative',
                transform: isDragging ? `translateY(${dragOffsetY ?? 0}px)` : undefined,
                zIndex: isDragging ? 2 : undefined,
            }}
        >
            <div
                onClick={longPress.onClick}
                onContextMenu={longPress.onContextMenu}
                onPointerCancel={longPress.onPointerCancel}
                onPointerDown={longPress.onPointerDown}
                onPointerMove={longPress.onPointerMove}
                onPointerUp={longPress.onPointerUp}
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
                        {isCurrent && <RiPlayFill color="var(--theme-colors-primary)" size={14} />}
                        <Text
                            fw={isCurrent ? 700 : 500}
                            lineClamp={1}
                            style={isCurrent ? { color: 'var(--theme-colors-primary)' } : undefined}
                        >
                            {entry.name}
                        </Text>
                    </Group>
                    <Text isMuted lineClamp={1} size="sm">
                        {entry.album ? `${entry.artistName} — ${entry.album}` : entry.artistName}
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
    );
});
