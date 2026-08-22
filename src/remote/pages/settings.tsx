import { ReactNode, useState } from 'react';

import { ImageButton } from '/@/remote/components/buttons/image-button';
import { ThemeButton } from '/@/remote/components/buttons/theme-button';
import { PageHeader } from '/@/remote/components/page-header';
import {
    RemoteListDisplay,
    RemoteListKey,
    useConnected,
    useHasLibraryAccess,
    useReconnect,
    useRemoteListDisplay,
    useSetListDisplay,
    useSignOut,
} from '/@/remote/store';
import { Button } from '/@/shared/components/button/button';
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

// Reconnect re-pulls the `server` event (and with it the desktop's current
// music-server credential); sign out discards the credential this device has
// cached. Both are plain labelled buttons on purpose — the old icon-only
// reconnect control relied on a tooltip, which never appears on touch.
const SessionControls = () => {
    const reconnect = useReconnect();
    const signOut = useSignOut();
    const hasLibraryAccess = useHasLibraryAccess();
    const [confirmingSignOut, setConfirmingSignOut] = useState(false);

    if (confirmingSignOut) {
        return (
            <Stack gap="xs">
                <Text isMuted size="sm">
                    Sign out and forget this device&apos;s saved library credentials? Playback
                    control keeps working; tap Reconnect to browse again.
                </Text>
                <Group gap="sm" grow>
                    <Button onClick={() => setConfirmingSignOut(false)} variant="default">
                        Cancel
                    </Button>
                    <Button
                        onClick={() => {
                            signOut();
                            setConfirmingSignOut(false);
                        }}
                        variant="state-error"
                    >
                        Sign out
                    </Button>
                </Group>
            </Stack>
        );
    }

    return (
        <Group gap="sm" grow>
            <Button onClick={() => reconnect()} variant="filled">
                Reconnect
            </Button>
            <Button
                disabled={!hasLibraryAccess}
                onClick={() => setConfirmingSignOut(true)}
                variant="default"
            >
                Sign out
            </Button>
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
                    <SessionControls />
                </SettingsSection>

                <SettingsSection title="Display">
                    <Group gap="sm">
                        <ThemeButton />
                        <ImageButton />
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
