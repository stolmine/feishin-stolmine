import { memo, ReactElement, Ref, useImperativeHandle, useMemo } from 'react';
import { RiArrowRightSLine, RiHeartFill } from 'react-icons/ri';
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

export type { RowData } from '/@/remote/components/item-list/types';

const DEFAULT_ROW_HEIGHT = 64;

const alignToRowAlign = (align?: RemoteListScrollOptions['align']) => {
    if (align === 'top') return 'start' as const;
    if (align === 'bottom') return 'end' as const;
    if (align === 'center') return 'center' as const;
    return 'auto' as const;
};

interface RemoteListRowProps {
    getItem: (index: number) => RowData | undefined;
    onLongPress?: (item: RowData, index: number) => void;
    onPress?: (item: RowData, index: number) => void;
    serverId: string;
}

const RemoteListRow = memo(
    ({
        getItem,
        index,
        onLongPress,
        onPress,
        serverId,
        style,
    }: RowComponentProps<RemoteListRowProps>) => {
        const item = getItem(index);

        const longPress = useLongPress({
            onLongPress: () => item && onLongPress?.(item, index),
            onPress: () => item && onPress?.(item, index),
        });

        if (!item) {
            return (
                <div
                    style={{
                        ...style,
                        alignItems: 'center',
                        display: 'flex',
                        gap: 12,
                        padding: '0 16px',
                    }}
                >
                    <Skeleton height={48} width={48} />
                    <Skeleton height={16} width="60%" />
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
                    ...style,
                    alignItems: 'center',
                    cursor: 'pointer',
                    display: 'flex',
                    gap: 12,
                    padding: '0 16px',
                    touchAction: 'pan-y',
                    userSelect: 'none',
                    WebkitTouchCallout: 'none',
                }}
            >
                <CoverImage imageId={item.imageId} serverId={serverId} size={48} />
                <div style={{ flex: 1, minWidth: 0 }}>
                    <Text fw={500} lineClamp={1}>
                        {item.title}
                    </Text>
                    {item.subtitle && (
                        <Text isMuted lineClamp={1} size="sm">
                            {item.subtitle}
                        </Text>
                    )}
                </div>
                {item.favorite && <RiHeartFill color="var(--theme-colors-primary)" size={16} />}
                <RiArrowRightSLine color="var(--theme-colors-foreground-muted)" size={20} />
            </div>
        );
    },
);

RemoteListRow.displayName = 'RemoteListRow';

interface RemoteListProps extends RemoteItemListProps {
    ref?: Ref<RemoteListHandle>;
    rowHeight?: number;
    scrollKey?: string;
    serverId: string;
}

export const RemoteList = ({
    getItem,
    itemCount,
    onLongPress,
    onPress,
    onRangeChanged,
    ref,
    rowHeight = DEFAULT_ROW_HEIGHT,
    scrollKey,
    serverId,
}: RemoteListProps) => {
    const listRef = useListRef(null);

    useScrollRestoration({
        getElement: () => listRef.current?.element,
        itemCount,
        ready: itemCount > 0,
        scrollKey,
    });

    const rowProps = useMemo<RemoteListRowProps>(
        () => ({ getItem, onLongPress, onPress, serverId }),
        [getItem, onLongPress, onPress, serverId],
    );

    useImperativeHandle(
        ref,
        (): RemoteListHandle => ({
            scrollToIndex: (index, options) => {
                listRef.current?.scrollToRow({
                    align: alignToRowAlign(options?.align),
                    behavior: options?.behavior ?? 'auto',
                    index,
                });
            },
            scrollToOffset: (offset, options) => {
                listRef.current?.element?.scrollTo({
                    behavior: options?.behavior ?? 'auto',
                    top: offset,
                });
            },
        }),
        [listRef],
    );

    return (
        <List
            listRef={listRef}
            onRowsRendered={(visibleRows) => onRangeChanged?.(visibleRows)}
            rowComponent={
                RemoteListRow as (props: RowComponentProps<RemoteListRowProps>) => ReactElement
            }
            rowCount={itemCount}
            rowHeight={rowHeight}
            rowProps={rowProps}
            style={{ flex: 1 }}
        />
    );
};
