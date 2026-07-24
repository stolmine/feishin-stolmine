import { type ReactNode } from 'react';

import { useAutoDJSettings, useSettingsStoreActions } from '/@/renderer/store/settings.store';
import { Group } from '/@/shared/components/group/group';
import { NumberInput } from '/@/shared/components/number-input/number-input';
import { Stack } from '/@/shared/components/stack/stack';
import { TagsInput } from '/@/shared/components/tags-input/tags-input';
import { Text } from '/@/shared/components/text/text';

const Field = ({ children, label }: { children: ReactNode; label: string }) => (
    <Stack gap={4}>
        <Text isNoSelect size="sm">
            {label}
        </Text>
        {children}
    </Stack>
);

/**
 * Compact vector-AutoDJ filter controls (year / bpm / length ranges + genre & artist
 * allow/exclude), bound directly to the flat AutoDJ settings. Shared by the settings
 * panel's "Advanced" section and the playerbar popover's horizontal filter flyout.
 * 0 / empty = no filter.
 */
export const AutoDjFilterControls = () => {
    const settings = useAutoDJSettings();
    const { setSettings } = useSettingsStoreActions();
    const set = (patch: Record<string, unknown>) => setSettings({ autoDJ: patch });

    return (
        <Stack gap="sm">
            <Field label="Year (min / max)">
                <Group gap="xs" wrap="nowrap">
                    <NumberInput
                        aria-label="Year min"
                        max={2100}
                        min={0}
                        onChange={(e) => set({ yearMin: Number(e) || 0 })}
                        value={settings.yearMin}
                        w={90}
                    />
                    <NumberInput
                        aria-label="Year max"
                        max={2100}
                        min={0}
                        onChange={(e) => set({ yearMax: Number(e) || 0 })}
                        value={settings.yearMax}
                        w={90}
                    />
                </Group>
            </Field>
            <Field label="BPM (min / max)">
                <Group gap="xs" wrap="nowrap">
                    <NumberInput
                        aria-label="BPM min"
                        max={400}
                        min={0}
                        onChange={(e) => set({ bpmMin: Number(e) || 0 })}
                        value={settings.bpmMin}
                        w={90}
                    />
                    <NumberInput
                        aria-label="BPM max"
                        max={400}
                        min={0}
                        onChange={(e) => set({ bpmMax: Number(e) || 0 })}
                        value={settings.bpmMax}
                        w={90}
                    />
                </Group>
            </Field>
            <Field label="Length sec (min / max)">
                <Group gap="xs" wrap="nowrap">
                    <NumberInput
                        aria-label="Length min seconds"
                        min={0}
                        onChange={(e) => set({ lengthMinSec: Number(e) || 0 })}
                        value={settings.lengthMinSec}
                        w={90}
                    />
                    <NumberInput
                        aria-label="Length max seconds"
                        min={0}
                        onChange={(e) => set({ lengthMaxSec: Number(e) || 0 })}
                        value={settings.lengthMaxSec}
                        w={90}
                    />
                </Group>
            </Field>
            <Field label="Genres — allow">
                <TagsInput
                    aria-label="Genres allow"
                    onChange={(value) => set({ genresAllow: value })}
                    placeholder="e.g. Ambient"
                    value={settings.genresAllow}
                />
            </Field>
            <Field label="Genres — exclude">
                <TagsInput
                    aria-label="Genres exclude"
                    onChange={(value) => set({ genresExclude: value })}
                    placeholder="e.g. Country"
                    value={settings.genresExclude}
                />
            </Field>
            <Field label="Artists — include">
                <TagsInput
                    aria-label="Artists include"
                    onChange={(value) => set({ artistsInclude: value })}
                    placeholder="artist name"
                    value={settings.artistsInclude}
                />
            </Field>
            <Field label="Artists — exclude">
                <TagsInput
                    aria-label="Artists exclude"
                    onChange={(value) => set({ artistsExclude: value })}
                    placeholder="artist name"
                    value={settings.artistsExclude}
                />
            </Field>
        </Stack>
    );
};
