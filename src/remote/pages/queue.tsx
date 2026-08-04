import { PointerEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RiArrowLeftLine, RiDeleteBinLine, RiPlayFill, RiShuffleLine } from 'react-icons/ri';
import { useNavigate } from 'react-router';

import { ActionItem, ActionSheet } from '/@/remote/components/action-sheet';
import { QUEUE_ROW_HEIGHT, QueueRow } from '/@/remote/components/queue/queue-row';
import { useConnected, useQueue, useQueueActions } from '/@/remote/store';
import { useCurrentServerId } from '/@/renderer/store/auth.store';
import { logger } from '/@/renderer/utils/logger';
import { ActionIcon } from '/@/shared/components/action-icon/action-icon';
import { Center } from '/@/shared/components/center/center';
import { Flex } from '/@/shared/components/flex/flex';
import { Group } from '/@/shared/components/group/group';
import { Spinner } from '/@/shared/components/spinner/spinner';
import { Text } from '/@/shared/components/text/text';
import { RemoteQueueEntry } from '/@/shared/types/remote-types';

// The current queue is typically tens-to-hundreds of tracks. A plain
// scrollable list keeps touch drag-reorder simple to implement correctly; if
// the queue regularly exceeds this size it should move to a virtualized list
// instead (accepted P2 tradeoff — not implemented here).
const LARGE_QUEUE_LOG_THRESHOLD = 500;

interface DragState {
    pointerId: number;
    snapshot: RemoteQueueEntry[];
    startIndex: number;
    startY: number;
    uniqueId: string;
}

export const QueuePage = () => {
    const connected = useConnected();
    const queue = useQueue();
    const { queueClear, queueMove, queuePlay, queueRemove, queueRequest } = useQueueActions();
    const serverId = useCurrentServerId();
    const navigate = useNavigate();

    const [entries, setEntries] = useState<RemoteQueueEntry[]>(() => queue?.entries ?? []);
    const [dragUniqueId, setDragUniqueId] = useState<null | string>(null);
    const [dragOffsetY, setDragOffsetY] = useState(0);
    const [selected, setSelected] = useState<null | RemoteQueueEntry>(null);
    const [confirmClear, setConfirmClear] = useState(false);

    // Mirrors dragUniqueId but read inside the `queue` sync effect without
    // making that effect depend on drag state, so a broadcast that arrives
    // mid-drag is skipped rather than clobbering the optimistic reorder.
    const draggingRef = useRef(false);
    const dragStateRef = useRef<DragState | null>(null);
    const currentRowRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        // Force a fresh snapshot whenever the queue view is opened.
        queueRequest();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!queue || draggingRef.current) return;

        setEntries(queue.entries);

        if (queue.entries.length > LARGE_QUEUE_LOG_THRESHOLD) {
            logger.debug('Rendering large queue without virtualization', {
                count: queue.entries.length,
            });
        }
    }, [queue]);

    const currentUniqueId = useMemo(() => {
        if (!queue) return null;
        if (queue.currentUniqueId) return queue.currentUniqueId;
        if (queue.currentIndex >= 0) return queue.entries[queue.currentIndex]?.uniqueId ?? null;
        return null;
    }, [queue]);

    useEffect(() => {
        currentRowRef.current?.scrollIntoView({ block: 'center' });
    }, [currentUniqueId]);

    const handlePress = useCallback(
        (entry: RemoteQueueEntry) => queuePlay(entry.uniqueId),
        [queuePlay],
    );

    const handleLongPress = useCallback((entry: RemoteQueueEntry) => setSelected(entry), []);

    const handleDragPointerDown = useCallback(
        (entry: RemoteQueueEntry, index: number, event: PointerEvent<HTMLDivElement>) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            draggingRef.current = true;
            dragStateRef.current = {
                pointerId: event.pointerId,
                snapshot: entries,
                startIndex: index,
                startY: event.clientY,
                uniqueId: entry.uniqueId,
            };
            setDragUniqueId(entry.uniqueId);
            setDragOffsetY(0);
        },
        [entries],
    );

    const handleDragPointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
        const drag = dragStateRef.current;
        if (!drag || event.pointerId !== drag.pointerId) return;

        const deltaY = event.clientY - drag.startY;
        const indexDelta = Math.round(deltaY / QUEUE_ROW_HEIGHT);
        const newIndex = Math.min(
            Math.max(drag.startIndex + indexDelta, 0),
            drag.snapshot.length - 1,
        );

        setEntries((current) => {
            const fromIndex = current.findIndex((e) => e.uniqueId === drag.uniqueId);
            if (fromIndex === -1 || fromIndex === newIndex) return current;

            const next = current.slice();
            const [moved] = next.splice(fromIndex, 1);
            next.splice(newIndex, 0, moved);
            return next;
        });

        setDragOffsetY(deltaY - indexDelta * QUEUE_ROW_HEIGHT);
    }, []);

    const endDrag = useCallback(
        (event: PointerEvent<HTMLDivElement>) => {
            const drag = dragStateRef.current;
            if (!drag || event.pointerId !== drag.pointerId) return;

            setEntries((current) => {
                const finalIndex = current.findIndex((e) => e.uniqueId === drag.uniqueId);
                if (finalIndex !== -1 && finalIndex !== drag.startIndex) {
                    const targetEntry = finalIndex === 0 ? current[1] : current[finalIndex - 1];
                    const edge = finalIndex === 0 ? 'top' : 'bottom';
                    if (targetEntry) {
                        queueMove(edge, targetEntry.uniqueId, [drag.uniqueId]);
                    }
                }
                return current;
            });

            dragStateRef.current = null;
            draggingRef.current = false;
            setDragUniqueId(null);
            setDragOffsetY(0);
        },
        [queueMove],
    );

    const selectedActions = useMemo<ActionItem[]>(() => {
        if (!selected) return [];

        return [
            {
                icon: <RiPlayFill size={20} />,
                label: 'Play',
                onClick: () => {
                    queuePlay(selected.uniqueId);
                    setSelected(null);
                },
            },
            {
                icon: <RiDeleteBinLine size={20} />,
                label: 'Remove from queue',
                onClick: () => {
                    queueRemove([selected.uniqueId]);
                    setSelected(null);
                },
            },
        ];
    }, [queuePlay, queueRemove, selected]);

    const clearActions = useMemo<ActionItem[]>(
        () => [
            {
                icon: <RiDeleteBinLine size={20} />,
                label: 'Clear queue',
                onClick: () => {
                    queueClear();
                    setConfirmClear(false);
                },
            },
        ],
        [queueClear],
    );

    if (!connected || !queue) {
        return (
            <Center h="100%" w="100%">
                <Spinner container />
            </Center>
        );
    }

    return (
        <Flex direction="column" h="100%" w="100%">
            <Group justify="space-between" p="md" wrap="nowrap">
                <Group gap="xs" wrap="nowrap">
                    <ActionIcon onClick={() => navigate(-1)} variant="transparent">
                        <RiArrowLeftLine size={22} />
                    </ActionIcon>
                    <Text fw={700} size="lg">
                        Queue
                    </Text>
                    {queue.shuffle && (
                        <RiShuffleLine color="var(--theme-colors-primary)" size={18} />
                    )}
                </Group>
                <ActionIcon
                    disabled={entries.length === 0}
                    onClick={() => setConfirmClear(true)}
                    tooltip={{ label: 'Clear queue' }}
                    variant="transparent"
                >
                    <RiDeleteBinLine size={20} />
                </ActionIcon>
            </Group>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                {entries.length === 0 ? (
                    <Center h="100%" w="100%">
                        <Text isMuted>Queue is empty</Text>
                    </Center>
                ) : (
                    entries.map((entry, index) => (
                        <QueueRow
                            dragOffsetY={dragUniqueId === entry.uniqueId ? dragOffsetY : undefined}
                            entry={entry}
                            isCurrent={entry.uniqueId === currentUniqueId}
                            isDragging={dragUniqueId === entry.uniqueId}
                            key={entry.uniqueId}
                            onDragPointerCancel={endDrag}
                            onDragPointerDown={(event) =>
                                handleDragPointerDown(entry, index, event)
                            }
                            onDragPointerMove={handleDragPointerMove}
                            onDragPointerUp={endDrag}
                            onLongPress={() => handleLongPress(entry)}
                            onPress={() => handlePress(entry)}
                            rowRef={entry.uniqueId === currentUniqueId ? currentRowRef : undefined}
                            serverId={serverId}
                        />
                    ))
                )}
            </div>
            <ActionSheet
                actions={selectedActions}
                onClose={() => setSelected(null)}
                opened={!!selected}
                title={selected?.name}
            />
            <ActionSheet
                actions={clearActions}
                onClose={() => setConfirmClear(false)}
                opened={confirmClear}
                title="Clear the entire queue?"
            />
        </Flex>
    );
};
