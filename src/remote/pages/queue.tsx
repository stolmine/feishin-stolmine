import { PointerEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RiArrowLeftLine, RiDeleteBinLine, RiPlayFill, RiShuffleLine } from 'react-icons/ri';
import { useNavigate } from 'react-router';

import { ActionItem, ActionSheet } from '/@/remote/components/action-sheet';
import { PageHeader } from '/@/remote/components/page-header';
import { QUEUE_ROW_HEIGHT, QueueRow } from '/@/remote/components/queue/queue-row';
import { useConnected, useQueue, useQueueActions, useRemoteStore } from '/@/remote/store';
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
    const entriesRef = useRef<RemoteQueueEntry[]>(entries);
    const hasAutoScrolledRef = useRef(false);

    // Kept in sync with `entries` during render (not an effect) so `endDrag`
    // can read the latest optimistic order synchronously without putting the
    // `queueMove` side effect inside the `setEntries` updater itself — doing
    // that would be impure and StrictMode's double-invoked updaters would
    // send the move twice.
    entriesRef.current = entries;

    useEffect(() => {
        // Redundant on a warm connection (sendInitialState already delivers the
        // queue on connect), but required after a cold load of #/queue: firing
        // this before App's reconnect() has an open socket would otherwise
        // trigger a spurious "Reconnecting…" toast and race-close the
        // in-flight CONNECTING socket.
        if (connected) {
            queueRequest();
        }
    }, [connected, queueRequest]);

    useEffect(() => {
        if (!queue || draggingRef.current) return;

        setEntries(queue.entries);

        if (queue.entries.length > LARGE_QUEUE_LOG_THRESHOLD) {
            logger.debug('Rendering large queue without virtualization', {
                count: queue.entries.length,
            });
        }
    }, [queue]);

    // A dropped socket unmounts the drag handle mid-drag, so pointerup/cancel
    // never fires and draggingRef would otherwise stay stuck `true` forever,
    // freezing all future queue syncs.
    useEffect(() => {
        if (!queue) {
            draggingRef.current = false;
            dragStateRef.current = null;
            setDragUniqueId(null);
            setDragOffsetY(0);
        }
    }, [queue]);

    const currentUniqueId = useMemo(() => {
        if (!queue) return null;
        if (queue.currentUniqueId) return queue.currentUniqueId;
        if (queue.currentIndex >= 0) return queue.entries[queue.currentIndex]?.uniqueId ?? null;
        return null;
    }, [queue]);

    // Only follow the current track into view once, when the queue page is
    // first opened — not on every later track change, which would yank the
    // list out from under a user scrolled elsewhere (and could scroll the
    // container mid-drag, desyncing the pointer-based index math).
    useEffect(() => {
        if (hasAutoScrolledRef.current || draggingRef.current || !currentUniqueId) return;

        currentRowRef.current?.scrollIntoView({ block: 'center' });
        hasAutoScrolledRef.current = true;
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

            dragStateRef.current = null;
            draggingRef.current = false;
            setDragUniqueId(null);
            setDragOffsetY(0);

            if (!drag || event.pointerId !== drag.pointerId) return;

            const current = entriesRef.current;
            const finalIndex = current.findIndex((e) => e.uniqueId === drag.uniqueId);
            let moveSent = false;

            if (finalIndex !== -1 && finalIndex !== drag.startIndex) {
                const targetEntry = finalIndex === 0 ? current[1] : current[finalIndex - 1];
                const edge = finalIndex === 0 ? 'top' : 'bottom';
                if (targetEntry) {
                    queueMove(edge, targetEntry.uniqueId, [drag.uniqueId]);
                    moveSent = true;
                }
            }

            if (!moveSent) {
                // No-op drag (or the target entry vanished): nothing was sent, so
                // no rebroadcast will arrive to reconcile. Re-sync from the latest
                // store snapshot now, otherwise a broadcast skipped while
                // draggingRef was true is lost until an unrelated future change.
                const latest = useRemoteStore.getState().queue;
                if (latest) setEntries(latest.entries);
            }
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
            <PageHeader
                actions={
                    <ActionIcon
                        disabled={entries.length === 0}
                        onClick={() => setConfirmClear(true)}
                        size="md"
                        tooltip={{ label: 'Clear queue' }}
                        variant="subtle"
                    >
                        <RiDeleteBinLine size={20} />
                    </ActionIcon>
                }
            >
                <Group gap="xs" wrap="nowrap">
                    <ActionIcon onClick={() => navigate(-1)} size="md" variant="subtle">
                        <RiArrowLeftLine size={22} />
                    </ActionIcon>
                    <Text
                        fw={700}
                        style={{
                            fontSize: '1.5rem',
                            letterSpacing: '-0.02em',
                            lineHeight: 1.2,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        Queue
                    </Text>
                    {queue.shuffle && (
                        <RiShuffleLine color="var(--theme-colors-primary)" size={18} />
                    )}
                </Group>
            </PageHeader>
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
                            index={index}
                            isCurrent={entry.uniqueId === currentUniqueId}
                            isDragging={dragUniqueId === entry.uniqueId}
                            key={entry.uniqueId}
                            onDragLostPointerCapture={endDrag}
                            onDragPointerCancel={endDrag}
                            onDragPointerDown={handleDragPointerDown}
                            onDragPointerMove={handleDragPointerMove}
                            onDragPointerUp={endDrag}
                            onLongPress={handleLongPress}
                            onPress={handlePress}
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
