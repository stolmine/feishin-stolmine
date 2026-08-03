import { createHashRouter } from 'react-router';

import { Shell } from '/@/remote/components/shell';
import { AlbumDetailPage } from '/@/remote/pages/album-detail';
import { AlbumsPage } from '/@/remote/pages/albums';
import { ArtistDetailPage } from '/@/remote/pages/artist-detail';
import { ArtistsPage } from '/@/remote/pages/artists';
import { LibraryPage } from '/@/remote/pages/library';
import { NowPlayingPage } from '/@/remote/pages/now-playing';
import { PlaylistDetailPage } from '/@/remote/pages/playlist-detail';
import { PlaylistsPage } from '/@/remote/pages/playlists';
import { QueuePage } from '/@/remote/pages/queue';
import { SettingsPage } from '/@/remote/pages/settings';

export const router = createHashRouter([
    {
        children: [
            { element: <NowPlayingPage />, index: true },
            { element: <LibraryPage />, path: 'library' },
            { element: <ArtistsPage />, path: 'artists' },
            { element: <ArtistDetailPage />, path: 'artists/:id' },
            { element: <AlbumsPage />, path: 'albums' },
            { element: <AlbumDetailPage />, path: 'albums/:id' },
            { element: <PlaylistsPage />, path: 'playlists' },
            { element: <PlaylistDetailPage />, path: 'playlists/:id' },
            { element: <QueuePage />, path: 'queue' },
            { element: <SettingsPage />, path: 'settings' },
        ],
        element: <Shell />,
        path: '/',
    },
]);
