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

// Grid cards omit an explicit `size` and fill their column; request a crisp
// thumbnail sized for a phone card on a retina display.
const REQUEST_SIZE_FALLBACK_PX = 400;
// Cap for the retina (2x) upscale of fixed-size covers.
const REQUEST_SIZE_MAX_PX = 512;

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

        // Request at 2x the display size (capped) for retina crispness; grid
        // cards (no explicit size) get the full-card fallback resolution.
        const requestSize =
            size === undefined ? REQUEST_SIZE_FALLBACK_PX : Math.min(REQUEST_SIZE_MAX_PX, size * 2);

        return api.controller.getImageUrl({
            apiClientProps: { serverId },
            query: { id: imageId, itemType, size: requestSize },
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
