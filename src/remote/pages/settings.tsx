import { ImageButton } from '/@/remote/components/buttons/image-button';
import { ReconnectButton } from '/@/remote/components/buttons/reconnect-button';
import { ThemeButton } from '/@/remote/components/buttons/theme-button';
import {
    RemoteListDisplay,
    RemoteListKey,
    useConnected,
    useHasLibraryAccess,
    useRemoteListDisplay,
    useSetListDisplay,
} from '/@/remote/store';
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

export const SettingsPage = () => {
    const connected = useConnected();
    const hasLibraryAccess = useHasLibraryAccess();

    return (
        <Stack gap="lg" p="md">
            <Stack gap="xs">
                <Text fw={700} size="lg">
                    Connection
                </Text>
                <Group justify="space-between">
                    <Text isMuted>Status</Text>
                    <Text>{connected ? 'Connected' : 'Disconnected'}</Text>
                </Group>
                <Group justify="space-between">
                    <Text isMuted>Library access</Text>
                    <Text>{hasLibraryAccess ? 'Available' : 'Unavailable'}</Text>
                </Group>
            </Stack>

            <Stack gap="xs">
                <Text fw={700} size="lg">
                    Display
                </Text>
                <Group gap="sm">
                    <ThemeButton />
                    <ImageButton />
                    <ReconnectButton />
                </Group>
            </Stack>

            <Stack gap="xs">
                <Text fw={700} size="lg">
                    Browse tab layout
                </Text>
                {listKeys.map(({ key, label }) => (
                    <ListDisplayRow key={key} label={label} listKey={key} />
                ))}
            </Stack>
        </Stack>
    );
};
