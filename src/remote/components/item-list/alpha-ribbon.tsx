import { useEffect, useMemo, useRef, useState } from 'react';

import { RemoteListScrollOptions } from '/@/remote/components/item-list/types';
import { useRibbonScrub } from '/@/remote/components/item-list/use-ribbon-scrub';
import { Portal } from '/@/shared/components/portal/portal';
import { Text } from '/@/shared/components/text/text';

export const RIBBON_COLUMN_WIDTH_PX = 34;

const LABEL_ROW_HEIGHT_PX = 14;
const BUBBLE_SIZE_PX = 56;
const BUBBLE_GAP_PX = 12;

export interface AlphaRibbonProps {
    buckets: string[];
    estimate: (bucket: string) => number;
    onScrollToIndex: (index: number, options?: RemoteListScrollOptions) => void;
    resolve: (bucket: string) => Promise<number>;
}

export const AlphaRibbon = ({ buckets, estimate, onScrollToIndex, resolve }: AlphaRibbonProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [ribbonHeight, setRibbonHeight] = useState(0);

    const {
        activeBucket,
        isScrubbing,
        onLostPointerCapture,
        onPointerCancel,
        onPointerDown,
        onPointerMove,
        onPointerUp,
        pointerY,
    } = useRibbonScrub({ buckets, estimate, onScrollToIndex, resolve });

    // Native ResizeObserver (no new dependency) drives label decimation: the
    // full `buckets` array is always used for hit-testing (in `use-ribbon-scrub`),
    // but only a subset is rendered once the ribbon is too short to fit one row
    // per bucket at ~14px each.
    useEffect(() => {
        const element = containerRef.current;

        if (!element) {
            return undefined;
        }

        const observer = new ResizeObserver((entries) => {
            const entry = entries[0];

            if (entry) {
                setRibbonHeight(entry.contentRect.height);
            }
        });

        observer.observe(element);

        return () => observer.disconnect();
    }, []);

    const step = useMemo(() => {
        const maxLabels = Math.max(1, Math.floor(ribbonHeight / LABEL_ROW_HEIGHT_PX));

        return Math.max(1, Math.ceil(buckets.length / maxLabels));
    }, [buckets.length, ribbonHeight]);

    const bubblePosition = useMemo(() => {
        if (!isScrubbing || pointerY === null) {
            return null;
        }

        const ribbonRect = containerRef.current?.getBoundingClientRect();
        const parentRect = containerRef.current?.parentElement?.getBoundingClientRect();

        if (!ribbonRect || !parentRect) {
            return null;
        }

        const minTop = parentRect.top;
        const maxTop = Math.max(minTop, parentRect.bottom - BUBBLE_SIZE_PX);
        const top = Math.min(maxTop, Math.max(minTop, pointerY - BUBBLE_SIZE_PX / 2));
        const left = ribbonRect.left - BUBBLE_SIZE_PX - BUBBLE_GAP_PX;

        return { left, top };
    }, [isScrubbing, pointerY]);

    return (
        <>
            <div
                onLostPointerCapture={onLostPointerCapture}
                onPointerCancel={onPointerCancel}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                ref={containerRef}
                style={{
                    inset: 0,
                    position: 'absolute',
                    touchAction: 'none',
                    userSelect: 'none',
                }}
            >
                <div
                    style={{
                        alignItems: 'center',
                        display: 'flex',
                        flexDirection: 'column',
                        inset: 0,
                        justifyContent: 'space-between',
                        position: 'absolute',
                    }}
                >
                    {buckets.map((bucket, index) => {
                        const isKept = index % step === 0 || index === buckets.length - 1;
                        const isActive = bucket === activeBucket;

                        return (
                            <div
                                key={bucket}
                                style={{
                                    alignItems: 'center',
                                    display: 'flex',
                                    flex: 1,
                                    justifyContent: 'center',
                                    minHeight: 0,
                                }}
                            >
                                <Text
                                    fw={isActive ? 700 : 500}
                                    size={isScrubbing ? '12px' : '11px'}
                                    style={{
                                        color: isActive
                                            ? 'var(--theme-colors-primary)'
                                            : 'var(--theme-colors-foreground-muted)',
                                        lineHeight: 1,
                                    }}
                                >
                                    {isKept ? bucket : '·'}
                                </Text>
                            </div>
                        );
                    })}
                </div>
            </div>
            {bubblePosition && (
                <Portal>
                    <div
                        style={{
                            alignItems: 'center',
                            background: 'var(--theme-colors-surface)',
                            borderRadius: 12,
                            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.35)',
                            display: 'flex',
                            height: BUBBLE_SIZE_PX,
                            justifyContent: 'center',
                            left: bubblePosition.left,
                            opacity: isScrubbing ? 1 : 0,
                            pointerEvents: 'none',
                            position: 'fixed',
                            top: bubblePosition.top,
                            transition: 'opacity 150ms ease',
                            width: BUBBLE_SIZE_PX,
                            zIndex: 1000,
                        }}
                    >
                        <Text
                            fw={700}
                            style={{ color: 'var(--theme-colors-primary)', fontSize: 28 }}
                        >
                            {activeBucket}
                        </Text>
                    </div>
                </Portal>
            )}
        </>
    );
};
