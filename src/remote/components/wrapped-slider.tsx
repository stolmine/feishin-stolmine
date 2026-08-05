import { CSSProperties, rem, Slider, SliderProps } from '@mantine/core';
import { ReactNode, useState } from 'react';

import { Flex } from '/@/shared/components/flex/flex';
import { Group } from '/@/shared/components/group/group';
import { Text } from '/@/shared/components/text/text';

// Fixed width for both label slots so the seek and volume tracks always
// span the exact same horizontal extents (wide enough for m:ss times).
const LABEL_SLOT_WIDTH = '2.75rem';

// Height of the interactive strip around the (visually thin) track so the
// slider stays comfortable to grab on touch screens.
const TOUCH_TARGET_HEIGHT = rem(28);

interface PlayerbarSliderProps extends SliderProps {
    isDragging?: boolean;
}

const PlayerbarSlider = ({ isDragging, ...props }: PlayerbarSliderProps) => {
    return (
        <Slider
            radius="xl"
            size={5}
            styles={{
                bar: {
                    backgroundColor: 'var(--theme-colors-primary)',
                },
                label: {
                    backgroundColor: 'var(--theme-colors-foreground)',
                    borderRadius: 'var(--theme-radius-md)',
                    color: 'var(--theme-colors-background)',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    padding: '0.25rem 0.6rem',
                },
                root: {
                    '--slider-track-bg': 'var(--theme-colors-surface-hover)',
                    height: TOUCH_TARGET_HEIGHT,
                } as CSSProperties,
                thumb: {
                    backgroundColor: 'var(--theme-colors-foreground)',
                    borderColor: 'var(--theme-colors-primary)',
                    borderWidth: rem(2),
                    boxShadow: '0 1px 4px rgb(0 0 0 / 30%)',
                    transform: isDragging ? 'translate(-50%, -50%) scale(1.3)' : undefined,
                },
                trackContainer: {
                    height: TOUCH_TARGET_HEIGHT,
                },
            }}
            thumbSize={14}
            {...props}
            onClick={(e) => {
                e?.stopPropagation();
            }}
        />
    );
};

export interface WrappedProps extends Omit<SliderProps, 'onChangeEnd'> {
    leftLabel?: ReactNode;
    onChangeEnd: (value: number) => void;
    rightLabel?: ReactNode;
    value: number;
}

const SliderLabel = ({ label }: { label: ReactNode }) => (
    <Flex align="center" justify="center" style={{ flexShrink: 0, width: LABEL_SLOT_WIDTH }}>
        {typeof label === 'string' || typeof label === 'number' ? (
            <Text fw={500} isMuted size="sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {label}
            </Text>
        ) : (
            label
        )}
    </Flex>
);

export const WrappedSlider = ({ leftLabel, rightLabel, value, ...props }: WrappedProps) => {
    const [isSeeking, setIsSeeking] = useState(false);
    const [seek, setSeek] = useState(0);

    return (
        <Group align="center" gap="xs" wrap="nowrap">
            {leftLabel !== undefined && <SliderLabel label={leftLabel} />}
            <PlayerbarSlider
                {...props}
                isDragging={isSeeking}
                min={0}
                onChange={(e) => {
                    setIsSeeking(true);
                    setSeek(e);
                }}
                onChangeEnd={(e) => {
                    props.onChangeEnd(e);
                    setIsSeeking(false);
                }}
                value={!isSeeking ? (value ?? 0) : seek}
                w="100%"
            />
            {rightLabel !== undefined && <SliderLabel label={rightLabel} />}
        </Group>
    );
};
