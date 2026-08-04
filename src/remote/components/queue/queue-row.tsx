import formatDuration from 'format-duration';
import { PointerEvent, Ref } from 'react';
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
    isCurrent: boolean;
    isDragging?: boolean;
    onDragPointerCancel: (event: PointerEvent<HTMLDivElement>) => void;
    onDragPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
    onDragPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
    onDragPointerUp: (event: PointerEvent<HTMLDivElement>) => void;
    onLongPress: () => void;
    onPress: () => void;
    rowRef?: Ref<HTMLDivElement>;
    serverId: string;
}

export const QueueRow = ({
    dragOffsetY,
    entry,
    isCurrent,
    isDragging,
    onDragPointerCancel,
    onDragPointerDown,
    onDragPointerMove,
    onDragPointerUp,
    onLongPress,
    onPress,
    rowRef,
    serverId,
}: QueueRowProps) => {
    const longPress = useLongPress({ onLongPress, onPress });

    return (
        <div
            ref={rowRef}
            style={{
                alignItems: 'center',
                display: 'flex',
                gap: 4,
                height: QUEUE_ROW_HEIGHT,
                padding: '0 4px 0 12px',
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
                onPointerCancel={onDragPointerCancel}
                onPointerDown={onDragPointerDown}
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
};
