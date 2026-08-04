import { PointerEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RiArrowLeftLine, RiDeleteBinLine, RiShuffleLine } from 'react-icons/ri';
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
    const [openSwipeUniqueId, setOpenSwipeUniqueId] = useState<null | string>(null);
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
            setOpenSwipeUniqueId(null);
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
            // A reorder drag and an open swipe-actions row would otherwise
            // fight over the row's transform, so starting a reorder always
            // closes whatever swipe row is open.
            setOpenSwipeUniqueId(null);
        },
        [entries],
    );

    // Computes the dragged item's target index directly from the pointer-down
    // snapshot (not the live, possibly-already-reordered `entries`), and the
    // preview list is rebuilt from that same snapshot on every move. This is
    // what makes the drag symmetric: `rawTarget` depends only on
    // `drag.startIndex` and the raw pointer delta, never on where the item
    // ended up after a previous move, so there is nothing to accumulate and
    // dragging 5 slots down behaves exactly like dragging 5 slots up.
    const computeDragTarget = useCallback((drag: DragState, clientY: number) => {
        const deltaY = clientY - drag.startY;
        const rawTarget = Math.min(
            Math.max(drag.startIndex + Math.round(deltaY / QUEUE_ROW_HEIGHT), 0),
            drag.snapshot.length - 1,
        );
        return { deltaY, rawTarget };
    }, []);

    const buildPreview = useCallback((drag: DragState, rawTarget: number) => {
        const draggedEntry = drag.snapshot[drag.startIndex];
        const withoutDragged = drag.snapshot.filter((e) => e.uniqueId !== drag.uniqueId);
        const preview = withoutDragged.slice();
        preview.splice(rawTarget, 0, draggedEntry);
        return preview;
    }, []);

    const handleDragPointerMove = useCallback(
        (event: PointerEvent<HTMLDivElement>) => {
            const drag = dragStateRef.current;
            if (!drag || event.pointerId !== drag.pointerId) return;

            const { deltaY, rawTarget } = computeDragTarget(drag, event.clientY);

            setEntries(buildPreview(drag, rawTarget));
            setDragOffsetY(deltaY - (rawTarget - drag.startIndex) * QUEUE_ROW_HEIGHT);
        },
        [buildPreview, computeDragTarget],
    );

    const endDrag = useCallback(
        (event: PointerEvent<HTMLDivElement>) => {
            const drag = dragStateRef.current;

            dragStateRef.current = null;
            draggingRef.current = false;
            setDragUniqueId(null);
            setDragOffsetY(0);

            if (!drag || event.pointerId !== drag.pointerId) return;

            let moveSent = false;

            if (drag.snapshot.length > 1) {
                const { rawTarget } = computeDragTarget(drag, event.clientY);

                if (rawTarget !== drag.startIndex) {
                    const finalOrder = buildPreview(drag, rawTarget);
                    const targetEntry = rawTarget === 0 ? finalOrder[1] : finalOrder[rawTarget - 1];
                    const edge = rawTarget === 0 ? 'top' : 'bottom';

                    if (targetEntry) {
                        queueMove(edge, targetEntry.uniqueId, [drag.uniqueId]);
                        moveSent = true;
                    }
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
        [buildPreview, computeDragTarget, queueMove],
    );

    const handleSwipeDelete = useCallback(
        (entry: RemoteQueueEntry) => queueRemove([entry.uniqueId]),
        [queueRemove],
    );

    // "Play next": move the entry to right after the currently-playing track.
    // If there is no current track, or the entry being moved IS the current
    // track (there is no "after itself" to move to), fall back to moving it
    // to the very top of the queue instead.
    const handleSwipeNext = useCallback(
        (entry: RemoteQueueEntry) => {
            const current = entriesRef.current;

            if (currentUniqueId && entry.uniqueId !== currentUniqueId) {
                queueMove('bottom', currentUniqueId, [entry.uniqueId]);
                return;
            }

            const first = current[0];
            if (first && first.uniqueId !== entry.uniqueId) {
                queueMove('top', first.uniqueId, [entry.uniqueId]);
            }
        },
        [currentUniqueId, queueMove],
    );

    // "Play last": move the entry to the end of the queue.
    const handleSwipeLast = useCallback(
        (entry: RemoteQueueEntry) => {
            const current = entriesRef.current;
            const last = current[current.length - 1];

            if (last && last.uniqueId !== entry.uniqueId) {
                queueMove('bottom', last.uniqueId, [entry.uniqueId]);
            }
        },
        [queueMove],
    );

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
                            isSwipeOpen={openSwipeUniqueId === entry.uniqueId}
                            key={entry.uniqueId}
                            onDragLostPointerCapture={endDrag}
                            onDragPointerCancel={endDrag}
                            onDragPointerDown={handleDragPointerDown}
                            onDragPointerMove={handleDragPointerMove}
                            onDragPointerUp={endDrag}
                            onPress={handlePress}
                            onSwipeDelete={handleSwipeDelete}
                            onSwipeLast={handleSwipeLast}
                            onSwipeNext={handleSwipeNext}
                            onSwipeOpenChange={setOpenSwipeUniqueId}
                            rowRef={entry.uniqueId === currentUniqueId ? currentRowRef : undefined}
                            serverId={serverId}
                        />
                    ))
                )}
            </div>
            <ActionSheet
                actions={clearActions}
                onClose={() => setConfirmClear(false)}
                opened={confirmClear}
                title="Clear the entire queue?"
            />
        </Flex>
    );
};
