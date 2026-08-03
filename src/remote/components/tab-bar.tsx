import { ReactNode } from 'react';
import {
    RiAlbumLine,
    RiHome5Line,
    RiMusic2Line,
    RiPlayListLine,
    RiSettings3Line,
    RiUser3Line,
} from 'react-icons/ri';
import { NavLink } from 'react-router';

import { useConnected, useHasLibraryAccess } from '/@/remote/store';
import { Flex } from '/@/shared/components/flex/flex';
import { Text } from '/@/shared/components/text/text';

interface TabConfig {
    end?: boolean;
    icon: ReactNode;
    label: string;
    path: string;
}

const nowPlayingTab: TabConfig = {
    end: true,
    icon: <RiHome5Line size={22} />,
    label: 'Now Playing',
    path: '/',
};

const libraryTabs: TabConfig[] = [
    { icon: <RiMusic2Line size={22} />, label: 'Library', path: '/library' },
    { icon: <RiUser3Line size={22} />, label: 'Artists', path: '/artists' },
    { icon: <RiAlbumLine size={22} />, label: 'Albums', path: '/albums' },
    { icon: <RiPlayListLine size={22} />, label: 'Playlists', path: '/playlists' },
];

const settingsTab: TabConfig = {
    icon: <RiSettings3Line size={22} />,
    label: 'Settings',
    path: '/settings',
};

export const TabBar = () => {
    const connected = useConnected();
    const hasLibraryAccess = useHasLibraryAccess();

    if (!connected) {
        return null;
    }

    const tabs = hasLibraryAccess
        ? [nowPlayingTab, ...libraryTabs, settingsTab]
        : [nowPlayingTab, settingsTab];

    return (
        <nav
            style={{
                background: 'var(--theme-colors-surface)',
                borderTop: '1px solid var(--theme-colors-border)',
                bottom: 0,
                display: 'flex',
                height: 'calc(56px + env(safe-area-inset-bottom))',
                left: 0,
                paddingBottom: 'env(safe-area-inset-bottom)',
                position: 'fixed',
                right: 0,
                zIndex: 200,
            }}
        >
            {tabs.map((tab) => (
                <NavLink
                    end={tab.end}
                    key={tab.path}
                    style={{ flex: 1, textDecoration: 'none' }}
                    to={tab.path}
                >
                    {({ isActive }) => {
                        const color = isActive
                            ? 'var(--theme-colors-primary)'
                            : 'var(--theme-colors-foreground-muted)';

                        return (
                            <Flex
                                align="center"
                                direction="column"
                                gap={2}
                                h="100%"
                                justify="center"
                                style={{ color }}
                            >
                                {tab.icon}
                                <Text size="xs" style={{ color }}>
                                    {tab.label}
                                </Text>
                            </Flex>
                        );
                    }}
                </NavLink>
            ))}
        </nav>
    );
};
