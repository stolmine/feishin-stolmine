import { ReactNode } from 'react';
import {
    RiAlbumLine,
    RiHome5Line,
    RiMusic2Line,
    RiPlayListLine,
    RiSearchLine,
    RiUser3Line,
} from 'react-icons/ri';
import { NavLink } from 'react-router';

import { useHasLibraryAccess } from '/@/remote/store';
import { Flex } from '/@/shared/components/flex/flex';

interface TabConfig {
    end?: boolean;
    icon: ReactNode;
    label: string;
    path: string;
}

const nowPlayingTab: TabConfig = {
    end: true,
    icon: <RiHome5Line size={28} />,
    label: 'Now Playing',
    path: '/',
};

const libraryTabs: TabConfig[] = [
    { icon: <RiMusic2Line size={28} />, label: 'Library', path: '/library' },
    { icon: <RiUser3Line size={28} />, label: 'Artists', path: '/artists' },
    { icon: <RiAlbumLine size={28} />, label: 'Albums', path: '/albums' },
    { icon: <RiPlayListLine size={28} />, label: 'Playlists', path: '/playlists' },
    { icon: <RiSearchLine size={28} />, label: 'Search', path: '/search' },
];

export const TabBar = () => {
    const hasLibraryAccess = useHasLibraryAccess();

    // The tab bar stays visible even across a transient socket drop (the store
    // auto-reconnects); browsing works over direct HTTP, only queue actions need
    // the socket. Yanking navigation on every blip was jarring on mobile.
    const tabs = hasLibraryAccess ? [nowPlayingTab, ...libraryTabs] : [nowPlayingTab];

    return (
        <nav
            style={{
                background: 'var(--theme-colors-surface)',
                borderTop: '1px solid var(--theme-colors-border)',
                bottom: 0,
                display: 'flex',
                height: 'calc(64px + env(safe-area-inset-bottom))',
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
                                h="100%"
                                justify="center"
                                style={{ color }}
                                title={tab.label}
                            >
                                {tab.icon}
                            </Flex>
                        );
                    }}
                </NavLink>
            ))}
        </nav>
    );
};
