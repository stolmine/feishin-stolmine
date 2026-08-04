import { ReactNode } from 'react';

import { ImageButton } from '/@/remote/components/buttons/image-button';
import { ReconnectButton } from '/@/remote/components/buttons/reconnect-button';
import { ThemeButton } from '/@/remote/components/buttons/theme-button';
import { PageHeader } from '/@/remote/components/page-header';
import {
    RemoteListDisplay,
    RemoteListKey,
    useConnected,
    useHasLibraryAccess,
    useRemoteListDisplay,
    useSetListDisplay,
} from '/@/remote/store';
import { Flex } from '/@/shared/components/flex/flex';
import { Group } from '/@/shared/components/group/group';
import { SegmentedControl } from '/@/shared/components/segmented-control/segmented-control';
import { Stack } from '/@/shared/components/stack/stack';
import { Text } from '/@/shared/components/text/text';

const displayOptions: { label: string; value: RemoteListDisplay }[] = [
    { label: 'Grid', value: 'grid' },
    { label: 'List', value: 'list' },
];

const listKeys: { key: RemoteListKey; label: string }[] = [
    { key: 'library', label: 'Library' },
    { key: 'artist', label: 'Artists' },
    { key: 'album', label: 'Albums' },
    { key: 'playlist', label: 'Playlists' },
];

const ListDisplayRow = ({ label, listKey }: { label: string; listKey: RemoteListKey }) => {
    const display = useRemoteListDisplay(listKey);
    const setListDisplay = useSetListDisplay();

    return (
        <Group justify="space-between">
            <Text>{label}</Text>
            <SegmentedControl
                data={displayOptions}
                onChange={(value) => setListDisplay(listKey, value as RemoteListDisplay)}
                value={display}
            />
        </Group>
    );
};

const SettingsSection = ({ children, title }: { children: ReactNode; title: string }) => {
    return (
        <Stack gap="xs">
            <Text
                fw={600}
                isMuted
                size="xs"
                style={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}
            >
                {title}
            </Text>
            <Stack
                gap="sm"
                p="md"
                style={{
                    background: 'var(--theme-colors-surface)',
                    border: '1px solid var(--theme-colors-border)',
                    borderRadius: 'var(--theme-radius-md)',
                }}
            >
                {children}
            </Stack>
        </Stack>
    );
};

export const SettingsPage = () => {
    const connected = useConnected();
    const hasLibraryAccess = useHasLibraryAccess();

    return (
        <Flex direction="column" h="100%" w="100%">
            <PageHeader title="Settings" />
            <Stack gap="lg" pb="lg" px="md" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                <SettingsSection title="Connection">
                    <Group justify="space-between">
                        <Text isMuted>Status</Text>
                        <Text>{connected ? 'Connected' : 'Disconnected'}</Text>
                    </Group>
                    <Group justify="space-between">
                        <Text isMuted>Library access</Text>
                        <Text>{hasLibraryAccess ? 'Available' : 'Unavailable'}</Text>
                    </Group>
                </SettingsSection>

                <SettingsSection title="Display">
                    <Group gap="sm">
                        <ThemeButton />
                        <ImageButton />
                        <ReconnectButton />
                    </Group>
                </SettingsSection>

                <SettingsSection title="Browse tab layout">
                    {listKeys.map(({ key, label }) => (
                        <ListDisplayRow key={key} label={label} listKey={key} />
                    ))}
                </SettingsSection>
            </Stack>
        </Flex>
    );
};
