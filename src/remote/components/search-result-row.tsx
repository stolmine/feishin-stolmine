import { RiArrowRightSLine } from 'react-icons/ri';

import { CoverImage } from '/@/remote/components/item-list/cover-image';
import { RowData } from '/@/remote/components/item-list/types';
import { useLongPress } from '/@/remote/components/item-list/use-long-press';
import { Text } from '/@/shared/components/text/text';
import { LibraryItem } from '/@/shared/types/domain-types';

export const SearchResultRow = ({
    itemType,
    onLongPress,
    onPress,
    row,
    serverId,
}: {
    itemType: LibraryItem;
    onLongPress: (row: RowData) => void;
    onPress: (row: RowData) => void;
    row: RowData;
    serverId: string;
}) => {
    const longPress = useLongPress({
        onLongPress: () => onLongPress(row),
        onPress: () => onPress(row),
    });

    return (
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
                gap: 12,
                padding: '8px 16px',
                touchAction: 'pan-y',
                userSelect: 'none',
                WebkitTouchCallout: 'none',
            }}
        >
            <CoverImage imageId={row.imageId} itemType={itemType} serverId={serverId} size={48} />
            <div style={{ flex: 1, minWidth: 0 }}>
                <Text fw={500} lineClamp={1}>
                    {row.title}
                </Text>
                {row.subtitle && (
                    <Text isMuted lineClamp={1} size="sm">
                        {row.subtitle}
                    </Text>
                )}
            </div>
            <RiArrowRightSLine color="var(--theme-colors-foreground-muted)" size={20} />
        </div>
    );
};
