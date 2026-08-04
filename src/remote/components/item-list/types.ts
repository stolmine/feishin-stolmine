export interface RemoteItemListProps {
    getItem: (index: number) => RowData | undefined;
    itemCount: number;
    onLongPress?: (item: RowData, index: number) => void;
    onPress?: (item: RowData, index: number) => void;
    onRangeChanged?: (range: { startIndex: number; stopIndex: number }) => void;
}

export interface RemoteListHandle {
    scrollToIndex: (index: number, options?: RemoteListScrollOptions) => void;
    scrollToOffset: (offset: number, options?: { behavior?: 'auto' | 'smooth' }) => void;
}

export interface RemoteListScrollOptions {
    align?: 'bottom' | 'center' | 'top';
    behavior?: 'auto' | 'smooth';
}

export interface RowData {
    favorite?: boolean;
    id: string;
    imageId?: null | string;
    imageUrl?: null | string;
    subtitle?: string;
    title: string;
}
