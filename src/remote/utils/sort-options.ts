import {
    AlbumArtistListSort,
    AlbumListSort,
    PlaylistListSort,
    ServerType,
    SongListSort,
    SortOrder,
} from '/@/shared/types/domain-types';

export interface SortOption {
    defaultOrder?: SortOrder;
    label: string;
    value: string;
}

// These lists are hand-curated per (server type, item type), mirroring the
// desktop's FILTERS constants in
// `/@/renderer/features/shared/components/list-sort-by-dropdown.tsx` (not
// exported there, so reproduced here rather than imported). Subsonic sorts
// client-side in its adapter — its entries in `albumListSortMap`/
// `songListSortMap`/etc. are all `undefined` — so deriving options from those
// maps (as this file previously did) leaves the menu empty on Subsonic. Using
// the desktop's curated lists instead gives every server type correct,
// non-empty options.
const ALBUM_SORT_OPTIONS: Partial<Record<ServerType, SortOption[]>> = {
    [ServerType.JELLYFIN]: [
        { defaultOrder: SortOrder.ASC, label: 'Album Artist', value: AlbumListSort.ALBUM_ARTIST },
        { defaultOrder: SortOrder.ASC, label: 'ID', value: AlbumListSort.ID },
        {
            defaultOrder: SortOrder.DESC,
            label: 'Community rating',
            value: AlbumListSort.COMMUNITY_RATING,
        },
        {
            defaultOrder: SortOrder.DESC,
            label: 'Critic rating',
            value: AlbumListSort.CRITIC_RATING,
        },
        { defaultOrder: SortOrder.ASC, label: 'Name', value: AlbumListSort.NAME },
        { defaultOrder: SortOrder.DESC, label: 'Play count', value: AlbumListSort.PLAY_COUNT },
        { defaultOrder: SortOrder.ASC, label: 'Random', value: AlbumListSort.RANDOM },
        {
            defaultOrder: SortOrder.DESC,
            label: 'Recently added',
            value: AlbumListSort.RECENTLY_ADDED,
        },
        {
            defaultOrder: SortOrder.DESC,
            label: 'Release date',
            value: AlbumListSort.RELEASE_DATE,
        },
    ],
    [ServerType.NAVIDROME]: [
        { defaultOrder: SortOrder.ASC, label: 'Album Artist', value: AlbumListSort.ALBUM_ARTIST },
        { defaultOrder: SortOrder.ASC, label: 'ID', value: AlbumListSort.ID },
        { defaultOrder: SortOrder.ASC, label: 'Artist', value: AlbumListSort.ARTIST },
        { defaultOrder: SortOrder.DESC, label: 'Duration', value: AlbumListSort.DURATION },
        { defaultOrder: SortOrder.DESC, label: 'Most played', value: AlbumListSort.PLAY_COUNT },
        { defaultOrder: SortOrder.ASC, label: 'Name', value: AlbumListSort.NAME },
        { defaultOrder: SortOrder.ASC, label: 'Random', value: AlbumListSort.RANDOM },
        { defaultOrder: SortOrder.DESC, label: 'Rating', value: AlbumListSort.RATING },
        {
            defaultOrder: SortOrder.DESC,
            label: 'Recently added',
            value: AlbumListSort.RECENTLY_ADDED,
        },
        {
            defaultOrder: SortOrder.DESC,
            label: 'Recently played',
            value: AlbumListSort.RECENTLY_PLAYED,
        },
        { defaultOrder: SortOrder.DESC, label: 'Song count', value: AlbumListSort.SONG_COUNT },
        { defaultOrder: SortOrder.DESC, label: 'Favorited', value: AlbumListSort.FAVORITED },
        { defaultOrder: SortOrder.DESC, label: 'Release year', value: AlbumListSort.YEAR },
    ],
    [ServerType.SUBSONIC]: [
        { defaultOrder: SortOrder.ASC, label: 'Album Artist', value: AlbumListSort.ALBUM_ARTIST },
        { defaultOrder: SortOrder.ASC, label: 'ID', value: AlbumListSort.ID },
        { defaultOrder: SortOrder.DESC, label: 'Most played', value: AlbumListSort.PLAY_COUNT },
        { defaultOrder: SortOrder.ASC, label: 'Name', value: AlbumListSort.NAME },
        { defaultOrder: SortOrder.ASC, label: 'Random', value: AlbumListSort.RANDOM },
        {
            defaultOrder: SortOrder.DESC,
            label: 'Recently added',
            value: AlbumListSort.RECENTLY_ADDED,
        },
        {
            defaultOrder: SortOrder.DESC,
            label: 'Recently played',
            value: AlbumListSort.RECENTLY_PLAYED,
        },
        { defaultOrder: SortOrder.DESC, label: 'Favorited', value: AlbumListSort.FAVORITED },
        { defaultOrder: SortOrder.DESC, label: 'Release year', value: AlbumListSort.YEAR },
    ],
};

export const getAlbumSortOptions = (serverType: ServerType | undefined): SortOption[] =>
    (serverType && ALBUM_SORT_OPTIONS[serverType]) ||
    ALBUM_SORT_OPTIONS[ServerType.NAVIDROME] ||
    [];

// Remote's "artists" page sorts by `AlbumArtistListSort`, matching the
// desktop's `ALBUM_ARTIST_LIST_FILTERS` (used for `LibraryItem.ALBUM_ARTIST`),
// not `ARTIST_LIST_FILTERS` (which is `ArtistListSort`, a separate item type
// the remote UI doesn't expose).
const ALBUM_ARTIST_SORT_OPTIONS: Partial<Record<ServerType, SortOption[]>> = {
    [ServerType.JELLYFIN]: [
        { defaultOrder: SortOrder.ASC, label: 'Album', value: AlbumArtistListSort.ALBUM },
        { defaultOrder: SortOrder.DESC, label: 'Duration', value: AlbumArtistListSort.DURATION },
        { defaultOrder: SortOrder.ASC, label: 'Name', value: AlbumArtistListSort.NAME },
        { defaultOrder: SortOrder.ASC, label: 'Random', value: AlbumArtistListSort.RANDOM },
        {
            defaultOrder: SortOrder.DESC,
            label: 'Recently added',
            value: AlbumArtistListSort.RECENTLY_ADDED,
        },
    ],
    [ServerType.NAVIDROME]: [
        {
            defaultOrder: SortOrder.DESC,
            label: 'Albums count',
            value: AlbumArtistListSort.ALBUM_COUNT,
        },
        {
            defaultOrder: SortOrder.DESC,
            label: 'Is favorited',
            value: AlbumArtistListSort.FAVORITED,
        },
        {
            defaultOrder: SortOrder.DESC,
            label: 'Most played',
            value: AlbumArtistListSort.PLAY_COUNT,
        },
        { defaultOrder: SortOrder.ASC, label: 'Name', value: AlbumArtistListSort.NAME },
        { defaultOrder: SortOrder.DESC, label: 'Rating', value: AlbumArtistListSort.RATING },
        {
            defaultOrder: SortOrder.DESC,
            label: 'Song count',
            value: AlbumArtistListSort.SONG_COUNT,
        },
    ],
    [ServerType.SUBSONIC]: [
        {
            defaultOrder: SortOrder.DESC,
            label: 'Albums count',
            value: AlbumArtistListSort.ALBUM_COUNT,
        },
        {
            defaultOrder: SortOrder.DESC,
            label: 'Is favorited',
            value: AlbumArtistListSort.FAVORITED,
        },
        { defaultOrder: SortOrder.ASC, label: 'Name', value: AlbumArtistListSort.NAME },
        { defaultOrder: SortOrder.DESC, label: 'Rating', value: AlbumArtistListSort.RATING },
    ],
};

export const getArtistSortOptions = (serverType: ServerType | undefined): SortOption[] =>
    (serverType && ALBUM_ARTIST_SORT_OPTIONS[serverType]) ||
    ALBUM_ARTIST_SORT_OPTIONS[ServerType.NAVIDROME] ||
    [];

const SONG_SORT_OPTIONS: Partial<Record<ServerType, SortOption[]>> = {
    [ServerType.JELLYFIN]: [
        { defaultOrder: SortOrder.ASC, label: 'Album', value: SongListSort.ALBUM },
        { defaultOrder: SortOrder.ASC, label: 'Album Artist', value: SongListSort.ALBUM_ARTIST },
        { defaultOrder: SortOrder.ASC, label: 'Artist', value: SongListSort.ARTIST },
        { defaultOrder: SortOrder.ASC, label: 'Duration', value: SongListSort.DURATION },
        { defaultOrder: SortOrder.ASC, label: 'Play count', value: SongListSort.PLAY_COUNT },
        { defaultOrder: SortOrder.ASC, label: 'Name', value: SongListSort.NAME },
        { defaultOrder: SortOrder.ASC, label: 'Random', value: SongListSort.RANDOM },
        {
            defaultOrder: SortOrder.ASC,
            label: 'Recently added',
            value: SongListSort.RECENTLY_ADDED,
        },
        {
            defaultOrder: SortOrder.ASC,
            label: 'Recently played',
            value: SongListSort.RECENTLY_PLAYED,
        },
        { defaultOrder: SortOrder.ASC, label: 'Release date', value: SongListSort.RELEASE_DATE },
    ],
    [ServerType.NAVIDROME]: [
        { defaultOrder: SortOrder.ASC, label: 'Album', value: SongListSort.ALBUM },
        { defaultOrder: SortOrder.ASC, label: 'Album Artist', value: SongListSort.ALBUM_ARTIST },
        { defaultOrder: SortOrder.ASC, label: 'Artist', value: SongListSort.ARTIST },
        { defaultOrder: SortOrder.DESC, label: 'BPM', value: SongListSort.BPM },
        { defaultOrder: SortOrder.ASC, label: 'Channels', value: SongListSort.CHANNELS },
        { defaultOrder: SortOrder.ASC, label: 'Comment', value: SongListSort.COMMENT },
        { defaultOrder: SortOrder.DESC, label: 'Duration', value: SongListSort.DURATION },
        { defaultOrder: SortOrder.DESC, label: 'Is favorited', value: SongListSort.FAVORITED },
        { defaultOrder: SortOrder.ASC, label: 'Genre', value: SongListSort.GENRE },
        { defaultOrder: SortOrder.ASC, label: 'Name', value: SongListSort.NAME },
        { defaultOrder: SortOrder.DESC, label: 'Play count', value: SongListSort.PLAY_COUNT },
        { defaultOrder: SortOrder.ASC, label: 'Random', value: SongListSort.RANDOM },
        { defaultOrder: SortOrder.DESC, label: 'Rating', value: SongListSort.RATING },
        {
            defaultOrder: SortOrder.DESC,
            label: 'Recently added',
            value: SongListSort.RECENTLY_ADDED,
        },
        {
            defaultOrder: SortOrder.DESC,
            label: 'Recently played',
            value: SongListSort.RECENTLY_PLAYED,
        },
        { defaultOrder: SortOrder.DESC, label: 'Release year', value: SongListSort.YEAR },
    ],
    [ServerType.SUBSONIC]: [
        { defaultOrder: SortOrder.ASC, label: 'Name', value: SongListSort.NAME },
    ],
};

export const getSongSortOptions = (serverType: ServerType | undefined): SortOption[] =>
    (serverType && SONG_SORT_OPTIONS[serverType]) || SONG_SORT_OPTIONS[ServerType.NAVIDROME] || [];

const PLAYLIST_SORT_OPTIONS: Partial<Record<ServerType, SortOption[]>> = {
    [ServerType.JELLYFIN]: [
        { defaultOrder: SortOrder.DESC, label: 'Duration', value: PlaylistListSort.DURATION },
        { defaultOrder: SortOrder.ASC, label: 'Name', value: PlaylistListSort.NAME },
        { defaultOrder: SortOrder.DESC, label: 'Song count', value: PlaylistListSort.SONG_COUNT },
    ],
    [ServerType.NAVIDROME]: [
        { defaultOrder: SortOrder.DESC, label: 'Duration', value: PlaylistListSort.DURATION },
        { defaultOrder: SortOrder.ASC, label: 'Name', value: PlaylistListSort.NAME },
        { defaultOrder: SortOrder.ASC, label: 'Owner', value: PlaylistListSort.OWNER },
        { defaultOrder: SortOrder.DESC, label: 'Is public', value: PlaylistListSort.PUBLIC },
        { defaultOrder: SortOrder.DESC, label: 'Song count', value: PlaylistListSort.SONG_COUNT },
        {
            defaultOrder: SortOrder.DESC,
            label: 'Recently updated',
            value: PlaylistListSort.UPDATED_AT,
        },
    ],
    [ServerType.SUBSONIC]: [
        { defaultOrder: SortOrder.ASC, label: 'Name', value: PlaylistListSort.NAME },
    ],
};

export const getPlaylistSortOptions = (serverType: ServerType | undefined): SortOption[] =>
    (serverType && PLAYLIST_SORT_OPTIONS[serverType]) ||
    PLAYLIST_SORT_OPTIONS[ServerType.NAVIDROME] ||
    [];

interface EffectiveSort {
    sortBy: string;
    sortOrder: SortOrder;
}

// `sort.sortBy` is a persisted free string; if it isn't present in the
// current server's curated option set (e.g. after switching server types, or
// a stale value from an older app version), fall back to sorting by `name`
// ascending rather than running a query with a sort key the server/adapter
// doesn't recognize (which silently falls back to the server's own default
// order and hides the alpha ribbon, since it keys off name-asc). Returns the
// same `sort` reference when it's already valid, so callers can cheaply
// detect "no correction needed" via `===`.
export function getEffectiveSort<TSort extends EffectiveSort>(
    sort: TSort,
    options: SortOption[],
    fallbackSortBy: string,
): TSort {
    if (options.length === 0 || options.some((option) => option.value === sort.sortBy)) {
        return sort;
    }

    return { ...sort, sortBy: fallbackSortBy, sortOrder: SortOrder.ASC };
}
