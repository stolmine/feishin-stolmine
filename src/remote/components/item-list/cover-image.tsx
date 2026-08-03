import { useMemo } from 'react';

import { api } from '/@/renderer/api';
import { LibraryItem } from '/@/shared/types/domain-types';

interface CoverImageProps {
    alt?: string;
    borderRadius?: number;
    imageId?: null | string;
    itemType?: LibraryItem;
    serverId: string;
    /** Fixed square size in px. Omit to fill the parent width at a 1:1 aspect ratio (grid cards). */
    size?: number;
}

const REQUEST_SIZE_FALLBACK_PX = 300;

export const CoverImage = ({
    alt = '',
    borderRadius = 4,
    imageId,
    itemType = LibraryItem.ALBUM,
    serverId,
    size,
}: CoverImageProps) => {
    const src = useMemo(() => {
        if (!imageId || !serverId) {
            return null;
        }

        return api.controller.getImageUrl({
            apiClientProps: { serverId },
            query: { id: imageId, itemType, size: size ?? REQUEST_SIZE_FALLBACK_PX },
        });
    }, [imageId, itemType, serverId, size]);

    const dimensionStyle =
        size === undefined
            ? { aspectRatio: '1 / 1', height: 'auto', width: '100%' }
            : { height: size, width: size };

    if (!src) {
        return (
            <div
                style={{
                    background: 'var(--theme-colors-surface-hover)',
                    borderRadius,
                    flexShrink: 0,
                    ...dimensionStyle,
                }}
            />
        );
    }

    return (
        <img
            alt={alt}
            loading="lazy"
            src={src}
            style={{
                borderRadius,
                flexShrink: 0,
                objectFit: 'cover',
                ...dimensionStyle,
            }}
        />
    );
};
