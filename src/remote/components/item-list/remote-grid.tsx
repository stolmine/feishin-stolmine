import { memo, ReactElement, Ref, useImperativeHandle, useMemo } from 'react';
import { RiHeartFill } from 'react-icons/ri';
import { List, RowComponentProps, useListRef } from 'react-window-v2';

import { CoverImage } from '/@/remote/components/item-list/cover-image';
import {
    RemoteItemListProps,
    RemoteListHandle,
    RemoteListScrollOptions,
    RowData,
} from '/@/remote/components/item-list/types';
import { useLongPress } from '/@/remote/components/item-list/use-long-press';
import { useScrollRestoration } from '/@/remote/components/item-list/use-scroll-restoration';
import { Skeleton } from '/@/shared/components/skeleton/skeleton';
import { Text } from '/@/shared/components/text/text';
import { useElementSize } from '/@/shared/hooks/use-element-size';

const MIN_CARD_WIDTH_PX = 168;
const MIN_COLUMNS = 2;
const MAX_COLUMNS = 3;
const CARD_GAP_PX = 12;
const TEXT_BLOCK_HEIGHT_PX = 52;

const alignToRowAlign = (align?: RemoteListScrollOptions['align']) => {
    if (align === 'top') return 'start' as const;
    if (align === 'bottom') return 'end' as const;
    if (align === 'center') return 'center' as const;
    return 'auto' as const;
};

const getColumnCount = (width: number) => {
    if (!width) return MIN_COLUMNS;

    const columns = Math.floor(width / MIN_CARD_WIDTH_PX);

    return Math.min(MAX_COLUMNS, Math.max(MIN_COLUMNS, columns));
};

interface RemoteGridCardProps {
    getItem: (index: number) => RowData | undefined;
    index: number;
    onLongPress?: (item: RowData, index: number) => void;
    onPress?: (item: RowData, index: number) => void;
    serverId: string;
}

const RemoteGridCard = memo(
    ({ getItem, index, onLongPress, onPress, serverId }: RemoteGridCardProps) => {
        const item = getItem(index);

        const longPress = useLongPress({
            onLongPress: () => item && onLongPress?.(item, index),
            onPress: () => item && onPress?.(item, index),
        });

        if (!item) {
            return (
                <div style={{ display: 'flex', flex: 1, flexDirection: 'column', gap: 6 }}>
                    <Skeleton height="auto" style={{ aspectRatio: '1 / 1', width: '100%' }} />
                    <Skeleton height={14} width="80%" />
                </div>
            );
        }

        return (
            <div
                onClick={longPress.onClick}
                onContextMenu={longPress.onContextMenu}
                onPointerCancel={longPress.onPointerCancel}
                onPointerDown={longPress.onPointerDown}
                onPointerMove={longPress.onPointerMove}
                onPointerUp={longPress.onPointerUp}
                style={{
                    cursor: 'pointer',
                    display: 'flex',
                    flex: 1,
                    flexDirection: 'column',
                    touchAction: 'pan-y',
                    userSelect: 'none',
                    WebkitTouchCallout: 'none',
                }}
            >
                <div style={{ position: 'relative' }}>
                    <CoverImage
                        alt={item.title}
                        borderRadius={8}
                        imageId={item.imageId}
                        serverId={serverId}
                    />
                    {item.favorite && (
                        <div
                            style={{
                                alignItems: 'center',
                                background: 'rgba(0, 0, 0, 0.45)',
                                borderRadius: '50%',
                                bottom: 6,
                                display: 'flex',
                                justifyContent: 'center',
                                padding: 4,
                                position: 'absolute',
                                right: 6,
                            }}
                        >
                            <RiHeartFill color="var(--theme-colors-primary)" size={14} />
                        </div>
                    )}
                </div>
                {/* Title + subtitle grouped tightly just under the artwork; the
                    row's leftover height falls BELOW this block, so the visual
                    break sits between the subtitle and the next row's artwork
                    rather than between the title and subtitle. */}
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 1,
                        marginTop: 4,
                        minWidth: 0,
                    }}
                >
                    <Text fw={500} lineClamp={1} size="md">
                        {item.title}
                    </Text>
                    {item.subtitle && (
                        <Text isMuted lineClamp={1} size="sm">
                            {item.subtitle}
                        </Text>
                    )}
                </div>
            </div>
        );
    },
);

RemoteGridCard.displayName = 'RemoteGridCard';

interface RemoteGridRowProps {
    columns: number;
    getItem: (index: number) => RowData | undefined;
    itemCount: number;
    onLongPress?: (item: RowData, index: number) => void;
    onPress?: (item: RowData, index: number) => void;
    serverId: string;
}

const RemoteGridRow = memo(
    ({
        columns,
        getItem,
        index,
        itemCount,
        onLongPress,
        onPress,
        serverId,
        style,
    }: RowComponentProps<RemoteGridRowProps>) => {
        const startIndex = index * columns;

        return (
            <div
                style={{
                    ...style,
                    display: 'flex',
                    gap: CARD_GAP_PX,
                    padding: `0 ${CARD_GAP_PX}px`,
                }}
            >
                {Array.from({ length: columns }, (_, col) => {
                    const itemIndex = startIndex + col;

                    if (itemIndex >= itemCount) {
                        return <div key={`empty-${col}`} style={{ flex: 1 }} />;
                    }

                    return (
                        <RemoteGridCard
                            getItem={getItem}
                            index={itemIndex}
                            key={itemIndex}
                            onLongPress={onLongPress}
                            onPress={onPress}
                            serverId={serverId}
                        />
                    );
                })}
            </div>
        );
    },
);

RemoteGridRow.displayName = 'RemoteGridRow';

interface RemoteGridProps extends RemoteItemListProps {
    ref?: Ref<RemoteListHandle>;
    scrollKey?: string;
    serverId: string;
}

export const RemoteGrid = ({
    getItem,
    itemCount,
    onLongPress,
    onPress,
    onRangeChanged,
    ref,
    scrollKey,
    serverId,
}: RemoteGridProps) => {
    const { ref: sizeRef, width } = useElementSize();
    const listRef = useListRef(null);

    useScrollRestoration({
        getElement: () => listRef.current?.element,
        itemCount,
        ready: width > 0 && itemCount > 0,
        scrollKey,
    });

    const columns = getColumnCount(width);
    const rowCount = Math.ceil(itemCount / columns);
    const cardWidth = columns > 0 ? (width - CARD_GAP_PX * (columns + 1)) / columns : 0;
    const rowHeight = cardWidth + TEXT_BLOCK_HEIGHT_PX;

    const rowProps = useMemo<RemoteGridRowProps>(
        () => ({ columns, getItem, itemCount, onLongPress, onPress, serverId }),
        [columns, getItem, itemCount, onLongPress, onPress, serverId],
    );

    useImperativeHandle(
        ref,
        (): RemoteListHandle => ({
            scrollToIndex: (index, options) => {
                const row = Math.floor(index / columns);
                listRef.current?.scrollToRow({
                    align: alignToRowAlign(options?.align),
                    behavior: options?.behavior ?? 'auto',
                    index: row,
                });
            },
            scrollToOffset: (offset, options) => {
                listRef.current?.element?.scrollTo({
                    behavior: options?.behavior ?? 'auto',
                    top: offset,
                });
            },
        }),
        [columns, listRef],
    );

    return (
        <div ref={sizeRef} style={{ display: 'flex', flex: 1, minHeight: 0 }}>
            {width > 0 && rowHeight > 0 && (
                <List
                    listRef={listRef}
                    onRowsRendered={(visibleRows) => {
                        if (!onRangeChanged) return;
                        onRangeChanged({
                            startIndex: visibleRows.startIndex * columns,
                            stopIndex: Math.min(
                                itemCount - 1,
                                visibleRows.stopIndex * columns + columns - 1,
                            ),
                        });
                    }}
                    rowComponent={
                        RemoteGridRow as (
                            props: RowComponentProps<RemoteGridRowProps>,
                        ) => ReactElement
                    }
                    rowCount={rowCount}
                    rowHeight={rowHeight}
                    rowProps={rowProps}
                    style={{ flex: 1 }}
                />
            )}
        </div>
    );
};
