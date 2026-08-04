import debounce from 'lodash/debounce';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useAutoDj, useConnected, useSetAutoDj } from '/@/remote/store';
import { Drawer } from '/@/shared/components/drawer/drawer';
import { Group } from '/@/shared/components/group/group';
import { SegmentedControl } from '/@/shared/components/segmented-control/segmented-control';
import { Slider } from '/@/shared/components/slider/slider';
import { Stack } from '/@/shared/components/stack/stack';
import { Switch } from '/@/shared/components/switch/switch';
import { Text } from '/@/shared/components/text/text';

interface AutoDjPanelProps {
    onClose: () => void;
    opened: boolean;
}

const CONTRAST_DEBOUNCE_MS = 300;

export const AutoDjPanel = ({ onClose, opened }: AutoDjPanelProps) => {
    const connected = useConnected();
    const autoDj = useAutoDj();
    const setAutoDj = useSetAutoDj();

    const [contrast, setContrast] = useState(autoDj?.contrast ?? 0);
    const isDraggingRef = useRef(false);

    // Reflect the desktop's broadcast state, unless the user is mid-drag on
    // the contrast slider (in which case a stale broadcast must not yank the
    // thumb out from under their finger).
    useEffect(() => {
        if (!isDraggingRef.current && autoDj) {
            setContrast(autoDj.contrast);
        }
    }, [autoDj]);

    const debouncedSetContrast = useMemo(
        () =>
            debounce((value: number) => {
                setAutoDj({ contrast: value });
            }, CONTRAST_DEBOUNCE_MS),
        [setAutoDj],
    );

    useEffect(() => () => debouncedSetContrast.cancel(), [debouncedSetContrast]);

    const disabled = !autoDj || !autoDj.enabled;

    return (
        <Drawer
            onClose={onClose}
            opened={opened}
            padding="md"
            position="bottom"
            size="auto"
            title="AutoDJ"
            withCloseButton
        >
            {!connected || autoDj === null ? (
                <Text isMuted size="sm">
                    AutoDJ is unavailable — the desktop app is not connected or is too old to
                    support remote AutoDJ control.
                </Text>
            ) : (
                <Stack gap="md" pb="sm">
                    <Group justify="space-between">
                        <Text fw={500}>Enabled</Text>
                        <Switch
                            checked={autoDj.enabled}
                            onChange={(event) =>
                                setAutoDj({ enabled: event.currentTarget.checked })
                            }
                        />
                    </Group>

                    <Stack gap="xs">
                        <Group justify="space-between">
                            <Text fw={500}>Contrast</Text>
                            {disabled && (
                                <Text isMuted size="xs">
                                    Enable AutoDJ to adjust
                                </Text>
                            )}
                        </Group>
                        <Slider
                            disabled={disabled}
                            max={1}
                            min={0}
                            onChange={(value) => {
                                isDraggingRef.current = true;
                                setContrast(value);
                                debouncedSetContrast(value);
                            }}
                            onChangeEnd={(value) => {
                                isDraggingRef.current = false;
                                debouncedSetContrast.cancel();
                                setAutoDj({ contrast: value });
                            }}
                            step={0.05}
                            value={contrast}
                        />
                        <Group justify="space-between">
                            <Text isMuted size="xs">
                                Consistent
                            </Text>
                            <Text isMuted size="xs">
                                Varied
                            </Text>
                        </Group>
                    </Stack>

                    <Stack gap="xs">
                        <Text fw={500}>Mode</Text>
                        <SegmentedControl
                            data={[
                                { label: 'Songs', value: 'songs' },
                                { label: 'Albums', value: 'albums' },
                            ]}
                            disabled={disabled}
                            onChange={(value) => setAutoDj({ mode: value as 'albums' | 'songs' })}
                            value={autoDj.mode}
                        />
                    </Stack>
                </Stack>
            )}
        </Drawer>
    );
};
