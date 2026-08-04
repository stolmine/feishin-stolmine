import { LibraryItem, QueueSong, ServerListItemWithCredential } from '/@/shared/types/domain-types';
import { Play, PlayerRepeat, PlayerStatus, SongState } from '/@/shared/types/types';

export interface ClientAuth {
    event: 'authenticate';
    header: string;
}

export interface ClientAutoDjSet {
    event: 'autoDjSet';
    settings: Partial<RemoteAutoDj>;
}

export type ClientEvent =
    | ClientAuth
    | ClientAutoDjSet
    | ClientFavorite
    | ClientPosition
    | ClientQueueAdd
    | ClientQueueClear
    | ClientQueueMove
    | ClientQueuePlay
    | ClientQueueRemove
    | ClientQueueRequest
    | ClientRating
    | ClientSimpleEvent
    | ClientVolume;

export interface ClientFavorite {
    event: 'favorite';
    favorite: boolean;
    id: string;
}

export interface ClientPosition {
    event: 'position';
    position: number;
}

export interface ClientQueueAdd {
    event: 'queueAdd';
    ids: string[];
    itemType: LibraryItem;
    playType: Play;
    serverId: string;
}

export interface ClientQueueClear {
    event: 'queueClear';
}

export interface ClientQueueMove {
    edge: 'bottom' | 'top';
    event: 'queueMove';
    targetUniqueId: string;
    uniqueIds: string[];
}

export interface ClientQueuePlay {
    event: 'queuePlay';
    uniqueId: string;
}

export interface ClientQueueRemove {
    event: 'queueRemove';
    uniqueIds: string[];
}

export interface ClientQueueRequest {
    event: 'queueRequest';
}

export interface ClientRating {
    event: 'rating';
    id: string;
    rating: number;
}
export interface ClientSimpleEvent {
    event: 'next' | 'pause' | 'play' | 'previous' | 'proxy' | 'repeat' | 'shuffle';
}

export interface ClientVolume {
    event: 'volume';
    volume: number;
}

export interface RemoteAutoDj {
    contrast: number;
    enabled: boolean;
    mode: 'albums' | 'songs';
}

export interface RemoteQueueEntry {
    album: null | string;
    albumId: null | string;
    artistName: string;
    duration: number;
    id: string;
    imageId: null | string;
    name: string;
    uniqueId: string;
    userFavorite: boolean;
    userRating: null | number;
}

export type RemoteServer = Omit<ServerListItemWithCredential, 'savePassword'>;

export interface RemoteTheme {
    accent: string;
    primaryShade: number;
    theme: string;
    useThemeAccentColor: boolean;
    useThemePrimaryShade: boolean;
}

export interface ServerAutoDj {
    data: null | RemoteAutoDj;
    event: 'autoDj';
}

export interface ServerCurrentServer {
    data: null | RemoteServer;
    event: 'server';
}

export interface ServerError {
    data: string;
    event: 'error';
}

export type ServerEvent =
    | ServerAutoDj
    | ServerCurrentServer
    | ServerError
    | ServerFavorite
    | ServerPlayStatus
    | ServerPosition
    | ServerProxy
    | ServerQueue
    | ServerRating
    | ServerRepeat
    | ServerShuffle
    | ServerSong
    | ServerState
    | ServerTheme
    | ServerVolume;

export interface ServerFavorite {
    data: { favorite: boolean; id: string };
    event: 'favorite';
}

export interface ServerPlayStatus {
    data: PlayerStatus;
    event: 'playback';
}

export interface ServerPosition {
    data: number;
    event: 'position';
}

export interface ServerProxy {
    data: string;
    event: 'proxy';
}

export interface ServerQueue {
    data: {
        currentIndex: number;
        currentUniqueId: null | string;
        entries: RemoteQueueEntry[];
        shuffle: boolean;
    };
    event: 'queue';
}

export interface ServerRating {
    data: { id: string; rating: number };
    event: 'rating';
}

export interface ServerRepeat {
    data: PlayerRepeat;
    event: 'repeat';
}

export interface ServerShuffle {
    data: boolean;
    event: 'shuffle';
}

export interface ServerSong {
    data: null | QueueSong;
    event: 'song';
}

export interface ServerState {
    data: SongState;
    event: 'state';
}

export interface ServerTheme {
    data: null | RemoteTheme;
    event: 'theme';
}

export interface ServerVolume {
    data: number;
    event: 'volume';
}

export interface SongUpdateSocket extends Omit<SongState, 'song'> {
    position?: number;
    song?: null | QueueSong;
}
